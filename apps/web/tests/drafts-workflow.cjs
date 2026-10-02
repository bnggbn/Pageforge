const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { chromium } = require('playwright')
const { createLibraryServer } = require('../../../scripts/library-server.cjs')
process.chdir(path.resolve(__dirname, '../../..'))

async function run(browser, mode) {
  const libraryRoot = path.resolve('.preview/draft-tests', randomUUID())
  let server = createLibraryServer({ libraryRoot })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port,
    url = `http://127.0.0.1:${port}`
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  if (mode === 'browser') {
    await context.route('**/api/library/status', (route) =>
      route.fulfill({ status: 404, body: '{}' }),
    )
    // Upgrade an existing v1 database rather than only testing a fresh installation.
    await context.addInitScript(() => {
      if (localStorage.getItem('migration-fixture')) return
      localStorage.setItem('migration-fixture', '1')
      const request = indexedDB.open('pageforge-library', 1)
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore('documents', { keyPath: 'id' })
        const summaries = db.createObjectStore('summaries', { keyPath: 'id' })
        summaries.createIndex('source', ['format', 'originalHash'], { unique: true })
        db.createObjectStore('progress', { keyPath: 'documentId' })
        db.createObjectStore('settings')
      }
      request.onsuccess = () => request.result.close()
    })
  }
  try {
    const page = await context.newPage(),
      errors = [],
      dialogs = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.type())
      await dialog.accept()
    })
    const copies = async (p) =>
      mode === 'disk'
        ? await (await fetch(`${url}/api/library/documents/${id}/drafts`)).json()
        : p.evaluate(async (id) => {
            const db = await new Promise((resolve) => {
              const request = indexedDB.open('pageforge-library')
              request.onsuccess = () => resolve(request.result)
            })
            return await new Promise((resolve) => {
              const request = db
                .transaction('drafts')
                .objectStore('drafts')
                .index('document')
                .getAll(id)
              request.onsuccess = () => {
                db.close()
                resolve(request.result)
              }
            })
          }, id)
    await page.goto(url)
    await page.getByRole('button', { name: '匯入文件', exact: true }).click()
    await page.getByLabel('選擇匯入文件').setInputFiles({
      name: '沙盒草稿.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# 草稿測試\n\n原始內容。'),
    })
    await page.getByRole('button', { name: '編輯文字', exact: true }).waitFor()
    const reader = page.url(),
      id = new URL(reader).searchParams.get('id')
    const editor = (p) => p.getByLabel('編輯文件文字')
    const saved = (p) =>
      p.locator('.working-copy-bar [role=status]').filter({ hasText: '草稿已暫存' }).waitFor()
    await page.getByRole('button', { name: '編輯文字', exact: true }).click()
    await editor(page).fill('# 第一個分頁\n\n尚未提交的文字。')
    // Switching immediately must await persistence, without asking to discard.
    await page.getByRole('button', { name: '閱讀', exact: true }).click()
    assert.match(await page.locator('.document-prose').innerText(), /原始內容/)
    await page.getByRole('button', { name: /^筆記 / }).click()
    await page.getByLabel('筆記位置').fill('待整理段落')
    await page.getByLabel('新增筆記').fill('尚未提交的筆記。')
    await saved(page)
    await page.reload()
    assert.match(await editor(page).inputValue(), /第一個分頁/)
    await page.getByRole('button', { name: /^筆記 / }).click()
    assert.equal(await page.getByLabel('新增筆記').inputValue(), '尚未提交的筆記。')
    assert.equal(await page.getByLabel('筆記位置').inputValue(), '待整理段落')
    assert.equal((await copies(page)).length, 1)
    if (mode === 'disk') {
      const stored = (await copies(page))[0]
      const target = path.join(libraryRoot, 'books', id, 'drafts', `${stored.id}.json`)
      const originalBytes = fs.readFileSync(target, 'utf8')
      const originalRename = fs.renameSync
      try {
        fs.renameSync = function (source, destination) {
          if (destination === target) throw new Error('Simulated draft disk failure')
          return originalRename.call(this, source, destination)
        }
        const response = await fetch(`${url}/api/library/documents/${id}/drafts/${stored.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            copy: { ...stored, version: randomUUID(), content: 'must not replace' },
            expectedVersion: stored.version,
          }),
        })
        assert.equal(response.status, 500)
      } finally {
        fs.renameSync = originalRename
      }
      assert.equal(fs.readFileSync(target, 'utf8'), originalBytes)
    }
    await page.getByRole('button', { name: '保存筆記', exact: true }).click()
    await page.getByText('已保存第 2 版。', { exact: true }).waitFor()
    await page.getByRole('button', { name: '編輯文字', exact: true }).click()
    assert.match(await editor(page).inputValue(), /第一個分頁/)
    const other = await context.newPage()
    await other.goto(reader)
    assert.match(await editor(other).inputValue(), /第一個分頁/)
    await editor(page).fill('# A 分頁的版本')
    await saved(page)
    await editor(other).fill('# B 分頁的版本')
    await saved(other)
    assert.equal((await copies(page)).length, 2)
    assert.deepEqual(
      new Set((await copies(page)).map((copy) => copy.content)),
      new Set(['# A 分頁的版本', '# B 分頁的版本']),
    )
    await page.getByRole('button', { name: '儲存新版本', exact: true }).click()
    await page.getByText('已保存第 3 版。', { exact: true }).waitFor()
    await other.getByRole('button', { name: '儲存新版本', exact: true }).click()
    await other.locator('.reader-status [role=alert]').waitFor()
    assert.match(await editor(other).inputValue(), /B 分頁/)
    assert.equal((await copies(page)).length, 1)
    await other.reload()
    assert.match(await editor(other).inputValue(), /B 分頁/)
    await other.getByText('草稿基於舊版本；主線更新已保留。', { exact: true }).waitFor()
    // Failed autosave must retain text and block the requested tab change.
    if (mode === 'disk')
      await other.route('**/drafts/*', (route) => {
        if (route.request().method() === 'PUT')
          return route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: '模擬草稿寫入失敗' }),
          })
        return route.continue()
      })
    else
      await other.evaluate(() => {
        const original = IDBDatabase.prototype.transaction
        window.__draftTransaction = original
        IDBDatabase.prototype.transaction = function (stores, mode, ...rest) {
          if (mode === 'readwrite' && [].concat(stores).includes('drafts'))
            throw new DOMException('quota', 'QuotaExceededError')
          return original.call(this, stores, mode, ...rest)
        }
      })
    await editor(other).fill('# 保存失敗也不能丟掉的文字')
    await other.getByRole('button', { name: '閱讀', exact: true }).click()
    assert.equal(await editor(other).inputValue(), '# 保存失敗也不能丟掉的文字')
    await other.locator('.working-copy-bar [role=alert]').waitFor()
    if (mode === 'disk') await other.unroute('**/drafts/*')
    else
      await other.evaluate(() => {
        IDBDatabase.prototype.transaction = window.__draftTransaction
      })
    await other.getByRole('button', { name: '重試暫存', exact: true }).click()
    await saved(other)
    await other.getByRole('button', { name: '閱讀', exact: true }).click()
    assert.match(await other.locator('.document-prose').innerText(), /A 分頁/)
    assert.deepEqual(dialogs, [])
    assert.deepEqual(errors, [])
    if (mode === 'disk') {
      await new Promise((resolve) => server.close(resolve))
      server = createLibraryServer({ libraryRoot })
      await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
      const fresh = await browser.newContext(),
        restored = await fresh.newPage()
      await restored.goto(reader)
      assert.equal(await editor(restored).inputValue(), '# 保存失敗也不能丟掉的文字')
      await fresh.close()
    }
    other.once('dialog', (dialog) => dialog.accept())
    await other.getByRole('button', { name: '刪除', exact: true }).click()
    await other.waitForURL(url + '/')
    if (mode === 'disk')
      assert.equal((await fetch(`${url}/api/library/documents/${id}/drafts`)).status, 404)
    else assert.equal((await copies(other)).length, 0)
    console.log(
      `PASS ${mode} drafts: v1 upgrade, immediate switch, reload, pending notes, parallel copies, stale head, failed write/retry, restart, deletion`,
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
