export type DocumentFormat = 'markdown' | 'text' | 'pdf' | 'epub' | 'xlsx'
export interface Section {
  title: string
  text: string
}
export interface Sheet {
  name: string
  rows: string[][]
}
export interface Note {
  id: string
  body: string
  quote: string
  location: string
  createdAt: string
}
export interface Revision {
  id: string
  parentId: string | null
  kind: 'import' | 'edit' | 'note' | 'restore'
  createdAt: string
  content: string
  notes: Note[]
  prevSAI: string
  sai: string
  envelope: string
}
export interface ReadingPosition {
  revisionId: string
  block: string
  ratio: number
  percentage: number
  updatedAt: string
  section: number
}
export interface LibraryDocument {
  id: string
  title: string
  filename: string
  format: DocumentFormat
  createdAt: string
  updatedAt: string
  originalHash: string
  original: Blob
  sections: Section[]
  sheets: Sheet[]
  actor: string
  salt: string
  genesis: string
  revisions: Revision[]
}
export interface DocumentSummary {
  id: string
  title: string
  filename: string
  format: DocumentFormat
  createdAt: string
  updatedAt: string
  originalHash: string
  head: string
  revisionCount: number
  progress: number
}
export const FORMAT_LABELS: Record<DocumentFormat, string> = {
  markdown: 'MD',
  text: 'TXT',
  pdf: 'PDF',
  epub: 'EPUB',
  xlsx: 'XLSX',
}
export const EDITABLE = new Set<DocumentFormat>(['markdown', 'text'])
export function latest(doc: LibraryDocument): Revision {
  return doc.revisions[doc.revisions.length - 1]
}
export function summary(doc: LibraryDocument, progress = 0): DocumentSummary {
  return {
    id: doc.id,
    title: doc.title,
    filename: doc.filename,
    format: doc.format,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    originalHash: doc.originalHash,
    head: latest(doc).id,
    revisionCount: doc.revisions.length,
    progress,
  }
}
export function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError')
    return '本機儲存空間不足，請先備份並移除不需要的文件。'
  return error instanceof Error ? error.message : '操作失敗，請重試。'
}
