'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { config } from '@/lib/config'
import { readingAnchor } from '@/lib/reading-anchor'
import { latest, errorMessage, type LibraryDocument, type ReadingPosition } from '@/lib/documents'
import { saveProgress, saveFontSize } from '@/lib/storage'
import type { ReaderSettings, ReaderTab } from '@/lib/reader-types'

interface Props {
  doc: LibraryDocument
  settings: ReaderSettings
  tab: ReaderTab
  onError: (message: string) => void
  onMessage: (message: string) => void
}

export function useReaderProgress({ doc, settings, tab, onError, onMessage }: Props) {
  const { position } = settings
  const compatible =
    position &&
    doc.revisions.find((node) => node.id === position.revisionId)?.content === latest(doc).content
  const [fontSize, setFontSize] = useState(settings.fontSize)
  const [section, setSection] = useState(position?.section ?? 0)
  const [pdfPage, setPdfPage] = useState((position?.section ?? 0) + 1)
  const [percentage, setPercentage] = useState(compatible ? position.percentage : 0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const articleRef = useRef<HTMLElement>(null)
  const blocks = useRef<HTMLElement[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<ReadingPosition | null>(null)
  const restore = useRef<ReadingPosition | null>(compatible ? position : null)
  const active = useRef(doc)
  const mounted = useRef(true)
  const reading = tab === 'read' || tab === 'notes'

  useEffect(() => {
    active.current = doc
  }, [doc])
  const capture = useCallback((): ReadingPosition | null => {
    const container = scrollRef.current
    if (!container) return null
    const current = active.current
    const top = container.getBoundingClientRect().top
    const anchor = readingAnchor(blocks.current, top + 36)
    const rect = anchor?.getBoundingClientRect()
    const distance = container.scrollHeight - container.clientHeight
    const ratio = distance <= 0 ? 1 : Math.max(0, Math.min(1, container.scrollTop / distance))
    const count =
      current.format === 'epub'
        ? current.sections.length
        : current.format === 'xlsx'
          ? current.sheets.length
          : 1
    return {
      revisionId: latest(current).id,
      block: anchor?.dataset.block ?? '',
      ratio: rect ? Math.max(0, Math.min(1, (top + 36 - rect.top) / Math.max(rect.height, 1))) : 0,
      percentage: Math.round(((section + ratio) / Math.max(1, count)) * 100),
      updatedAt: new Date().toISOString(),
      section,
    }
  }, [section])
  const cancelPending = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    pending.current = null
  }, [])
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    const position = pending.current
    if (!position) return
    await saveProgress(active.current.id, position)
    if (pending.current === position) pending.current = null
  }, [])
  const onScroll = () => {
    if (!reading) return
    const position = capture()
    if (!position) return
    pending.current = position
    setPercentage(position.percentage)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void flush().catch((e) => {
        if (mounted.current) onError(errorMessage(e))
      })
    }, config.reading.progressDebounceMs)
  }
  useEffect(() => {
    blocks.current = Array.from(
      articleRef.current?.querySelectorAll<HTMLElement>('[data-block]') ?? [],
    )
  }, [doc, tab, section])
  useEffect(() => {
    if (!reading || !scrollRef.current || !restore.current) return
    const position = restore.current,
      container = scrollRef.current
    const anchor = blocks.current.find((node) => node.dataset.block === position.block)
    if (anchor)
      container.scrollTop =
        anchor.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop +
        anchor.getBoundingClientRect().height * position.ratio -
        36
    else if (position.block) {
      container.scrollTop = 0
      onMessage('舊閱讀區塊無法定位，已回到開頭。')
    }
    restore.current = null
  }, [doc, tab, reading, fontSize, section, onMessage])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current) clearTimeout(timer.current)
      if (pending.current) void saveProgress(active.current.id, pending.current).catch(() => {})
    }
  }, [])

  const rememberPosition = () => {
    const position = capture()
    if (position) restore.current = position
  }
  const revisionSaved = (updated: LibraryDocument) => {
    const changed = latest(updated).content !== latest(active.current).content
    active.current = updated
    if (!changed) return
    cancelPending()
    restore.current = null
    setPercentage(0)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }
  const resizeFont = async (size: number) => {
    rememberPosition()
    try {
      await saveFontSize(size)
      setFontSize(size)
    } catch (e) {
      onError(errorMessage(e))
    }
  }
  const changeSection = async (index: number) => {
    const current = active.current
    const count = current.format === 'epub' ? current.sections.length : current.sheets.length
    const position: ReadingPosition = {
      revisionId: latest(current).id,
      block: '',
      ratio: 0,
      percentage: Math.round((index / Math.max(1, count)) * 100),
      section: index,
      updatedAt: new Date().toISOString(),
    }
    try {
      await flush()
      await saveProgress(current.id, position)
    } catch (e) {
      onError(errorMessage(e))
      return
    }
    restore.current = null
    cancelPending()
    setSection(index)
    setPercentage(position.percentage)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }
  const changePdfPage = (value: number) => {
    const page = Math.max(1, Math.min(config.reading.pdfMaxPage, value || 1))
    setPdfPage(page)
    return page
  }
  const savePdfBookmark = async () => {
    try {
      await saveProgress(active.current.id, {
        revisionId: latest(active.current).id,
        block: '',
        ratio: 0,
        percentage: 0,
        section: pdfPage - 1,
        updatedAt: new Date().toISOString(),
      })
      onMessage(`已保存第 ${pdfPage} 頁書籤。`)
    } catch (e) {
      onError(errorMessage(e))
    }
  }

  return {
    fontSize,
    section,
    pdfPage,
    percentage,
    scrollRef,
    articleRef,
    onScroll,
    flush,
    cancelPending,
    rememberPosition,
    revisionSaved,
    resizeFont,
    changeSection,
    changePdfPage,
    savePdfBookmark,
  }
}

export type ReaderProgress = ReturnType<typeof useReaderProgress>
