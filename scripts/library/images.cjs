const fs = require('node:fs/promises')
const path = require('node:path')

function imageError(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

function imageType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp'
  return null
}

// Only collection assets are served. Never fetch a URL supplied by a document.
async function serveImage({ collection, source, maxMiB, response }) {
  if (
    !source ||
    /[\\\0]/.test(source) ||
    source.startsWith('/') ||
    /^[a-z][a-z\d+.-]*:/i.test(source)
  )
    imageError(400, '圖片路徑無效。')
  const segments = source.split('/')
  if (segments.some((part) => !part || part === '.' || part === '..'))
    imageError(400, '圖片路徑無效。')
  if (!/\.(png|jpe?g|gif|webp)$/i.test(source))
    imageError(415, '只支援 PNG、JPEG、GIF 與 WebP 圖片。')
  let file = collection
  for (const segment of segments) {
    file = path.join(file, segment)
    if ((await fs.lstat(file)).isSymbolicLink()) imageError(403, '圖片不可連結到外部資料夾。')
  }
  const [root, resolved] = await Promise.all([fs.realpath(collection), fs.realpath(file)])
  if (!resolved.startsWith(`${root}${path.sep}`)) imageError(403, '圖片路徑超出書架。')
  const handle = await fs.open(file, 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size === 0 || stat.size > maxMiB * 1024 * 1024)
      imageError(413, '圖片超過設定容量，或不是有效檔案。')
    const buffer = Buffer.alloc(stat.size + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
      if (!bytesRead) break
      length += bytesRead
    }
    if (length !== stat.size) imageError(409, '圖片正在變更，請重新載入。')
    const bytes = buffer.subarray(0, length)
    const type = imageType(bytes)
    if (!type) imageError(415, '圖片內容不是支援的格式。')
    response.writeHead(200, {
      'Content-Type': type,
      'Content-Length': bytes.length,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Cache-Control': 'private, no-cache',
    })
    response.end(bytes)
  } finally {
    await handle.close()
  }
}

module.exports = { serveImage }
