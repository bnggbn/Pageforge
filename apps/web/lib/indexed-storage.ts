import { config } from './config'
import { marshal } from 'vax-sdk'
import {
  latest,
  summary,
  type DocumentSummary,
  type LibraryDocument,
  type ReadingPosition,
  type Revision,
  type WorkingCopy,
  WorkingCopyConflict,
} from './documents'

let opening: Promise<IDBDatabase> | null = null
export const changeSource = crypto.randomUUID()
export function database(): Promise<IDBDatabase> {
  if (opening) return opening
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('此瀏覽器無法使用本機儲存。'))
      return
    }
    const request = indexedDB.open('pageforge-library', 3)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'id' })
        const meta = db.createObjectStore('summaries', { keyPath: 'id' })
        meta.createIndex('source', ['format', 'originalHash'], { unique: true })
        db.createObjectStore('progress', { keyPath: 'documentId' })
        db.createObjectStore('settings')
      }
      if (!db.objectStoreNames.contains('drafts')) {
        const drafts = db.createObjectStore('drafts', { keyPath: 'id' })
        drafts.createIndex('document', 'documentId')
      }
      if (!db.objectStoreNames.contains('branches')) {
        const branches = db.createObjectStore('branches', { keyPath: 'id' })
        branches.createIndex('document', 'documentId')
      }
    }
    request.onblocked = () => {
      reject(new Error('請關閉其他 Pageforge 分頁後再試。'))
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        opening = null
      }
      resolve(db)
    }
  }).catch((error) => {
    opening = null
    throw error
  })
  return opening
}
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('資料無法保存。'))
    transaction.onabort = () => reject(transaction.error ?? new Error('資料保存已取消。'))
  })
}
export async function listDocuments(): Promise<DocumentSummary[]> {
  const db = await database()
  return result(db.transaction('summaries').objectStore('summaries').getAll())
}
export async function loadDocument(id: string): Promise<LibraryDocument | undefined> {
  const db = await database()
  return result(db.transaction('documents').objectStore('documents').get(id))
}
export async function findDuplicate(
  format: string,
  hash: string,
): Promise<DocumentSummary | undefined> {
  const db = await database()
  return result(
    db.transaction('summaries').objectStore('summaries').index('source').get([format, hash]),
  )
}
export async function insertDocument(doc: LibraryDocument): Promise<void> {
  const db = await database()
  const tx = db.transaction(['documents', 'summaries'], 'readwrite')
  const done = completed(tx)
  tx.objectStore('documents').add(doc)
  tx.objectStore('summaries').add(summary(doc))
  await done
}
export async function appendRevision(
  id: string,
  expectedHead: string,
  revision: Revision,
): Promise<LibraryDocument> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['documents', 'summaries', 'progress', 'branches'], 'readwrite')
    let updated: LibraryDocument
    let failure: Error | null = null
    const req = tx.objectStore('documents').get(id)
    req.onsuccess = () => {
      const doc: LibraryDocument | undefined = req.result
      if (
        !doc ||
        revision.branchId ||
        revision.kind === 'fork' ||
        latest(doc).id !== expectedHead ||
        revision.parentId !== expectedHead ||
        revision.prevSAI !== latest(doc).sai
      ) {
        failure = new Error(
          '文件已在另一個分頁修改或刪除。請重新載入；未保存的文字仍保留在編輯器中。',
        )
        tx.abort()
        return
      }
      const publish = () => {
        updated = { ...doc, updatedAt: revision.createdAt, revisions: [...doc.revisions, revision] }
        const changedContent = latest(doc).content !== revision.content
        tx.objectStore('documents').put(updated)
        const metaReq = tx.objectStore('summaries').get(id)
        metaReq.onsuccess = () =>
          tx
            .objectStore('summaries')
            .put(summary(updated, changedContent ? 0 : (metaReq.result?.progress ?? 0)))
        if (changedContent) tx.objectStore('progress').delete(id)
      }
      if (revision.kind === 'adopt') {
        const source = revision.adoptedFrom
        if (!source) {
          failure = new Error('採納來源無效。')
          tx.abort()
          return
        }
        const branch = tx.objectStore('branches').get(source.branchId)
        branch.onsuccess = () => {
          const stored = branch.result
          const node = stored?.revisions.find((item: Revision) => item.id === source.revisionId)
          if (
            stored?.documentId !== id ||
            stored.baseRevisionId !== source.baseRevisionId ||
            !node ||
            node.content !== revision.content ||
            marshal(latest(doc).notes).toString('utf8') !== marshal(revision.notes).toString('utf8')
          ) {
            failure = new Error('採納來源或主線筆記不一致。')
            tx.abort()
            return
          }
          publish()
        }
      } else publish()
    }
    tx.oncomplete = () => {
      announce()
      resolve(updated)
    }
    tx.onerror = () => reject(tx.error ?? new Error('版本保存失敗。'))
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('版本保存失敗。'))
  })
}
export async function deleteDocument(id: string): Promise<void> {
  const db = await database()
  const tx = db.transaction(
    ['documents', 'summaries', 'progress', 'drafts', 'branches'],
    'readwrite',
  )
  const done = completed(tx)
  for (const name of ['documents', 'summaries', 'progress']) tx.objectStore(name).delete(id)
  for (const store of ['drafts', 'branches']) {
    const request = tx.objectStore(store).index('document').openKeyCursor(id)
    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) {
        tx.objectStore(store).delete(cursor.primaryKey)
        cursor.continue()
      }
    }
  }
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
    if (!meta || meta.head !== position.revisionId) {
      tx.abort()
      return
    }
    tx.objectStore('progress').put({
      ...position,
      percentage: Math.max(0, Math.min(100, position.percentage)),
      documentId: id,
    })
    tx.objectStore('summaries').put({ ...meta, progress: position.percentage })
  }
  await done
}
export async function readFontSize(): Promise<number> {
  const db = await database()
  const size = await result(db.transaction('settings').objectStore('settings').get('fontSize'))
  return typeof size === 'number' && config.reading.fontSizes.includes(size)
    ? size
    : config.reading.defaultFontSize
}
export async function saveFontSize(size: number) {
  const db = await database()
  const tx = db.transaction('settings', 'readwrite')
  const done = completed(tx)
  tx.objectStore('settings').put(size, 'fontSize')
  await done
}
export function announce() {
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('pageforge-library')
    channel.postMessage({ source: changeSource })
    channel.close()
  }
}

export async function listWorkingCopies(id: string): Promise<WorkingCopy[]> {
  const db = await database()
  return result(db.transaction('drafts').objectStore('drafts').index('document').getAll(id))
}

export async function saveWorkingCopy(copy: WorkingCopy, expectedVersion: string | null) {
  const db = await database()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['documents', 'drafts', 'branches'], 'readwrite')
    let failure: Error | null = null
    const fail = (error: Error) => {
      failure = error
      tx.abort()
    }
    const document = tx.objectStore('documents').get(copy.documentId)
    document.onsuccess = () => {
      const doc: LibraryDocument | undefined = document.result
      if (!doc) {
        fail(new Error('文件或草稿來源已不存在，草稿未保存。'))
        return
      }
      const save = () => {
        const stored = tx.objectStore('drafts').get(copy.id)
        stored.onsuccess = () => {
          if (
            (stored.result?.version ?? null) !== expectedVersion ||
            (stored.result &&
              (stored.result.documentId !== copy.documentId ||
                stored.result.branchId !== copy.branchId))
          ) {
            fail(new WorkingCopyConflict())
            return
          }
          const count = tx.objectStore('drafts').index('document').count(copy.documentId)
          count.onsuccess = () => {
            if (!stored.result && count.result >= config.limits.workingCopyCount) {
              fail(new Error('此文件的草稿數量已達上限，請先整理保留的草稿。'))
              return
            }
            tx.objectStore('drafts').put(copy)
          }
        }
      }
      if (copy.branchId) {
        const branch = tx.objectStore('branches').get(copy.branchId)
        branch.onsuccess = () => {
          if (
            branch.result?.documentId !== doc.id ||
            ![
              branch.result.baseRevisionId,
              ...branch.result.revisions.map((item: Revision) => item.id),
            ].includes(copy.baseRevisionId)
          ) {
            fail(new Error('沙盒草稿來源不存在。'))
            return
          }
          save()
        }
      } else if (doc.revisions.some((revision) => revision.id === copy.baseRevisionId)) save()
      else fail(new Error('草稿來源不存在。'))
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('草稿保存失敗。'))
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('草稿保存失敗。'))
  })
}

export async function removeWorkingCopy(id: string, copyId: string, expectedVersion: string) {
  const db = await database()
  const tx = db.transaction('drafts', 'readwrite')
  const done = completed(tx)
  const request = tx.objectStore('drafts').get(copyId)
  request.onsuccess = () => {
    if (request.result?.documentId === id && request.result.version === expectedVersion)
      tx.objectStore('drafts').delete(copyId)
  }
  await done
}
