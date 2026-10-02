import { config } from './config'
import { marshal } from 'vax-sdk'
import { latest, type LibraryDocument, type SandboxBranch } from './documents'
import { createRevision, verifyHistory } from './history'
import { appendSandbox, insertSandbox } from './storage'

export function sandboxDocument(doc: LibraryDocument, branch: SandboxBranch): LibraryDocument {
  const base = doc.revisions.findIndex((revision) => revision.id === branch.baseRevisionId)
  if (branch.documentId !== doc.id || base < 0 || branch.revisions.length === 0)
    throw new Error('沙盒來源版本不存在。')
  return {
    ...doc,
    branchId: branch.id,
    revisions: [...doc.revisions.slice(0, base + 1), ...branch.revisions],
  }
}

export async function verifySandbox(doc: LibraryDocument, branch: SandboxBranch) {
  const projected = sandboxDocument(doc, branch)
  const base = doc.revisions.find((revision) => revision.id === branch.baseRevisionId)!
  const fork = branch.revisions[0]
  if (
    fork.kind !== 'fork' ||
    fork.parentId !== base.id ||
    fork.content !== base.content ||
    marshal(fork.notes).toString('utf8') !== marshal(base.notes).toString('utf8')
  )
    throw new Error('沙盒初始快照不一致。')
  await verifyHistory(projected)
  return projected
}

export async function forkSandbox(doc: LibraryDocument, baseRevisionId: string, name: string) {
  name = name.trim()
  if (!name || name.length > config.limits.sandboxNameCharacters)
    throw new Error(`沙盒名稱請填寫 1–${config.limits.sandboxNameCharacters} 字。`)
  const base = doc.revisions.findIndex((revision) => revision.id === baseRevisionId)
  if (base < 0 || !['markdown', 'text'].includes(doc.format))
    throw new Error('此版本無法建立文字沙盒。')
  const id = crypto.randomUUID()
  const source = { ...doc, branchId: id, revisions: doc.revisions.slice(0, base + 1) }
  const parent = latest(source)
  const revision = await createRevision(source, 'fork', parent.content, parent.notes)
  const branch: SandboxBranch = {
    id,
    documentId: doc.id,
    name,
    baseRevisionId,
    createdAt: revision.createdAt,
    updatedAt: revision.createdAt,
    revisions: [revision],
  }
  await verifySandbox(doc, branch)
  return insertSandbox(branch)
}

export async function saveSandbox(doc: LibraryDocument, branch: SandboxBranch, content: string) {
  if (
    !content.trim() ||
    new TextEncoder().encode(content).length > config.limits.textMiB * 1024 * 1024
  )
    throw new Error(`文字不可空白，且最多 ${config.limits.textMiB} MiB。`)
  const projected = await verifySandbox(doc, branch)
  const revision = await createRevision(projected, 'edit', content, latest(branch).notes)
  const updated = await appendSandbox(branch, latest(branch).id, revision)
  await verifySandbox(doc, updated)
  return updated
}
