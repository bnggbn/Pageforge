import { config } from './config'
import { marshal } from 'vax-sdk'
import {
  latest,
  summary,
  WorkingCopyConflict,
  type DocumentSummary,
  type LibraryDocument,
  type ReadingPosition,
  type Revision,
  type WorkingCopyRecord,
} from './documents'
import {
  result,
  completed,
  upgradeRecords,
  storeDocument,
  readDocument,
  readRevision,
  revisionRow,
  type DocumentRecord,
  type BranchRecord,
} from './indexed-model'

let opening: Promise<IDBDatabase> | null = null
export const changeSource = crypto.randomUUID()
export function database(): Promise<IDBDatabase> {
  if (opening) return opening
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('此瀏覽器無法使用本機儲存。'))
    const request = indexedDB.open('pageforge-library', 4)
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
      if (!db.objectStoreNames.contains('sources')) upgradeRecords(request.transaction!)
    }
    request.onblocked = () => reject(new Error('請關閉其他 Pageforge 分頁後再試。'))
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
export async function listDocuments(): Promise<DocumentSummary[]> {
  const db = await database()
  return result(db.transaction('summaries').objectStore('summaries').getAll())
}
export async function loadDocument(id: string): Promise<LibraryDocument | undefined> {
  const db = await database()
  return readDocument(db.transaction(['documents', 'sources', 'revisions']), id)
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
  const tx = db.transaction(['documents', 'sources', 'revisions', 'summaries'], 'readwrite')
  const done = completed(tx)
  storeDocument(tx, doc)
  tx.objectStore('summaries').add(summary(doc))
  await done
}
export async function appendRevision(
  document: LibraryDocument,
  expectedHead: string,
  revision: Revision,
): Promise<LibraryDocument> {
  const db = await database(),
    id = document.id
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ['documents', 'summaries', 'progress', 'branches', 'revisions'],
      'readwrite',
    )
    let updated: LibraryDocument, failure: unknown
    const fail = (error: unknown) => {
      failure = error
      tx.abort()
    }
    const request = tx.objectStore('documents').get(id)
    request.onsuccess = () => {
      const doc = request.result as DocumentRecord | undefined
      if (
        !doc ||
        doc.revisionIds.at(-1) !== expectedHead ||
        latest(document).id !== expectedHead ||
        revision.branchId ||
        revision.kind === 'fork' ||
        revision.kind === 'import' ||
        revision.parentId !== expectedHead ||
        revision.prevSAI !== latest(document).sai ||
        doc.revisionIds.length >= config.limits.revisionCount ||
        doc.revisionIds.includes(revision.id)
      ) {
        fail(new Error('文件已在另一個分頁修改或刪除。請重新載入；未保存的文字仍保留在編輯器中。'))
        return
      }
      const publish = () => {
        updated = {
          ...document,
          updatedAt: revision.createdAt,
          revisions: [...document.revisions, revision],
        }
        tx.objectStore('revisions').add(revisionRow(id, revision))
        tx.objectStore('documents').put({
          ...doc,
          updatedAt: revision.createdAt,
          revisionIds: [...doc.revisionIds, revision.id],
        })
        const changed = latest(document).content !== revision.content
        const meta = tx.objectStore('summaries').get(id)
        meta.onsuccess = () =>
          tx
            .objectStore('summaries')
            .put(summary(updated, changed ? 0 : (meta.result?.progress ?? 0)))
        if (changed) tx.objectStore('progress').delete(id)
      }
      if (revision.kind !== 'adopt') return publish()
      const source = revision.adoptedFrom
      if (!source) return fail(new Error('採納來源無效。'))
      const branch = tx.objectStore('branches').get(source.branchId)
      branch.onsuccess = () => {
        const stored = branch.result as BranchRecord | undefined
        if (
          stored?.documentId !== id ||
          stored.baseRevisionId !== source.baseRevisionId ||
          !stored.revisionIds.includes(source.revisionId)
        )
          return fail(new Error('採納來源無效。'))
        void readRevision(tx, id, source.revisionId)
          .then((node) => {
            if (
              node?.branchId !== source.branchId ||
              node.content !== revision.content ||
              marshal(latest(document).notes).toString('utf8') !==
                marshal(revision.notes).toString('utf8')
            )
              fail(new Error('採納來源或主線筆記不一致。'))
            else publish()
          })
          .catch(fail)
      }
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
    ['documents', 'sources', 'revisions', 'summaries', 'progress', 'drafts', 'branches'],
    'readwrite',
  )
  const done = completed(tx)
  for (const name of ['documents', 'sources', 'summaries', 'progress'])
    tx.objectStore(name).delete(id)
  for (const name of ['drafts', 'branches', 'revisions']) {
    const request = tx.objectStore(name).index('document').openKeyCursor(id)
    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) {
        tx.objectStore(name).delete(cursor.primaryKey)
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
  const tx = db.transaction(['summaries', 'progress'], 'readwrite'),
    done = completed(tx)
  const request = tx.objectStore('summaries').get(id)
  request.onsuccess = () => {
    const meta: DocumentSummary | undefined = request.result
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
  const db = await database(),
    tx = db.transaction('settings', 'readwrite'),
    done = completed(tx)
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
export async function listWorkingCopies(id: string): Promise<WorkingCopyRecord[]> {
  const db = await database()
  return result(db.transaction('drafts').objectStore('drafts').index('document').getAll(id))
}
export async function saveWorkingCopy(copy: WorkingCopyRecord, expectedVersion: string | null) {
  const db = await database()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['documents', 'drafts', 'branches'], 'readwrite')
    let failure: Error | null = null
    const fail = (error: Error) => {
      failure = error
      tx.abort()
    }
    const request = tx.objectStore('documents').get(copy.documentId)
    request.onsuccess = () => {
      const doc = request.result as DocumentRecord | undefined
      if (!doc) return fail(new Error('文件或草稿來源已不存在，草稿未保存。'))
      const save = () => {
        const stored = tx.objectStore('drafts').get(copy.id)
        stored.onsuccess = () => {
          if (
            (stored.result?.version ?? null) !== expectedVersion ||
            (stored.result &&
              (stored.result.documentId !== copy.documentId ||
                stored.result.branchId !== copy.branchId))
          )
            return fail(new WorkingCopyConflict())
          const count = tx.objectStore('drafts').index('document').count(copy.documentId)
          count.onsuccess = () => {
            if (!stored.result && count.result >= config.limits.workingCopyCount)
              fail(new Error('此文件的草稿數量已達上限，請先整理保留的草稿。'))
            else tx.objectStore('drafts').put(copy)
          }
        }
      }
      if (copy.branchId) {
        const branch = tx.objectStore('branches').get(copy.branchId)
        branch.onsuccess = () => {
          const base = branch.result as BranchRecord | undefined
          if (
            base?.documentId !== doc.id ||
            (base.baseRevisionId !== copy.baseRevisionId &&
              !base.revisionIds.includes(copy.baseRevisionId))
          )
            fail(new Error('沙盒草稿來源不存在。'))
          else save()
        }
      } else if (doc.revisionIds.includes(copy.baseRevisionId)) save()
      else fail(new Error('草稿來源不存在。'))
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('草稿保存失敗。'))
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('草稿保存失敗。'))
  })
}
export async function removeWorkingCopy(id: string, copyId: string, expectedVersion: string) {
  const db = await database(),
    tx = db.transaction('drafts', 'readwrite'),
    done = completed(tx)
  const request = tx.objectStore('drafts').get(copyId)
  request.onsuccess = () => {
    if (request.result?.documentId === id && request.result.version === expectedVersion)
      tx.objectStore('drafts').delete(copyId)
  }
  await done
}
