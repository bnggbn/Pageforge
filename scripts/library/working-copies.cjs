const fs = require('node:fs')
const path = require('node:path')
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

function createWorkingCopyStore({ directory, record, config, writeJSON, fail, branch }) {
  const folder = (id) => {
    record(id)
    const target = path.join(directory(id), 'drafts')
    if (
      fs.existsSync(target) &&
      (fs.lstatSync(target).isSymbolicLink() || !fs.statSync(target).isDirectory())
    )
      fail(400, '草稿資料夾無效。')
    return target
  }
  const file = (id, copyId) => {
    if (!uuid.test(copyId)) fail(400, '草稿 ID 無效。')
    const target = path.join(folder(id), `${copyId}.json`)
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())
      fail(400, '草稿不可為連結檔。')
    return target
  }
  const read = (target) =>
    fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : null
  const list = (id) => {
    const target = folder(id)
    if (!fs.existsSync(target)) return []
    return fs
      .readdirSync(target)
      .filter((name) => uuid.test(name.replace(/\.json$/, '')) && name.endsWith('.json'))
      .map((name) => read(file(id, name.slice(0, -5))))
  }
  const save = (id, copyId, copy, expectedVersion) => {
    const doc = record(id)
    const branchData = copy?.branchId ? branch(id, copy.branchId) : null
    const baseIds = branchData
      ? [branchData.baseRevisionId, ...branchData.revisionIds]
      : doc.revisionIds
    const target = file(id, copyId)
    if (
      !copy ||
      copy.id !== copyId ||
      copy.documentId !== id ||
      !uuid.test(copy.version) ||
      !baseIds.includes(copy.baseRevisionId) ||
      !['content', 'body', 'quote', 'location', 'updatedAt'].every(
        (key) => typeof copy[key] === 'string',
      ) ||
      !Number.isFinite(Date.parse(copy.updatedAt)) ||
      (!['markdown', 'text'].includes(doc.document.format) && copy.content !== '')
    )
      fail(400, '草稿內容或來源無效。')
    if (
      Buffer.byteLength(copy.content) > config.limits.textMiB * 1024 * 1024 ||
      copy.body.length > config.limits.noteCharacters ||
      copy.quote.length > config.limits.quoteCharacters ||
      copy.location.length > config.limits.locationCharacters
    )
      fail(413, '草稿超過設定容量。')
    const current = read(target)
    if (
      (current?.version ?? null) !== expectedVersion ||
      (current && current.branchId !== copy.branchId)
    )
      fail(409, '此草稿已由另一個分頁更新。')
    if (!current && list(id).length >= config.limits.workingCopyCount)
      fail(413, '此文件的草稿數量已達上限，請先整理保留的草稿。')
    fs.mkdirSync(folder(id), { recursive: true })
    const saved = {}
    for (const key of [
      'id',
      'documentId',
      'baseRevisionId',
      'version',
      'content',
      'body',
      'quote',
      'location',
      'updatedAt',
    ])
      saved[key] = copy[key]
    if (branchData) saved.branchId = branchData.id
    writeJSON(target, saved)
  }
  const remove = (id, copyId, expectedVersion) => {
    const target = file(id, copyId)
    if (read(target)?.version === expectedVersion) fs.unlinkSync(target)
  }
  return { list, save, remove }
}
module.exports = { createWorkingCopyStore }
