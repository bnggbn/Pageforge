import { Buffer } from 'buffer'
import {
  computeGenesisSAI,
  computeSAI,
  generateGenesisSalt,
  toHex,
  fromHex,
  marshal,
} from 'vax-sdk'
import type { LibraryDocument, Revision, Note, AdoptionSource } from './documents'

// vax-sdk 1.0.0 canonicalizes with Buffer; its crypto primitives use Web Crypto.
const globals = globalThis as unknown as { Buffer?: typeof Buffer }
globals.Buffer ??= Buffer

interface VerifiedContext {
  id: string
  actor: string
  salt: string
  genesis: string
  originalHash: string
  title: string
  filename: string
  format: LibraryDocument['format']
  sections: LibraryDocument['sections']
  sheets: LibraryDocument['sheets']
  viewHash: string
}
const contexts = new WeakMap<Blob, VerifiedContext>()
const verified = new WeakMap<Revision, VerifiedContext>()
const contextKeys = [
  'id',
  'actor',
  'salt',
  'genesis',
  'originalHash',
  'title',
  'filename',
  'format',
  'sections',
  'sheets',
] as const

function freezeTree(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return
  for (const child of Object.values(value)) freezeTree(child)
  Object.freeze(value)
}

async function verifiedContext(doc: LibraryDocument): Promise<VerifiedContext> {
  const cached = contexts.get(doc.original)
  if (cached && contextKeys.every((key) => cached[key] === doc[key])) return cached
  const expected = toHex(await computeGenesisSAI(doc.actor, fromHex(doc.salt)))
  if (expected !== doc.genesis) throw new Error('版本來源驗證失敗，已停止編輯。')
  if ((await digest(await doc.original.arrayBuffer())) !== doc.originalHash)
    throw new Error('原始檔完整性驗證失敗。')
  // Only immutable, verified objects qualify for reuse. Reloaded IDB/API objects are rechecked.
  freezeTree(doc.sections)
  freezeTree(doc.sheets)
  const context = Object.fromEntries(contextKeys.map((key) => [key, doc[key]])) as Omit<
    VerifiedContext,
    'viewHash'
  >
  const value = {
    ...context,
    viewHash: await digest(
      marshal({
        title: doc.title,
        filename: doc.filename,
        format: doc.format,
        sections: doc.sections,
        sheets: doc.sheets,
      }).toString('utf8'),
    ),
  }
  contexts.set(doc.original, value)
  return value
}

export async function digest(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value)
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
}
export async function genesis(actor: string) {
  const salt = generateGenesisSalt()
  return { salt: toHex(salt), genesis: toHex(await computeGenesisSAI(actor, salt)) }
}
export async function createRevision(
  doc: Pick<
    LibraryDocument,
    | 'id'
    | 'title'
    | 'filename'
    | 'format'
    | 'sections'
    | 'sheets'
    | 'originalHash'
    | 'genesis'
    | 'revisions'
    | 'branchId'
  >,
  kind: Revision['kind'],
  content: string,
  notes: Note[],
  restoredFrom: string | null = null,
  adoptedFrom?: AdoptionSource,
): Promise<Revision> {
  const parent = doc.revisions.at(-1)
  const id = crypto.randomUUID()
  const timestamp = Date.now()
  const payload = {
    documentId: doc.id,
    revisionId: id,
    parentId: parent?.id ?? null,
    originalHash: doc.originalHash,
    contentHash: await digest(content),
    notesHash: await digest(marshal(notes).toString('utf8')),
    restoredFrom,
    ...(doc.branchId ? { branchId: doc.branchId } : {}),
    ...(adoptedFrom ? { adoptedFrom } : {}),
    viewHash: await digest(
      marshal({
        title: doc.title,
        filename: doc.filename,
        format: doc.format,
        sections: doc.sections,
        sheets: doc.sheets,
      }).toString('utf8'),
    ),
  }
  const envelope = marshal({ action_type: `pageforge.${kind}`, timestamp, sdto: payload }).toString(
    'utf8',
  )
  const prevSAI = parent?.sai ?? doc.genesis
  return {
    id,
    parentId: parent?.id ?? null,
    kind,
    createdAt: new Date(timestamp).toISOString(),
    content,
    notes: structuredClone(notes),
    prevSAI,
    sai: toHex(await computeSAI(fromHex(prevSAI), new TextEncoder().encode(envelope))),
    envelope,
    ...(doc.branchId ? { branchId: doc.branchId } : {}),
    ...(adoptedFrom ? { adoptedFrom } : {}),
  }
}
export async function verifyHistory(doc: LibraryDocument): Promise<void> {
  if (doc.revisions.length === 0) throw new Error('版本來源驗證失敗，已停止編輯。')
  const context = await verifiedContext(doc)
  let expected = doc.genesis
  const { viewHash } = context
  let parentId: string | null = null
  const ids = new Set<string>()
  let inBranch = false
  for (const revision of doc.revisions) {
    freezeTree(revision)
    if (
      !['import', 'edit', 'note', 'restore', 'fork', 'adopt'].includes(revision.kind) ||
      (parentId === null ? revision.kind !== 'import' : revision.kind === 'import')
    )
      throw new Error('版本事件順序無效。')
    if (revision.branchId) {
      if (
        revision.branchId !== doc.branchId ||
        (!inBranch ? revision.kind !== 'fork' : !['edit', 'note'].includes(revision.kind))
      )
        throw new Error('沙盒版本來源或事件順序無效。')
      inBranch = true
    } else if (inBranch || revision.kind === 'fork') throw new Error('沙盒版本鏈不連續。')
    if (revision.prevSAI !== expected || revision.parentId !== parentId || ids.has(revision.id))
      throw new Error('版本鏈不連續，已停止編輯。')
    if (verified.get(revision) === context) {
      ids.add(revision.id)
      parentId = revision.id
      expected = revision.sai
      continue
    }
    const env = JSON.parse(revision.envelope)
    if (
      marshal(env).toString('utf8') !== revision.envelope ||
      env.action_type !== `pageforge.${revision.kind}` ||
      new Date(env.timestamp).toISOString() !== revision.createdAt
    )
      throw new Error('版本事件驗證失敗。')
    const data = env.sdto
    if (
      data.branchId !== revision.branchId ||
      marshal(data.adoptedFrom ?? null).toString('utf8') !==
        marshal(revision.adoptedFrom ?? null).toString('utf8') ||
      (revision.kind === 'adopt' ? !revision.adoptedFrom : !!revision.adoptedFrom)
    )
      throw new Error('版本來源紀錄無效。')
    if (
      revision.adoptedFrom &&
      !['branchId', 'revisionId', 'baseRevisionId'].every((key) => {
        const value = revision.adoptedFrom![key as keyof AdoptionSource]
        return (
          typeof value === 'string' &&
          /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
        )
      })
    )
      throw new Error('採納來源 ID 無效。')
    if (revision.kind === 'restore' && !ids.has(data.restoredFrom))
      throw new Error('還原來源不在此文件的版本鏈中。')
    if (
      data.documentId !== doc.id ||
      data.revisionId !== revision.id ||
      data.parentId !== parentId ||
      data.originalHash !== doc.originalHash ||
      data.viewHash !== viewHash ||
      data.contentHash !== (await digest(revision.content)) ||
      data.notesHash !== (await digest(marshal(revision.notes).toString('utf8')))
    )
      throw new Error('版本內容驗證失敗。')
    const computed = toHex(
      await computeSAI(fromHex(expected), new TextEncoder().encode(revision.envelope)),
    )
    if (computed !== revision.sai) throw new Error('版本識別碼驗證失敗。')
    freezeTree(revision)
    verified.set(revision, context)
    ids.add(revision.id)
    parentId = revision.id
    expected = computed
  }
  if (doc.branchId && !inBranch) throw new Error('沙盒缺少初始版本。')
}
