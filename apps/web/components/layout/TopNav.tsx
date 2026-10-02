import Link from 'next/link'
export function TopNav() {
  return <header className="top-nav"><Link href="/" className="brand"><svg width="29" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M6 5h12l8 8v14H6V5ZM18 5v8h8M11 18h10M11 22h7" stroke="currentColor" strokeWidth="1.6" /></svg><span>Pageforge<span className="accent">.</span></span></Link><span className="nav-caption">給文字一個安靜的地方</span><span className="local-badge"><i />本機閱讀空間</span></header>
}
