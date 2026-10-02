'use client'
import { EDITABLE, latest, type LibraryDocument, type Revision } from '@/lib/documents'
import { useRevisionDiff } from '@/hooks/useRevisionDiff'
import { exportFile } from '@/lib/download'
const kindLabels = {
  import: '匯入原始文件',
  edit: '修改文字',
  note: '更新筆記',
  restore: '還原版本',
}
interface Props {
  doc: LibraryDocument
  busy: boolean
  from: string
  to: string
  compareNotes: boolean
  setFrom: (value: string) => void
  setTo: (value: string) => void
  setCompareNotes: (value: boolean) => void
  onRestore: (revision: Revision) => Promise<unknown>
}
export function RevisionHistory({
  doc,
  busy,
  from,
  to,
  compareNotes,
  setFrom,
  setTo,
  setCompareNotes,
  onRestore,
}: Props) {
  const head = latest(doc)
  const editable = EDITABLE.has(doc.format)
  const compare = useRevisionDiff(doc, true, from, to, compareNotes)
  return (
    <div className={styles.historyLayout}>
      <aside
        className={[
          'version-list',
          '[&_h2]:text-[19px] [&_h2]:font-medium [&_h2]:my-3 [&_h2]:mx-0',
          'min-w-0',
          'max-md:max-h-[40dvh] max-md:overflow-auto',
        ].join(' ')}
      >
        <p className="eyebrow text-[10px] tracking-[2px] font-semibold m-0 text-muted">
          VERSION HISTORY
        </p>
        <h2>每一步，都有跡可循。</h2>
        <p className="integrity-label text-[#738360] text-[11px] py-3 px-0">✓ VAX 版本鏈已驗證</p>
        {[...doc.revisions].reverse().map((revision, index) => (
          <div className={styles.versionItem} key={revision.id}>
            <div>
              <strong>
                第 {doc.revisions.length - index} 版 · {kindLabels[revision.kind]}
              </strong>
              <time>{new Date(revision.createdAt).toLocaleString('zh-TW')}</time>
              <code title={revision.sai}>{revision.sai.slice(0, 16)}…</code>
            </div>
            <button
              disabled={busy || revision.id === head.id}
              onClick={async () => {
                if (!window.confirm('將此版本的文字與筆記還原成新版本？目前版本仍會保留。')) return
                await onRestore(revision)
              }}
            >
              還原成新版
            </button>
          </div>
        ))}
        <button
          className={[
            'secondary-button text-[11px] border border-solid border-line py-2.5 px-3.5',
            'rounded-[4px] bg-transparent my-[15px] mx-0',
          ].join(' ')}
          onClick={() =>
            exportFile(
              new Blob(
                [
                  JSON.stringify(
                    {
                      schema: 'pageforge-history/1',
                      documentId: doc.id,
                      originalHash: doc.originalHash,
                      actor: doc.actor,
                      salt: doc.salt,
                      genesis: doc.genesis,
                      revisions: doc.revisions,
                    },
                    null,
                    2,
                  ),
                ],
                { type: 'application/json' },
              ),
              `${doc.title}.history.json`,
            )
          }
        >
          匯出版本紀錄
        </button>
        <p className="small-note text-[11px] text-muted leading-[1.8] my-2.5 mx-0">
          版本紀錄不含二進位原始檔。這是本機版本鏈驗證，尚未包含簽章或外部可信錨點。
        </p>
      </aside>
      <section
        className={[
          'diff-panel',
          '[&_h2]:text-[23px] [&_h2]:font-medium [&_h2]:my-3 [&_h2]:mx-0',
          'min-w-0',
          'max-md:[&_h2]:text-[20px]',
        ].join(' ')}
      >
        <p className="eyebrow text-[10px] tracking-[2px] font-semibold m-0 text-muted">
          COMPARE VERSIONS
        </p>
        <h2>看看文字如何改變。</h2>
        <div className={styles.diffSelectors}>
          <label>
            從
            <select
              aria-label="比較起始版本"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            >
              {doc.revisions.map((r, i) => (
                <option key={r.id} value={r.id}>
                  第 {i + 1} 版 · {kindLabels[r.kind]}
                </option>
              ))}
            </select>
          </label>
          <span>→</span>
          <label>
            到
            <select aria-label="比較結束版本" value={to} onChange={(e) => setTo(e.target.value)}>
              {doc.revisions.map((r, i) => (
                <option key={r.id} value={r.id}>
                  第 {i + 1} 版 · {kindLabels[r.kind]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.diffType}>
          <button aria-pressed={!compareNotes} onClick={() => setCompareNotes(false)}>
            文字差異
          </button>
          <button aria-pressed={compareNotes} onClick={() => setCompareNotes(true)}>
            筆記差異
          </button>
          <span>綠色新增 · 紅色刪除</span>
        </div>
        {!editable && !compareNotes && (
          <p className="small-note text-[11px] text-muted leading-[1.8] my-2.5 mx-0">
            此格式的原始檔保持不變，可切換「筆記差異」比較紀錄。
          </p>
        )}
        {compare?.pending ? (
          <p role="status">正在比較版本…</p>
        ) : compare?.tooLarge ? (
          <p role="status">差異過大，請匯出版本紀錄後使用外部工具比較。</p>
        ) : (
          <div className={styles.diffOutput}>
            {compare?.parts.length ? (
              compare.parts.map((part, index) => (
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
        )}
      </section>
    </div>
  )
}

const styles = {
  historyLayout: [
    'history-layout grid grid-cols-[310px_minmax(0,_1fr)] gap-[45px] py-9 px-0',
    'max-lg:gap-[25px] max-lg:grid-cols-[270px_minmax(0,_1fr)]',
    'max-md:grid-cols-1 max-md:gap-7.5 max-md:pt-[25px]',
  ].join(' '),
  versionItem: [
    'version-item flex items-start justify-between gap-3 py-4.5 px-0 border-t border-solid',
    'border-t-line',
    '[&_strong]:text-[12px] [&_strong]:font-medium',
    '[&_time]:block [&_time]:text-[9px] [&_time]:text-muted [&_time]:mt-[7px]',
    '[&_code]:block [&_code]:text-[9px] [&_code]:text-muted [&_code]:mt-[7px]',
    '[&_button]:text-[10px] [&_button]:bg-transparent [&_button]:border-0',
    '[&_button]:text-rust [&_button]:py-0.5 [&_button]:px-0 [&_button]:whitespace-nowrap',
  ].join(' '),
  diffSelectors: [
    'diff-selectors flex items-center gap-4 my-6 mx-0',
    '[&_label]:flex-1 [&_label]:min-w-0 [&_label]:text-muted [&_label]:text-[11px]',
    '[&_select]:block [&_select]:w-full [&_select]:border [&_select]:border-solid',
    '[&_select]:border-line [&_select]:p-2.5 [&_select]:bg-surface [&_select]:text-ink',
    '[&_select]:rounded-[4px] [&_select]:mt-1.5 [&_select]:text-[12px]',
    'max-md:gap-2.5',
    'max-md:[&_select]:text-[11px] max-md:[&_select]:py-2 max-md:[&_select]:px-1',
  ].join(' '),
  diffType: [
    'diff-type flex items-center gap-[15px] text-[11px] mb-5',
    '[&_button]:border-0 [&_button]:border-b [&_button]:border-solid',
    '[&_button]:border-b-transparent [&_button]:bg-transparent [&_button]:py-[7px]',
    '[&_button]:px-0 [&_button]:text-muted',
    "[&_button[aria-pressed='true']]:text-ink [&_button[aria-pressed='true']]:border-ink",
    '[&_>_span]:text-muted [&_>_span]:ml-auto [&_>_span]:text-[10px]',
    'max-md:gap-2.5',
    'max-md:[&_>_span]:text-[9px]',
  ].join(' '),
  diffOutput: [
    'diff-output bg-surface border border-solid border-line rounded-[5px] overflow-auto',
    'max-h-[65dvh]',
    '[&_pre]:flex [&_pre]:whitespace-pre-wrap',
    '[&_pre]:[word-break:break-word]',
    '[&_pre]:py-2.5 [&_pre]:px-[15px] [&_pre]:m-0 [&_pre]:text-[12px] [&_pre]:leading-[1.8]',
    '[&_pre]:font-code',
    '[&_pre_>_span]:w-5.5 [&_pre_>_span]:shrink-0',
    '[&_.diff-added]:bg-[#e5eddd] [&_.diff-added]:text-[#3a623b]',
    '[&_.diff-removed]:bg-[#f3e2dc] [&_.diff-removed]:text-[#934c3e]',
    '[&_>_p]:p-6 [&_>_p]:text-[12px] [&_>_p]:text-muted',
  ].join(' '),
}
