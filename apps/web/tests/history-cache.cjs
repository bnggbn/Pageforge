'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { transpileModule, ModuleKind, ScriptTarget } = require('typescript')

// Exercise the actual pure TypeScript module, without introducing a second hash implementation.
async function checkHistoryCache(source) {
  const file = path.resolve(__dirname, '../lib/history.ts')
  const code = transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(createRequire(file), module, module.exports)
  const { verifyHistory, createRevision } = module.exports
  const { originalBase64, originalType, ...doc } = structuredClone(source)
  doc.original = new Blob([Buffer.from(originalBase64, 'base64')], { type: originalType })
  const note = {
    id: crypto.randomUUID(),
    body: 'Immutable note',
    quote: '',
    location: '全文',
    createdAt: new Date().toISOString(),
  }
  doc.revisions.push(await createRevision(doc, 'note', doc.revisions.at(-1).content, [note]))
  // A shallow-frozen incoming object must not exempt its descendants from freezing.
  Object.freeze(doc.revisions.at(-1))
  await verifyHistory(doc)
  assert.throws(() => {
    doc.revisions.at(-1).notes[0].body = 'tampered'
  }, TypeError)
  assert.throws(() => {
    doc.actor = 'tampered'
  }, TypeError)
  assert.throws(() => {
    doc.revisions.reverse()
  }, TypeError)
  const digest = crypto.subtle.digest.bind(crypto.subtle)
  let bytes = 0
  crypto.subtle.digest = function (algorithm, input) {
    bytes += input.byteLength
    return digest(algorithm, input)
  }
  try {
    await verifyHistory(doc)
    assert.equal(bytes, 0, 'Verified immutable snapshots must reuse their hashes')
  } finally {
    crypto.subtle.digest = digest
  }
  const changed = structuredClone(doc)
  changed.revisions[0].content += 'tampered'
  await assert.rejects(verifyHistory(changed), /版本內容驗證失敗/)
  const metadata = { ...doc, title: 'Changed metadata' }
  await assert.rejects(verifyHistory(metadata), /版本內容驗證失敗/)
  const original = { ...doc, original: new Blob(['Replaced source']) }
  await assert.rejects(verifyHistory(original), /原始檔完整性驗證失敗/)
  console.log(
    'PASS history cache: zero repeated hashes, deep immutability, metadata/source invalidation, cloned tamper rejection',
  )
}
module.exports = { checkHistoryCache }
