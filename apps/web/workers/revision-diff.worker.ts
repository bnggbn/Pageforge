import { diffLines } from 'diff'
import type { DiffRequest, DiffResult } from '../lib/revision-diff'

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<DiffRequest>) => void) | null
  postMessage: (result: DiffResult) => void
}
worker.onmessage = ({ data }) => {
  const parts = diffLines(data.left, data.right, {
    timeout: data.options.timeoutMs,
    maxEditLength: data.options.maxEditLength,
  })
  worker.postMessage({ tooLarge: !parts, parts: parts ?? [] })
}
