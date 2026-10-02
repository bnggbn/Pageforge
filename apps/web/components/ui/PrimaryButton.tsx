import type { ComponentProps } from 'react'

type Props = ComponentProps<'button'> & { size?: 'default' | 'small' }

export function PrimaryButton({ size = 'default', className = '', ...props }: Props) {
  return <button {...props} className={`${buttonClasses} ${sizeClasses[size]} ${className}`} />
}

const buttonClasses = [
  'primary-button flex items-center gap-2.5 rounded-[5px] border-0 bg-ink text-surface',
  'px-[21px] py-[13px] hover:bg-rust',
  '[&>span]:text-[20px] [&>span]:leading-none [&>span]:font-light',
  'max-md:px-3.5 max-md:py-[11px] max-md:whitespace-nowrap',
  'max-sm:px-3 max-sm:py-2.5',
].join(' ')

const sizeClasses = {
  default: 'text-[12px] max-md:text-[11px]',
  small: 'text-[11px]',
}
