import type { ReadingPosition } from './documents'

export type ReaderTab = 'read' | 'edit' | 'notes' | 'history' | 'sandbox'
export interface ReaderSettings {
  position?: ReadingPosition
  fontSize: number
}
