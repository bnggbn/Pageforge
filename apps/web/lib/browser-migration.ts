import * as browser from './indexed-storage'
import * as branches from './indexed-sandboxes'
import { latest, type LibraryDocument, type WorkingCopyRecord } from './documents'
import { verifySandbox } from './sandboxes'
import {
  listSandboxes,
  loadSandbox,
  insertSandbox,
  appendSandbox,
  archiveSandbox,
  listWorkingCopies,
  saveWorkingCopy,
} from './storage'

const sameDraft = (a: WorkingCopyRecord, b: WorkingCopyRecord) =>
  ['branchId', 'baseRevisionId', 'content', 'body', 'quote', 'location'].every(
    (key) => a[key as keyof WorkingCopyRecord] === b[key as keyof WorkingCopyRecord],
  )

/** Retryable copy: preserve the browser source and never overwrite a divergent disk branch. */
export async function migrateWorkingData(doc: LibraryDocument): Promise<string[]> {
  const conflicts: string[] = []
  const blocked = new Set<string>()
  const stored = await listSandboxes(doc.id)
  for (const item of await branches.listSandboxes(doc.id)) {
    const source = await branches.loadSandbox(doc.id, item.id)
    await verifySandbox(doc, source)
    let destination = stored.some((branch) => branch.id === item.id)
      ? await loadSandbox(doc.id, item.id)
      : await insertSandbox({ ...source, archivedAt: undefined, revisions: [source.revisions[0]] })
    if (
      destination.baseRevisionId !== source.baseRevisionId ||
      destination.revisions.some((node, index) => node.sai !== source.revisions[index]?.sai)
    ) {
      conflicts.push(`${doc.title} / ${source.name}`)
      blocked.add(item.id)
      continue
    }
    if (destination.revisions.length < source.revisions.length && destination.archivedAt)
      destination = await archiveSandbox(doc.id, item.id, latest(destination).id, false)
    for (const node of source.revisions.slice(destination.revisions.length))
      destination = await appendSandbox(destination, latest(destination).id, node)
    if (source.archivedAt && !destination.archivedAt)
      await archiveSandbox(doc.id, item.id, latest(destination).id, true)
  }
  const copies = await listWorkingCopies(doc.id)
  for (const copy of await browser.listWorkingCopies(doc.id)) {
    if (copy.branchId && blocked.has(copy.branchId)) continue
    if (copies.some((saved) => sameDraft(saved, copy))) continue
    const saved = {
      ...copy,
      id: copies.some((saved) => saved.id === copy.id) ? crypto.randomUUID() : copy.id,
    }
    await saveWorkingCopy(saved, null)
    copies.push(saved)
  }
  return conflicts
}
