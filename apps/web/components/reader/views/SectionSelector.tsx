interface Props {
  titles: string[]
  section: number
  label: string
  onChange: (index: number) => Promise<void>
}
export function SectionSelector({ titles, section, label, onChange }: Props) {
  if (!titles.length) return null
  return (
    <div className={styles.selector}>
      <label>
        {label}
        <select
          aria-label="選擇章節或工作表"
          value={section}
          onChange={(e) => void onChange(Number(e.target.value))}
        >
          {titles.map((title, index) => (
            <option key={index} value={index}>
              {title}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

const styles = {
  selector: [
    'section-selector border-b border-line py-3 px-5 text-[11px] text-muted',
    '[&_label]:flex [&_label]:gap-[15px] [&_label]:items-center',
    '[&_select]:min-w-0 [&_select]:max-w-[90%] [&_select]:border-0',
    '[&_select]:bg-transparent [&_select]:text-ink [&_select]:p-[5px]',
  ].join(' '),
}
