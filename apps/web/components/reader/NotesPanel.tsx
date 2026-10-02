'use client'
import { config } from '@/lib/config'
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
    <aside className="notes-panel">
      <p className="eyebrow">THOUGHTS IN THE MARGIN</p>
      <h2>頁邊，留給你的想法。</h2>
      <p className="small-note">選取文字即可引用，筆記不會修改原文。</p>
      <label className="note-location">
        位置
        <input
          aria-label="筆記位置"
          value={location}
          onChange={(e) => setLocation(e.target.value.slice(0, config.limits.locationCharacters))}
        />
      </label>
      {quote && (
        <blockquote className="note-quote">
          {quote}
          <button aria-label="移除引用" onClick={() => setQuote('')}>
            ×
          </button>
        </blockquote>
      )}
      <textarea
        aria-label="新增筆記"
        placeholder="記下此刻的想法…"
        value={body}
        maxLength={config.limits.noteCharacters}
        onChange={(e) => setBody(e.target.value)}
      />
      <button
        className="primary-button"
        disabled={busy || !body.trim()}
        onClick={() => void onAdd()}
      >
        {busy ? '保存中…' : '保存筆記'}
      </button>
      <div className="note-list">
        {notes.length === 0 && <p className="small-note">第一則筆記，從一個想法開始。</p>}
        {notes.map((note) => (
          <div className="note-card" key={note.id}>
            <span>{note.location}</span>
            {note.quote && <blockquote>{note.quote}</blockquote>}
            <p>{note.body}</p>
            <footer>
              <time>{new Date(note.createdAt).toLocaleDateString('zh-TW')}</time>
              <button
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
