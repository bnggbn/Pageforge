import type { ReactNode } from 'react'

// --- ContentAdapter (Strategy: 開放擴展) ---
export interface ContentAdapter {
  render(raw: string): ReactNode
}

// --- RenderMode ---
export type RenderMode = 'scroll' | 'page'

// --- Slots ---
export interface ReaderSlots {
  header?: ReactNode
  toolbar?: ReactNode
  sidebar?: ReactNode
  footer?: ReactNode
}

// --- Reader Props ---
export interface ReaderProps {
  content: string
  mode?: RenderMode
  adapter: ContentAdapter
  slots?: ReaderSlots
  className?: string
}

// --- RenderModeProps (Strategy 元件共用的 props) ---
export interface RenderModeProps {
  children: ReactNode
}
