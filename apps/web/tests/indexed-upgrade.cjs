const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')

async function checkUpgrade(browser, url, document, branch) {
  const copies = [
    {
      id: randomUUID(),
      documentId: document.id,
      baseRevisionId: document.revisions.at(-1).id,
      version: randomUUID(),
      body: 'Upgrade note',
      quote: '',
      location: '全文筆記',
      updatedAt: new Date().toISOString(),
    },
    {
      id: randomUUID(),
      documentId: document.id,
      branchId: branch.id,
      baseRevisionId: branch.revisions.at(-1).id,
      version: randomUUID(),
      content: 'Legacy branch draft',
      body: '',
      quote: '',
      location: '全文筆記',
      updatedAt: new Date().toISOString(),
    },
  ]
  for (const failUpgrade of [true, false]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    try {
      const page = await context.newPage()
      // Seed a real v3 database before loading any application JavaScript.
      await page.goto(url + '/api/library/documents')
      await page.evaluate(
        async ({ document, branch, copies }) => {
          const { originalBase64, originalType, ...doc } = document
          doc.original = new Blob(
            [Uint8Array.from(atob(originalBase64), (character) => character.charCodeAt(0))],
            { type: originalType },
          )
          await new Promise((resolve, reject) => {
            const request = indexedDB.open('pageforge-library', 3)
            request.onupgradeneeded = () => {
              const db = request.result
              db.createObjectStore('documents', { keyPath: 'id' })
              const summaries = db.createObjectStore('summaries', { keyPath: 'id' })
              summaries.createIndex('source', ['format', 'originalHash'], { unique: true })
              db.createObjectStore('settings')
              db.createObjectStore('progress', { keyPath: 'documentId' })
              for (const name of ['branches', 'drafts'])
                db.createObjectStore(name, { keyPath: 'id' }).createIndex('document', 'documentId')
            }
            request.onerror = () => reject(request.error)
            request.onsuccess = () => {
              const db = request.result
              const tx = db.transaction(
                ['documents', 'summaries', 'branches', 'drafts', 'progress', 'settings'],
                'readwrite',
              )
              tx.objectStore('documents').add(doc)
              tx.objectStore('branches').add(branch)
              for (const copy of copies) tx.objectStore('drafts').add(copy)
              tx.objectStore('summaries').add({
                id: doc.id,
                title: doc.title,
                filename: doc.filename,
                format: doc.format,
                originalHash: doc.originalHash,
                head: doc.revisions.at(-1).id,
                revisionCount: doc.revisions.length,
                progress: 20,
              })
              tx.objectStore('progress').add({
                documentId: doc.id,
                revisionId: doc.revisions.at(-1).id,
                section: 0,
                block: 'block-0',
                ratio: 0.2,
                percentage: 20,
                updatedAt: new Date().toISOString(),
              })
              tx.objectStore('settings').put(20, 'fontSize')
              tx.oncomplete = () => {
                db.close()
                resolve()
              }
              tx.onabort = () => {
                db.close()
                reject(tx.error)
              }
            }
          })
        },
        { document, branch, copies },
      )
      await context.route('**/api/library/status', (route) =>
        route.fulfill({ status: 404, body: '{}' }),
      )
      if (failUpgrade) {
        await context.addInitScript(() => {
          if (localStorage.getItem('failed-upgrade-once')) return
          localStorage.setItem('failed-upgrade-once', '1')
          const add = IDBObjectStore.prototype.add
          IDBObjectStore.prototype.add = function (...args) {
            if (this.name === 'revisions')
              throw new DOMException('Simulated upgrade quota', 'QuotaExceededError')
            return add.apply(this, args)
          }
        })
      }
      await page.goto(`${url}/reader/?id=${document.id}`)
      if (failUpgrade) {
        await page.getByRole('heading', { name: '無法開啟文件' }).waitFor()
        const before = await page.evaluate(async (id) => {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('pageforge-library', 3)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })
          const doc = await new Promise((resolve) => {
            const request = db.transaction('documents').objectStore('documents').get(id)
            request.onsuccess = () => resolve(request.result)
          })
          const value = {
            version: db.version,
            revisions: doc.revisions.length,
            originalSize: doc.original.size,
          }
          db.close()
          return value
        }, document.id)
        assert.equal(before.version, 3)
        assert.equal(before.revisions, document.revisions.length)
        assert.ok(before.originalSize > 0)
        await page.reload()
      }
      await page.getByLabel('新增筆記').waitFor()
      assert.equal(await page.getByLabel('新增筆記').inputValue(), 'Upgrade note')
      const metadata = await page.evaluate(
        async ({ id, branchId }) => {
          const db = await new Promise((resolve) => {
            const request = indexedDB.open('pageforge-library')
            request.onsuccess = () => resolve(request.result)
          })
          const get = (request) =>
            new Promise((resolve) => (request.onsuccess = () => resolve(request.result)))
          const tx = db.transaction([
            'documents',
            'branches',
            'sources',
            'revisions',
            'settings',
            'progress',
          ])
          const [doc, branch, source, count, fontSize, progress] = await Promise.all([
            get(tx.objectStore('documents').get(id)),
            get(tx.objectStore('branches').get(branchId)),
            get(tx.objectStore('sources').get(id)),
            get(tx.objectStore('revisions').count()),
            get(tx.objectStore('settings').get('fontSize')),
            get(tx.objectStore('progress').get(id)),
          ])
          const value = {
            version: db.version,
            doc,
            branch,
            originalSize: source.original.size,
            count,
            fontSize,
            progress: progress.percentage,
          }
          db.close()
          return value
        },
        { id: document.id, branchId: branch.id },
      )
      assert.equal(metadata.version, 4)
      assert.equal(metadata.doc.revisions, undefined)
      assert.equal(metadata.doc.original, undefined)
      assert.equal(metadata.doc.sheets, undefined)
      assert.equal(metadata.branch.revisions, undefined)
      assert.equal(metadata.count, document.revisions.length + branch.revisions.length)
      assert.equal(metadata.fontSize, 20)
      assert.equal(metadata.progress, 20)
      await page.evaluate(() => {
        window.__draftStores = []
        const transaction = IDBDatabase.prototype.transaction
        IDBDatabase.prototype.transaction = function (stores, mode, ...rest) {
          if (mode === 'readwrite' && Array.from([stores].flat()).includes('drafts'))
            window.__draftStores.push(Array.from([stores].flat()))
          return transaction.call(this, stores, mode, ...rest)
        }
      })
      await page.getByLabel('新增筆記').fill('Updated upgrade note')
      await page
        .locator('.working-copy-bar [role=status]')
        .filter({ hasText: '草稿已暫存' })
        .waitFor()
      const stores = await page.evaluate(() => window.__draftStores)
      assert.ok(stores.length > 0)
      assert.ok(stores.every((names) => !names.includes('sources') && !names.includes('revisions')))
      await page.getByRole('button', { name: '思考沙盒', exact: true }).click()
      await page.getByRole('button', { name: `開啟沙盒 ${branch.name}`, exact: true }).click()
      await page.getByLabel('沙盒文字').waitFor()
      assert.equal(await page.getByLabel('沙盒文字').inputValue(), 'Legacy branch draft')
    } finally {
      await context.close()
    }
  }
  console.log(
    'PASS IndexedDB v3 upgrade: originals, complete chains, branch and note drafts, settings, progress, quota rollback/retry, metadata-only autosave',
  )
}
module.exports = { checkUpgrade }
