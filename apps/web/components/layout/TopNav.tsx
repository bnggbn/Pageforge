import Link from 'next/link'
export function TopNav() {
  return (
    <header className={styles.topNav}>
      <Link
        href="/"
        className={[
          'brand flex items-center gap-2.5 font-display text-[27px] font-semibold tracking-[-1px]',
          'no-underline text-ink',
          'max-md:text-[25px]',
          'max-xs:text-[23px]',
        ].join(' ')}
      >
        <svg width="29" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path
            d="M6 5h12l8 8v14H6V5ZM18 5v8h8M11 18h10M11 22h7"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
        <span>
          Pageforge<span className="accent text-rust">.</span>
        </span>
      </Link>
      <span className="nav-caption text-[12px] text-muted tracking-[2px] max-md:hidden">
        給文字一個安靜的地方
      </span>
      <span className="local-badge flex items-center gap-2 text-[11px] text-[#626d5d] max-sm:text-[9px]">
        <i className="inline-block size-1.5 rounded-full bg-[#758467]" />
        本機閱讀空間
      </span>
    </header>
  )
}

const styles = {
  topNav: [
    'top-nav h-22',
    '[padding:0_max(32px,_calc((100vw_-_1240px)_/_2))]',
    'flex items-center justify-between border-b border-solid border-b-line gap-6',
    'max-md:h-18 max-md:py-0 max-md:px-6',
    'max-sm:py-0 max-sm:px-5',
    'max-xs:gap-3',
  ].join(' '),
}
