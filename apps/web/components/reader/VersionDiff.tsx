import type { DiffResult } from '@/lib/revision-diff'

export function VersionDiff({ result }: { result: (DiffResult & { pending: boolean }) | null }) {
  if (result?.pending) return <p role="status">正在比較版本…</p>
  if (result?.tooLarge) return <p role="status">差異過大，請匯出版本紀錄後使用外部工具比較。</p>
  return (
    <div className={styles.output}>
      {result?.parts.length ? (
        result.parts.map((part, index) => (
          <pre
            className={part.added ? 'diff-added' : part.removed ? 'diff-removed' : ''}
            key={index}
          >
            <span aria-hidden="true">{part.added ? '+' : part.removed ? '−' : ' '}</span>
            {!part.added && !part.removed && part.value.split('\n').length > 12
              ? `${part.value.split('\n').slice(0, 3).join('\n')}\n\n… ${part.value.split('\n').length - 6} 行未變更 …\n\n${part.value.split('\n').slice(-3).join('\n')}`
              : part.value}
          </pre>
        ))
      ) : (
        <p>兩個版本沒有差異。</p>
      )}
    </div>
  )
}

const styles = {
  output: [
    'diff-output bg-surface border border-line rounded-[5px] overflow-auto max-h-[65dvh]',
    '[&_pre]:flex [&_pre]:whitespace-pre-wrap [&_pre]:[word-break:break-word]',
    '[&_pre]:py-2.5 [&_pre]:px-[15px] [&_pre]:m-0 [&_pre]:text-[12px] [&_pre]:leading-[1.8] [&_pre]:font-code',
    '[&_pre_>_span]:w-5.5 [&_pre_>_span]:shrink-0',
    '[&_.diff-added]:bg-[#e5eddd] [&_.diff-added]:text-[#3a623b]',
    '[&_.diff-removed]:bg-[#f3e2dc] [&_.diff-removed]:text-[#934c3e]',
    '[&_>_p]:p-6 [&_>_p]:text-[12px] [&_>_p]:text-muted',
  ].join(' '),
}
