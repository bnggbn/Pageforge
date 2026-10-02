import { config } from './config'
import { latest, summary, type DocumentSummary, type LibraryDocument, type ReadingPosition, type Revision } from './documents'

let opening: Promise<IDBDatabase> | null = null
export const changeSource = crypto.randomUUID()
export function database(): Promise<IDBDatabase> {
  if (opening) return opening
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('此瀏覽器無法使用本機儲存。')); return }
    const request = indexedDB.open('pageforge-library', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      db.createObjectStore('documents', { keyPath: 'id' })
      const meta = db.createObjectStore('summaries', { keyPath: 'id' })
      meta.createIndex('source', ['format', 'originalHash'], { unique: true })
      db.createObjectStore('progress', { keyPath: 'documentId' })
      db.createObjectStore('settings')
    }
    request.onblocked = () => { reject(new Error('請關閉其他 Pageforge 分頁後再試。')) }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { db.close(); opening = null }
      resolve(db)
    }
  }).catch(error => { opening = null; throw error })
  return opening
}
function result<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) }) }
function completed(transaction: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error ?? new Error('資料無法保存。')); transaction.onabort = () => reject(transaction.error ?? new Error('資料保存已取消。')) }) }
export async function listDocuments(): Promise<DocumentSummary[]> {
  const db = await database()
  return result(db.transaction('summaries').objectStore('summaries').getAll())
}
export async function loadDocument(id: string): Promise<LibraryDocument | undefined> {
  const db = await database()
  return result(db.transaction('documents').objectStore('documents').get(id))
}
export async function findDuplicate(format: string, hash: string): Promise<DocumentSummary | undefined> {
  const db = await database()
  return result(db.transaction('summaries').objectStore('summaries').index('source').get([format, hash]))
}
export async function insertDocument(doc: LibraryDocument): Promise<void> {
  const db = await database()
  const tx = db.transaction(['documents', 'summaries'], 'readwrite')
  const done = completed(tx)
  tx.objectStore('documents').add(doc)
  tx.objectStore('summaries').add(summary(doc))
  await done
}
export async function appendRevision(id: string, expectedHead: string, revision: Revision): Promise<LibraryDocument> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['documents', 'summaries', 'progress'], 'readwrite')
    let updated: LibraryDocument
    let failure: Error | null = null
    const req = tx.objectStore('documents').get(id)
    req.onsuccess = () => {
      const doc: LibraryDocument | undefined = req.result
      if (!doc || latest(doc).id !== expectedHead || revision.parentId !== expectedHead || revision.prevSAI !== latest(doc).sai) { failure = new Error('文件已在另一個分頁修改或刪除。請重新載入；未保存的文字仍保留在編輯器中。'); tx.abort(); return }
      updated = { ...doc, updatedAt: revision.createdAt, revisions: [...doc.revisions, revision] }
      const changedContent = latest(doc).content !== revision.content
      tx.objectStore('documents').put(updated)
      const metaReq = tx.objectStore('summaries').get(id)
      metaReq.onsuccess = () => tx.objectStore('summaries').put(summary(updated, changedContent ? 0 : (metaReq.result?.progress ?? 0)))
      if (changedContent) tx.objectStore('progress').delete(id)
    }
    tx.oncomplete = () => { announce(); resolve(updated) }
    tx.onerror = () => reject(tx.error ?? new Error('版本保存失敗。'))
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('版本保存失敗。'))
  })
}
export async function deleteDocument(id: string): Promise<void> {
  const db = await database()
  const tx = db.transaction(['documents', 'summaries', 'progress'], 'readwrite')
  const done = completed(tx)
  for (const name of ['documents', 'summaries', 'progress']) tx.objectStore(name).delete(id)
  await done
  announce()
}
export async function readProgress(id: string): Promise<ReadingPosition | undefined> {
  const db = await database()
  return result(db.transaction('progress').objectStore('progress').get(id))
}
export async function saveProgress(id: string, position: ReadingPosition): Promise<void> {
  const db = await database()
  const tx = db.transaction(['summaries', 'progress'], 'readwrite')
  const done = completed(tx)
  const req = tx.objectStore('summaries').get(id)
  req.onsuccess = () => {
    const meta: DocumentSummary | undefined = req.result
    if (!meta || meta.head !== position.revisionId) { tx.abort(); return }
    tx.objectStore('progress').put({ ...position, percentage: Math.max(0, Math.min(100, position.percentage)), documentId: id })
    tx.objectStore('summaries').put({ ...meta, progress: position.percentage })
  }
  await done
}
export async function readFontSize(): Promise<number> {
  const db = await database()
  const size = await result(db.transaction('settings').objectStore('settings').get('fontSize'))
  return typeof size === 'number' && config.reading.fontSizes.includes(size) ? size : config.reading.defaultFontSize
}
export async function saveFontSize(size: number) {
  const db = await database()
  const tx = db.transaction('settings', 'readwrite')
  const done = completed(tx)
  tx.objectStore('settings').put(size, 'fontSize')
  await done
}
export function announce() {
  if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('pageforge-library'); channel.postMessage({ source: changeSource }); channel.close() }
}
