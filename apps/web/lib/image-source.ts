export function localImageSource(source: string | undefined, documentId: string): string | null {
  if (!source || !documentId) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(source)
  } catch {
    return null
  }
  if (
    /^[a-z][a-z\d+.-]*:/i.test(decoded) ||
    decoded.startsWith('/') ||
    /[\\\0?#]/.test(decoded) ||
    decoded.split('/').some((part) => !part || part === '.' || part === '..') ||
    !/\.(png|jpe?g|gif|webp)$/i.test(decoded)
  )
    return null
  return `/api/library/documents/${encodeURIComponent(documentId)}/image?path=${encodeURIComponent(decoded)}`
}
