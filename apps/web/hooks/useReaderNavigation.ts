'use client'

import { useCallback, useRef } from 'react'
import { errorMessage, type LibraryDocument } from '@/lib/documents'
import { deleteDocument } from '@/lib/storage'
import type { ReaderTab } from '@/lib/reader-types'
import type { ReaderSession } from './useReaderDocument'
import type { ReaderProgress } from './useReaderProgress'

export function useReaderNavigation(
  doc: LibraryDocument,
  session: Pick<
    ReaderSession,
    'working' | 'busy' | 'setError' | 'setMessage' | 'setTab' | 'setBusy' | 'load'
  >,
  progress: Pick<ReaderProgress, 'flush' | 'rememberPosition' | 'cancelPending'>,
) {
  const sandboxFlush = useRef<(() => Promise<void>) | null>(null)
  const { working, busy, setError, setMessage, setTab, setBusy } = session
  const registerSandboxFlush = useCallback((flush: (() => Promise<void>) | null) => {
    sandboxFlush.current = flush
  }, [])
  const flushAll = async () => {
    await sandboxFlush.current?.()
    await working.flush()
    await progress.flush()
  }
  const changeTab = async (next: ReaderTab) => {
    if (busy) return
    try {
      await flushAll()
      progress.rememberPosition()
      setTab(next)
      setError('')
      setMessage('')
    } catch (e) {
      setError(errorMessage(e))
    }
  }
  const returnToShelf = async () => {
    if (busy) return
    try {
      await flushAll()
      window.location.href = '/'
    } catch (e) {
      setError(errorMessage(e))
    }
  }
  const reload = async () => {
    if (busy) return
    try {
      await flushAll()
      await session.load()
    } catch (e) {
      setError(errorMessage(e))
    }
  }
  const remove = async () => {
    if (
      busy ||
      !window.confirm(
        '確定從書架移除文件、筆記與全部版本？固定資料夾模式會移到 .trash/；瀏覽器模式會永久刪除。',
      )
    )
      return
    setBusy(true)
    try {
      progress.cancelPending()
      await sandboxFlush.current?.()
      await deleteDocument(doc.id)
      working.close()
      window.location.href = '/'
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }
  const selectDraft = async (id: string) => {
    if (busy) return
    setBusy(true)
    try {
      await flushAll()
      const recovered = await working.open(doc, id)
      setTab(recovered.edited ? 'edit' : 'notes')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const discardDraft = async () => {
    if (busy || !window.confirm('捨棄此草稿？已保存版本與其他草稿會保留。')) return
    setBusy(true)
    try {
      await working.discard(doc)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return {
    changeTab,
    returnToShelf,
    reload,
    remove,
    selectDraft,
    discardDraft,
    registerSandboxFlush,
  }
}
