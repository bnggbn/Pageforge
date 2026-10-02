'use client'

import { useEffect, useState } from 'react'
import { latest, type LibraryDocument } from '@/lib/documents'
import type { ReaderSettings } from '@/lib/reader-types'
import type { ReaderSession } from '@/hooks/useReaderDocument'
import { useReaderProgress } from '@/hooks/useReaderProgress'
import { useReaderCommands } from '@/hooks/useReaderCommands'
import { useReaderNavigation } from '@/hooks/useReaderNavigation'
import { useQuoteSelection } from '@/hooks/useQuoteSelection'
import { ReaderHeader } from './ReaderHeader'
import { ReaderToolbar } from './ReaderToolbar'
import { ReaderFeedback } from './ReaderFeedback'
import { TextEditorPanel } from './TextEditorPanel'
import { ReadingView } from './ReadingView'
import { WorkingCopyBar } from './WorkingCopyBar'
import { NotesPanel } from './NotesPanel'
import { RevisionHistory } from './RevisionHistory'
import { SandboxPanel } from './SandboxPanel'

interface Props {
  doc: LibraryDocument
  settings: ReaderSettings
  session: ReaderSession
}
export function ReaderScreen({ doc, settings, session }: Props) {
  const { tab, busy, working } = session
  const head = latest(doc)
  const progress = useReaderProgress({
    doc,
    settings,
    tab,
    onError: session.setError,
    onMessage: session.setMessage,
  })
  const commands = useReaderCommands(doc, session, progress)
  const navigation = useReaderNavigation(doc, session, progress)
  const selectQuote = useQuoteSelection(doc, progress.section, progress.articleRef, working, () =>
    session.setTab('notes'),
  )
  const [from, setFrom] = useState(doc.revisions.at(-2)?.id ?? head.id)
  const [to, setTo] = useState(head.id)
  const [compareNotes, setCompareNotes] = useState(false)
  useEffect(() => {
    setFrom(doc.revisions.at(-2)?.id ?? head.id)
    setTo(head.id)
  }, [doc, head.id])

  return (
    <div className="reader-workspace min-h-[100dvh] max-w-375 m-auto pt-0 px-10 pb-7.5 max-lg:px-[25px] max-md:px-5 max-md:pb-[25px]">
      <ReaderHeader doc={doc} onBack={navigation.returnToShelf} busy={busy} />
      <ReaderToolbar
        doc={doc}
        tab={tab}
        busy={busy}
        fontSize={progress.fontSize}
        onTabChange={navigation.changeTab}
        onFontChange={progress.resizeFont}
        onDelete={navigation.remove}
      />
      <ReaderFeedback
        error={session.error}
        message={session.message}
        stale={session.stale}
        busy={busy}
        onReload={navigation.reload}
      />
      {tab !== 'sandbox' &&
        (commands.dirty ||
          working.body ||
          working.quote ||
          working.copies.length > 0 ||
          working.error) && (
          <WorkingCopyBar
            {...working}
            selectedId={working.id}
            stale={working.baseRevisionId !== head.id}
            busy={busy}
            onRetry={() => void working.flush().catch(() => {})}
            onSelect={(id) => void navigation.selectDraft(id)}
            onDiscard={() => void navigation.discardDraft()}
          />
        )}
      {tab === 'sandbox' ? (
        <SandboxPanel
          doc={doc}
          onBusyChange={session.setBusy}
          registerFlush={navigation.registerSandboxFlush}
          onAdopt={commands.adopt}
        />
      ) : tab === 'history' ? (
        <RevisionHistory
          doc={doc}
          busy={busy}
          from={from}
          to={to}
          compareNotes={compareNotes}
          setFrom={setFrom}
          setTo={setTo}
          setCompareNotes={setCompareNotes}
          onRestore={commands.restore}
        />
      ) : tab === 'edit' ? (
        <TextEditorPanel
          content={working.content}
          dirty={commands.dirty}
          busy={busy}
          onChange={(content) => working.change({ content })}
          onSave={commands.saveEdit}
        />
      ) : (
        <ReadingView
          doc={doc}
          progress={progress}
          withNotes={tab === 'notes'}
          onSelectQuote={selectQuote}
          onPdfPageChange={(value) => {
            const page = progress.changePdfPage(value)
            working.change({ location: `PDF 第 ${page} 頁` })
          }}
        >
          <NotesPanel
            notes={head.notes}
            body={working.body}
            quote={working.quote}
            location={working.location}
            busy={busy}
            setBody={(body) => working.change({ body })}
            setQuote={(quote) => working.change({ quote })}
            setLocation={(location) => working.change({ location })}
            onAdd={commands.addNote}
            onRemove={commands.removeNote}
          />
        </ReadingView>
      )}
    </div>
  )
}
