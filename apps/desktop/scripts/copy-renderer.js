/**
 * Cross-platform script: copies apps/web/out → apps/desktop/renderer/
 * Run after `next build` in apps/web.
 */
const { cpSync, rmSync, existsSync } = require('fs')
const { join } = require('path')

const src = join(__dirname, '..', '..', 'web', 'out')
const dest = join(__dirname, '..', 'renderer')

if (!existsSync(src)) {
  console.error(`Error: web build not found at ${src}`)
  console.error('Run `pnpm build:web` from the repo root first.')
  process.exit(1)
}

if (existsSync(dest)) {
  rmSync(dest, { recursive: true })
}

cpSync(src, dest, { recursive: true })
console.log(`Renderer copied: ${src} → ${dest}`)
