import { database, announce } from './indexed-storage'
import { config } from './config'
import { marshal } from 'vax-sdk'
import {
  latest,
  type LibraryDocument,
  type Revision,
  type SandboxBranch,
  type SandboxSummary,
} from './documents'

const summary = ({ revisions, ...branch }: SandboxBranch): SandboxSummary => ({
  ...branch,
  head: revisions.at(-1)!.id,
  revisionCount: revisions.length,
})
export async function listSandboxes(id: string): Promise<SandboxSummary[]> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = db.transaction('branches').objectStore('branches').index('document').getAll(id)
    request.onsuccess = () => resolve(request.result.map(summary))
    request.onerror = () => reject(request.error)
  })
}
export async function loadSandbox(id: string, branchId: string): Promise<SandboxBranch> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = db.transaction('branches').objectStore('branches').get(branchId)
    request.onsuccess = () =>
      request.result?.documentId === id
        ? resolve(request.result)
        : reject(new Error('找不到此文件的沙盒。'))
    request.onerror = () => reject(request.error)
  })
}
async function mutate(
  id: string,
  branchId: string,
  change: (branch: SandboxBranch | undefined, doc: LibraryDocument) => SandboxBranch,
  creating = false,
) {
  const db = await database()
  return new Promise<SandboxBranch>((resolve, reject) => {
    const tx = db.transaction(['documents', 'branches'], 'readwrite')
    let failure: unknown, updated: SandboxBranch
    const fail = (error: unknown) => {
      failure = error
      try {
        tx.abort()
      } catch {
        /* A failed IndexedDB operation may already abort the transaction. */
      }
    }
    const document = tx.objectStore('documents').get(id)
    document.onsuccess = () => {
      if (!document.result) {
        fail(new Error('文件已不存在。'))
        return
      }
      const request = tx.objectStore('branches').get(branchId)
      request.onsuccess = () => {
        try {
          updated = change(request.result, document.result)
        } catch (error) {
          fail(error)
          return
        }
        if (creating) {
          const count = tx.objectStore('branches').index('document').count(id)
          count.onsuccess = () => {
            try {
              if (count.result >= config.limits.sandboxCount)
                fail(new Error('保留沙盒數量已達上限。'))
              else tx.objectStore('branches').add(updated)
            } catch (error) {
              fail(error)
            }
          }
        } else {
          try {
            tx.objectStore('branches').put(updated)
          } catch (error) {
            fail(error)
          }
        }
      }
    }
    tx.oncomplete = () => {
      announce()
      resolve(updated)
    }
    tx.onerror = () => reject(tx.error ?? new Error('沙盒保存失敗。'))
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('沙盒保存失敗。'))
  })
}
export async function insertSandbox(branch: SandboxBranch) {
  return mutate(
    branch.documentId,
    branch.id,
    (existing, doc) => {
      const base = doc.revisions.find((item) => item.id === branch.baseRevisionId)
      const fork = branch.revisions[0]
      if (
        existing ||
        !base ||
        !['markdown', 'text'].includes(doc.format) ||
        !fork ||
        branch.revisions.length !== 1 ||
        doc.revisions.some((item) => item.id === fork.id) ||
        fork.kind !== 'fork' ||
        fork.parentId !== base.id ||
        fork.prevSAI !== base.sai ||
        fork.branchId !== branch.id ||
        fork.content !== base.content ||
        marshal(fork.notes).toString('utf8') !== marshal(base.notes).toString('utf8')
      )
        throw new Error('沙盒初始版本或來源無效。')
      return branch
    },
    true,
  )
}
export async function appendSandbox(
  id: string,
  branchId: string,
  expectedHead: string,
  revision: Revision,
) {
  return mutate(id, branchId, (branch, doc) => {
    if (
      !branch ||
      branch.documentId !== id ||
      branch.archivedAt ||
      latest(branch).id !== expectedHead ||
      revision.parentId !== expectedHead ||
      revision.prevSAI !== latest(branch).sai ||
      revision.kind !== 'edit' ||
      revision.branchId !== branchId
    )
      throw new Error('沙盒已更新或封存，草稿仍會保留。')
    if (
      branch.revisions.length >= config.limits.revisionCount ||
      doc.revisions.some((item) => item.id === revision.id) ||
      branch.revisions.some((item) => item.id === revision.id)
    )
      throw new Error('沙盒版本數量或 ID 無效。')
    return { ...branch, updatedAt: revision.createdAt, revisions: [...branch.revisions, revision] }
  })
}
export async function archiveSandbox(
  id: string,
  branchId: string,
  expectedHead: string,
  archived: boolean,
) {
  return mutate(id, branchId, (branch) => {
    if (!branch || branch.documentId !== id || latest(branch).id !== expectedHead)
      throw new Error('沙盒已更新，請重新載入。')
    const updated = { ...branch }
    if (archived) updated.archivedAt = new Date().toISOString()
    else delete updated.archivedAt
    return updated
  })
}
