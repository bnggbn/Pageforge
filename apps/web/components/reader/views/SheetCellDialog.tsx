import { useEffect, useId, useRef } from 'react'

export interface SheetCell {
  value: string
  row: number
  column: number
}
export function SheetCellDialog({ cell, onClose }: { cell: SheetCell; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) ref.current?.close()
      }}
      className="fixed inset-0 m-auto w-[90vw] max-w-160 max-h-[80dvh] overflow-auto rounded-lg border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-black/30"
    >
      <div className="flex items-center justify-between gap-4 text-[13px]">
        <h3 id={titleId}>
          第 {cell.row + 1} 列，第 {cell.column + 1} 欄
        </h3>
        <button type="button" onClick={() => ref.current?.close()} className="text-rust underline">
          關閉完整內容
        </button>
      </div>
      <p
        data-block={`row-${cell.row}`}
        className="whitespace-pre-wrap select-text text-[14px] leading-7"
      >
        {cell.value}
      </p>
    </dialog>
  )
}
