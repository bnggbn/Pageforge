const { createHash } = require('node:crypto')
const { computeSAI, fromHex, toHex, marshal } = require('vax-sdk')
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const hash = (value) => createHash('sha256').update(value).digest('hex')
function fail(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}
async function validateRevision(doc, revision, parent, config) {
  if (
    !revision ||
    !uuid.test(revision.id) ||
    !Array.isArray(revision.notes) ||
    typeof revision.content !== 'string' ||
    !['import', 'edit', 'note', 'restore'].includes(revision.kind)
  )
    fail(400, '版本資料格式錯誤。')
  if (
    (parent ? revision.kind === 'import' : revision.kind !== 'import') ||
    revision.parentId !== (parent?.id ?? null) ||
    revision.prevSAI !== (parent?.sai ?? doc.genesis)
  )
    fail(409, '版本鏈與目前文件不一致。')
  if (
    Buffer.byteLength(revision.content) > config.limits.textMiB * 1024 * 1024 ||
    Buffer.byteLength(JSON.stringify(revision.notes)) > config.limits.snapshotNotesMiB * 1024 * 1024
  )
    fail(413, '文字或筆記快照超過設定容量。')
  if (!['markdown', 'text'].includes(doc.format) && revision.content !== '')
    fail(400, '此格式只支援閱讀與筆記。')
  const env = JSON.parse(revision.envelope)
  if (
    marshal(env).toString('utf8') !== revision.envelope ||
    env.action_type !== `pageforge.${revision.kind}` ||
    new Date(env.timestamp).toISOString() !== revision.createdAt
  )
    fail(400, 'VAX 事件驗證失敗。')
  const data = env.sdto
  const viewHash = hash(
    marshal({
      title: doc.title,
      filename: doc.filename,
      format: doc.format,
      sections: doc.sections,
      sheets: doc.sheets,
    }),
  )
  if (
    data.documentId !== doc.id ||
    data.revisionId !== revision.id ||
    data.parentId !== revision.parentId ||
    data.originalHash !== doc.originalHash ||
    data.contentHash !== hash(revision.content) ||
    data.notesHash !== hash(marshal(revision.notes)) ||
    data.viewHash !== viewHash
  )
    fail(400, 'VAX 快照驗證失敗。')
  if (
    toHex(await computeSAI(fromHex(revision.prevSAI), Buffer.from(revision.envelope))) !==
    revision.sai
  )
    fail(400, 'VAX SAI 驗證失敗。')
}

module.exports = { validateRevision }
