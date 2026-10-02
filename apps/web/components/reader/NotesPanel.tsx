'use client'
import { config } from '@/lib/config'
import { PrimaryButton } from '@/components/ui/PrimaryButton'
import type { Note } from '@/lib/documents'
interface Props {
  notes: Note[]
  body: string
  quote: string
  location: string
  busy: boolean
  setBody: (value: string) => void
  setQuote: (value: string) => void
  setLocation: (value: string) => void
  onAdd: () => Promise<void>
  onRemove: (id: string) => Promise<unknown>
}
export function NotesPanel({
  notes,
  body,
  quote,
  location,
  busy,
  setBody,
  setQuote,
  setLocation,
  onAdd,
  onRemove,
}: Props) {
  return (
    <aside className="notes-panel min-w-0 px-1 py-4 max-md:hidden">
      <p className="eyebrow text-[10px] tracking-[2px] font-semibold m-0 text-muted">
        THOUGHTS IN THE MARGIN
      </p>
      <h2 className="mt-3.5 mb-2.5 text-[17px] font-medium tracking-[0.5px]">
        頁邊，留給你的想法。
      </h2>
      <p className="small-note text-[11px] text-muted leading-[1.8] my-2.5 mx-0">
        選取文字即可引用，筆記不會修改原文。
      </p>
      <label className="note-location mt-4.5 mb-3 block text-[10px] text-muted">
        位置
        <input
          className={[
            'mt-[5px] block w-full rounded-[4px] border border-line bg-[#faf9f2]',
            'px-2.5 py-2 text-[11px] text-ink',
          ].join(' ')}
          aria-label="筆記位置"
          disabled={busy}
          value={location}
          onChange={(e) => setLocation(e.target.value.slice(0, config.limits.locationCharacters))}
        />
      </label>
      {quote && (
        <blockquote
          className={[
            'note-quote relative mb-3 border-l-2 border-[#9fae8e] bg-[#e9ecdf]',
            'py-3 pr-6 pl-3 text-[12px] leading-[1.7] wrap-anywhere',
          ].join(' ')}
        >
          {quote}
          <button
            className="absolute top-1.5 right-1.5 border-0 bg-transparent"
            aria-label="移除引用"
            disabled={busy}
            onClick={() => setQuote('')}
          >
            ×
          </button>
        </blockquote>
      )}
      <textarea
        className={[
          'min-h-30 w-full resize-y rounded-[5px] border border-line bg-surface',
          'p-3.5 text-[13px] leading-[1.8]',
        ].join(' ')}
        aria-label="新增筆記"
        disabled={busy}
        placeholder="記下此刻的想法…"
        value={body}
        maxLength={config.limits.noteCharacters}
        onChange={(e) => setBody(e.target.value)}
      />
      <PrimaryButton
        size="small"
        className="mt-3 mb-6"
        disabled={busy || !body.trim()}
        onClick={() => void onAdd()}
      >
        {busy ? '保存中…' : '保存筆記'}
      </PrimaryButton>
      <div className="note-list">
        {notes.length === 0 && (
          <p className="small-note text-[11px] text-muted leading-[1.8] my-2.5 mx-0">
            第一則筆記，從一個想法開始。
          </p>
        )}
        {notes.map((note) => (
          <div className="note-card border-t border-line py-4.5" key={note.id}>
            <span className="text-[9px] text-muted wrap-anywhere">{note.location}</span>
            {note.quote && (
              <blockquote
                className={[
                  'my-2.5 border-l-2 border-[#bac3ad] pl-2.5 text-[11px] text-[#788669]',
                  'whitespace-pre-wrap wrap-anywhere',
                ].join(' ')}
              >
                {note.quote}
              </blockquote>
            )}
            <p className="my-3 text-[13px] leading-[1.8] whitespace-pre-wrap wrap-anywhere">
              {note.body}
            </p>
            <footer className="flex justify-between text-[9px] text-muted">
              <time>{new Date(note.createdAt).toLocaleDateString('zh-TW')}</time>
              <button
                className="border-0 bg-transparent text-rust"
                disabled={busy}
                onClick={async () => {
                  if (window.confirm('移除此筆記？舊版本仍會保留。')) await onRemove(note.id)
                }}
              >
                移除
              </button>
            </footer>
          </div>
        ))}
      </div>
    </aside>
  )
}
