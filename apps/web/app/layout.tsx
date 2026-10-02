import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pageforge',
  description: 'Pageforge — Document Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <body className="antialiased">{children}</body>
    </html>
  )
}
