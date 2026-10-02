import { unzipSync, strFromU8 } from 'fflate'
import { digest, genesis, createRevision } from './history'
import { findDuplicate, insertDocument, announce } from './storage'
import type { DocumentFormat, LibraryDocument, Section, Sheet } from './documents'

const MiB = 1024 * 1024
const formats: Record<string, DocumentFormat> = { md: 'markdown', markdown: 'markdown', txt: 'text', pdf: 'pdf', epub: 'epub', xlsx: 'xlsx' }
const tags = (node: Document | Element, name: string): Element[] => Array.from(node.getElementsByTagNameNS('*', name))
function xml(text: string): Document {
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(text)) throw new Error('文件使用不支援的 XML 實體宣告。')
  const doc = new DOMParser().parseFromString(text.replace(/<!DOCTYPE[^>]*>/gi, ''), 'application/xml')
  if (tags(doc, 'parsererror').length) throw new Error('文件內的 XML 無效。')
  return doc
}
function archive(bytes: Uint8Array): Record<string, Uint8Array> {
  let total = 0, entries = 0
  unzipSync(bytes, { filter: entry => {
    total += entry.originalSize
    entries++
    if (entries > 2000 || total > 40 * MiB || entry.originalSize > 15 * MiB) throw new Error('文件解壓後過大（最多 40 MiB／2,000 個項目）。')
    if (entry.name.includes('..') || entry.name.startsWith('/') || entry.name.includes('\\')) throw new Error('封裝內含不支援的路徑。')
    return false
  } })
  return unzipSync(bytes, { filter: entry => /\.(xml|rels|opf|xhtml|html|htm|txt)$/i.test(entry.name) || entry.name === 'mimetype' })
}
function fileText(files: Record<string, Uint8Array>, name: string): string {
  const bytes = files[name]
  if (!bytes) throw new Error(`文件缺少必要項目：${name}`)
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}
function resolvePath(base: string, relative: string): string {
  if (/^[a-z]+:|^\/\//i.test(relative)) throw new Error('文件引用外部資源，無法匯入。')
  const parts = relative.startsWith('/') ? [] : base.split('/').slice(0, -1)
  for (const part of decodeURIComponent(relative.split('#')[0]).split('/')) {
    if (part === '..') { if (!parts.length) throw new Error('文件路徑無效。'); parts.pop() }
    else if (part && part !== '.') parts.push(part)
  }
  return parts.join('/')
}
export function parseEpub(files: Record<string, Uint8Array>): { title: string; sections: Section[] } {
  if (strFromU8(files.mimetype ?? new Uint8Array()).trim() !== 'application/epub+zip') throw new Error('這不是有效的 EPUB 文件。')
  if (files['META-INF/encryption.xml']) throw new Error('目前不支援加密或 DRM EPUB。')
  const container = xml(fileText(files, 'META-INF/container.xml'))
  const opfPath = tags(container, 'rootfile')[0]?.getAttribute('full-path')
  if (!opfPath) throw new Error('EPUB 缺少閱讀清單。')
  const opf = xml(fileText(files, opfPath))
  const manifest = new Map(tags(opf, 'item').map(item => [item.getAttribute('id'), item]))
  const sections: Section[] = []
  for (const reference of tags(opf, 'itemref')) {
    if (reference.getAttribute('linear') === 'no') continue
    const item = manifest.get(reference.getAttribute('idref'))
    if (!item || !/xhtml|html/.test(item.getAttribute('media-type') ?? '')) throw new Error('EPUB 含不支援的章節格式。')
    const doc = xml(fileText(files, resolvePath(opfPath, item.getAttribute('href') ?? '')))
    for (const tag of ['script', 'style', 'iframe', 'object', 'svg', 'head', 'img', 'noscript']) for (const node of tags(doc, tag)) node.remove()
    const heading = tags(doc, 'h1')[0] ?? tags(doc, 'h2')[0]
    const title = heading?.textContent?.trim() || `第 ${sections.length + 1} 章`
    const body = tags(doc, 'body')[0] ?? doc.documentElement
    const collect = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
      if (!(node instanceof Element)) return ''
      if (node.localName === 'br') return '\n'
      const content = Array.from(node.childNodes).map(collect).join('')
      return /^(p|div|section|h[1-6]|li|blockquote|pre|tr)$/.test(node.localName) ? `${content}\n\n` : content
    }
    const text = collect(body).replace(/\n[\t ]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    if (text) sections.push({ title, text })
  }
  if (!sections.length) throw new Error('EPUB 沒有可閱讀的文字章節。')
  return { title: tags(opf, 'title')[0]?.textContent?.trim() ?? '', sections }
}
export function parseXlsx(files: Record<string, Uint8Array>): Sheet[] {
  const workbook = xml(fileText(files, 'xl/workbook.xml'))
  const rels = xml(fileText(files, 'xl/_rels/workbook.xml.rels'))
  const relationships = new Map(tags(rels, 'Relationship').map(item => [item.getAttribute('Id'), item]))
  const shared = files['xl/sharedStrings.xml'] ? tags(xml(fileText(files, 'xl/sharedStrings.xml')), 'si').map(item => tags(item, 't').map(t => t.textContent ?? '').join('')) : []
  let cells = 0
  const sheets: Sheet[] = []
  for (const sheet of tags(workbook, 'sheet')) {
    const relId = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? sheet.getAttribute('r:id')
    const rel = relationships.get(relId)
    if (!rel || rel.getAttribute('TargetMode') === 'External') throw new Error('試算表引用外部工作表。')
    const path = resolvePath('xl/workbook.xml', rel.getAttribute('Target') ?? '')
    const data = xml(fileText(files, path))
    const rows: string[][] = []
    for (const row of tags(data, 'row')) {
      const rowNumber = Number(row.getAttribute('r') ?? rows.length + 1)
      if (!Number.isInteger(rowNumber) || rowNumber < rows.length + 1 || rowNumber > 10000) throw new Error('工作表列號無效，或超過 10,000 列上限。')
      while (rows.length < rowNumber - 1) rows.push([])
      const values: string[] = []
      for (const cell of tags(row, 'c')) {
        const letters = /^([A-Z]+)/.exec(cell.getAttribute('r') ?? '')?.[1]
        const column = letters ? [...letters].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0) - 1 : values.length
        if (column >= 200 || ++cells > 100000) throw new Error('試算表最多支援 200 欄／100,000 個儲存格。')
        while (values.length < column) values.push('')
        const type = cell.getAttribute('t')
        const raw = tags(cell, 'v')[0]?.textContent ?? ''
        values[column] = type === 's' ? shared[Number(raw)] ?? '' : type === 'inlineStr' ? tags(cell, 't').map(t => t.textContent ?? '').join('') : type === 'b' ? raw === '1' ? 'TRUE' : 'FALSE' : raw
      }
      rows.push(values)
    }
    sheets.push({ name: sheet.getAttribute('name') ?? `工作表 ${sheets.length + 1}`, rows })
  }
  if (!sheets.length) throw new Error('試算表沒有工作表。')
  return sheets
}
export async function importFile(file: File): Promise<{ id: string; duplicate: boolean }> {
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
  const format = formats[extension]
  if (!format) throw new Error('支援 .md、.txt、.pdf、.epub 與 .xlsx；舊版 .xls 尚不支援。')
  const limit = format === 'markdown' || format === 'text' ? 5 * MiB : 20 * MiB
  if (!file.size || file.size > limit) throw new Error(`文件不可為空，且不可超過 ${limit / MiB} MiB。`)
  const bytes = await file.arrayBuffer()
  const originalHash = await digest(bytes)
  const duplicate = await findDuplicate(format, originalHash)
  if (duplicate) return { id: duplicate.id, duplicate: true }
  let content = '', sections: Section[] = [], sheets: Sheet[] = []
  let title = file.name.replace(/\.[^.]+$/, '') || file.name
  if (format === 'markdown' || format === 'text') {
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { throw new Error('文字文件需使用有效的 UTF-8 編碼。') }
    if (!content.trim() || content.includes('\0')) throw new Error('文件沒有可閱讀的文字，或包含二進位內容。')
  } else if (format === 'pdf') {
    const header = new TextDecoder().decode(bytes.slice(0, 1024))
    if (!header.includes('%PDF-')) throw new Error('這不是有效的 PDF 文件。')
  } else {
    const files = archive(new Uint8Array(bytes))
    if (format === 'epub') { const parsed = parseEpub(files); sections = parsed.sections; title = parsed.title || title }
    else sheets = parseXlsx(files)
  }
  const id = crypto.randomUUID(), actor = `pageforge:${id}`
  const chain = await genesis(actor)
  const now = new Date().toISOString()
  const doc: LibraryDocument = { id, title, filename: file.name, format, createdAt: now, updatedAt: now, originalHash, original: new Blob([bytes], { type: file.type || 'application/octet-stream' }), sections, sheets, actor, ...chain, revisions: [] }
  doc.revisions.push(await createRevision(doc, 'import', content, []))
  try { await insertDocument(doc) } catch (error) {
    if (error instanceof DOMException && error.name === 'ConstraintError') {
      const existing = await findDuplicate(format, originalHash)
      if (existing) return { id: existing.id, duplicate: true }
    }
    throw error
  }
  announce()
  return { id, duplicate: false }
}
