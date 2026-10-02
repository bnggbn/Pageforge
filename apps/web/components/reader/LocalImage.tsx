'use client'

import { useState } from 'react'
import { localImageSource } from '@/lib/image-source'

export function LocalImage({
  source,
  alt,
  documentId,
}: {
  source?: string
  alt?: string
  documentId: string
}) {
  const url = localImageSource(source, documentId)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (!url || failedUrl === url) {
    return (
      <span className="omitted-image">
        [圖片：{alt || '無說明'} · {url ? '檔案不存在或無法載入' : '僅載入書架內的點陣圖片'}]
      </span>
    )
  }
  return (
    // The local API checks paths, byte signatures and size before serving raster images.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt ?? ''}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(url)}
      className="document-image"
    />
  )
}
