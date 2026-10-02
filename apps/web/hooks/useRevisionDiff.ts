'use client'

import { useEffect, useMemo, useState } from 'react'
import { config } from '@/lib/config'
import { serializeNotes, type DiffResult } from '@/lib/revision-diff'
import type { LibraryDocument } from '@/lib/documents'

export function useRevisionDiff(
  doc: LibraryDocument | null,
  enabled: boolean,
  from: string,
  to: string,
  notes: boolean,
) {
  const input = useMemo(() => {
    if (!doc || !enabled) return null
    const start = doc.revisions.find((revision) => revision.id === from)
    const end = doc.revisions.find((revision) => revision.id === to)
    if (!start || !end) return null
    return {
      left: notes ? serializeNotes(start.notes) : start.content,
      right: notes ? serializeNotes(end.notes) : end.content,
    }
  }, [doc, enabled, from, to, notes])
  const [completed, setCompleted] = useState<{ input: typeof input; result: DiffResult } | null>(
    null,
  )

  useEffect(() => {
    if (
      !input ||
      input.left === input.right ||
      input.left.length + input.right.length > config.diff.maxCharacters
    )
      return
    let worker: Worker
    try {
      worker = new Worker(new URL('../workers/revision-diff.worker.ts', import.meta.url))
    } catch {
      setCompleted({ input, result: { tooLarge: true, parts: [] } })
      return
    }
    worker.onmessage = (event: MessageEvent<DiffResult>) => {
      setCompleted({ input, result: event.data })
      worker.terminate()
    }
    worker.onerror = () => {
      setCompleted({ input, result: { tooLarge: true, parts: [] } })
      worker.terminate()
    }
    worker.postMessage({ ...input, options: config.diff })
    return () => worker.terminate()
  }, [input])

  if (!input) return null
  if (input.left === input.right) return { tooLarge: false, parts: [], pending: false }
  if (input.left.length + input.right.length > config.diff.maxCharacters)
    return { tooLarge: true, parts: [], pending: false }
  if (completed?.input === input) return { ...completed.result, pending: false }
  return { tooLarge: false, parts: [], pending: true }
}
