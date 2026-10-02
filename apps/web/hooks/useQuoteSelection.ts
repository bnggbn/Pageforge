'use client'

import type { RefObject } from 'react'
import { config } from '@/lib/config'
import type { LibraryDocument } from '@/lib/documents'
import type { useWorkingCopy } from './useWorkingCopy'

export function useQuoteSelection(
  doc: LibraryDocument,
  section: number,
  article: RefObject<HTMLElement | null>,
  working: Pick<ReturnType<typeof useWorkingCopy>, 'change'>,
  onSelected: () => void,
) {
  return () => {
    const selection = window.getSelection()
    if (
      !selection?.anchorNode ||
      !article.current?.contains(selection.anchorNode) ||
      !article.current.contains(selection.focusNode)
    )
      return
    const text = selection.toString().trim()
    if (!text) return
    const element =
      selection.anchorNode instanceof Element
        ? selection.anchorNode
        : selection.anchorNode.parentElement
    const block = element?.closest('[data-block]')?.getAttribute('data-block') ?? '全文'
    const location =
      doc.format === 'epub'
        ? `${doc.sections[section]?.title} / ${block}`
        : doc.format === 'xlsx'
          ? `${doc.sheets[section]?.name} / ${block}`
          : block
    working.change({ quote: text.slice(0, config.limits.quoteCharacters), location })
    onSelected()
  }
}
