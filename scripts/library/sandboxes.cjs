const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { validateRevision } = require('./revisions.cjs')
const { marshal } = require('vax-sdk')
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

function createSandboxStore({ directory, record, version, writeJSON, config, fail }) {
  const safe = (target) => {
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())
      fail(400, '沙盒不支援連結檔。')
    return target
  }
  const root = (id) => {
    record(id)
    return safe(path.join(directory(id), 'branches'))
  }
  const folder = (id, branchId) => {
    if (!uuid.test(branchId)) fail(400, '沙盒 ID 無效。')
    return safe(path.join(root(id), branchId))
  }
  const manifest = (id, branchId) => {
    const file = safe(path.join(folder(id, branchId), 'manifest.json'))
    if (!fs.existsSync(file)) fail(404, '找不到沙盒。')
    const item = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (
      item.id !== branchId ||
      item.documentId !== id ||
      !record(id).revisionIds.includes(item.baseRevisionId) ||
      !Array.isArray(item.revisionIds) ||
      !item.revisionIds.length ||
      !item.revisionIds.every((value) => uuid.test(value)) ||
      new Set(item.revisionIds).size !== item.revisionIds.length
    )
      fail(400, '沙盒紀錄無效。')
    return item
  }
  const node = (id, branchId, revisionId) => {
    if (!uuid.test(revisionId)) fail(400, '沙盒版本 ID 無效。')
    const versions = safe(path.join(folder(id, branchId), 'versions'))
    const revision = JSON.parse(
      fs.readFileSync(safe(path.join(versions, `${revisionId}.json`)), 'utf8'),
    )
    if (revision.id !== revisionId) fail(400, '沙盒版本 ID 與檔案不一致。')
    return revision
  }
  const summary = (item) => {
    const { revisionIds, ...data } = item
    return { ...data, head: revisionIds.at(-1), revisionCount: revisionIds.length }
  }
  const list = (id) => {
    const target = root(id)
    return !fs.existsSync(target)
      ? []
      : fs
          .readdirSync(target)
          .filter((value) => uuid.test(value))
          .map((branchId) => summary(manifest(id, branchId)))
  }
  const load = (id, branchId) => {
    const item = manifest(id, branchId),
      { revisionIds, ...data } = item
    return { ...data, revisions: revisionIds.map((revisionId) => node(id, branchId, revisionId)) }
  }
  const create = async (id, input) => {
    const doc = record(id)
    const { branchId, name, baseRevisionId, revision } = input
    if (
      !uuid.test(branchId) ||
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > config.limits.sandboxNameCharacters ||
      !doc.revisionIds.includes(baseRevisionId) ||
      !['markdown', 'text'].includes(doc.document.format)
    )
      fail(400, '沙盒名稱、格式或來源無效。')
    const parent = version(id, baseRevisionId)
    await validateRevision(doc.document, revision, parent, config, { branchId, fork: true })
    if (
      revision.content !== parent.content ||
      !marshal(revision.notes).equals(marshal(parent.notes))
    )
      fail(400, '沙盒初始版本必須保留來源快照。')
    if (record(id).revisionIds.includes(revision.id)) fail(400, '沙盒版本 ID 不得重複主線版本。')
    if (list(id).length >= config.limits.sandboxCount) fail(413, '保留沙盒數量已達上限。')
    if (fs.existsSync(folder(id, branchId))) fail(409, '此沙盒 ID 已存在。')
    const temporary = path.join(root(id), `.pending-${randomUUID()}`)
    fs.mkdirSync(path.join(temporary, 'versions'), { recursive: true })
    writeJSON(path.join(temporary, 'versions', `${revision.id}.json`), revision)
    writeJSON(path.join(temporary, 'manifest.json'), {
      id: branchId,
      documentId: id,
      name: name.trim(),
      baseRevisionId,
      createdAt: revision.createdAt,
      updatedAt: revision.createdAt,
      revisionIds: [revision.id],
    })
    fs.renameSync(temporary, folder(id, branchId))
    return load(id, branchId)
  }
  const append = async (id, branchId, expectedHead, revision, incremental = false) => {
    const item = manifest(id, branchId)
    if (item.archivedAt || item.revisionIds.at(-1) !== expectedHead)
      fail(409, '沙盒已更新或封存，草稿仍會保留。')
    if (item.revisionIds.length >= config.limits.revisionCount) fail(413, '沙盒版本數量已達上限。')
    await validateRevision(
      record(id).document,
      revision,
      node(id, branchId, expectedHead),
      config,
      { branchId },
    )
    const fresh = manifest(id, branchId)
    if (record(id).revisionIds.includes(revision.id)) fail(400, '沙盒版本 ID 不得重複主線版本。')
    if (fresh.archivedAt || fresh.revisionIds.at(-1) !== expectedHead)
      fail(409, '沙盒已更新或封存，草稿仍會保留。')
    const target = safe(
      path.join(safe(path.join(folder(id, branchId), 'versions')), `${revision.id}.json`),
    )
    if (fs.existsSync(target)) fail(409, '沙盒版本 ID 已存在。')
    writeJSON(target, revision)
    fresh.revisionIds.push(revision.id)
    fresh.updatedAt = revision.createdAt
    writeJSON(path.join(folder(id, branchId), 'manifest.json'), fresh)
    return incremental ? { revision, updatedAt: fresh.updatedAt } : load(id, branchId)
  }
  const archive = (id, branchId, expectedHead, archived) => {
    const item = manifest(id, branchId)
    if (item.revisionIds.at(-1) !== expectedHead || typeof archived !== 'boolean')
      fail(409, '沙盒已更新，請重新載入。')
    if (archived) item.archivedAt = new Date().toISOString()
    else delete item.archivedAt
    writeJSON(path.join(folder(id, branchId), 'manifest.json'), item)
    return load(id, branchId)
  }
  const adoption = async (id, source) => {
    if (
      !source ||
      !['branchId', 'revisionId', 'baseRevisionId'].every((key) => uuid.test(source[key]))
    )
      fail(400, '採納來源無效。')
    const item = manifest(id, source.branchId)
    if (
      item.baseRevisionId !== source.baseRevisionId ||
      !item.revisionIds.includes(source.revisionId)
    )
      fail(400, '採納來源不屬於此沙盒。')
    let parent = version(id, item.baseRevisionId)
    for (const revisionId of item.revisionIds) {
      const revision = node(id, source.branchId, revisionId)
      await validateRevision(record(id).document, revision, parent, config, {
        branchId: item.id,
        fork: parent.id === item.baseRevisionId,
      })
      parent = revision
      if (revisionId === source.revisionId) return revision
    }
    fail(400, '採納來源不存在。')
  }
  return { list, load, create, append, archive, adoption, draftBase: manifest }
}
module.exports = { createSandboxStore }
