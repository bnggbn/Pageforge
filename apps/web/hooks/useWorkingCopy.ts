'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { config } from '@/lib/config'
import {
  latest,
  errorMessage,
  WorkingCopyConflict,
  type LibraryDocument,
  type WorkingCopy,
} from '@/lib/documents'
import { listWorkingCopies, saveWorkingCopy, removeWorkingCopy } from '@/lib/storage'

type Values = Pick<WorkingCopy, 'content' | 'body' | 'quote' | 'location'>
type Status = 'saved' | 'pending' | 'saving' | 'error'
interface Session {
  documentId: string
  baseRevisionId: string
  baseline: string
  id: string
  version: string | null
  values: Values
  saved: string
  branchId?: string
}
const emptyNote = { body: '', quote: '', location: '全文筆記' }
const signature = (values: Values) => JSON.stringify(values)

export function useWorkingCopy() {
  const active = useRef<Session | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)
  const [view, setView] = useState({
    ...emptyNote,
    content: '',
    id: '',
    baseRevisionId: '',
    status: 'saved' as Status,
    error: '',
    restored: false,
    copies: [] as WorkingCopy[],
  })
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    const session = active.current
    if (!session) return
    const values = session.values
    const mark = signature(values)
    const operation = queue.current
      .catch(() => {})
      .then(async () => {
        if (session.saved === mark) return
        if (mounted.current && active.current === session)
          setView((previous) => ({ ...previous, status: 'saving', error: '' }))
        try {
          if (
            new TextEncoder().encode(values.content).length > config.limits.textMiB * 1024 * 1024 ||
            values.body.length > config.limits.noteCharacters ||
            values.quote.length > config.limits.quoteCharacters ||
            values.location.length > config.limits.locationCharacters
          )
            throw new Error('草稿超過設定容量，請縮短內容後重試。')
          const clean =
            values.content === session.baseline &&
            !values.body &&
            !values.quote &&
            values.location === emptyNote.location
          let copy: WorkingCopy | null = null
          if (clean) {
            if (session.version)
              await removeWorkingCopy(session.documentId, session.id, session.version)
            session.version = null
          } else {
            copy = {
              ...values,
              id: session.id,
              documentId: session.documentId,
              baseRevisionId: session.baseRevisionId,
              version: crypto.randomUUID(),
              updatedAt: new Date().toISOString(),
              ...(session.branchId ? { branchId: session.branchId } : {}),
            }
            try {
              await saveWorkingCopy(copy, session.version)
            } catch (error) {
              if (!(error instanceof WorkingCopyConflict)) throw error
              // Preserve both writers; a stale draft token never overwrites another tab.
              session.id = crypto.randomUUID()
              copy.id = session.id
              await saveWorkingCopy(copy, null)
            }
            session.version = copy.version
          }
          session.saved = mark
          if (mounted.current && active.current === session) {
            setView((previous) => ({
              ...previous,
              id: session.id,
              copies: copy
                ? [...previous.copies.filter((item) => item.id !== copy.id), copy]
                : previous.copies.filter((item) => item.id !== session.id),
              error: '',
              status: session.values === values ? 'saved' : 'pending',
            }))
          }
        } catch (error) {
          if (mounted.current && active.current === session)
            setView((previous) => ({ ...previous, status: 'error', error: errorMessage(error) }))
          throw error
        }
      })
    queue.current = operation
    await operation
    if (active.current === session && session.values !== values) await flush()
  }, [])

  const open = useCallback(async (doc: LibraryDocument, selectedId?: string) => {
    await queue.current.catch(() => {})
    const copies = (await listWorkingCopies(doc.id))
      .filter((copy) => copy.branchId === doc.branchId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const preferred =
      selectedId ??
      (active.current?.documentId === doc.id && active.current.branchId === doc.branchId
        ? active.current.id
        : '')
    const copy = copies.find((item) => item.id === preferred) ?? copies[0]
    if (selectedId && !copies.some((item) => item.id === selectedId))
      throw new Error('此草稿已不存在。')
    const values: Values = copy
      ? {
          content: copy.content,
          body: copy.body,
          quote: copy.quote,
          location: copy.location,
        }
      : { content: latest(doc).content, ...emptyNote }
    if (copy && !doc.revisions.some((revision) => revision.id === copy.baseRevisionId))
      throw new Error('草稿來源版本不存在，已停止載入。')
    const base =
      doc.revisions.find((revision) => revision.id === copy?.baseRevisionId) ?? latest(doc)
    active.current = {
      documentId: doc.id,
      baseRevisionId: base.id,
      baseline: base.content,
      id: copy?.id ?? crypto.randomUUID(),
      version: copy?.version ?? null,
      values,
      saved: signature(values),
      branchId: doc.branchId,
    }
    setView({
      ...values,
      id: active.current.id,
      baseRevisionId: base.id,
      copies,
      restored: !!copy,
      status: 'saved',
      error: '',
    })
    return {
      restored: !!copy,
      edited: values.content !== latest(doc).content,
      note: !!(values.body || values.quote),
    }
  }, [])

  const change = useCallback(
    (patch: Partial<Values>) => {
      const session = active.current
      if (!session) return
      session.values = { ...session.values, ...patch }
      setView((previous) => ({ ...previous, ...patch, status: 'pending', error: '' }))
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        void flush().catch(() => {})
      }, config.reading.draftDebounceMs)
    },
    [flush],
  )

  const rebase = useCallback(
    async (doc: LibraryDocument, clearContent: boolean, clearNote: boolean) => {
      await queue.current.catch(() => {})
      const session = active.current
      if (!session) return
      const preserveBase =
        !clearContent &&
        session.values.content !== session.baseline &&
        session.baseline !== latest(doc).content
      if (!preserveBase) {
        session.baseRevisionId = latest(doc).id
        session.baseline = latest(doc).content
      }
      session.values = {
        ...session.values,
        ...(clearContent ? { content: latest(doc).content } : {}),
        ...(clearNote ? emptyNote : {}),
      }
      session.saved = ''
      setView((previous) => ({
        ...previous,
        ...session.values,
        baseRevisionId: session.baseRevisionId,
        restored: false,
        status: 'pending',
      }))
      await flush()
    },
    [flush],
  )

  const discard = useCallback(async (doc: LibraryDocument) => {
    if (timer.current) clearTimeout(timer.current)
    await queue.current.catch(() => {})
    const session = active.current
    if (session?.version) await removeWorkingCopy(doc.id, session.id, session.version)
    active.current = null
    // Start fresh, leaving other tabs' copies available in the selector.
    const values = { content: latest(doc).content, ...emptyNote }
    const copies = (await listWorkingCopies(doc.id)).filter(
      (copy) => copy.branchId === doc.branchId,
    )
    active.current = {
      documentId: doc.id,
      baseRevisionId: latest(doc).id,
      baseline: latest(doc).content,
      id: crypto.randomUUID(),
      version: null,
      values,
      saved: signature(values),
      branchId: doc.branchId,
    }
    setView({
      ...values,
      id: active.current.id,
      baseRevisionId: latest(doc).id,
      copies,
      restored: false,
      status: 'saved',
      error: '',
    })
  }, [])

  const close = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    active.current = null
  }, [])

  useEffect(() => {
    mounted.current = true
    const prevent = (event: BeforeUnloadEvent) => {
      const session = active.current
      if (session && session.saved !== signature(session.values)) event.preventDefault()
    }
    const visibility = () => {
      if (document.visibilityState === 'hidden') void flush().catch(() => {})
    }
    window.addEventListener('beforeunload', prevent)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      mounted.current = false
      if (timer.current) clearTimeout(timer.current)
      window.removeEventListener('beforeunload', prevent)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [flush])

  return { ...view, open, flush, rebase, discard, change, close }
}
