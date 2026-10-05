const path = require('node:path')
process.chdir(path.resolve(__dirname, '../../..'))
require('./fixtures.cjs')
const http = require('node:http')
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
;(async () => {
  const root = path.resolve('apps/web/out')
  const server = http.createServer((req, res) => {
    let file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]))
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403).end()
      return
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404).end()
        return
      }
      res
        .writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' })
        .end(data)
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    browser = await chromium.launch({
      channel:
        process.env.PAGEFORGE_BROWSER_CHANNEL ||
        (process.platform === 'win32' ? 'msedge' : undefined),
      headless: true,
    })
  } catch (error) {
    server.close()
    throw error
  }
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addInitScript(() => {
      window.__pdfUrls = { created: [], revoked: [] }
      const create = URL.createObjectURL.bind(URL),
        revoke = URL.revokeObjectURL.bind(URL)
      URL.createObjectURL = (blob) => {
        const url = create(blob)
        if (blob.type === 'application/pdf') window.__pdfUrls.created.push(url)
        return url
      }
      URL.revokeObjectURL = (url) => {
        if (window.__pdfUrls.created.includes(url)) window.__pdfUrls.revoked.push(url)
        revoke(url)
      }
    })
    const page = await context.newPage()
    const errors = [],
      remote = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('request', (req) => {
      if (req.url().startsWith('https://')) remote.push(req.url())
    })
    const url = `http://127.0.0.1:${server.address().port}`
    const fixture = (name) => '.preview/fixtures/' + name
    const waitReader = async (p) => {
      await p.waitForURL(/reader/)
      await p
        .getByRole('button', { name: '編輯文字', exact: true })
        .or(p.getByRole('button', { name: '版本紀錄', exact: true }))
        .first()
        .waitFor()
    }
    const importDocument = async (name) => {
      await page.goto(url)
      await page.getByRole('button', { name: '匯入文件', exact: true }).click()
      await page.getByLabel('選擇匯入文件').setInputFiles(fixture(name))
      await waitReader(page)
    }
    const db = async (p, stores, mode, operation, payload) =>
      p.evaluate(
        async ({ stores, mode, operation, payload }) => {
          const database = await new Promise((resolve, reject) => {
            const r = indexedDB.open('pageforge-library')
            r.onsuccess = () => resolve(r.result)
            r.onerror = () => reject(r.error)
          })
          return await new Promise((resolve, reject) => {
            const tx = database.transaction(stores, mode)
            let value
            const r = tx.objectStore(stores[0])[operation](payload)
            r.onsuccess = () => (value = r.result)
            tx.oncomplete = () => {
              database.close()
              resolve(value)
            }
            tx.onerror = () => reject(tx.error)
          })
        },
        { stores, mode, operation, payload },
      )
    await importDocument('閱讀測試.md')
    const originalUrl = page.url()
    assert.match(await page.locator('.document-prose').innerText(), /自製的中文/)
    assert.equal(await page.locator('.document-prose img').count(), 0)
    assert.equal(await page.locator('.document-prose a[href^="javascript"]').count(), 0)
    assert.equal(await page.evaluate(() => window.__unsafe), undefined)
    await page.locator('.reader-scroll').evaluate((el) => (el.scrollTop = el.scrollHeight * 0.55))
    await page.waitForTimeout(900)
    const before = await page.locator('.reader-scroll').evaluate((el) => el.scrollTop)
    await page.reload()
    await waitReader(page)
    const after = await page.locator('.reader-scroll').evaluate((el) => el.scrollTop)
    assert.ok(Math.abs(before - after) < 15, `progress restored ${before} / ${after}`)
    // A non-reading mode must not erase the last captured reading anchor.
    await page.getByRole('button', { name: '編輯文字', exact: true }).click()
    await page.getByRole('button', { name: '版本紀錄', exact: true }).click()
    await page.getByRole('button', { name: '閱讀', exact: true }).click()
    await page.waitForFunction(
      (top) => Math.abs(document.querySelector('.reader-scroll').scrollTop - top) < 15,
      after,
    )
    await page.getByLabel('閱讀字級').selectOption('24')
    await page.waitForTimeout(700)
    await page.reload()
    await waitReader(page)
    assert.equal(await page.getByLabel('閱讀字級').inputValue(), '24')
    const selectedQuote = await page
      .locator('.document-prose p')
      .first()
      .evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
        const text = selection.toString().trim()
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        return text
      })
    await page.locator('.note-quote').waitFor()
    assert.ok((await page.locator('.note-quote').innerText()).includes(selectedQuote))
    await page.getByRole('button', { name: '筆記 0', exact: true }).click()
    await page.getByLabel('新增筆記').fill('這是我的第一則筆記。')
    await page.getByRole('button', { name: '保存筆記', exact: true }).click()
    await page.getByText('已保存第 2 版。', { exact: true }).waitFor()
    assert.match(await page.locator('.note-list').innerText(), /第一則笔記|第一則筆記/)
    await page.getByRole('button', { name: '編輯文字', exact: true }).click()
    const originalText = await page.getByLabel('編輯文件文字').inputValue()
    await page.getByLabel('編輯文件文字').fill(originalText + '\n\n這是一段新加入的文字。\n')
    await page.getByRole('button', { name: '儲存新版本', exact: true }).click()
    await page.getByText('已保存第 3 版。', { exact: true }).waitFor()
    assert.match(await page.locator('.document-prose').innerText(), /新加入的文字/)
    await page.getByRole('button', { name: '版本紀錄', exact: true }).click()
    assert.match(await page.locator('.diff-added').innerText(), /新加入的文字/)
    await page.screenshot({ path: '.preview/pageforge-history.png', fullPage: true })
    await page.getByLabel('比較起始版本').selectOption({ label: '第 1 版 · 匯入原始文件' })
    await page.getByRole('button', { name: '筆記差異', exact: true }).click()
    assert.match(await page.locator('.diff-added').innerText(), /第一則筆記/)
    page.once('dialog', (d) => d.accept())
    await page.locator('.version-item').last().getByRole('button', { name: '還原成新版' }).click()
    await page.getByText('已保存第 4 版。', { exact: true }).waitFor()
    await page.getByRole('button', { name: '閱讀', exact: true }).click()
    assert.ok(!(await page.locator('.document-prose').innerText()).includes('新加入的文字'))
    assert.equal(await page.locator('.note-card').count(), 0)
    await importDocument('閱讀測試.md')
    assert.equal(page.url(), originalUrl)
    assert.equal((await db(page, ['summaries'], 'readonly', 'getAll')).length, 1)
    assert.equal(await page.locator('.version-badge').innerText(), '第 4 版')
    const second = await context.newPage()
    await second.goto(originalUrl)
    await waitReader(second)
    await second.getByRole('button', { name: '編輯文字', exact: true }).click()
    await second.getByLabel('編輯文件文字').fill(originalText + '\n分頁 B 尚未保存的文字。')
    await page.getByRole('button', { name: '編輯文字', exact: true }).click()
    await page.getByLabel('編輯文件文字').fill(originalText + '\n分頁 A 的修改。')
    await page.getByRole('button', { name: '儲存新版本', exact: true }).click()
    await page.getByText('已保存第 5 版。', { exact: true }).waitFor()
    await second.getByRole('button', { name: '儲存新版本', exact: true }).click()
    await second.locator('.reader-status .error').waitFor()
    assert.match(await second.locator('.reader-status .error').innerText(), /另一個分頁/)
    assert.match(await second.getByLabel('編輯文件文字').inputValue(), /分頁 B/)
    await second.close()
    await importDocument('純文字.txt')
    assert.match(await page.locator('.document-prose').innerText(), /第二行保留換行/)
    await importDocument('章節.epub')
    assert.match(await page.locator('.document-prose').innerText(), /EPUB 的中文/)
    assert.equal(await page.getByRole('button', { name: '編輯文字', exact: true }).count(), 0)
    await page.getByLabel('選擇章節或工作表').selectOption('1')
    await page.waitForFunction(
      () => document.querySelector('[aria-label="選擇章節或工作表"]').value === '1',
    )
    await page.reload()
    await waitReader(page)
    assert.equal(await page.getByLabel('選擇章節或工作表').inputValue(), '1')
    assert.match(await page.locator('.document-prose').innerText(), /另一個章節/)
    await page.screenshot({ path: '.preview/pageforge-epub.png', fullPage: true })
    await importDocument('試算表.xlsx')
    assert.match(await page.locator('.document-prose').innerText(), /中文儲存格/)
    assert.match(await page.locator('.document-prose').innerText(), /42/)
    await page.getByLabel('選擇章節或工作表').selectOption('1')
    await page.getByRole('cell', { name: '100', exact: true }).waitFor()
    assert.match(await page.locator('.document-prose').innerText(), /100/)
    await page.screenshot({ path: '.preview/pageforge-xlsx.png', fullPage: true })
    await importDocument('文件.pdf')
    assert.ok((await page.locator('iframe').getAttribute('src')).startsWith('blob:'))
    const pdfSource = (await page.locator('iframe').getAttribute('src')).split('#')[0]
    await page.getByLabel('PDF 頁碼書籤').fill('1')
    await page.getByRole('button', { name: '保存頁碼', exact: true }).click()
    await page.getByText('已保存第 1 頁書籤。', { exact: true }).waitFor()
    await page.getByLabel('新增筆記').fill('PDF 也可以留下筆記。')
    await page.getByRole('button', { name: '保存筆記', exact: true }).click()
    await page.getByText('已保存第 2 版。', { exact: true }).waitFor()
    assert.equal((await page.locator('iframe').getAttribute('src')).split('#')[0], pdfSource)
    assert.equal(await page.evaluate(() => window.__pdfUrls.created.length), 1)
    await page.getByRole('button', { name: '版本紀錄', exact: true }).click()
    await page.waitForFunction((url) => window.__pdfUrls.revoked.includes(url), pdfSource)
    await page.getByRole('button', { name: '閱讀', exact: true }).click()
    await page.waitForFunction(() =>
      document.querySelector('iframe')?.getAttribute('src')?.startsWith('blob:'),
    )
    assert.equal(await page.evaluate(() => window.__pdfUrls.created.length), 2)
    assert.equal((await db(page, ['summaries'], 'readonly', 'getAll')).length, 5)
    await page.goto(url)
    await page.getByRole('button', { name: '匯入文件', exact: true }).click()
    await page.getByLabel('選擇匯入文件').setInputFiles({
      name: 'bad.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from([0xff, 0xfe, 0xff]),
    })
    await page.locator('dialog').getByRole('alert').waitFor()
    assert.match(await page.locator('dialog').getByRole('alert').innerText(), /UTF-8/)
    assert.equal((await db(page, ['summaries'], 'readonly', 'getAll')).length, 5)
    await page.getByLabel('選擇匯入文件').setInputFiles({
      name: 'bad.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('not a pdf'),
    })
    await page.waitForTimeout(400)
    assert.match(await page.locator('dialog').getByRole('alert').innerText(), /有效的 PDF/)
    await page.getByRole('button', { name: '關閉預覽' }).click()
    await page.goto(originalUrl)
    await waitReader(page)
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `reader overflow ${width}`,
      )
      await page.getByRole('button', { name: '筆記 0', exact: true }).click()
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `notes overflow ${width}`,
      )
      if (width === 390)
        await page.screenshot({ path: '.preview/pageforge-reader-mobile.png', fullPage: true })
      await page.getByRole('button', { name: '閱讀', exact: true }).click()
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({ path: '.preview/pageforge-reader.png', fullPage: true })
    await page.evaluate(async (id) => {
      const database = await new Promise((resolve) => {
        const r = indexedDB.open('pageforge-library')
        r.onsuccess = () => resolve(r.result)
      })
      await new Promise((resolve, reject) => {
        const tx = database.transaction(['documents', 'revisions'], 'readwrite')
        const r = tx.objectStore('documents').get(id)
        r.onsuccess = () => {
          const doc = r.result
          const store = tx.objectStore('revisions')
          const node = store.get([id, doc.revisionIds[0]])
          node.onsuccess = () => {
            node.result.content += '篡改'
            store.put(node.result)
          }
        }
        tx.oncomplete = () => {
          database.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      })
    }, new URL(originalUrl).searchParams.get('id'))
    await page.reload()
    await page.getByRole('heading', { name: '無法開啟文件' }).waitFor()
    assert.match(await page.locator('.reader-loading [role=alert]').innerText(), /版本內容驗證失敗/)
    await page.goto(url)
    await page.getByRole('button', { name: '匯入文件', exact: true }).click()
    await page.evaluate(() => {
      window.__originalTransaction = IDBDatabase.prototype.transaction
      IDBDatabase.prototype.transaction = function (stores, mode, ...rest) {
        if (mode === 'readwrite') throw new DOMException('quota', 'QuotaExceededError')
        return window.__originalTransaction.call(this, stores, mode, ...rest)
      }
    })
    await page.getByLabel('選擇匯入文件').setInputFiles({
      name: '容量測試.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('This must not be saved.'),
    })
    await page.locator('dialog').getByRole('alert').waitFor()
    assert.match(await page.locator('dialog').getByRole('alert').innerText(), /儲存空間不足/)
    await page.evaluate(() => {
      IDBDatabase.prototype.transaction = window.__originalTransaction
    })
    assert.equal((await db(page, ['summaries'], 'readonly', 'getAll')).length, 5)
    await page.reload()
    await page.locator('.book-card').filter({ hasText: '試算表' }).click()
    await waitReader(page)
    const deletedId = new URL(page.url()).searchParams.get('id')
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: '刪除', exact: true }).click()
    await page.waitForURL(url + '/')
    assert.equal((await db(page, ['summaries'], 'readonly', 'getAll')).length, 4)
    assert.equal(await db(page, ['documents'], 'readonly', 'get', deletedId), undefined)
    assert.equal(await db(page, ['progress'], 'readonly', 'get', deletedId), undefined)
    assert.deepEqual(errors, [])
    assert.deepEqual(remote, [])
    await context.close()
    console.log(
      'PASS: 5 formats, reload persistence, position/font and mode restoration, quoted notes, PDF URL lifetime, edit, diff, restore, duplicate import, concurrent edit rejection, invalid files, quota failure rollback, atomic deletion, 5 viewport widths, tamper detection, no remote content requests or runtime errors.',
    )
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
