const { validateRevision } = require('./library/revisions.cjs')
const { loadConfig, publicConfig } = require('./config.cjs')
const { serveImage } = require('./library/images.cjs')
const { createWorkingCopyStore } = require('./library/working-copies.cjs')
const { createSandboxStore } = require('./library/sandboxes.cjs')
const http = require('node:http')
const net = require('node:net')
const fs = require('node:fs')
const path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')
const { computeGenesisSAI, fromHex, toHex } = require('vax-sdk')

const extensions = { markdown: 'md', text: 'txt', pdf: 'pdf', epub: 'epub', xlsx: 'xlsx' }
const supported = /\.(md|markdown|txt|pdf|epub|xlsx)$/i
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const hash = (value) => createHash('sha256').update(value).digest('hex')
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
function fail(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}
function writeJSON(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`
  const descriptor = fs.openSync(temporary, 'wx')
  try {
    fs.writeFileSync(descriptor, JSON.stringify(value, null, 2))
    fs.fsyncSync(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
  try {
    fs.renameSync(temporary, file)
  } catch (error) {
    fs.unlinkSync(temporary)
    throw error
  }
}
async function writeProgressJSON(file, value, beforeCommit) {
  const temporary = `${file}.${randomUUID()}.tmp`
  let handle
  try {
    handle = await fs.promises.open(temporary, 'wx')
    await handle.writeFile(JSON.stringify(value))
    await handle.sync()
    await handle.close()
    handle = null
    // The head may have changed while asynchronous I/O was in flight.
    beforeCommit()
    fs.renameSync(temporary, file)
  } catch (error) {
    if (handle) await handle.close()
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
    throw error
  }
}
function readBody(request, config) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let length = 0
    request.on('data', (chunk) => {
      length += chunk.length
      if (length > config.limits.requestMiB * 1024 * 1024) {
        const error = new Error('資料過大，無法保存。')
        error.status = 413
        reject(error)
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        const error = new Error('請求資料格式錯誤。')
        error.status = 400
        reject(error)
      }
    })
    request.on('error', reject)
  })
}
function metadata(record) {
  const doc = record.document
  return {
    id: doc.id,
    title: doc.title,
    filename: doc.filename,
    format: doc.format,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    originalHash: doc.originalHash,
    head: record.revisionIds.at(-1),
    revisionCount: record.revisionIds.length,
    progress: record.progress?.percentage ?? 0,
  }
}

function createLibraryServer({
  config = loadConfig(),
  libraryRoot = config.paths.libraryRoot,
  webRoot = config.paths.webRoot,
  devPort = null,
} = {}) {
  libraryRoot = path.resolve(libraryRoot)
  const books = path.join(libraryRoot, 'books')
  const state = path.join(libraryRoot, '.pageforge')
  const trash = path.join(libraryRoot, '.trash')
  const collection = path.join(libraryRoot, 'collection')
  for (const dir of [books, state, trash, collection]) fs.mkdirSync(dir, { recursive: true })
  const lock = path.join(state, 'server.lock')
  if (fs.existsSync(lock)) {
    const owner = Number(fs.readFileSync(lock, 'utf8'))
    let live = Number.isInteger(owner) && owner > 0
    if (live) {
      try {
        process.kill(owner, 0)
      } catch (error) {
        if (error.code === 'ESRCH') live = false
      }
    }
    if (live) throw new Error('此 library 已由另一個 Pageforge 程序使用，請先關閉該程序。')
    fs.unlinkSync(lock)
  }
  fs.writeFileSync(lock, String(process.pid), { flag: 'wx' })
  const release = () => {
    if (fs.existsSync(lock) && fs.readFileSync(lock, 'utf8') === String(process.pid))
      fs.unlinkSync(lock)
  }
  const directory = (id) => {
    if (!uuid.test(id)) fail(400, '文件 ID 無效。')
    const dir = path.join(books, id)
    if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink())
      fail(400, '不支援連結到外部的文件資料夾。')
    return dir
  }
  const record = (id) => {
    const file = path.join(directory(id), 'manifest.json')
    if (!fs.existsSync(file)) fail(404, '找不到文件，可能已被刪除。')
    if (fs.lstatSync(file).isSymbolicLink()) fail(400, '文件紀錄不可為外部連結。')
    const item = readJSON(file)
    if (
      item.document.id !== id ||
      !extensions[item.document.format] ||
      item.originalFile !== `original.${extensions[item.document.format]}` ||
      !Array.isArray(item.revisionIds) ||
      !item.revisionIds.length ||
      !item.revisionIds.every((value) => uuid.test(value))
    )
      fail(400, '資料夾中的文件紀錄無效。')
    return item
  }
  const version = (id, revisionId) => {
    if (!uuid.test(revisionId)) fail(400, '版本 ID 無效。')
    return readJSON(path.join(directory(id), 'versions', `${revisionId}.json`))
  }
  const progressFile = (id) => path.join(directory(id), 'progress.json')
  const readProgress = (item) => {
    const file = progressFile(item.document.id)
    if (!fs.existsSync(file)) return item.progress ?? null
    if (fs.lstatSync(file).isSymbolicLink()) fail(400, '閱讀進度不可為外部連結。')
    const { epoch, ...position } = readJSON(file)
    return epoch === (item.progressEpoch ?? null) && item.revisionIds.includes(position.revisionId)
      ? position
      : null
  }
  const progressWrites = new Map()
  const list = () =>
    fs
      .readdirSync(books)
      .filter((id) => uuid.test(id) && fs.existsSync(path.join(books, id, 'manifest.json')))
      .map((id) => {
        const item = record(id)
        return metadata({ ...item, progress: readProgress(item) })
      })
  const serialize = (item) => ({
    ...item.document,
    revisions: item.revisionIds.map((id) => version(item.document.id, id)),
    originalBase64: fs
      .readFileSync(path.join(directory(item.document.id), item.originalFile))
      .toString('base64'),
    originalType: item.originalType,
  })
  const settingsFile = path.join(state, 'settings.json')
  const branches = createSandboxStore({ directory, record, version, config, writeJSON, fail })
  const drafts = createWorkingCopyStore({
    directory,
    record,
    config,
    writeJSON,
    fail,
    branch: branches.draftBase,
  })
  const settings = () =>
    fs.existsSync(settingsFile)
      ? readJSON(settingsFile)
      : { fontSize: config.reading.defaultFontSize, collectionImported: false }
  const send = (res, value, status = 200) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(JSON.stringify(value))
  }
  const trusted = (req) => {
    const port = server.address()?.port
    const hosts = [`localhost:${port}`, `127.0.0.1:${port}`]
    if (!hosts.includes(req.headers.host)) fail(403, '只接受本機 Pageforge 請求。')
    if (req.headers.origin && !hosts.map((host) => `http://${host}`).includes(req.headers.origin))
      fail(403, '不允許其他網站存取書架。')
  }
  const server = http.createServer(async (req, res) => {
    try {
      trusted(req)
      const url = new URL(req.url, 'http://localhost')
      if (url.pathname.startsWith('/api/library')) {
        const route = url.pathname.slice('/api/library'.length)
        if (req.method === 'GET' && route === '/status')
          return send(res, {
            mode: 'disk',
            label: `${path.basename(libraryRoot)}/`,
            collectionImported: settings().collectionImported,
            config: publicConfig(config),
          })
        if (req.method === 'GET' && route === '/documents') return send(res, list())
        if (req.method === 'GET' && route === '/duplicate')
          return send(
            res,
            list().find(
              (doc) =>
                doc.format === url.searchParams.get('format') &&
                doc.originalHash === url.searchParams.get('hash'),
            ) ?? null,
          )
        if (req.method === 'GET' && route === '/collection')
          return send(
            res,
            fs
              .readdirSync(collection)
              .filter(
                (name) => supported.test(name) && fs.statSync(path.join(collection, name)).isFile(),
              )
              .map((name) => ({
                name,
                size: fs.statSync(path.join(collection, name)).size,
                url: `/api/library/collection-file?name=${encodeURIComponent(name)}`,
              })),
          )
        if (req.method === 'GET' && route === '/collection-file') {
          const name = url.searchParams.get('name') ?? ''
          if (path.basename(name) !== name || name.includes('\\') || !supported.test(name))
            fail(400, '文件路徑無效。')
          const file = path.join(collection, name)
          const stat = fs.lstatSync(file)
          if (
            !stat.isFile() ||
            stat.isSymbolicLink() ||
            stat.size >
              (/\.(md|markdown|txt)$/i.test(name)
                ? config.limits.textMiB
                : config.limits.documentMiB) *
                1024 *
                1024
          )
            fail(400, '來源不是可匯入的文件。')
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'no-store',
          })
          return fs.createReadStream(file).pipe(res)
        }
        if (req.method === 'GET' && route === '/settings') return send(res, settings())
        if (req.method === 'PUT' && route === '/settings') {
          const value = await readBody(req, config)
          const previous = settings()
          if (
            value.fontSize !== undefined &&
            (!Number.isFinite(value.fontSize) || !config.reading.fontSizes.includes(value.fontSize))
          )
            fail(400, '閱讀字級無效。')
          writeJSON(settingsFile, {
            ...previous,
            ...(value.fontSize !== undefined ? { fontSize: value.fontSize } : {}),
            ...(value.collectionImported === true ? { collectionImported: true } : {}),
          })
          return send(res, { saved: true })
        }
        if (req.method === 'POST' && route === '/documents') {
          const input = await readBody(req, config)
          const { originalBase64, originalType, revisions, ...doc } = input
          if (
            !uuid.test(doc.id) ||
            !extensions[doc.format] ||
            typeof originalBase64 !== 'string' ||
            typeof doc.title !== 'string' ||
            typeof doc.filename !== 'string' ||
            !Array.isArray(doc.sections) ||
            !Array.isArray(doc.sheets) ||
            !Array.isArray(revisions) ||
            !revisions.length ||
            revisions.length > config.limits.revisionCount
          )
            fail(400, '文件資料格式錯誤。')
          const source = Buffer.from(originalBase64, 'base64')
          const max = ['markdown', 'text'].includes(doc.format)
            ? config.limits.textMiB
            : config.limits.documentMiB
          if (
            !source.length ||
            source.length > max * 1024 * 1024 ||
            hash(source) !== doc.originalHash
          )
            fail(400, '原始檔大小或完整性驗證失敗。')
          if (toHex(await computeGenesisSAI(doc.actor, fromHex(doc.salt))) !== doc.genesis)
            fail(400, 'VAX genesis 驗證失敗。')
          let parent = null
          const ids = new Set()
          for (const revision of revisions) {
            await validateRevision(doc, revision, parent, config, { allowDetachedAdoption: true })
            if (
              ids.has(revision.id) ||
              (revision.kind === 'restore' &&
                !ids.has(JSON.parse(revision.envelope).sdto.restoredFrom))
            )
              fail(400, '版本 ID 或還原來源無效。')
            ids.add(revision.id)
            parent = revision
          }
          if (
            list().some(
              (existing) =>
                existing.format === doc.format && existing.originalHash === doc.originalHash,
            )
          )
            fail(409, '相同來源已在書架中。')
          if (fs.existsSync(directory(doc.id))) fail(409, '文件 ID 已存在。')
          const temporary = path.join(books, `.pending-${randomUUID()}`)
          fs.mkdirSync(path.join(temporary, 'versions'), { recursive: true })
          const originalFile = `original.${extensions[doc.format]}`
          fs.writeFileSync(path.join(temporary, originalFile), source)
          for (const revision of revisions)
            writeJSON(path.join(temporary, 'versions', `${revision.id}.json`), revision)
          writeJSON(path.join(temporary, 'manifest.json'), {
            document: doc,
            originalFile,
            originalType: originalType ?? 'application/octet-stream',
            revisionIds: revisions.map((r) => r.id),
            progress: null,
          })
          fs.renameSync(temporary, directory(doc.id))
          return send(res, { id: doc.id }, 201)
        }
        const image = /^\/documents\/([^/]+)\/image$/.exec(route)
        if (req.method === 'GET' && image) {
          const item = record(image[1])
          if (item.document.format !== 'markdown') fail(400, '此文件不支援本機圖片。')
          return await serveImage({
            collection,
            source: url.searchParams.get('path'),
            maxMiB: config.limits.imageMiB,
            response: res,
          })
        }
        const draftRoute = /^\/documents\/([^/]+)\/drafts(?:\/([^/]+))?$/.exec(route)
        if (draftRoute) {
          const [, id, copyId] = draftRoute
          if (req.method === 'GET' && !copyId) return send(res, drafts.list(id))
          if (copyId && ['PUT', 'DELETE'].includes(req.method)) {
            const input = await readBody(req, config)
            if (req.method === 'PUT') drafts.save(id, copyId, input.copy, input.expectedVersion)
            else drafts.remove(id, copyId, input.expectedVersion)
            return send(res, { saved: true })
          }
        }
        const branchRoute =
          /^\/documents\/([^/]+)\/branches(?:\/([^/]+)(?:\/(revisions|state))?)?$/.exec(route)
        if (branchRoute) {
          const [, id, branchId, action] = branchRoute
          if (req.method === 'GET' && !action)
            return send(res, branchId ? branches.load(id, branchId) : branches.list(id))
          if (req.method === 'POST') {
            const input = await readBody(req, config)
            if (!branchId) return send(res, await branches.create(id, input), 201)
            if (action === 'revisions')
              return send(
                res,
                await branches.append(
                  id,
                  branchId,
                  input.expectedHead,
                  input.revision,
                  input.response === 'revision',
                ),
              )
            if (action === 'state')
              return send(res, branches.archive(id, branchId, input.expectedHead, input.archived))
          }
        }
        const match = /^\/documents\/([^/]+)(?:\/(revisions|progress))?$/.exec(route)
        if (match) {
          const [, id, action] = match
          if (req.method === 'GET') {
            const item = record(id)
            return send(res, action === 'progress' ? readProgress(item) : serialize(item))
          }
          if (req.method === 'DELETE' && !action) {
            record(id)
            fs.renameSync(directory(id), path.join(trash, `${id}-${Date.now()}`))
            return send(res, { deleted: true })
          }
          if (req.method === 'POST' && action === 'revisions') {
            const { expectedHead, revision, response } = await readBody(req, config)
            const previous = record(id)
            if (previous.revisionIds.at(-1) !== expectedHead)
              fail(409, '文件已在另一個分頁修改。請重新載入；未保存的文字仍保留在編輯器中。')
            const parent = version(id, expectedHead)
            const adoption =
              revision?.kind === 'adopt'
                ? await branches.adoption(id, revision.adoptedFrom)
                : undefined
            await validateRevision(previous.document, revision, parent, config, { adoption })
            if (
              previous.revisionIds.includes(revision.id) ||
              (revision.kind === 'restore' &&
                !previous.revisionIds.includes(JSON.parse(revision.envelope).sdto.restoredFrom))
            )
              fail(400, '版本 ID 或還原來源無效。')
            const fresh = record(id)
            if (fresh.revisionIds.at(-1) !== expectedHead)
              fail(409, '文件已在另一個分頁修改。請重新載入；未保存的文字仍保留在編輯器中。')
            writeJSON(path.join(directory(id), 'versions', `${revision.id}.json`), revision)
            fresh.document.updatedAt = revision.createdAt
            fresh.revisionIds.push(revision.id)
            if (parent.content !== revision.content) {
              fresh.progress = null
              fresh.progressEpoch = revision.id
            }
            writeJSON(path.join(directory(id), 'manifest.json'), fresh)
            return send(
              res,
              response === 'revision'
                ? { revision, updatedAt: fresh.document.updatedAt }
                : serialize(fresh),
            )
          }
          if (req.method === 'PUT' && action === 'progress') {
            const position = await readBody(req, config)
            if (
              !Number.isFinite(position.percentage) ||
              !Number.isFinite(position.ratio) ||
              !Number.isInteger(position.section) ||
              position.section < 0 ||
              typeof position.block !== 'string'
            )
              fail(400, '閱讀位置無效。')
            const value = {
              revisionId: position.revisionId,
              section: position.section,
              block: position.block,
              updatedAt: new Date().toISOString(),
              percentage: Math.max(0, Math.min(100, position.percentage)),
              ratio: Math.max(0, Math.min(1, position.ratio)),
            }
            const operation = (progressWrites.get(id) ?? Promise.resolve())
              .catch(() => {})
              .then(async () => {
                const item = record(id)
                const check = () => {
                  if (record(id).revisionIds.at(-1) !== position.revisionId)
                    fail(409, '文件版本已更新，未保存舊進度。')
                }
                check()
                const file = progressFile(id)
                if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink())
                  fail(400, '閱讀進度不可為外部連結。')
                await writeProgressJSON(
                  file,
                  { ...value, epoch: item.progressEpoch ?? null },
                  check,
                )
              })
            progressWrites.set(id, operation)
            try {
              await operation
            } finally {
              if (progressWrites.get(id) === operation) progressWrites.delete(id)
            }
            return send(res, { saved: true })
          }
        }
        fail(404, '找不到書架操作。')
      }
      if (devPort) {
        const proxy = http.request(
          {
            hostname: '127.0.0.1',
            port: devPort,
            path: req.url,
            method: req.method,
            headers: { ...req.headers, host: `localhost:${devPort}` },
          },
          (response) => {
            res.writeHead(response.statusCode, response.headers)
            response.pipe(res)
          },
        )
        proxy.on('error', () => {
          res.writeHead(503).end('Web 開發服務正在啟動，請稍後重新整理。')
        })
        req.pipe(proxy)
        return
      }
      let file = path.resolve(webRoot, `.${decodeURIComponent(url.pathname)}`)
      if (file !== webRoot && !file.startsWith(`${webRoot}${path.sep}`)) fail(403, '路徑無效。')
      if (fs.existsSync(file) && fs.statSync(file).isDirectory())
        file = path.join(file, 'index.html')
      if (!fs.existsSync(file) || !fs.statSync(file).isFile())
        fail(404, '找不到頁面，請先執行 pnpm build:web。')
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
      }
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      })
      fs.createReadStream(file).pipe(res)
    } catch (error) {
      if (!res.headersSent)
        send(
          res,
          {
            error:
              error.code === 'ENOSPC'
                ? '硬碟空間不足，資料未保存。'
                : error.code === 'ENOENT'
                  ? '找不到資料夾中的文件。'
                  : error.status
                    ? error.message
                    : '書架操作失敗，請檢查資料夾或服務紀錄。',
          },
          error.status ?? (error.code === 'ENOENT' ? 404 : 500),
        )
      if (!error.status) console.error(error.message)
    }
  })
  if (devPort)
    server.on('upgrade', (req, socket, head) => {
      try {
        trusted(req)
      } catch {
        socket.destroy()
        return
      }
      const upstream = net.connect(devPort, '127.0.0.1', () => {
        upstream.write(
          `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${Object.entries(req.headers)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\r\n')}\r\n\r\n`,
        )
        if (head.length) upstream.write(head)
        socket.pipe(upstream).pipe(socket)
      })
      upstream.on('error', () => socket.destroy())
      socket.on('error', () => upstream.destroy())
    })
  server.on('close', release)
  server.on('error', release)
  return server
}

module.exports = { createLibraryServer }
if (require.main === module) {
  const config = loadConfig()
  const devPort = process.argv.includes('--dev') ? config.server.devPort : null
  const port = config.server.port
  const server = createLibraryServer({ config, devPort })
  server.listen(port, '127.0.0.1', () =>
    console.log(`Pageforge http://localhost:${port} · ${config.paths.libraryRoot}`),
  )
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => server.close(() => process.exit(0)))
}
