const fs = require('node:fs')
const path = require('node:path')
const { randomUUID, createHash } = require('node:crypto')
const { performance } = require('node:perf_hooks')
const { chromium } = require('playwright')
const { zipSync, strToU8 } = require('fflate')
const { marshal, computeSAI, fromHex, toHex } = require('vax-sdk')
const { createLibraryServer } = require('../../../scripts/library-server.cjs')
const assert = require('node:assert/strict')
const { checkUpgrade } = require('./indexed-upgrade.cjs')
const { checkHistoryCache } = require('./history-cache.cjs')
process.chdir(path.resolve(__dirname, '../../..'))
const hash = (value) => createHash('sha256').update(value).digest('hex')
const root = path.resolve('.preview/performance-tests', randomUUID())
const results = { root, spreadsheet: [], errors: [] }

function spreadsheet(rows) {
  const files = {
    '[Content_Types].xml':
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    'xl/workbook.xml':
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sparse" sheetId="1" r:id="r1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      Array.from(
        { length: rows },
        (_, i) => `<row r="${i + 1}"><c r="CV${i + 1}"><v>${i + 1}</v></c></row>`,
      ).join('') +
      '</sheetData></worksheet>',
  }
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([key, value]) => [key, strToU8(value)])),
  )
}

async function nextRevision(doc, parent) {
  const id = randomUUID(),
    timestamp = Date.now()
  const payload = {
    documentId: doc.id,
    revisionId: id,
    parentId: parent.id,
    originalHash: doc.originalHash,
    contentHash: hash(parent.content),
    notesHash: hash(marshal(parent.notes)),
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
  }
  const envelope = marshal({ action_type: 'pageforge.edit', timestamp, sdto: payload }).toString(
    'utf8',
  )
  return {
    id,
    kind: 'edit',
    content: parent.content,
    notes: parent.notes,
    parentId: parent.id,
    prevSAI: parent.sai,
    createdAt: new Date(timestamp).toISOString(),
    envelope,
    sai: toHex(await computeSAI(fromHex(parent.sai), Buffer.from(envelope))),
  }
}

async function main() {
  fs.mkdirSync(path.join(root, 'collection'), { recursive: true })
  for (const count of [100, 1000])
    fs.writeFileSync(path.join(root, 'collection', `Sparse-${count}.xlsx`), spreadsheet(count))
  fs.writeFileSync(path.join(root, 'collection', 'History.txt'), 'abcdefghij '.repeat(95325))
  const server = createLibraryServer({ libraryRoot: root })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  let browser
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addInitScript(() => {
      window.__perf = { tasks: [], hashes: [], inputFrames: [] }
      document.addEventListener(
        'input',
        (event) => {
          if (event.target.getAttribute('aria-label') !== '新增筆記') return
          const start = performance.now()
          requestAnimationFrame(() =>
            requestAnimationFrame(() => window.__perf.inputFrames.push(performance.now() - start)),
          )
        },
        true,
      )
      new PerformanceObserver((list) =>
        window.__perf.tasks.push(...list.getEntries().map((e) => e.duration)),
      ).observe({ type: 'longtask', buffered: true })
      const nativeDigest = crypto.subtle.digest.bind(crypto.subtle)
      crypto.subtle.digest = function (algorithm, bytes) {
        window.__perf.hashes.push(bytes.byteLength)
        return nativeDigest(algorithm, bytes)
      }
    })
    const page = await context.newPage()
    page.on('pageerror', (error) => results.errors.push(error.message))
    await page.goto(url)
    await page.waitForFunction(() => document.querySelectorAll('.book-card').length === 3)
    const docs = await (await fetch(url + '/api/library/documents')).json()
    for (const count of [100, 1000]) {
      const doc = docs.find((item) => item.title === `Sparse-${count}`)
      const began = performance.now()
      await page.goto(`${url}/reader/?id=${doc.id}`)
      await page.waitForFunction(() => document.querySelector('table td'))
      await page.waitForFunction(() => document.querySelectorAll('table tr[data-block]').length > 1)
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      )
      const initialMs = performance.now() - began
      const cells = await page.locator('table td').count()
      assert.ok(cells > 100 && cells < 5000, `Visible cell count must stay bounded: ${cells}`)
      await page.evaluate(() => {
        window.__perf.tasks = []
        window.__perf.inputFrames = []
      })
      for (const letter of 'abcdef') {
        await page.getByLabel('新增筆記').press(letter)
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        )
      }
      const tasks = await page.evaluate(() => window.__perf.tasks)
      const manifest = path.join(root, 'books', doc.id, 'manifest.json')
      const head = JSON.parse(fs.readFileSync(manifest, 'utf8')).revisionIds.at(-1)
      const beforeProgress = fs.readFileSync(manifest, 'utf8')
      const data = { revisionId: head, section: 0, block: 'row-20', ratio: 0.2, percentage: 20 }
      const progressBegan = performance.now()
      const response = await fetch(`${url}/api/library/documents/${doc.id}/progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      assert.equal(response.status, 200)
      assert.equal(fs.readFileSync(manifest, 'utf8'), beforeProgress)
      const progressBytes = fs.statSync(path.join(root, 'books', doc.id, 'progress.json')).size
      assert.ok(progressBytes < 1024)
      results.spreadsheet.push({
        populatedCells: count,
        renderedCells: cells,
        initialMs,
        inputToTwoFramesMs: await page.evaluate(() => window.__perf.inputFrames),
        longTasksMs: tasks,
        progressRequestBytes: Buffer.byteLength(JSON.stringify(data)),
        progressFileBytes: progressBytes,
        rewrittenManifestBytes: 0,
      })
      if (count === 1000) {
        await page
          .locator('.reader-scroll')
          .evaluate((el) => (el.scrollTop = el.scrollHeight * 0.5))
        await page.waitForFunction(() => document.querySelector('[data-block="row-500"]'))
        await page.waitForTimeout(700)
        const saved = await (await fetch(`${url}/api/library/documents/${doc.id}/progress`)).json()
        assert.ok(Number(saved.block.slice(4)) > 400)
        await page.reload()
        await page.waitForFunction(
          (block) => document.querySelector(`[data-block="${block}"]`),
          saved.block,
        )
        const restored = await page.locator('.reader-scroll').evaluate((el) => el.scrollTop)
        assert.ok(restored > 10000, `Offscreen row must restore: ${restored}`)
      }
    }
    const doc = await (
      await fetch(
        `${url}/api/library/documents/${docs.find((item) => item.title === 'History').id}`,
      )
    ).json()
    const book = path.join(root, 'books', doc.id)
    const manifestFile = path.join(book, 'manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
    let parent = doc.revisions.at(-1)
    for (let i = 1; i < 20; i++) {
      parent = await nextRevision(doc, parent)
      fs.writeFileSync(path.join(book, 'versions', `${parent.id}.json`), JSON.stringify(parent))
      manifest.revisionIds.push(parent.id)
    }
    fs.writeFileSync(manifestFile, JSON.stringify(manifest))
    await page.goto(`${url}/reader/?id=${doc.id}`)
    await page.getByRole('button', { name: '思考沙盒', exact: true }).click()
    await page.getByLabel('沙盒名稱').fill('Benchmark')
    await page.getByRole('button', { name: '建立沙盒', exact: true }).click()
    await page.getByLabel('沙盒文字').waitFor()
    await page.getByLabel('沙盒文字').fill(doc.revisions[0].content + 'x')
    await page.waitForTimeout(750)
    await page.evaluate(() => (window.__perf.hashes = []))
    const saveBegan = performance.now()
    await page.getByRole('button', { name: '保存沙盒版本', exact: true }).click()
    await page.getByText('SANDBOX / 第 2 版', { exact: true }).waitFor()
    results.sandbox = {
      mainRevisions: 20,
      textBytes: Buffer.byteLength(parent.content),
      saveMs: performance.now() - saveBegan,
      hashBytes: await page.evaluate(() => window.__perf.hashes),
      totalHashBytes: await page.evaluate(() => window.__perf.hashes.reduce((a, b) => a + b, 0)),
    }
    assert.ok(
      results.sandbox.totalHashBytes < 5 * 1024 * 1024,
      'Saving must not hash the entire history again',
    )
    await page.goto(`${url}/reader/?id=${doc.id}`)
    await page.getByLabel('新增筆記').waitFor()
    const requestPromise = page.waitForRequest(
      (request) => request.method() === 'PUT' && request.url().includes('/drafts/'),
    )
    await page.getByLabel('新增筆記').fill('A')
    const request = await requestPromise
    const payload = request.postData()
    const copy = JSON.parse(payload).copy
    assert.equal(copy.content, undefined)
    assert.ok(Buffer.byteLength(payload) < 1024)
    results.noteDraft = {
      noteCharacters: 1,
      requestBytes: Buffer.byteLength(payload),
      includedTextBytes: 0,
    }
    await page
      .locator('.working-copy-bar [role=status]')
      .filter({ hasText: '草稿已暫存' })
      .waitFor()
    await page.reload()
    await page.getByLabel('新增筆記').waitFor()
    assert.equal(await page.getByLabel('新增筆記').inputValue(), 'A')
    assert.deepEqual(results.errors, [])
    await context.close()
    const latestDocument = await (await fetch(`${url}/api/library/documents/${doc.id}`)).json()
    const summaries = await (await fetch(`${url}/api/library/documents/${doc.id}/branches`)).json()
    const branch = await (
      await fetch(`${url}/api/library/documents/${doc.id}/branches/${summaries[0].id}`)
    ).json()
    await checkHistoryCache(latestDocument)
    await checkUpgrade(browser, url, latestDocument, branch)
    console.log(
      'PASS performance: bounded spreadsheet DOM, offscreen progress restoration, incremental VAX hashing, small note drafts, small progress writes',
    )
  } finally {
    if (browser) await browser.close()
    await new Promise((resolve) => server.close(resolve))
    fs.writeFileSync(path.join(root, 'results.json'), JSON.stringify(results, null, 2))
    console.log(
      JSON.stringify(
        { ...results, sandbox: results.sandbox && { ...results.sandbox, hashBytes: undefined } },
        null,
        2,
      ),
    )
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
