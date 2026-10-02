'use client'

import { useReaderDocument } from '@/hooks/useReaderDocument'
import { ReaderLoadState } from './ReaderLoadState'
import { ReaderScreen } from './ReaderScreen'

export function ReaderWorkspace() {
  const session = useReaderDocument()
  if (session.loading || !session.data)
    return <ReaderLoadState loading={session.loading} error={session.error} />
  return <ReaderScreen doc={session.data.doc} settings={session.data.settings} session={session} />
}
