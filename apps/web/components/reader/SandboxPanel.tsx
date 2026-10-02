'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PrimaryButton } from '@/components/ui/PrimaryButton'
import { useWorkingCopy } from '@/hooks/useWorkingCopy'
import { useRevisionDiff } from '@/hooks/useRevisionDiff'
import { config } from '@/lib/config'
import {
  latest,
  errorMessage,
  type AdoptionSource,
  type LibraryDocument,
  type SandboxBranch,
  type SandboxSummary,
} from '@/lib/documents'
import { listSandboxes, loadSandbox, archiveSandbox } from '@/lib/storage'
import { forkSandbox, saveSandbox, sandboxDocument, verifySandbox } from '@/lib/sandboxes'
import { WorkingCopyBar } from './WorkingCopyBar'
import { VersionDiff } from './VersionDiff'

interface Props {
  doc: LibraryDocument
  onAdopt: (source: AdoptionSource, content: string) => Promise<boolean>
  registerFlush: (flush: (() => Promise<void>) | null) => void
  onBusyChange: (busy: boolean) => void
}

export function SandboxPanel({ doc, onAdopt, registerFlush, onBusyChange }: Props) {
  const working = useWorkingCopy()
  const [branches, setBranches] = useState<SandboxSummary[]>([])
  const [branch, setBranch] = useState<SandboxBranch | null>(null)
  const [base, setBase] = useState(latest(doc).id)
  const [name, setName] = useState('')
  const [archived, setArchived] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [comparison, setComparison] = useState<{ main: string; branch: string } | null>(null)
  const head = latest(doc)
  const branchHead = branch ? latest(branch) : null
  const dirty = !!branchHead && working.content !== branchHead.content
  const matching =
    !!comparison && comparison.main === head.id && comparison.branch === branchHead?.id
  const compareDocument = useMemo(
    () => (branchHead ? { ...doc, revisions: [head, branchHead] } : null),
    [doc, head, branchHead],
  )
  const diff = useRevisionDiff(compareDocument, matching, head.id, branchHead?.id ?? '', false)
  const refresh = useCallback(
    async () =>
      setBranches(
        (await listSandboxes(doc.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      ),
    [doc.id],
  )

  useEffect(() => {
    void refresh().catch((e) => setError(errorMessage(e)))
  }, [refresh])
  useEffect(() => {
    registerFlush(working.flush)
    return () => registerFlush(null)
  }, [registerFlush, working.flush])
  const act = async (operation: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    onBusyChange(true)
    setError('')
    setMessage('')
    try {
      await operation()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }
  const open = (id: string) =>
    act(async () => {
      await working.flush()
      const loaded = await loadSandbox(doc.id, id)
      const projected = await verifySandbox(doc, loaded)
      await working.open(projected)
      setBranch(loaded)
      setComparison(null)
      await refresh()
    })
  const create = () =>
    act(async () => {
      await working.flush()
      const created = await forkSandbox(doc, base, name)
      await working.open(sandboxDocument(doc, created))
      setBranch(created)
      setName('')
      setComparison(null)
      await refresh()
    })
  const save = () =>
    act(async () => {
      if (!branch) return
      await working.flush()
      const saved = await saveSandbox(doc, branch, working.content)
      setBranch(saved)
      setComparison(null)
      await working
        .rebase(sandboxDocument(doc, saved), true, false)
        .catch((e) => setError(`版本已保存，但草稿整理失敗：${errorMessage(e)}`))
      setMessage('沙盒版本已保存，主線保留原文。')
      await refresh()
    })
  const toggleArchive = () =>
    act(async () => {
      if (!branch) return
      await working.flush()
      const saved = await archiveSandbox(doc.id, branch.id, latest(branch).id, !branch.archivedAt)
      setBranch(saved)
      setArchived(true)
      setMessage(saved.archivedAt ? '沙盒已封存，版本與草稿仍可復原。' : '沙盒已復原。')
      await refresh()
    })
  const adopt = async () => {
    if (!branch || !branchHead || !matching || dirty || busy || diff?.pending || diff?.tooLarge)
      return
    if (!window.confirm('採納這份沙盒文字為主線新版本？主線筆記與原有版本會保留。')) return
    setBusy(true)
    try {
      await working.flush()
      await verifySandbox(doc, await loadSandbox(doc.id, branch.id))
      if (
        await onAdopt(
          { branchId: branch.id, revisionId: branchHead.id, baseRevisionId: branch.baseRevisionId },
          branchHead.content,
        )
      ) {
        setComparison(null)
        setMessage('已採納到主線；沙盒版本仍保留。')
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sandbox-panel grid grid-cols-[280px_minmax(0,1fr)] items-start gap-9 py-8 max-lg:grid-cols-[240px_minmax(0,1fr)] max-lg:gap-6 max-md:grid-cols-1">
      <aside className="min-w-0 space-y-6">
        <div>
          <p className="text-[10px] font-semibold tracking-[2px] text-muted">A PLACE TO TRY</p>
          <h2 className="my-3 font-display text-[25px]">給想法，一條岔路。</h2>
          <p className="text-[12px] leading-7 text-muted">
            先在沙盒裡改寫。保存、比較，再決定哪些文字值得帶回主線。
          </p>
        </div>
        <div className="space-y-4 rounded-md border border-line bg-surface p-4">
          <label className={styles.label}>
            沙盒來源版本
            <select
              aria-label="沙盒來源版本"
              className={styles.input}
              value={base}
              disabled={busy}
              onChange={(e) => setBase(e.target.value)}
            >
              {doc.revisions.map((revision, index) => (
                <option key={revision.id} value={revision.id}>
                  第 {index + 1} 版{revision.id === head.id ? ' · 目前主線' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            沙盒名稱
            <input
              aria-label="沙盒名稱"
              className={styles.input}
              placeholder="例如：另一種開場"
              value={name}
              maxLength={config.limits.sandboxNameCharacters}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <PrimaryButton size="small" disabled={busy || !name.trim()} onClick={() => void create()}>
            建立沙盒
          </PrimaryButton>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>保留的想法 · {branches.length}</span>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            包含封存
          </label>
        </div>
        <div className="space-y-2">
          {branches
            .filter((item) => archived || !item.archivedAt)
            .map((item) => (
              <button
                key={item.id}
                aria-label={`開啟沙盒 ${item.name}`}
                aria-pressed={branch?.id === item.id}
                disabled={busy}
                onClick={() => void open(item.id)}
                className="w-full rounded-md border border-line px-4 py-3 text-left aria-pressed:border-rust aria-pressed:bg-[#f1e9df]"
              >
                <span className="block wrap-anywhere text-[13px]">{item.name}</span>
                <span className="mt-2 block text-[10px] text-muted">
                  {item.archivedAt ? '已封存 · ' : ''}
                  {item.revisionCount} 個沙盒版本 · 來源第{' '}
                  {doc.revisions.findIndex((revision) => revision.id === item.baseRevisionId) + 1}{' '}
                  版
                </span>
              </button>
            ))}
        </div>
      </aside>
      <section className="min-w-0">
        {error && (
          <p role="alert" className="mb-4 text-[12px] text-rust">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mb-4 text-[12px] text-muted">
            {message}
          </p>
        )}
        {!branch ? (
          <div className="flex min-h-96 flex-col justify-center rounded-lg border border-dashed border-line bg-surface px-8 py-12">
            <span className="font-display text-[48px] text-rust">↗</span>
            <h3 className="my-4 font-display text-[25px]">還沒決定，也可以開始。</h3>
            <p className="max-w-96 text-[13px] leading-8 text-muted">
              選一個版本，替新想法取個名字。你的原文會留在主線，這裡可以放心嘗試。
            </p>
          </div>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] tracking-[2px] text-muted">
                  SANDBOX / 第 {branch.revisions.length} 版
                </p>
                <h3 className="mt-2 wrap-anywhere font-display text-[25px]">{branch.name}</h3>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  className="text-[11px] text-rust underline"
                  disabled={busy}
                  onClick={() => void open(branch.id)}
                >
                  重新載入沙盒
                </button>
                <button
                  className="text-[11px] text-rust underline"
                  disabled={busy}
                  onClick={() => void toggleArchive()}
                >
                  {branch.archivedAt ? '復原沙盒' : '封存沙盒'}
                </button>
                <PrimaryButton
                  size="small"
                  disabled={busy || !dirty || !!branch.archivedAt}
                  onClick={() => void save()}
                >
                  保存沙盒版本
                </PrimaryButton>
              </div>
            </div>
            {(dirty || working.copies.length > 0 || working.error) && (
              <WorkingCopyBar
                {...working}
                selectedId={working.id}
                staleMessage="草稿基於舊版本；沙盒更新已保留。"
                busy={busy}
                stale={working.baseRevisionId !== branchHead?.id}
                onRetry={() => void working.flush().catch(() => {})}
                onSelect={(id) =>
                  void act(async () => {
                    await working.flush()
                    await working.open(sandboxDocument(doc, branch), id)
                  })
                }
                onDiscard={() => {
                  if (window.confirm('捨棄此沙盒草稿？已保存版本會保留。'))
                    void act(() => working.discard(sandboxDocument(doc, branch)))
                }}
              />
            )}
            <textarea
              aria-label="沙盒文字"
              value={working.content}
              spellCheck={false}
              disabled={busy || !!branch.archivedAt}
              onChange={(e) => working.change({ content: e.target.value })}
              className="my-4 min-h-80 w-full resize-y rounded-md border border-line bg-surface p-6 font-code text-[14px] leading-8 max-md:p-4 max-md:text-[12px]"
            />
            <div className="mb-5 flex flex-wrap items-center gap-4 border-t border-line pt-4">
              <button
                className="rounded border border-line px-4 py-2 text-[12px]"
                disabled={busy || dirty}
                onClick={() => setComparison({ main: head.id, branch: branchHead!.id })}
              >
                比較目前主線
              </button>
              <PrimaryButton
                size="small"
                disabled={
                  busy ||
                  dirty ||
                  !matching ||
                  !!branch.archivedAt ||
                  !!diff?.pending ||
                  !!diff?.tooLarge ||
                  head.content === branchHead?.content
                }
                onClick={() => void adopt()}
              >
                採納到主線
              </PrimaryButton>
              <p className="text-[11px] leading-6 text-muted">
                {dirty
                  ? '先保存沙盒文字，再比較與採納。'
                  : matching
                    ? `主線第 ${doc.revisions.length} 版 → 沙盒第 ${branch.revisions.length} 版 · 綠色新增、紅色刪除`
                    : '比較目前主線後，才能採納。主線筆記會保留。'}
              </p>
            </div>
            {matching && <VersionDiff result={diff} />}
          </>
        )}
      </section>
    </div>
  )
}

const styles = {
  label: 'block text-[11px] text-muted',
  input:
    'mt-2 block w-full min-w-0 rounded border border-line bg-transparent px-3 py-2 text-[12px] text-ink',
}
