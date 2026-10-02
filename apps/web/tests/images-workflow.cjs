const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { chromium } = require('playwright')
const ts = require('typescript')
const { createLibraryServer } = require('../../../scripts/library-server.cjs')
const { loadConfig } = require('../../../scripts/config.cjs')

process.chdir(path.resolve(__dirname, '../../..'))

// Count layout reads on a long document, including boundaries and a middle block.
const moduleSource = ts.transpile(fs.readFileSync('apps/web/lib/reading-anchor.ts', 'utf8'), {
  module: ts.ModuleKind.CommonJS,
})
const anchorModule = { exports: {} }
new Function('exports', moduleSource)(anchorModule.exports)
let reads = 0
const blocks = Array.from({ length: 10000 }, (_, index) => ({
  getBoundingClientRect() {
    reads++
    return { top: index * 20 }
  },
}))
for (const [position, expected] of [
  [-10, 0],
  [100001, 5000],
  [300000, 9999],
]) {
  reads = 0
  assert.equal(anchorModule.exports.readingAnchor(blocks, position), blocks[expected])
  assert.ok(reads <= 15, `Too many layout reads: ${reads}`)
}

;(async () => {
  const root = path.resolve('.preview/image-tests', randomUUID())
  const collection = path.join(root, 'collection')
  fs.mkdirSync(path.join(collection, 'assets'), { recursive: true })
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64',
  )
  fs.writeFileSync(path.join(collection, 'assets/pixel.png'), png)
  fs.writeFileSync(path.join(collection, 'assets/fake.png'), '<script>alert(1)</script>')
  fs.writeFileSync(path.join(collection, 'assets/large.png'), Buffer.alloc(1024 * 1024 + 1))
  fs.writeFileSync(
    path.join(collection, 'images.md'),
    '# Local images\n\n![pixel](assets/pixel.png)\n\n![missing](assets/missing.png)\n\n![remote](https://example.com/tracker.png)\n\n![vector](assets/unsafe.svg)\n\n![escape](../secret.png)\n\n![data](data:image/png;base64,AA==)',
  )
  const config = loadConfig()
  config.paths.libraryRoot = root
  config.limits.imageMiB = 1
  const server = createLibraryServer({ config })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  let browser
  try {
    browser = await chromium.launch({
      channel:
        process.env.PAGEFORGE_BROWSER_CHANNEL ||
        (process.platform === 'win32' ? 'msedge' : undefined),
      headless: true,
    })
    const page = await browser.newPage()
    const remote = [],
      errors = []
    page.on('request', (request) => {
      if (request.url().startsWith('https:')) remote.push(request.url())
    })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(url)
    await page.locator('.book-card').click()
    await page.getByRole('button', { name: '版本紀錄', exact: true }).waitFor()
    const image = page.getByAltText('pixel', { exact: true })
    await image.scrollIntoViewIfNeeded()
    await page.waitForFunction(() => {
      const image = document.querySelector('img[alt=pixel]')
      return image?.complete && image.naturalWidth === 1
    })
    assert.equal(await image.getAttribute('loading'), 'lazy')
    assert.equal(await image.getAttribute('referrerpolicy'), 'no-referrer')
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.omitted-image')].some((node) =>
        node.textContent.includes('missing'),
      ),
    )
    assert.equal(await page.locator('.document-prose img').count(), 1)
    await page.getByLabel('新增筆記').fill('圖片旁的筆記')
    const savedResponse = page.waitForResponse(
      (response) => response.url().endsWith('/revisions') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: '保存筆記', exact: true }).click()
    const saved = await (await savedResponse).json()
    assert.equal(saved.originalBase64, undefined)
    assert.equal(saved.revisions, undefined)
    assert.equal(saved.revision.notes[0].body, '圖片旁的筆記')
    await page.getByText('已保存第 2 版。', { exact: true }).waitFor()
    await page.reload()
    await page.getByRole('button', { name: '版本紀錄', exact: true }).waitFor()
    assert.match(await page.locator('.note-list').innerText(), /圖片旁的筆記/)
    const [document] = await (await fetch(url + '/api/library/documents')).json()
    const getImage = (source) =>
      fetch(`${url}/api/library/documents/${document.id}/image?path=${encodeURIComponent(source)}`)
    const valid = await getImage('assets/pixel.png')
    assert.equal(valid.status, 200)
    assert.equal(valid.headers.get('content-type'), 'image/png')
    assert.equal(valid.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual(Buffer.from(await valid.arrayBuffer()), png)
    for (const [source, expected] of [
      ['../secret.png', 400],
      ['https://example.com/pixel.png', 400],
      ['/secret.png', 400],
      ['assets/fake.png', 415],
      ['assets/unsafe.svg', 415],
      ['assets/large.png', 413],
    ])
      assert.equal((await getImage(source)).status, expected, source)
    const outside = path.join(root, 'outside')
    fs.mkdirSync(outside)
    fs.writeFileSync(path.join(outside, 'pixel.png'), png)
    fs.symlinkSync(
      outside,
      path.join(collection, 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    assert.equal((await getImage('linked/pixel.png')).status, 403)
    await page.screenshot({ path: '.preview/pageforge-local-images.png', fullPage: true })
    assert.deepEqual(remote, [])
    assert.deepEqual(errors, [])
    console.log(
      'PASS local image rendering, broken-image fallback, path/signature/size/link rejection, no remote requests, logarithmic reading anchors',
    )
  } finally {
    if (browser) await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
