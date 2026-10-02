'use client'

import { useRef } from 'react'
import { config } from '@/lib/config'
import {
  latest,
  errorMessage,
  type LibraryDocument,
  type Note,
  type Revision,
  type AdoptionSource,
} from '@/lib/documents'
import { createRevision } from '@/lib/history'
import { appendRevision } from '@/lib/storage'
import type { ReaderSession } from './useReaderDocument'
import type { ReaderProgress } from './useReaderProgress'

export function useReaderCommands(
  doc: LibraryDocument,
  session: Pick<
    ReaderSession,
    'working' | 'busy' | 'setBusy' | 'setError' | 'setMessage' | 'publish' | 'setTab'
  >,
  progress: Pick<ReaderProgress, 'flush' | 'revisionSaved'>,
) {
  const committing = useRef(false)
  const { working, busy, setBusy, setError, setMessage, publish, setTab } = session
  const head = latest(doc)
  const dirty = working.content !== head.content
  const commit = async (
    kind: Revision['kind'],
    content: string,
    notes: Note[],
    restoredFrom: string | null = null,
    clearNote = false,
    adoptedFrom?: AdoptionSource,
  ) => {
    if (busy || committing.current) return false
    committing.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await working.flush()
      await progress.flush()
      const version = await createRevision(doc, kind, content, notes, restoredFrom, adoptedFrom)
      const updated = await appendRevision(doc, head.id, version)
      progress.revisionSaved(updated)
      publish(updated)
      await working
        .rebase(
          updated,
          kind === 'edit' || (!dirty && (kind === 'restore' || kind === 'adopt')),
          clearNote,
        )
        .catch((e) => setError(`版本已保存，但草稿整理失敗：${errorMessage(e)}`))
      setMessage(`已保存第 ${updated.revisions.length} 版。`)
      return true
    } catch (e) {
      setError(errorMessage(e))
      return false
    } finally {
      committing.current = false
      setBusy(false)
    }
  }
  const saveEdit = async () => {
    if (!dirty) return
    const content = working.content
    if (
      !content.trim() ||
      new TextEncoder().encode(content).length > config.limits.textMiB * 1024 * 1024
    ) {
      setError(`文字不可空白，且最多 ${config.limits.textMiB} MiB。`)
      return
    }
    if (await commit('edit', content, head.notes)) setTab('read')
  }
  const addNote = async () => {
    if (!working.body.trim()) return
    if (
      working.body.length > config.limits.noteCharacters ||
      working.quote.length > config.limits.quoteCharacters
    ) {
      setError(
        `筆記最多 ${config.limits.noteCharacters} 字，引用最多 ${config.limits.quoteCharacters} 字。`,
      )
      return
    }
    const note: Note = {
      id: crypto.randomUUID(),
      body: working.body.trim(),
      quote: working.quote,
      location: working.location,
      createdAt: new Date().toISOString(),
    }
    await commit('note', head.content, [...head.notes, note], null, true)
  }
  return {
    dirty,
    saveEdit,
    addNote,
    removeNote: (id: string) =>
      commit(
        'note',
        head.content,
        head.notes.filter((note) => note.id !== id),
      ),
    restore: (revision: Revision) =>
      commit('restore', revision.content, revision.notes, revision.id),
    adopt: (source: AdoptionSource, content: string) =>
      commit('adopt', content, head.notes, null, false, source),
  }
}
