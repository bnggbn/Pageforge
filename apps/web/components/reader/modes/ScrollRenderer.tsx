import type { RenderModeProps } from '../types'

export function ScrollRenderer({ children }: RenderModeProps) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-prose mx-auto px-6 py-8">{children}</div>
    </div>
  )
}
