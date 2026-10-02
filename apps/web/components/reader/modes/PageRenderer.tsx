'use client'

import { useRef, useState } from 'react'
import type { RenderModeProps } from '../types'

export function PageRenderer({ children }: RenderModeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)

  const goNext = () => {
    if (!containerRef.current) return
    const h = containerRef.current.clientHeight
    containerRef.current.scrollBy({ top: h, behavior: 'smooth' })
    setPage(p => p + 1)
  }

  const goPrev = () => {
    if (!containerRef.current) return
    const h = containerRef.current.clientHeight
    containerRef.current.scrollBy({ top: -h, behavior: 'smooth' })
    setPage(p => Math.max(0, p - 1))
  }

  return (
    <div className="relative h-full flex flex-col">
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
      >
        <div className="max-w-prose mx-auto px-6 py-8">
          {children}
        </div>
      </div>

      {/* 翻頁控制 */}
      <div className="flex items-center justify-center gap-8 py-4 border-t border-gray-200">
        <button
          onClick={goPrev}
          disabled={page === 0}
          className="px-4 py-2 rounded-lg disabled:opacity-30 hover:bg-gray-100 transition-colors"
        >
          ← 上一頁
        </button>
        <span className="text-sm text-text-muted">{page + 1}</span>
        <button
          onClick={goNext}
          className="px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          下一頁 →
        </button>
      </div>
    </div>
  )
}
