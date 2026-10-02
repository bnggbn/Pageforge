import { PrimaryButton } from '@/components/ui/PrimaryButton'

interface Props {
  content: string
  dirty: boolean
  busy: boolean
  onChange: (content: string) => void
  onSave: () => Promise<void>
}
export function TextEditorPanel({ content, dirty, busy, onChange, onSave }: Props) {
  return (
    <section className={styles.panel}>
      <div className={styles.heading}>
        <div>
          <p className="eyebrow text-[10px] tracking-[2px] font-semibold m-0 text-muted">
            MAKE IT YOUR OWN
          </p>
          <h2>讓文字，往前一步。</h2>
          <p>每次儲存建立新版本，原文與筆記都會保留。</p>
        </div>
        <PrimaryButton
          className="max-sm:mt-[27px]"
          disabled={busy || !dirty}
          onClick={() => void onSave()}
        >
          {busy ? '保存中…' : '儲存新版本'}
        </PrimaryButton>
      </div>
      <textarea
        aria-label="編輯文件文字"
        value={content}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        disabled={busy}
      />
      <span className="small-note text-[11px] text-muted leading-[1.8] my-2.5 mx-0">
        {dirty ? '有未儲存的修改' : '目前文字已保存'} · {content.length.toLocaleString()} 字元
      </span>
    </section>
  )
}

const styles = {
  panel: [
    'editor-panel pt-9 px-0 pb-0 max-w-275 m-auto',
    '[&_textarea]:block [&_textarea]:w-full [&_textarea]:[min-height:calc(100dvh_-_370px)]',
    '[&_textarea]:border [&_textarea]:border-solid [&_textarea]:border-line',
    '[&_textarea]:bg-surface [&_textarea]:rounded-[5px] [&_textarea]:p-7',
    '[&_textarea]:font-code [&_textarea]:text-[15px] [&_textarea]:leading-[1.9]',
    '[&_textarea]:resize-y [&_textarea]:mb-3 max-md:[&_textarea]:p-4.5 max-md:[&_textarea]:text-[13px]',
  ].join(' '),
  heading: [
    'editor-heading flex items-center justify-between gap-5 mb-6',
    '[&_h2]:text-[23px] [&_h2]:font-medium [&_h2]:my-3 [&_h2]:mx-0',
    '[&_p:not(.eyebrow)]:text-[12px] [&_p:not(.eyebrow)]:text-muted max-md:items-start',
    'max-md:[&_h2]:text-[19px] max-md:[&_.primary-button]:text-[10px] max-md:[&_.primary-button]:p-2.5',
    'max-md:[&_.primary-button]:whitespace-nowrap',
    'max-md:[&_p:not(.eyebrow)]:text-[10px] max-md:[&_p:not(.eyebrow)]:leading-[1.7]',
  ].join(' '),
}
