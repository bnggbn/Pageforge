'use client'
import { config } from '@/lib/config'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { diffLines } from 'diff'
import { DocumentContent } from './DocumentContent'
import { EDITABLE, FORMAT_LABELS, latest, errorMessage, type LibraryDocument, type Note, type ReadingPosition, type Revision } from '@/lib/documents'
import { appendRevision, loadDocument, readProgress, saveProgress, readFontSize, saveFontSize, deleteDocument, changeSource } from '@/lib/storage'
import { createRevision, verifyHistory } from '@/lib/history'

const kindLabels = { import: '匯入原始文件', edit: '修改文字', note: '更新筆記', restore: '還原版本' }
type Tab = 'read' | 'edit' | 'notes' | 'history'
function exportFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ReaderWorkspace() {
  const [doc, setDoc] = useState<LibraryDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState<Tab>('read')
  const [draft, setDraft] = useState('')
  const [body, setBody] = useState('')
  const [quote, setQuote] = useState('')
  const [location, setLocation] = useState('全文筆記')
  const [busy, setBusy] = useState(false)
  const [fontSize, setFontSize] = useState(config.reading.defaultFontSize)
  const [section, setSection] = useState(0)
  const [pdfPage, setPdfPage] = useState(1)
  const [pdfUrl, setPdfUrl] = useState('')
  const [percentage, setPercentage] = useState(0)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [compareNotes, setCompareNotes] = useState(false)
  const [stale, setStale] = useState(false)
  const [verified, setVerified] = useState(false)
  const scroll = useRef<HTMLDivElement>(null)
  const article = useRef<HTMLElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<ReadingPosition | null>(null)
  const restore = useRef<ReadingPosition | null>(null)
  const currentDoc = useRef<LibraryDocument | null>(null)
  const mounted = useRef(true)
  const head = doc ? latest(doc) : null
  const dirty = !!head && draft !== head.content

  const load = useCallback(async () => {
    setLoading(true); setError(''); setVerified(false); setStale(false)
    try {
      const id = new URL(window.location.href).searchParams.get('id')
      if (!id) throw new Error('請從書架選擇一份文件。')
      const loaded = await loadDocument(id)
      if (!loaded) throw new Error('找不到這份文件，可能已被刪除。')
      await verifyHistory(loaded)
      const last = latest(loaded)
      const position = await readProgress(id)
      const compatible = position && loaded.revisions.find(r => r.id === position.revisionId)?.content === last.content
      restore.current = compatible ? position : null
      pending.current = null
      setSection(position?.section ?? 0); setPdfPage((position?.section ?? 0) + 1)
      setPercentage(compatible ? position.percentage : 0)
      setFontSize(await readFontSize())
      setDoc(loaded); currentDoc.current = loaded; setDraft(last.content); setVerified(true)
      setFrom(loaded.revisions.at(-2)?.id ?? last.id); setTo(last.id)
      if (position && !compatible) setMessage('文件內容已有新版本，閱讀位置已回到開頭。')
    } catch (e) { setError(errorMessage(e)) } finally { setLoading(false) }
  }, [])
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); const position = pending.current; const active = currentDoc.current; if (position && active) void saveProgress(active.id, position).catch(() => {}) } }, [load])
  useEffect(() => {
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pageforge-library') : null
    if (channel) channel.onmessage = event => { if (event.data?.source !== changeSource) setStale(true) }
    return () => channel?.close()
  }, [])
  useEffect(() => {
    if (!doc || doc.format !== 'pdf') return
    const url = URL.createObjectURL(new Blob([doc.original], { type: 'application/pdf' }))
    setPdfUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [doc?.id, doc?.format]) // Original binary stays immutable across revisions.
  useEffect(() => {
    if (!dirty && !body.trim()) return
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty, body])

  const capture = useCallback((): ReadingPosition | null => {
    const active = currentDoc.current, container = scroll.current
    if (!active || !container) return null
    const top = container.getBoundingClientRect().top
    const blocks = Array.from(container.querySelectorAll<HTMLElement>('[data-block]'))
    let anchor = blocks[0]
    for (const block of blocks) { if (block.getBoundingClientRect().top <= top + 36) anchor = block; else break }
    const rect = anchor?.getBoundingClientRect()
    const distance = container.scrollHeight - container.clientHeight
    const localRatio = distance <= 0 ? 1 : Math.max(0, Math.min(1, container.scrollTop / distance))
    const count = active.format === 'epub' ? active.sections.length : active.format === 'xlsx' ? active.sheets.length : 1
    return { revisionId: latest(active).id, block: anchor?.dataset.block ?? '', ratio: rect ? Math.max(0, Math.min(1, (top + 36 - rect.top) / Math.max(rect.height, 1))) : 0, percentage: Math.round((section + localRatio) / Math.max(1, count) * 100), updatedAt: new Date().toISOString(), section }
  }, [section])
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    const active = currentDoc.current, position = pending.current
    if (!active || !position) return
    await saveProgress(active.id, position)
    if (pending.current === position) pending.current = null
  }, [])
  const onScroll = () => {
    if (tab !== 'read' && tab !== 'notes') return
    const position = capture()
    if (!position) return
    pending.current = position; setPercentage(position.percentage)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void flush().catch(e => { if (mounted.current) setError(errorMessage(e)) }) }, config.reading.progressDebounceMs)
  }
  useEffect(() => {
    if (!doc || loading || (tab !== 'read' && tab !== 'notes') || !scroll.current) return
    const position = restore.current
    if (!position) return
    const container = scroll.current
    const anchor = Array.from(container.querySelectorAll<HTMLElement>('[data-block]')).find(node => node.dataset.block === position.block)
    if (anchor) container.scrollTop = anchor.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop + anchor.getBoundingClientRect().height * position.ratio - 36
    else if (position.block) { container.scrollTop = 0; setMessage('舊閱讀區塊無法定位，已回到開頭。') }
    restore.current = null
  }, [doc, loading, tab, fontSize, section])

  const changeTab = async (next: Tab) => {
    if (busy) return
    if (tab === 'edit' && dirty && !window.confirm('離開編輯會放棄未儲存的修改。要繼續嗎？')) return
    try { await flush() } catch (e) { setError(errorMessage(e)); return }
    restore.current = capture()
    if (head) setDraft(head.content)
    setTab(next); setError(''); setMessage('')
  }
  const commit = async (kind: Revision['kind'], content: string, notes: Note[], restoredFrom: string | null = null) => {
    if (!doc || !head || busy || !verified) return false
    setBusy(true); setError(''); setMessage('')
    try {
      await flush()
      const version = await createRevision(doc, kind, content, notes, restoredFrom)
      const updated = await appendRevision(doc.id, head.id, version)
      setDoc(updated); currentDoc.current = updated; setDraft(latest(updated).content); setStale(false)
      setFrom(head.id); setTo(version.id)
      if (content !== head.content) { restore.current = null; pending.current = null; setPercentage(0); if (scroll.current) scroll.current.scrollTop = 0 }
      setMessage(`已保存第 ${updated.revisions.length} 版。`)
      return true
    } catch (e) { setError(errorMessage(e)); return false } finally { setBusy(false) }
  }
  const saveEdit = async () => {
    if (!doc || !head || !dirty) return
    if (!draft.trim() || new TextEncoder().encode(draft).length > config.limits.textMiB * 1024 * 1024) { setError(`文字不可空白，且最多 ${config.limits.textMiB} MiB。`); return }
    if (await commit('edit', draft, head.notes)) setTab('read')
  }
  const addNote = async () => {
    if (!head || !body.trim()) return
    if (body.length > config.limits.noteCharacters || quote.length > config.limits.quoteCharacters) { setError(`筆記最多 ${config.limits.noteCharacters} 字，引用最多 ${config.limits.quoteCharacters} 字。`); return }
    const note: Note = { id: crypto.randomUUID(), body: body.trim(), quote, location, createdAt: new Date().toISOString() }
    if (await commit('note', head.content, [...head.notes, note])) { setBody(''); setQuote(''); setLocation('全文筆記') }
  }
  const selectQuote = () => {
    const selection = window.getSelection()
    if (!selection?.anchorNode || !article.current?.contains(selection.anchorNode) || !article.current.contains(selection.focusNode)) return
    const text = selection.toString().trim()
    if (!text) return
    const element = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode.parentElement
    const block = element?.closest('[data-block]')?.getAttribute('data-block') ?? '全文'
    setQuote(text.slice(0, config.limits.quoteCharacters)); setLocation(doc?.format === 'epub' ? `${doc.sections[section]?.title} / ${block}` : doc?.format === 'xlsx' ? `${doc.sheets[section]?.name} / ${block}` : block)
    setTab('notes')
  }
  const resizeFont = async (size: number) => {
    restore.current = capture()
    try { await saveFontSize(size); setFontSize(size) } catch (e) { setError(errorMessage(e)) }
  }
  const changeSection = async (index: number) => {
    if (!doc || !head) return
    const count = doc.format === 'epub' ? doc.sections.length : doc.sheets.length
    const next: ReadingPosition = { revisionId: head.id, block: '', ratio: 0, percentage: Math.round(index / Math.max(1,count) * 100), section:index, updatedAt:new Date().toISOString() }
    try { await flush(); await saveProgress(doc.id,next) } catch (e) { setError(errorMessage(e)); return }
    restore.current = null; pending.current = null; setSection(index); setPercentage(next.percentage)
    if (scroll.current) scroll.current.scrollTop = 0
  }
  const compare = useMemo(() => {
    if (!doc || tab !== 'history') return null
    const a = doc.revisions.find(r => r.id === from), b = doc.revisions.find(r => r.id === to)
    if (!a || !b) return null
    const serializeNotes = (notes: Note[]) => notes.map(n => `[${n.location}]\n${n.quote ? `> ${n.quote}\n` : ''}${n.body}\n`).join('\n')
    const left = compareNotes ? serializeNotes(a.notes) : a.content
    const right = compareNotes ? serializeNotes(b.notes) : b.content
    if (left === right) return { tooLarge: false, parts: [] }
    if (left.length + right.length > config.diff.maxCharacters) return { tooLarge: true, parts: [] }
    const parts = diffLines(left, right, { timeout: config.diff.timeoutMs, maxEditLength: config.diff.maxEditLength })
    return { tooLarge: !parts, parts: parts ?? [] }
  }, [doc, tab, from, to, compareNotes])

  if (loading) return <main className="reader-loading"><p className="eyebrow">PAGEFORGE READING ROOM</p><h1>正在打開你的文字…</h1></main>
  if (!doc || !head || !verified) return <main className="reader-loading"><h1>無法開啟文件</h1><p role="alert">{error}</p><Link href="/">回到書架 →</Link></main>
  const editable = EDITABLE.has(doc.format)
  const sections = doc.format === 'epub' ? doc.sections.map(s => s.title) : doc.format === 'xlsx' ? doc.sheets.map(s => s.name) : []
  const activeSection = Math.min(Math.max(0, section), Math.max(0, sections.length - 1))
  const returnToShelf = async () => {
    if ((dirty || body.trim()) && !window.confirm('有尚未保存的文字或筆記，仍要回書架嗎？')) return
    try { await flush(); window.location.href = '/' } catch (e) { setError(errorMessage(e)) }
  }
  return <div className="reader-workspace">
    <header className="reader-header"><button className="back-button" onClick={() => void returnToShelf()}>← 書架</button><div><p className="eyebrow">{FORMAT_LABELS[doc.format]} / PERSONAL READING ROOM</p><h1>{doc.title}</h1></div><span className="version-badge">第 {doc.revisions.length} 版</span></header>
    <div className="reader-toolbar"><div className="reader-tabs">{([['read','閱讀'],['notes',`筆記 ${head.notes.length}`], ...(editable ? [['edit','編輯文字']] : []), ['history','版本紀錄']] as [Tab,string][]).map(([key,label]) => <button key={key} className={tab === key ? 'active' : ''} disabled={busy} aria-pressed={tab === key} onClick={() => void changeTab(key)}>{label}</button>)}</div><div className="reader-tools"><label>字級 <select aria-label="閱讀字級" value={fontSize} onChange={e => void resizeFont(Number(e.target.value))}>{config.reading.fontSizes.map(size => <option key={size} value={size}>{size}</option>)}</select></label><button onClick={() => exportFile(doc.original, doc.filename)}>下載原始檔</button>{editable && <button onClick={() => exportFile(new Blob([head.content],{type:'text/plain;charset=utf-8'}),`${doc.title}.${doc.format === 'markdown' ? 'md' : 'txt'}`)}>匯出目前文字</button>}<button className="delete-action" disabled={busy} onClick={async () => { if (!window.confirm('確定從書架移除文件、筆記與全部版本？固定資料夾模式會移到 .trash/；瀏覽器模式會永久刪除。')) return; setBusy(true); try { if (timer.current) clearTimeout(timer.current); pending.current=null; await deleteDocument(doc.id); window.location.href='/' } catch(e) { setError(errorMessage(e)); setBusy(false) } }}>刪除</button></div></div>
    {(error || message || stale) && <div className="reader-status">{error && <p role="alert" className="error">{error}</p>}{message && <p role="status">{message}</p>}{stale && <p>另一個分頁更新了書架。<button onClick={() => { if (!(dirty || body.trim()) || window.confirm('重新載入會放棄未儲存內容。確定繼續？')) { setBody(''); setTab('read'); void load() } }}>重新載入</button></p>}</div>}
    {tab === 'history' ? <div className="history-layout"><aside className="version-list"><p className="eyebrow">VERSION HISTORY</p><h2>每一步，都有跡可循。</h2><p className="integrity-label">✓ VAX 版本鏈已驗證</p>{[...doc.revisions].reverse().map((revision,index) => <div className="version-item" key={revision.id}><div><strong>第 {doc.revisions.length-index} 版 · {kindLabels[revision.kind]}</strong><time>{new Date(revision.createdAt).toLocaleString('zh-TW')}</time><code title={revision.sai}>{revision.sai.slice(0,16)}…</code></div><button disabled={busy || revision.id === head.id} onClick={async () => { if (!window.confirm('將此版本的文字與筆記還原成新版本？目前版本仍會保留。')) return; await commit('restore',revision.content,revision.notes,revision.id) }}>還原成新版</button></div>)}<button className="secondary-button" onClick={() => exportFile(new Blob([JSON.stringify({ schema:'pageforge-history/1', documentId:doc.id, originalHash:doc.originalHash, actor:doc.actor, salt:doc.salt, genesis:doc.genesis, revisions:doc.revisions },null,2)],{type:'application/json'}),`${doc.title}.history.json`)}>匯出版本紀錄</button><p className="small-note">版本紀錄不含二進位原始檔。這是本機版本鏈驗證，尚未包含簽章或外部可信錨點。</p></aside><section className="diff-panel"><p className="eyebrow">COMPARE VERSIONS</p><h2>看看文字如何改變。</h2><div className="diff-selectors"><label>從<select aria-label="比較起始版本" value={from} onChange={e => setFrom(e.target.value)}>{doc.revisions.map((r,i) => <option key={r.id} value={r.id}>第 {i+1} 版 · {kindLabels[r.kind]}</option>)}</select></label><span>→</span><label>到<select aria-label="比較結束版本" value={to} onChange={e => setTo(e.target.value)}>{doc.revisions.map((r,i) => <option key={r.id} value={r.id}>第 {i+1} 版 · {kindLabels[r.kind]}</option>)}</select></label></div><div className="diff-type"><button aria-pressed={!compareNotes} onClick={() => setCompareNotes(false)}>文字差異</button><button aria-pressed={compareNotes} onClick={() => setCompareNotes(true)}>筆記差異</button><span>綠色新增 · 紅色刪除</span></div>{!editable && !compareNotes && <p className="small-note">此格式的原始檔保持不變，可切換「筆記差異」比較紀錄。</p>}{compare?.tooLarge ? <p role="status">差異過大，請匯出版本紀錄後使用外部工具比較。</p> : <div className="diff-output">{compare?.parts.length ? compare.parts.map((part,index) => <pre className={part.added ? 'diff-added' : part.removed ? 'diff-removed' : ''} key={index}><span aria-hidden="true">{part.added ? '+' : part.removed ? '−' : ' '}</span>{!part.added && !part.removed && part.value.split('\n').length > 12 ? `${part.value.split('\n').slice(0,3).join('\n')}\n\n… ${part.value.split('\n').length - 6} 行未變更 …\n\n${part.value.split('\n').slice(-3).join('\n')}` : part.value}</pre>) : <p>兩個版本沒有差異。</p>}</div>}</section></div> : tab === 'edit' ? <section className="editor-panel"><div className="editor-heading"><div><p className="eyebrow">MAKE IT YOUR OWN</p><h2>讓文字，往前一步。</h2><p>每次儲存建立新版本，原文與筆記都會保留。</p></div><button className="primary-button" disabled={busy || !dirty} onClick={() => void saveEdit()}>{busy ? '保存中…' : '儲存新版本'}</button></div><textarea aria-label="編輯文件文字" value={draft} onChange={e => setDraft(e.target.value)} spellCheck={false} /><span className="small-note">{dirty ? '有未儲存的修改' : '目前文字已保存'} · {draft.length.toLocaleString()} 字元</span></section> : <div className={`reading-layout ${tab === 'notes' ? 'with-notes' : ''}`}>
      <section className="reading-panel">{sections.length > 0 && <div className="section-selector"><label>{doc.format === 'epub' ? '章節' : '工作表'}<select aria-label="選擇章節或工作表" value={activeSection} onChange={e => void changeSection(Number(e.target.value))}>{sections.map((title,index) => <option key={index} value={index}>{title}</option>)}</select></label></div>}{doc.format === 'pdf' ? <><div className="pdf-controls"><label>頁碼書籤 <input type="number" aria-label="PDF 頁碼書籤" min="1" max={config.reading.pdfMaxPage} value={pdfPage} onChange={e => { const value=Math.max(1,Math.min(config.reading.pdfMaxPage,Number(e.target.value)||1));setPdfPage(value);setLocation(`PDF 第 ${value} 頁`) }} /></label><button onClick={async () => { try { await saveProgress(doc.id,{revisionId:head.id,block:'',ratio:0,percentage:0,section:pdfPage-1,updatedAt:new Date().toISOString()});setMessage(`已保存第 ${pdfPage} 頁書籤。`) } catch(e) {setError(errorMessage(e))} }}>保存頁碼</button><span>PDF 捲動由瀏覽器管理；請手動保存頁碼。</span></div><iframe className="pdf-viewer" title={`${doc.title} PDF`} src={pdfUrl ? `${pdfUrl}#page=${pdfPage}` : undefined} /><p className="small-note">若瀏覽器無法顯示 PDF，可下載原始檔閱讀；筆記仍可在右側保存。</p></> : <div ref={scroll} className="reader-scroll" onScroll={onScroll}><article ref={article} className="document-prose" style={{ fontSize }} onMouseUp={selectQuote} onKeyUp={e => { if(e.key === 'Shift') selectQuote() }}>{doc.format === 'xlsx' ? <><h2>{doc.sheets[activeSection]?.name}</h2><p className="small-note">顯示儲存格原始值與公式的快取結果；不重算公式，也不保留 Excel 樣式。</p><div className="reader-table-wrap"><table><tbody>{doc.sheets[activeSection]?.rows.map((row,index) => <tr data-block={`row-${index}`} key={index}><th scope="row">{index+1}</th>{row.map((cell,column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div></> : <DocumentContent text={doc.format === 'epub' ? doc.sections[activeSection]?.text ?? '' : head.content} markdown={doc.format === 'markdown'} />}</article></div>}<div className="reading-footer"><span>{doc.format === 'pdf' ? `頁碼書籤 ${pdfPage}` : `閱讀位置 ${percentage}%`}</span><span>{doc.format === 'epub' ? '文字閱讀模式' : '留一點時間，給文字。'}</span></div></section>
      <aside className="notes-panel"><p className="eyebrow">THOUGHTS IN THE MARGIN</p><h2>頁邊，留給你的想法。</h2><p className="small-note">選取文字即可引用，筆記不會修改原文。</p><label className="note-location">位置<input aria-label="筆記位置" value={location} onChange={e => setLocation(e.target.value.slice(0,config.limits.locationCharacters))} /></label>{quote && <blockquote className="note-quote">{quote}<button aria-label="移除引用" onClick={() => setQuote('')}>×</button></blockquote>}<textarea aria-label="新增筆記" placeholder="記下此刻的想法…" value={body} maxLength={config.limits.noteCharacters} onChange={e => setBody(e.target.value)} /><button className="primary-button" disabled={busy || !body.trim()} onClick={() => void addNote()}>{busy ? '保存中…' : '保存筆記'}</button><div className="note-list">{head.notes.length === 0 && <p className="small-note">第一則筆記，從一個想法開始。</p>}{head.notes.map(note => <div className="note-card" key={note.id}><span>{note.location}</span>{note.quote && <blockquote>{note.quote}</blockquote>}<p>{note.body}</p><footer><time>{new Date(note.createdAt).toLocaleDateString('zh-TW')}</time><button disabled={busy} onClick={async () => { if(window.confirm('移除此筆記？舊版本仍會保留。')) await commit('note',head.content,head.notes.filter(n => n.id !== note.id)) }}>移除</button></footer></div>)}</div></aside>
    </div>}
  </div>
}
