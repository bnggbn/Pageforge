'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { latest, errorMessage, type LibraryDocument } from '@/lib/documents'
import { loadDocument, readProgress, readFontSize, changeSource } from '@/lib/storage'
import { verifyHistory } from '@/lib/history'
import type { ReaderSettings, ReaderTab } from '@/lib/reader-types'
import { useWorkingCopy } from './useWorkingCopy'

export function useReaderDocument() {
  const working = useWorkingCopy()
  const [data, setData] = useState<{ doc: LibraryDocument; settings: ReaderSettings } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [stale, setStale] = useState(false)
  const [tab, setTab] = useState<ReaderTab>('read')
  const generation = useRef(0)

  const load = useCallback(async () => {
    const request = ++generation.current
    setLoading(true)
    setData(null)
    setError('')
    setStale(false)
    try {
      const id = new URL(window.location.href).searchParams.get('id')
      if (!id) throw new Error('請從書架選擇一份文件。')
      const doc = await loadDocument(id)
      if (!doc) throw new Error('找不到這份文件，可能已被刪除。')
      await verifyHistory(doc)
      if (request !== generation.current) return
      const recovered = await working.open(doc)
      const [position, fontSize] = await Promise.all([readProgress(id), readFontSize()])
      if (request !== generation.current) return
      if (recovered.restored) setTab(recovered.edited ? 'edit' : recovered.note ? 'notes' : 'read')
      if (
        position &&
        doc.revisions.find((node) => node.id === position.revisionId)?.content !==
          latest(doc).content
      )
        setMessage('文件內容已有新版本，閱讀位置已回到開頭。')
      setData({ doc, settings: { position, fontSize } })
    } catch (e) {
      if (request === generation.current) setError(errorMessage(e))
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }, [working.open])

  useEffect(() => {
    void load()
    return () => {
      generation.current++
    }
  }, [load])
  useEffect(() => {
    const channel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pageforge-library') : null
    if (channel)
      channel.onmessage = (event) => {
        if (event.data?.source !== changeSource) setStale(true)
      }
    return () => channel?.close()
  }, [])
  const publish = (doc: LibraryDocument) => {
    setData((previous) => (previous ? { ...previous, doc } : null))
    setStale(false)
  }

  return {
    data,
    loading,
    error,
    message,
    busy,
    stale,
    tab,
    working,
    load,
    publish,
    setError,
    setMessage,
    setBusy,
    setTab,
  }
}

export type ReaderSession = ReturnType<typeof useReaderDocument>
