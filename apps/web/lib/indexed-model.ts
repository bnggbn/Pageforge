import type { LibraryDocument, Revision, SandboxBranch } from './documents'

export type DocumentRecord = Omit<
  LibraryDocument,
  'original' | 'sections' | 'sheets' | 'revisions'
> & {
  revisionIds: string[]
}
export type BranchRecord = Omit<SandboxBranch, 'revisions'> & { revisionIds: string[] }
type StoredRevision = Revision & { documentId: string; chainId: string }

export function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('資料無法保存。'))
    tx.onabort = () => reject(tx.error ?? new Error('資料保存已取消。'))
  })
}
export function revisionRow(documentId: string, revision: Revision): StoredRevision {
  return { ...revision, documentId, chainId: revision.branchId ?? documentId }
}
function unpack({ documentId, chainId, ...revision }: StoredRevision): Revision {
  return revision
}
export async function readRevision(tx: IDBTransaction, documentId: string, id: string) {
  const row = await result<StoredRevision | undefined>(
    tx.objectStore('revisions').get([documentId, id]),
  )
  return row ? unpack(row) : undefined
}
async function readChain(tx: IDBTransaction, documentId: string, chainId: string, ids: string[]) {
  const rows = await result<StoredRevision[]>(
    tx.objectStore('revisions').index('chain').getAll([documentId, chainId]),
  )
  const nodes = new Map(rows.map((row) => [row.id, row]))
  return ids.map((id) => {
    const node = nodes.get(id)
    if (!node) throw new Error('版本節點缺失，已停止載入。')
    return unpack(node)
  })
}
export function storeDocument(tx: IDBTransaction, doc: LibraryDocument) {
  const { original, sections, sheets, revisions, ...metadata } = doc
  tx.objectStore('documents').add({
    ...metadata,
    revisionIds: revisions.map((revision) => revision.id),
  })
  tx.objectStore('sources').add({ id: doc.id, original, sections, sheets })
  for (const revision of revisions) tx.objectStore('revisions').add(revisionRow(doc.id, revision))
}
export async function readDocument(
  tx: IDBTransaction,
  id: string,
): Promise<LibraryDocument | undefined> {
  const record = await result<DocumentRecord | undefined>(tx.objectStore('documents').get(id))
  if (!record) return undefined
  const { revisionIds, ...metadata } = record
  const [source, revisions] = await Promise.all([
    result(tx.objectStore('sources').get(id)),
    readChain(tx, id, id, revisionIds),
  ])
  if (!source) throw new Error('原始檔缺失，已停止載入。')
  return {
    ...metadata,
    original: source.original,
    sections: source.sections,
    sheets: source.sheets,
    revisions,
  }
}
export async function readBranch(tx: IDBTransaction, documentId: string, id: string) {
  const record = await result<BranchRecord | undefined>(tx.objectStore('branches').get(id))
  if (record?.documentId !== documentId) throw new Error('找不到此文件的沙盒。')
  const { revisionIds, ...metadata } = record
  return { ...metadata, revisions: await readChain(tx, documentId, id, revisionIds) }
}

/** All cursor writes belong to the upgrade transaction: failure leaves v3 intact. */
export function upgradeRecords(tx: IDBTransaction) {
  const sources = tx.db.createObjectStore('sources', { keyPath: 'id' })
  const versions = tx.db.createObjectStore('revisions', { keyPath: ['documentId', 'id'] })
  versions.createIndex('document', 'documentId')
  versions.createIndex('chain', ['documentId', 'chainId'])
  const documents = tx.objectStore('documents').openCursor()
  documents.onsuccess = () => {
    const cursor = documents.result
    if (!cursor) return
    const { original, sections, sheets, revisions, ...metadata } = cursor.value as LibraryDocument
    sources.add({ id: metadata.id, original, sections, sheets })
    for (const revision of revisions) versions.add(revisionRow(metadata.id, revision))
    cursor.update({ ...metadata, revisionIds: revisions.map((revision) => revision.id) })
    cursor.continue()
  }
  const branches = tx.objectStore('branches').openCursor()
  branches.onsuccess = () => {
    const cursor = branches.result
    if (!cursor) return
    const { revisions, ...metadata } = cursor.value as SandboxBranch
    for (const revision of revisions) versions.add(revisionRow(metadata.documentId, revision))
    cursor.update({ ...metadata, revisionIds: revisions.map((revision) => revision.id) })
    cursor.continue()
  }
}
