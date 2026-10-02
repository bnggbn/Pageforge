import Link from 'next/link'

export function ReaderLoadState({ loading, error }: { loading: boolean; error: string }) {
  return (
    <main className={styles.loading}>
      {loading ? (
        <>
          <p className="eyebrow text-[10px] tracking-[2px] font-semibold m-0 text-muted">
            PAGEFORGE READING ROOM
          </p>
          <h1>正在打開你的文字…</h1>
        </>
      ) : (
        <>
          <h1>無法開啟文件</h1>
          <p role="alert">{error}</p>
          <Link href="/">回到書架 →</Link>
        </>
      )}
    </main>
  )
}

const styles = {
  loading: [
    'reader-loading max-w-225 py-17.5 px-6 m-auto',
    '[&_h1]:text-[28px] [&_h1]:font-medium [&_h1]:my-5 [&_h1]:mx-0',
    '[&_p]:leading-[1.8] [&_a]:inline-block [&_a]:mt-[25px] [&_a]:text-rust',
  ].join(' '),
}
