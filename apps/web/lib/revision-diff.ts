import type { Note } from './documents'

export interface DiffPart {
  value: string
  added?: boolean
  removed?: boolean
}
export interface DiffResult {
  tooLarge: boolean
  parts: DiffPart[]
}
export interface DiffRequest {
  left: string
  right: string
  options: { timeoutMs: number; maxEditLength: number }
}

export function serializeNotes(notes: Note[]): string {
  return notes
    .map((note) => `[${note.location}]\n${note.quote ? `> ${note.quote}\n` : ''}${note.body}\n`)
    .join('\n')
}
