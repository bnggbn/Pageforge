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
    <div className="history-layout">
      <aside className="version-list">
        <p className="eyebrow">VERSION HISTORY</p>
        <h2>每一步，都有跡可循。</h2>
        <p className="integrity-label">✓ VAX 版本鏈已驗證</p>
        {[...doc.revisions].reverse().map((revision, index) => (
          <div className="version-item" key={revision.id}>
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
          className="secondary-button"
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
        <p className="small-note">
          版本紀錄不含二進位原始檔。這是本機版本鏈驗證，尚未包含簽章或外部可信錨點。
        </p>
      </aside>
      <section className="diff-panel">
        <p className="eyebrow">COMPARE VERSIONS</p>
        <h2>看看文字如何改變。</h2>
        <div className="diff-selectors">
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
        <div className="diff-type">
          <button aria-pressed={!compareNotes} onClick={() => setCompareNotes(false)}>
            文字差異
          </button>
          <button aria-pressed={compareNotes} onClick={() => setCompareNotes(true)}>
            筆記差異
          </button>
          <span>綠色新增 · 紅色刪除</span>
        </div>
        {!editable && !compareNotes && (
          <p className="small-note">此格式的原始檔保持不變，可切換「筆記差異」比較紀錄。</p>
        )}
        {compare?.pending ? (
          <p role="status">正在比較版本…</p>
        ) : compare?.tooLarge ? (
          <p role="status">差異過大，請匯出版本紀錄後使用外部工具比較。</p>
        ) : (
          <div className="diff-output">
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
