const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const defaults = require('../pageforge.config.json')
function merge(base, override, prefix = '') {
  if (!override || typeof override !== 'object' || Array.isArray(override))
    throw new Error(`設定 ${prefix || 'root'} 必須是物件。`)
  const result = structuredClone(base)
  for (const [key, value] of Object.entries(override)) {
    if (!(key in base)) throw new Error(`未知設定：${prefix}${key}`)
    result[key] =
      base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])
        ? merge(base[key], value, `${prefix}${key}.`)
        : value
  }
  return result
}
function loadConfig({
  env = process.env,
  localFile = path.join(root, 'pageforge.config.local.json'),
} = {}) {
  const config = fs.existsSync(localFile)
    ? merge(defaults, JSON.parse(fs.readFileSync(localFile, 'utf8').replace(/^\uFEFF/, '')))
    : structuredClone(defaults)
  if (env.PAGEFORGE_PORT !== undefined) config.server.port = Number(env.PAGEFORGE_PORT)
  if (env.PAGEFORGE_DEV_PORT !== undefined) config.server.devPort = Number(env.PAGEFORGE_DEV_PORT)
  if (env.PAGEFORGE_LIBRARY_ROOT !== undefined)
    config.paths.libraryRoot = env.PAGEFORGE_LIBRARY_ROOT
  if (env.PAGEFORGE_WEB_ROOT !== undefined) config.paths.webRoot = env.PAGEFORGE_WEB_ROOT
  for (const [key, value] of Object.entries(config.server))
    if (!Number.isInteger(value) || value < 1 || value > 65535)
      throw new Error(`server.${key} 必須介於 1–65535。`)
  if (config.server.port === config.server.devPort) throw new Error('服務與開發連接埠不可相同。')
  for (const group of ['limits', 'diff'])
    for (const [key, value] of Object.entries(config[group]))
      if (!Number.isSafeInteger(value) || value < 1 || value > 100000000)
        throw new Error(`${group}.${key} 必須是有效的正整數。`)
  const reading = config.reading
  if (
    !Array.isArray(reading.fontSizes) ||
    !reading.fontSizes.length ||
    reading.fontSizes.some(
      (value, i, sizes) =>
        !Number.isInteger(value) || value < 10 || value > 48 || (i > 0 && value <= sizes[i - 1]),
    ) ||
    !reading.fontSizes.includes(reading.defaultFontSize)
  )
    throw new Error('reading.fontSizes 必須是遞增的 10–48 字級，且包含 defaultFontSize。')
  for (const key of ['progressDebounceMs', 'pdfMaxPage'])
    if (!Number.isSafeInteger(reading[key]) || reading[key] < 1 || reading[key] > 1000000)
      throw new Error(`reading.${key} 無效。`)
  if (
    config.limits.archiveEntryMiB > config.limits.archiveMiB ||
    config.limits.requestMiB <
      2 * Math.max(config.limits.textMiB, config.limits.documentMiB, config.limits.snapshotNotesMiB)
  )
    throw new Error(
      '容量設定不一致：解壓單項不得超過總量，請求容量至少為最大快照或檔案容量的兩倍。',
    )
  for (const [key, value] of Object.entries(config.paths)) {
    if (typeof value !== 'string' || !value.trim() || value.includes('\0'))
      throw new Error(`paths.${key} 必須是有效路徑。`)
    config.paths[key] = path.resolve(root, value)
  }
  return config
}
function publicConfig(config) {
  return { limits: config.limits, reading: config.reading, diff: config.diff }
}
module.exports = { loadConfig, publicConfig }
