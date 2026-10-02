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
