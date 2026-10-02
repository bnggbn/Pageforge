const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const { randomUUID, createHash } = require('node:crypto')
const { chromium } = require('playwright')
const { marshal, computeSAI, fromHex, toHex } = require('vax-sdk')
const { createLibraryServer } = require('../../../scripts/library-server.cjs')
const { loadConfig } = require('../../../scripts/config.cjs')
process.chdir(path.resolve(__dirname, '../../..'))

const hash = (value) => createHash('sha256').update(value).digest('hex')
async function revision(doc, parent, kind, content, notes, extra = {}) {
  const id = randomUUID(),
    timestamp = Date.now()
  const payload = {
    documentId: doc.id,
    revisionId: id,
    parentId: parent.id,
    originalHash: doc.originalHash,
    contentHash: hash(content),
    notesHash: hash(marshal(notes)),
    restoredFrom: null,
    viewHash: hash(
      marshal({
        title: doc.title,
        filename: doc.filename,
        format: doc.format,
        sections: doc.sections,
        sheets: doc.sheets,
      }),
    ),
    ...extra,
  }
  const envelope = marshal({ action_type: `pageforge.${kind}`, timestamp, sdto: payload }).toString(
    'utf8',
  )
  return {
    id,
    kind,
    content,
    notes,
    parentId: parent.id,
    prevSAI: parent.sai,
    createdAt: new Date(timestamp).toISOString(),
    envelope,
    sai: toHex(await computeSAI(fromHex(parent.sai), Buffer.from(envelope))),
    ...extra,
  }
}

async function run(browser, mode) {
  const libraryRoot = path.resolve('.preview/sandbox-tests', randomUUID())
  const config = loadConfig()
  config.limits.sandboxCount = 2
  config.limits.sandboxNameCharacters = 12
  let server = createLibraryServer({ libraryRoot, config })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port,
    url = `http://127.0.0.1:${port}`
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  if (mode === 'browser')
    await context.route('**/api/library/status', (route) =>
      route.fulfill({ status: 404, body: '{}' }),
    )
  const errors = []
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('dialog', (dialog) => dialog.accept())
  }
  const api = async (route, method = 'GET', value) => {
    const response = await fetch(`${url}/api/library${route}`, {
      method,
      ...(value === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }),
    })
    return { status: response.status, value: await response.json() }
  }
  const read = async (page, store, id) =>
    page.evaluate(
      async ({ store, id }) => {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('pageforge-library')
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        return new Promise((resolve, reject) => {
          const request = id
            ? db.transaction(store).objectStore(store).get(id)
            : db.transaction(store).objectStore(store).getAll()
          request.onsuccess = () => {
            db.close()
            resolve(request.result)
          }
          request.onerror = () => {
            db.close()
            reject(request.error)
          }
        })
      },
      { store, id },
    )
  try {
    const page = await context.newPage()
    watch(page)
    await page.goto(url)
    await page.getByRole('button', { name: '匯入文件', exact: true }).click()
    const original = '# 思考的岔路\n\n這裡是原始文字。\n'
    await page.getByLabel('選擇匯入文件').setInputFiles({
      name: '思考的岔路.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(original),
    })
    await page.getByRole('button', { name: '思考沙盒', exact: true }).waitFor()
    const reader = page.url(),
      id = new URL(reader).searchParams.get('id')
    const document = async () =>
      mode === 'disk' ? (await api(`/documents/${id}`)).value : read(page, 'documents', id)
    const branches = async () =>
      mode === 'disk' ? (await api(`/documents/${id}/branches`)).value : read(page, 'branches')
    const getBranch = async (branchId) =>
      mode === 'disk'
        ? (await api(`/documents/${id}/branches/${branchId}`)).value
        : read(page, 'branches', branchId)
    const enter = async (p) => p.getByRole('button', { name: '思考沙盒', exact: true }).click()
    const open = async (p, name) => {
      await p.getByRole('button', { name: `開啟沙盒 ${name}`, exact: true }).click()
      await p.getByLabel('沙盒文字').waitFor()
      await p
        .getByRole('button', { name: '重新載入沙盒', exact: true })
        .waitFor({ state: 'visible' })
      await p
        .getByRole('button', { name: '重新載入沙盒', exact: true })
        .isEnabled()
        .then(async (enabled) => {
          if (!enabled)
            await p.waitForFunction(
              () => !document.querySelector('.sandbox-panel textarea')?.disabled,
            )
        })
    }
    const save = async (p) => {
      await p.getByRole('button', { name: '保存沙盒版本', exact: true }).click()
      await p.getByText('沙盒版本已保存，主線保留原文。', { exact: true }).waitFor()
    }
    await page.getByLabel('新增筆記').fill('主線的筆記必須保留。')
    await page.getByRole('button', { name: '保存筆記', exact: true }).click()
    await page.getByText('已保存第 2 版。', { exact: true }).waitFor()
    const source = await document(),
      base = source.revisions[0]
    await enter(page)
    await page.getByLabel('沙盒來源版本').selectOption(base.id)
    await page.getByLabel('沙盒名稱').fill('另一種開場')
    await page.getByRole('button', { name: '建立沙盒', exact: true }).click()
    await page.getByLabel('沙盒文字').waitFor()
    assert.equal(await page.getByLabel('沙盒文字').inputValue(), original)
    await page.getByLabel('沙盒文字').fill('# 改寫的開場\n\n從另一個角度開始。\n')
    await save(page)
    let branchId = (await branches()).find((branch) => branch.name === '另一種開場').id
    let branch = await getBranch(branchId)
    assert.equal(branch.revisions[0].prevSAI, base.sai)
    assert.equal(branch.revisions[0].parentId, base.id)
    assert.equal(branch.revisions[0].kind, 'fork')
    assert.equal(JSON.parse(branch.revisions[1].envelope).sdto.branchId, branchId)
    assert.equal((await document()).revisions.length, 2)
    // A second sandbox uses a newer source and preserves that source's notes.
    await page.getByLabel('沙盒來源版本').selectOption(source.revisions[1].id)
    await page.getByLabel('沙盒名稱').fill('另一條岔路')
    await page.getByRole('button', { name: '建立沙盒', exact: true }).click()
    await page.getByRole('heading', { name: '另一條岔路', exact: true }).waitFor()
    const secondId = (await branches()).find((item) => item.name === '另一條岔路').id
    assert.equal((await getBranch(secondId)).revisions[0].notes.length, 1)
    if (mode === 'disk') {
      assert.equal(await page.getByLabel('沙盒名稱').getAttribute('maxlength'), '12')
      await page.getByLabel('沙盒名稱').fill('超過保留數量')
      await page.getByRole('button', { name: '建立沙盒', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: '沙盒數量已達上限' }).waitFor()
      assert.equal((await branches()).length, 2)
    }
    await open(page, '另一種開場')
    await page.getByLabel('沙盒文字').fill('# 分支草稿\n\n切換後仍然保留。')
    await open(page, '另一條岔路')
    assert.equal(await page.getByLabel('沙盒文字').inputValue(), original)
    await open(page, '另一種開場')
    assert.match(await page.getByLabel('沙盒文字').inputValue(), /切換後仍然保留/)
    await save(page)
    // Keep an independent main draft while the sandbox is adopted.
    await page.getByRole('button', { name: '編輯文字', exact: true }).click()
    await page.getByLabel('編輯文件文字').fill('# 主線尚未提交的文字')
    await enter(page)
    await open(page, '另一種開場')
    const other = await context.newPage()
    watch(other)
    await other.goto(reader)
    await other.getByRole('button', { name: /^筆記 / }).click()
    await other.getByLabel('新增筆記').fill('另一個分頁新增的主線筆記。')
    await other.getByRole('button', { name: '保存筆記', exact: true }).click()
    await other.getByText('已保存第 3 版。', { exact: true }).waitFor()
    await page.getByRole('button', { name: '比較目前主線', exact: true }).click()
    await page.locator('.diff-added').first().waitFor()
    await page.getByRole('button', { name: '採納到主線', exact: true }).click()
    await page.locator('.reader-status [role=alert]').waitFor()
    assert.equal((await document()).revisions.length, 3)
    await page.reload()
    assert.equal(await page.getByLabel('編輯文件文字').inputValue(), '# 主線尚未提交的文字')
    await enter(page)
    await open(page, '另一種開場')
    await page.getByRole('button', { name: '比較目前主線', exact: true }).click()
    await page.locator('.diff-added').first().waitFor()
    for (const width of [1440, 1024, 768, 430, 375]) {
      await page.setViewportSize({ width, height: 1000 })
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `sandbox overflow at ${width}`,
      )
    }
    await page.screenshot({ path: `.preview/pageforge-sandbox-${mode}-mobile.png`, fullPage: true })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({ path: `.preview/pageforge-sandbox-${mode}.png`, fullPage: true })
    await page.getByRole('button', { name: '採納到主線', exact: true }).click()
    await page.getByText('已採納到主線；沙盒版本仍保留。', { exact: true }).waitFor()
    const adopted = (await document()).revisions.at(-1)
    assert.equal(adopted.kind, 'adopt')
    assert.equal(adopted.notes.length, 2)
    assert.equal(adopted.adoptedFrom.branchId, branchId)
    assert.equal(
      JSON.parse(adopted.envelope).sdto.adoptedFrom.revisionId,
      adopted.adoptedFrom.revisionId,
    )
    await page.getByRole('button', { name: '編輯文字', exact: true }).click()
    assert.equal(await page.getByLabel('編輯文件文字').inputValue(), '# 主線尚未提交的文字')
    await page.getByRole('button', { name: '捨棄此草稿', exact: true }).click()
    await page.waitForFunction(
      (content) => document.querySelector('textarea[aria-label="編輯文件文字"]')?.value === content,
      adopted.content,
    )
    assert.equal(await page.getByLabel('編輯文件文字').inputValue(), adopted.content)
    await enter(page)
    await open(page, '另一種開場')
    await page.getByRole('button', { name: '封存沙盒', exact: true }).click()
    await page.getByRole('button', { name: '復原沙盒', exact: true }).waitFor()
    assert.equal(await page.getByLabel('沙盒文字').isDisabled(), true)
    await page.getByRole('button', { name: '復原沙盒', exact: true }).click()
    await page.getByRole('button', { name: '封存沙盒', exact: true }).waitFor()
    // Concurrent sandbox heads cannot overwrite each other; both drafts survive.
    await other.reload()
    await enter(other)
    await open(other, '另一種開場')
    await page.getByLabel('沙盒文字').fill('# A 保存的沙盒版本')
    await other.getByLabel('沙盒文字').fill('# B 尚未提交的沙盒版本')
    await save(page)
    await other.getByRole('button', { name: '保存沙盒版本', exact: true }).click()
    await other.locator('.sandbox-panel [role=alert]').waitFor()
    assert.equal(await other.getByLabel('沙盒文字').inputValue(), '# B 尚未提交的沙盒版本')
    await other.getByRole('button', { name: '重新載入沙盒', exact: true }).click()
    await other.getByText('草稿基於舊版本；沙盒更新已保留。', { exact: true }).waitFor()
    assert.equal(await other.getByLabel('沙盒文字').inputValue(), '# B 尚未提交的沙盒版本')
    await save(other)
    assert.equal((await document()).revisions.at(-1).content, adopted.content)
    // A failed write must leave the published sandbox head intact.
    await other.getByLabel('沙盒文字').fill('# 寫入失敗仍須保留')
    const before = await getBranch(branchId)
    if (mode === 'browser') {
      await other.evaluate(() => {
        window.__branchPut = IDBObjectStore.prototype.put
        IDBObjectStore.prototype.put = function (...args) {
          if (this.name === 'branches') {
            this.transaction.abort()
            throw new DOMException('quota', 'QuotaExceededError')
          }
          return window.__branchPut.apply(this, args)
        }
      })
      await other.getByRole('button', { name: '保存沙盒版本', exact: true }).click()
      await other.locator('.sandbox-panel [role=alert]').waitFor()
      assert.equal((await getBranch(branchId)).revisions.at(-1).id, before.revisions.at(-1).id)
      assert.equal(await other.getByLabel('沙盒文字').inputValue(), '# 寫入失敗仍須保留')
      await other.evaluate(() => {
        IDBObjectStore.prototype.put = window.__branchPut
      })
      await save(other)
    } else {
      const doc = await document(),
        node = await revision(
          doc,
          before.revisions.at(-1),
          'edit',
          'failed disk snapshot',
          before.revisions.at(-1).notes,
          { branchId },
        )
      const manifest = path.join(libraryRoot, 'books', id, 'branches', branchId, 'manifest.json')
      const bytes = fs.readFileSync(manifest, 'utf8'),
        originalRename = fs.renameSync
      try {
        fs.renameSync = function (source, destination) {
          if (destination === manifest) throw new Error('Simulated sandbox disk failure')
          return originalRename.call(this, source, destination)
        }
        assert.equal(
          (
            await api(`/documents/${id}/branches/${branchId}/revisions`, 'POST', {
              expectedHead: before.revisions.at(-1).id,
              revision: node,
            })
          ).status,
          500,
        )
      } finally {
        fs.renameSync = originalRename
      }
      assert.equal(fs.readFileSync(manifest, 'utf8'), bytes)
      await save(other)
      // Reject a correctly hashed event whose content or notes do not match adoption policy.
      const current = await document(),
        parent = current.revisions.at(-1)
      const bad = await revision(current, parent, 'adopt', 'forged text', parent.notes, {
        adoptedFrom: adopted.adoptedFrom,
      })
      assert.equal(
        (
          await api(`/documents/${id}/revisions`, 'POST', {
            expectedHead: parent.id,
            revision: bad,
          })
        ).status,
        400,
      )
      const scoped = await revision(current, parent, 'edit', 'invalid main scope', parent.notes, {
        branchId,
      })
      assert.equal(
        (
          await api(`/documents/${id}/revisions`, 'POST', {
            expectedHead: parent.id,
            revision: scoped,
          })
        ).status,
        400,
      )
      const file = path.join(
        libraryRoot,
        'books',
        id,
        'branches',
        branchId,
        'versions',
        `${adopted.adoptedFrom.revisionId}.json`,
      )
      const savedBytes = fs.readFileSync(file, 'utf8'),
        tampered = JSON.parse(savedBytes)
      const wrongNotes = await revision(current, parent, 'adopt', adopted.content, [], {
        adoptedFrom: adopted.adoptedFrom,
      })
      assert.equal(
        (
          await api(`/documents/${id}/revisions`, 'POST', {
            expectedHead: parent.id,
            revision: wrongNotes,
          })
        ).status,
        400,
      )
      tampered.content += 'tampered'
      fs.writeFileSync(file, JSON.stringify(tampered))
      try {
        const candidate = await revision(current, parent, 'adopt', tampered.content, parent.notes, {
          adoptedFrom: adopted.adoptedFrom,
        })
        assert.equal(
          (
            await api(`/documents/${id}/revisions`, 'POST', {
              expectedHead: parent.id,
              revision: candidate,
            })
          ).status,
          400,
        )
      } finally {
        fs.writeFileSync(file, savedBytes)
      }
      assert.equal(
        fs.readFileSync(path.join(libraryRoot, 'books', id, 'original.md'), 'utf8'),
        original,
      )
      await new Promise((resolve) => server.close(resolve))
      server = createLibraryServer({ libraryRoot })
      await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
    }
    await page.reload()
    await enter(page)
    await open(page, '另一種開場')
    assert.equal(await page.getByLabel('沙盒文字').inputValue(), '# 寫入失敗仍須保留')
    if (mode === 'browser') {
      // Migration copies branches and drafts, and repeating it does not create extra copies.
      await page.getByLabel('沙盒文字').fill('# 移轉也須保留的沙盒草稿')
      await page.getByRole('button', { name: '閱讀', exact: true }).click()
      await context.unroute('**/api/library/status')
      await page.goto(url)
      await page.getByRole('button', { name: /^轉入瀏覽器書架/ }).click()
      await page.waitForFunction(() => document.querySelector('.book-card'))
      assert.equal((await api(`/documents/${id}/branches`)).value.length, 2)
      assert.equal((await api(`/documents/${id}/drafts`)).value[0].branchId, branchId)
      await page.reload()
      await page.getByRole('button', { name: /^轉入瀏覽器書架/ }).click()
      await page.waitForFunction(
        () =>
          !Array.from(document.querySelectorAll('button')).find((item) =>
            item.textContent.includes('轉入瀏覽器書架'),
          )?.disabled,
      )
      assert.equal((await api(`/documents/${id}/drafts`)).value.length, 1)
      await page.goto(reader)
      await enter(page)
      await open(page, '另一種開場')
      assert.equal(await page.getByLabel('沙盒文字').inputValue(), '# 移轉也須保留的沙盒草稿')
      // The browser source is retained independently of disk deletion.
      assert.equal((await read(page, 'branches')).length, 2)
      await context.route('**/api/library/status', (route) =>
        route.fulfill({ status: 404, body: '{}' }),
      )
      await page.reload()
      await enter(page)
      await open(page, '另一種開場')
    }
    assert.deepEqual(errors, [])
    await page.getByRole('button', { name: '刪除', exact: true }).click()
    await page.waitForURL(url + '/')
    if (mode === 'browser') {
      assert.equal((await read(page, 'branches')).length, 0)
      assert.equal((await read(page, 'drafts')).length, 0)
    } else assert.equal((await api(`/documents/${id}/branches`)).status, 404)
    console.log(
      `PASS ${mode} sandboxes: fork ancestry, draft isolation, diff, stale adoption, preserved notes/main draft, provenance, archive/recovery, concurrent heads, write failure, persistence, deletion`,
    )
  } finally {
    await context.close()
    await new Promise((resolve) => server.close(resolve))
  }
}

;(async () => {
  const browser = await chromium.launch({
    channel:
      process.env.PAGEFORGE_BROWSER_CHANNEL ||
      (process.platform === 'win32' ? 'msedge' : undefined),
    headless: true,
  })
  try {
    for (const mode of ['browser', 'disk']) await run(browser, mode)
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
