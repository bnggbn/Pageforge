import { ScrollRenderer } from './modes/ScrollRenderer'
import { PageRenderer } from './modes/PageRenderer'
import type { ReaderProps } from './types'

// Reader 核心 — 關閉修改，透過 adapter / slots / mode 擴展
export function Reader({ content, mode = 'scroll', adapter, slots, className = '' }: ReaderProps) {
  const rendered = adapter.render(content)
  const ModeRenderer = mode === 'scroll' ? ScrollRenderer : PageRenderer

  return (
    <div className={`flex flex-col h-full bg-surface ${className}`}>
      {/* Header Slot */}
      {slots?.header && (
        <header className="border-b border-gray-200 px-6 py-3">{slots.header}</header>
      )}

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Slot */}
        {slots?.sidebar && (
          <aside className="w-64 border-r border-gray-200 overflow-y-auto">{slots.sidebar}</aside>
        )}

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar Slot */}
          {slots?.toolbar && (
            <div className="border-b border-gray-200 px-4 py-2">{slots.toolbar}</div>
          )}

          {/* RenderMode (Strategy) */}
          <ModeRenderer>{rendered}</ModeRenderer>
        </main>
      </div>

      {/* Footer Slot */}
      {slots?.footer && (
        <footer className="border-t border-gray-200 px-6 py-3">{slots.footer}</footer>
      )}
    </div>
  )
}

// Re-exports
export { MarkdownAdapter } from './adapters/MarkdownAdapter'
export type { ReaderProps, ReaderSlots, ContentAdapter, RenderMode } from './types'
