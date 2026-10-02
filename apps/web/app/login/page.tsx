'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const blockCopy = (e: React.ClipboardEvent) => e.preventDefault()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // TODO: connect real auth
    router.push('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary mb-4">
            <span className="text-white font-bold text-lg">P</span>
          </div>
          <h1 className="text-2xl font-bold text-text">歡迎回來</h1>
          <p className="text-text-muted text-sm mt-1">登入你的 Pageforge 帳號</p>
        </div>

        {/* Card */}
        <div className="bg-surface rounded-2xl shadow-sm border border-gray-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">電子郵件</label>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-primary transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-text">密碼</label>
                <button type="button" className="text-xs text-primary hover:underline">
                  忘記密碼？
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onCopy={blockCopy}
                  onCut={blockCopy}
                  onContextMenu={(e) => e.preventDefault()}
                  required
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-primary transition-colors select-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors p-1 rounded"
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="w-full bg-primary text-white rounded-xl py-3 text-sm font-semibold hover:bg-primary-hover transition-colors mt-2"
            >
              登入
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-text-muted mt-6">© 2025 Pageforge. 保留所有權利。</p>
      </div>
    </div>
  )
}
