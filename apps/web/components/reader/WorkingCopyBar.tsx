import type { WorkingCopy } from '@/lib/documents'

interface Props {
  status: 'saved' | 'pending' | 'saving' | 'error'
  error: string
  restored: boolean
  stale: boolean
  staleMessage?: string
  copies: WorkingCopy[]
  selectedId: string
  busy: boolean
  onSelect: (id: string) => void
  onRetry: () => void
  onDiscard: () => void
}
export function WorkingCopyBar(props: Props) {
  const labels = {
    saved: '草稿已暫存',
    pending: '草稿待暫存',
    saving: '正在暫存草稿…',
    error: '草稿暫存失敗',
  }
  return (
    <div className="working-copy-bar mt-4 flex flex-wrap items-center gap-3 rounded-[5px] border border-line bg-[#eeeee3] px-4 py-3 text-[11px] text-muted">
      <span role="status">
        {labels[props.status]}
        {props.restored ? ' · 已恢復上次草稿' : ''}
      </span>
      {props.stale && (
        <span className="text-rust">
          {props.staleMessage ?? '草稿基於舊版本；主線更新已保留。'}
        </span>
      )}
      {props.copies.length > 1 && (
        <select
          aria-label="選擇保留草稿"
          className="max-w-full bg-transparent"
          value={props.selectedId}
          disabled={props.busy}
          onChange={(event) => props.onSelect(event.target.value)}
        >
          {!props.copies.some((copy) => copy.id === props.selectedId) && (
            <option value={props.selectedId}>目前草稿</option>
          )}
          {props.copies.map((copy, index) => (
            <option key={copy.id} value={copy.id}>
              草稿 {index + 1} · {new Date(copy.updatedAt).toLocaleString('zh-TW')}
            </option>
          ))}
        </select>
      )}
      {props.error && (
        <span role="alert" className="text-rust">
          {props.error}
        </span>
      )}
      {props.status === 'error' && (
        <button className="text-rust underline" onClick={props.onRetry} disabled={props.busy}>
          重試暫存
        </button>
      )}
      <button
        className="ml-auto text-rust underline"
        onClick={props.onDiscard}
        disabled={props.busy}
      >
        捨棄此草稿
      </button>
    </div>
  )
}
