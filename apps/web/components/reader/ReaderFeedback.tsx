interface Props {
  error: string
  message: string
  stale: boolean
  busy: boolean
  onReload: () => Promise<void>
}
export function ReaderFeedback({ error, message, stale, busy, onReload }: Props) {
  if (!error && !message && !stale) return null
  return (
    <div className={styles.status}>
      {error && (
        <p role="alert" className="error text-[#a43c2e]">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {stale && (
        <p>
          另一個分頁更新了書架。
          <button disabled={busy} onClick={() => void onReload()}>
            重新載入
          </button>
        </p>
      )}
    </div>
  )
}

const styles = {
  status: [
    'reader-status py-3 px-4.5 bg-[#eeeee3] mt-4 mx-0 mb-0 rounded-[5px] text-[12px] leading-[1.8]',
    '[&_button]:bg-transparent [&_button]:border-0 [&_button]:underline [&_button]:ml-2.5',
  ].join(' '),
}
