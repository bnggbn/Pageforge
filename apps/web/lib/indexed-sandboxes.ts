import { database, announce } from './indexed-storage'
import { config } from './config'
import { marshal } from 'vax-sdk'
import { latest, type Revision, type SandboxBranch, type SandboxSummary } from './documents'
import {
  result,
  readBranch,
  readRevision,
  revisionRow,
  type DocumentRecord,
  type BranchRecord,
} from './indexed-model'

export async function listSandboxes(id: string): Promise<SandboxSummary[]> {
  const db = await database()
  const records = await result<BranchRecord[]>(
    db.transaction('branches').objectStore('branches').index('document').getAll(id),
  )
  return records.map(({ revisionIds, ...metadata }) => ({
    ...metadata,
    head: revisionIds.at(-1)!,
    revisionCount: revisionIds.length,
  }))
}
export async function loadSandbox(id: string, branchId: string): Promise<SandboxBranch> {
  const db = await database()
  return readBranch(db.transaction(['branches', 'revisions']), id, branchId)
}
async function mutate(
  id: string,
  branchId: string,
  change: (
    branch: BranchRecord | undefined,
    doc: DocumentRecord,
    tx: IDBTransaction,
  ) => Promise<BranchRecord> | BranchRecord,
  creating = false,
) {
  const db = await database()
  return new Promise<BranchRecord>((resolve, reject) => {
    const tx = db.transaction(['documents', 'branches', 'revisions'], 'readwrite')
    let failure: unknown, updated: BranchRecord
    void (async () => {
      const doc = await result<DocumentRecord | undefined>(tx.objectStore('documents').get(id))
      if (!doc) throw new Error('文件已不存在。')
      const branch = await result<BranchRecord | undefined>(
        tx.objectStore('branches').get(branchId),
      )
      updated = await change(branch, doc, tx)
      if (creating) {
        const count = await result(tx.objectStore('branches').index('document').count(id))
        if (count >= config.limits.sandboxCount) throw new Error('保留沙盒數量已達上限。')
        tx.objectStore('branches').add(updated)
      } else tx.objectStore('branches').put(updated)
    })().catch((error) => {
      failure = error
      try {
        tx.abort()
      } catch {
        /* Already aborted by an IndexedDB failure. */
      }
    })
    tx.oncomplete = () => {
      announce()
      resolve(updated)
    }
    tx.onerror = () => reject(tx.error ?? new Error('沙盒保存失敗。'))
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('沙盒保存失敗。'))
  })
}
export async function insertSandbox(branch: SandboxBranch) {
  await mutate(
    branch.documentId,
    branch.id,
    async (existing, doc, tx) => {
      const fork = branch.revisions[0]
      if (
        existing ||
        !doc.revisionIds.includes(branch.baseRevisionId) ||
        !['markdown', 'text'].includes(doc.format) ||
        !fork ||
        branch.revisions.length !== 1 ||
        doc.revisionIds.includes(fork.id) ||
        fork.kind !== 'fork' ||
        fork.parentId !== branch.baseRevisionId ||
        fork.branchId !== branch.id
      )
        throw new Error('沙盒初始版本或來源無效。')
      const base = await readRevision(tx, doc.id, branch.baseRevisionId)
      if (
        !base ||
        fork.prevSAI !== base.sai ||
        fork.content !== base.content ||
        marshal(fork.notes).toString('utf8') !== marshal(base.notes).toString('utf8')
      )
        throw new Error('沙盒初始版本或來源無效。')
      tx.objectStore('revisions').add(revisionRow(doc.id, fork))
      const { revisions, ...metadata } = branch
      return { ...metadata, revisionIds: revisions.map((revision) => revision.id) }
    },
    true,
  )
  return branch
}
export async function appendSandbox(
  branch: SandboxBranch,
  expectedHead: string,
  revision: Revision,
) {
  await mutate(branch.documentId, branch.id, (stored, doc, tx) => {
    if (
      !stored ||
      stored.documentId !== doc.id ||
      stored.archivedAt ||
      stored.revisionIds.at(-1) !== expectedHead ||
      latest(branch).id !== expectedHead ||
      revision.parentId !== expectedHead ||
      revision.prevSAI !== latest(branch).sai ||
      revision.kind !== 'edit' ||
      revision.branchId !== branch.id
    )
      throw new Error('沙盒已更新或封存，草稿仍會保留。')
    if (
      stored.revisionIds.length >= config.limits.revisionCount ||
      doc.revisionIds.includes(revision.id) ||
      stored.revisionIds.includes(revision.id)
    )
      throw new Error('沙盒版本數量或 ID 無效。')
    tx.objectStore('revisions').add(revisionRow(doc.id, revision))
    return {
      ...stored,
      updatedAt: revision.createdAt,
      revisionIds: [...stored.revisionIds, revision.id],
    }
  })
  return { ...branch, updatedAt: revision.createdAt, revisions: [...branch.revisions, revision] }
}
export async function archiveSandbox(
  id: string,
  branchId: string,
  expectedHead: string,
  archived: boolean,
) {
  await mutate(id, branchId, (branch) => {
    if (!branch || branch.documentId !== id || branch.revisionIds.at(-1) !== expectedHead)
      throw new Error('沙盒已更新，請重新載入。')
    const updated = { ...branch }
    if (archived) updated.archivedAt = new Date().toISOString()
    else delete updated.archivedAt
    return updated
  })
  return loadSandbox(id, branchId)
}
