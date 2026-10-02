import defaults from '../../../pageforge.config.json'

export type PublicConfig = Pick<typeof defaults, 'limits' | 'reading' | 'diff'>
export const config: PublicConfig = {
  limits: defaults.limits,
  reading: defaults.reading,
  diff: defaults.diff,
}
export function configure(value: PublicConfig): void {
  config.limits = value.limits
  config.reading = value.reading
  config.diff = value.diff
}
