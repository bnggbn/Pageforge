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
  kind: 'import' | 'edit' | 'note' | 'restore' | 'fork' | 'adopt'
  createdAt: string
  content: string
  notes: Note[]
  prevSAI: string
  sai: string
  envelope: string
  branchId?: string
  adoptedFrom?: AdoptionSource
}
export interface AdoptionSource {
  branchId: string
  revisionId: string
  baseRevisionId: string
}
export interface SandboxBranch {
  id: string
  documentId: string
  name: string
  baseRevisionId: string
  createdAt: string
  updatedAt: string
  revisions: Revision[]
  archivedAt?: string
}
export type SandboxSummary = Omit<SandboxBranch, 'revisions'> & {
  head: string
  revisionCount: number
}
export interface WorkingCopy {
  id: string
  documentId: string
  baseRevisionId: string
  version: string
  content: string
  body: string
  quote: string
  location: string
  updatedAt: string
  branchId?: string
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
