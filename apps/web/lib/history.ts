import { Buffer } from 'buffer'
import {
  computeGenesisSAI,
  computeSAI,
  generateGenesisSalt,
  toHex,
  fromHex,
  marshal,
} from 'vax-sdk'
import type { LibraryDocument, Revision, Note } from './documents'

// vax-sdk 1.0.0 canonicalizes with Buffer; its crypto primitives use Web Crypto.
const globals = globalThis as unknown as { Buffer?: typeof Buffer }
globals.Buffer ??= Buffer

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
  >,
  kind: Revision['kind'],
  content: string,
  notes: Note[],
  restoredFrom: string | null = null,
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
  }
}
export async function verifyHistory(doc: LibraryDocument): Promise<void> {
  const expectedGenesis = toHex(await computeGenesisSAI(doc.actor, fromHex(doc.salt)))
  if (expectedGenesis !== doc.genesis || doc.revisions.length === 0)
    throw new Error('版本來源驗證失敗，已停止編輯。')
  if ((await digest(await doc.original.arrayBuffer())) !== doc.originalHash)
    throw new Error('原始檔完整性驗證失敗。')
  let expected = doc.genesis
  const viewHash = await digest(
    marshal({
      title: doc.title,
      filename: doc.filename,
      format: doc.format,
      sections: doc.sections,
      sheets: doc.sheets,
    }).toString('utf8'),
  )
  let parentId: string | null = null
  const ids = new Set<string>()
  for (const revision of doc.revisions) {
    if (
      !['import', 'edit', 'note', 'restore'].includes(revision.kind) ||
      (parentId === null ? revision.kind !== 'import' : revision.kind === 'import')
    )
      throw new Error('版本事件順序無效。')
    if (revision.prevSAI !== expected || revision.parentId !== parentId || ids.has(revision.id))
      throw new Error('版本鏈不連續，已停止編輯。')
    const env = JSON.parse(revision.envelope)
    if (
      marshal(env).toString('utf8') !== revision.envelope ||
      env.action_type !== `pageforge.${revision.kind}` ||
      new Date(env.timestamp).toISOString() !== revision.createdAt
    )
      throw new Error('版本事件驗證失敗。')
    const data = env.sdto
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
    ids.add(revision.id)
    parentId = revision.id
    expected = computed
  }
}
