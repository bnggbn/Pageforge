import type { ComponentProps } from 'react'

// The article owns typography for Markdown, plain text, EPUB and spreadsheet content.
export function DocumentProse(props: Omit<ComponentProps<'article'>, 'className'>) {
  return <article {...props} className={proseClasses} />
}

const proseClasses = [
  'document-prose max-w-202.5 pt-12.5 px-15 pb-25 m-auto leading-[1.95] wrap-anywhere',
  '[&_h1]:font-display [&_h1]:leading-[1.5] [&_h1]:font-semibold [&_h1]:mt-[1.5em]',
  '[&_h1]:mx-0 [&_h1]:mb-[0.7em] [&_h1]:text-[1.8em]',
  '[&_h2]:font-display [&_h2]:leading-[1.5] [&_h2]:font-semibold [&_h2]:mt-[1.5em]',
  '[&_h2]:mx-0 [&_h2]:mb-[0.7em] [&_h2]:text-[1.4em]',
  '[&_h3]:font-display [&_h3]:leading-[1.5] [&_h3]:font-semibold [&_h3]:mt-[1.5em]',
  '[&_h3]:mx-0 [&_h3]:mb-[0.7em] [&_h3]:text-[1.2em]',
  '[&_h4]:font-display [&_h4]:leading-[1.5] [&_h4]:font-semibold [&_h4]:mt-[1.5em]',
  '[&_h4]:mx-0 [&_h4]:mb-[0.7em]',
  '[&_p]:my-[1em] [&_p]:mx-0',
  '[&_>_:first-child]:mt-0',
  '[&_ul]:pl-[1.5em] [&_ul]:my-[1em] [&_ul]:mx-0 [&_ul]:list-disc',
  '[&_ol]:pl-[1.5em] [&_ol]:my-[1em] [&_ol]:mx-0 [&_ol]:list-decimal',
  '[&_li]:pl-[0.2em]',
  '[&_a]:text-rust [&_a]:underline',
  '[&_a]:[text-underline-offset:3px]',
  '[&_blockquote]:py-2 [&_blockquote]:px-5 [&_blockquote]:my-[1.5em] [&_blockquote]:mx-0',
  '[&_blockquote]:bg-[#f2f2e9] [&_blockquote]:border-l-2 [&_blockquote]:border-solid',
  '[&_blockquote]:border-l-[#a8b296] [&_blockquote]:text-[#67735d]',
  '[&_pre]:bg-[#f1f0e8] [&_pre]:p-5 [&_pre]:rounded-[5px] [&_pre]:overflow-auto',
  '[&_pre]:text-[0.8em] [&_pre]:leading-[1.7]',
  '[&_code]:font-code [&_code]:bg-[#f1f0e8] [&_code]:py-0.5 [&_code]:px-1',
  '[&_code]:text-[0.85em]',
  '[&_pre_code]:p-0 [&_pre_code]:bg-transparent',
  '[&_hr]:my-[2em] [&_hr]:mx-0 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-solid',
  '[&_hr]:border-t-line',
  '[&_table]:border-collapse [&_table]:text-[0.8em] [&_table]:w-full',
  '[&_th]:py-[9px] [&_th]:px-3.5 [&_th]:border [&_th]:border-solid [&_th]:border-line',
  '[&_th]:text-left [&_th]:min-w-20 [&_th]:max-w-80 [&_th]:whitespace-pre-wrap',
  '[&_th]:bg-[#eeefe5] [&_th]:font-medium',
  '[&_td]:py-[9px] [&_td]:px-3.5 [&_td]:border [&_td]:border-solid [&_td]:border-line',
  '[&_td]:text-left [&_td]:min-w-20 [&_td]:max-w-80 [&_td]:whitespace-pre-wrap',
  '[&_tr:nth-child(even)_td]:bg-[#f8f7f1]',
  'max-lg:pt-[35px] max-lg:px-8 max-lg:pb-20',
  'max-md:pt-7 max-md:px-5.5 max-md:pb-15',
].join(' ')
