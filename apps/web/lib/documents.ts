import type { DocumentFormat, Section, Sheet, Revision, DocumentSummary } from '@pageforge/domain'
export * from '@pageforge/domain'

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
