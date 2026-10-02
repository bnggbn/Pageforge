import { importFile } from './importer'
import { collectionFiles, markCollectionImported } from './storage'
import { errorMessage } from './documents'

let scanning: Promise<{ imported: number; skipped: number; errors: string[] }> | null = null
export function syncCollection() {
  if (scanning) return scanning
  scanning = (async () => {
    const files = await collectionFiles()
    let imported = 0,
      skipped = 0
    const errors: string[] = []
    for (const file of files) {
      try {
        const response = await fetch(file.url, { cache: 'no-store' })
        if (!response.ok) throw new Error('來源文件無法讀取。')
        const outcome = await importFile(new File([await response.blob()], file.name))
        if (outcome.duplicate) skipped++
        else imported++
      } catch (error) {
        errors.push(`${file.name}：${errorMessage(error)}`)
      }
    }
    await markCollectionImported()
    return { imported, skipped, errors }
  })().finally(() => {
    scanning = null
  })
  return scanning
}
