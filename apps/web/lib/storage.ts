import * as browser from './indexed-storage'
import type { DocumentSummary, LibraryDocument, ReadingPosition, Revision } from './documents'
import { latest } from './documents'

export { database, changeSource, announce } from './indexed-storage'
export interface StorageInfo { mode: 'disk' | 'browser'; label: string; collectionImported: boolean }
let storage: Promise<StorageInfo> | null = null
export function storageInfo(): Promise<StorageInfo> {
  if (!storage) storage = (async () => {
    let response: Response
    try { response = await fetch('/api/library/status', { cache: 'no-store' }) }
    catch { throw new Error('無法連線到本機書架服務，請確認 Pageforge 正在執行。') }
    if (response.status === 404) return { mode: 'browser' as const, label: '瀏覽器儲存', collectionImported: true }
    if (!response.ok) throw new Error('本機書架服务無法使用，資料未切換到其他位置。')
    const info = await response.json()
    if (info.mode !== 'disk') throw new Error('書架服務回傳不支援的儲存模式。')
    return info as StorageInfo
  })().catch(error => { storage = null; throw error })
  return storage
}
async function api<T>(route: string, method = 'GET', data?: unknown): Promise<T> {
  let response: Response
  try { response = await fetch(`/api/library${route}`, { method, cache:'no-store', ...(data !== undefined ? { headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(data) } : {}) }) }
  catch { throw new Error('無法連線到本機書架，資料尚未保存。請重新啟動 Pageforge 後再試。') }
  const value = await response.json()
  if (!response.ok) {
    if (response.status === 409 && method === 'POST' && route === '/documents') throw new DOMException(value.error, 'ConstraintError')
    throw new Error(value.error ?? '本機書架操作失敗。')
  }
  return value as T
}
async function encode(doc: LibraryDocument) {
  const bytes = new Uint8Array(await doc.original.arrayBuffer())
  let binary = ''
  for (let index=0; index<bytes.length; index+=8192) binary += String.fromCharCode(...bytes.subarray(index,index+8192))
  const { original, ...data } = doc
  return { ...data, originalBase64:btoa(binary), originalType:original.type }
}
function decode(data: LibraryDocument & { originalBase64:string; originalType:string }): LibraryDocument {
  const { originalBase64, originalType, ...doc } = data
  const binary = atob(originalBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index=0; index<binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return { ...doc, original:new Blob([bytes],{type:originalType}) }
}
export async function listDocuments(): Promise<DocumentSummary[]> {
  return (await storageInfo()).mode === 'disk' ? api('/documents') : browser.listDocuments()
}
export async function loadDocument(id: string): Promise<LibraryDocument | undefined> {
  if ((await storageInfo()).mode !== 'disk') return browser.loadDocument(id)
  return decode(await api(`/documents/${encodeURIComponent(id)}`))
}
export async function findDuplicate(format: string, hash: string): Promise<DocumentSummary | undefined> {
  return (await storageInfo()).mode === 'disk' ? (await api<DocumentSummary | null>(`/duplicate?format=${encodeURIComponent(format)}&hash=${encodeURIComponent(hash)}`)) ?? undefined : browser.findDuplicate(format, hash)
}
export async function insertDocument(doc: LibraryDocument): Promise<void> {
  if ((await storageInfo()).mode !== 'disk') return browser.insertDocument(doc)
  await api('/documents','POST',await encode(doc))
}
export async function appendRevision(id: string, expectedHead: string, revision: Revision): Promise<LibraryDocument> {
  if ((await storageInfo()).mode !== 'disk') return browser.appendRevision(id,expectedHead,revision)
  const updated = decode(await api(`/documents/${encodeURIComponent(id)}/revisions`,'POST',{expectedHead,revision}))
  browser.announce()
  return updated
}
export async function deleteDocument(id: string): Promise<void> {
  if ((await storageInfo()).mode !== 'disk') return browser.deleteDocument(id)
  await api(`/documents/${encodeURIComponent(id)}`,'DELETE')
  browser.announce()
}
export async function readProgress(id: string): Promise<ReadingPosition | undefined> {
  return (await storageInfo()).mode === 'disk' ? (await api<ReadingPosition | null>(`/documents/${encodeURIComponent(id)}/progress`)) ?? undefined : browser.readProgress(id)
}
export async function saveProgress(id: string, position: ReadingPosition): Promise<void> {
  if ((await storageInfo()).mode !== 'disk') return browser.saveProgress(id,position)
  await api(`/documents/${encodeURIComponent(id)}/progress`,'PUT',position)
}
export async function readFontSize(): Promise<number> {
  return (await storageInfo()).mode === 'disk' ? (await api<{fontSize:number}>('/settings')).fontSize : browser.readFontSize()
}
export async function saveFontSize(size: number): Promise<void> {
  if ((await storageInfo()).mode !== 'disk') return browser.saveFontSize(size)
  await api('/settings','PUT',{fontSize:size})
}
export async function collectionFiles(): Promise<{ name:string; size:number; url:string }[]> { return api('/collection') }
export async function markCollectionImported(): Promise<void> {
  await api('/settings','PUT',{collectionImported:true})
  const info = await storageInfo(); info.collectionImported=true
}
export async function browserDocumentCount(): Promise<number> { return (await browser.listDocuments()).length }
export async function migrateBrowserDocuments(): Promise<{ imported:number; skipped:number; conflicts:string[] }> {
  if ((await storageInfo()).mode !== 'disk') throw new Error('請使用 npm run dev:web 或 npm run start:web 啟動固定資料夾書架。')
  const { verifyHistory } = await import('./history')
  const summaries = await browser.listDocuments()
  let imported=0,skipped=0
  const conflicts: string[] = []
  for (const item of summaries) {
    const doc = await browser.loadDocument(item.id)
    if (!doc) continue
    await verifyHistory(doc)
    const duplicate = await findDuplicate(doc.format,doc.originalHash)
    if (duplicate) {
      const stored = await loadDocument(duplicate.id)
      if (stored && doc.revisions.every((revision,index)=>stored.revisions[index]?.sai === revision.sai)) skipped++
      else conflicts.push(doc.title)
      continue
    }
    try { await insertDocument(doc) } catch(error) {
      if (error instanceof DOMException && error.name === 'ConstraintError') {skipped++;continue}
      throw error
    }
    const position = await browser.readProgress(doc.id)
    if (position && doc.revisions.find(r=>r.id===position.revisionId)?.content === latest(doc).content) await saveProgress(doc.id,{...position,revisionId:latest(doc).id})
    imported++
  }
  browser.announce()
  return {imported,skipped,conflicts}
}
