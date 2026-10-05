import { memo, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { config } from '@/lib/config'
import type { VirtualReading } from '@/hooks/useReaderProgress'

interface Props {
  rows: string[][]
  fontSize: number
  scrollRef: RefObject<HTMLDivElement | null>
  virtualRef: RefObject<VirtualReading | null>
}

// Fixed-height cells keep off-screen row anchors exact without creating their DOM nodes.
export const VirtualSheet = memo(function VirtualSheet({
  rows,
  fontSize,
  scrollRef,
  virtualRef,
}: Props) {
  const bodyRef = useRef<HTMLTableSectionElement>(null)
  const rowHeight = Math.max(config.reading.sheetRowHeightPx, Math.ceil(fontSize * 2))
  const [range, setRange] = useState({ start: 0, end: 1 })
  const columns = useMemo(() => Math.max(1, ...rows.map((row) => row.length)), [rows])

  useLayoutEffect(() => {
    const container = scrollRef.current
    const body = bodyRef.current
    if (!container || !body) return
    const offset = () =>
      body.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
    const update = () => {
      const first = Math.max(0, Math.floor((container.scrollTop - offset()) / rowHeight))
      const start = Math.max(0, Math.min(rows.length, first - config.reading.sheetOverscanRows))
      const end = Math.min(
        rows.length,
        first + Math.ceil(container.clientHeight / rowHeight) + config.reading.sheetOverscanRows,
      )
      setRange((old) => (old.start === start && old.end === end ? old : { start, end }))
    }
    const adapter: VirtualReading = {
      capture: () => {
        const position = Math.max(0, (container.scrollTop + 36 - offset()) / rowHeight)
        const index = Math.min(Math.max(0, rows.length - 1), Math.floor(position))
        return { block: rows.length ? `row-${index}` : '', ratio: Math.min(1, position - index) }
      },
      restore: (position) => {
        if (!position.block) return false
        const match = /^row-(\d+)$/.exec(position.block)
        const index = Number(match?.[1])
        if (!match || index >= rows.length) return false
        container.scrollTop = Math.max(0, offset() + (index + position.ratio) * rowHeight - 36)
        update()
        return true
      },
    }
    virtualRef.current = adapter
    container.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(container)
    update()
    return () => {
      container.removeEventListener('scroll', update)
      observer.disconnect()
      if (virtualRef.current === adapter) virtualRef.current = null
    }
  }, [rows, rowHeight, scrollRef, virtualRef])

  const spacer = (height: number, key: string) =>
    height > 0 && (
      <tr key={key} aria-hidden="true" style={{ height }}>
        <td colSpan={columns + 1} style={{ height, padding: 0, border: 0 }} />
      </tr>
    )
  return (
    <div className="reader-table-wrap overflow-x-auto max-w-full my-5 mx-0">
      <table aria-label="工作表內容" aria-rowcount={rows.length}>
        <tbody ref={bodyRef}>
          {spacer(range.start * rowHeight, 'before')}
          {rows.slice(range.start, range.end).map((row, local) => {
            const index = range.start + local
            return (
              <tr
                data-block={`row-${index}`}
                aria-rowindex={index + 1}
                key={index}
                style={{ height: rowHeight }}
              >
                <th scope="row" style={{ height: rowHeight, paddingBlock: 0 }}>
                  {index + 1}
                </th>
                {row.map((cell, column) => (
                  <td key={column} style={{ height: rowHeight, paddingBlock: 0 }}>
                    <span title={cell} className="block max-w-80 truncate whitespace-nowrap">
                      {cell}
                    </span>
                  </td>
                ))}
              </tr>
            )
          })}
          {spacer((rows.length - range.end) * rowHeight, 'after')}
        </tbody>
      </table>
    </div>
  )
})
