export interface Book {
  id: string
  title: string
  author: string
  color: string
  ink: string
  progress: number
  format: 'MD' | 'TXT' | 'PDF' | 'EPUB' | 'XLSX'
  coverStyle?: string
  category: string
  subtitle: string
}
export function BookCover({ book }: { book: Book }) {
  return (
    <div
      className={`${styles.bookCover} cover-${book.coverStyle ?? book.id} ${coverStyles[book.coverStyle ?? book.id] ?? ''}`}
      style={{ backgroundColor: book.color, color: book.ink }}
    >
      <span
        className={[
          'cover-edition text-[5px] tracking-[1.3px] opacity-70',
          'max-sm:text-[4px] max-sm:tracking-[0.8px]',
        ].join(' ')}
      >
        PAGEFORGE COLLECTION / {book.coverStyle ?? book.id.padStart(2, '0')}
      </span>
      <span className={styles.coverTitle}>{book.title}</span>
      <span
        className={[
          'cover-subtitle text-[5px] tracking-[1.2px] leading-[1.6] mt-2.5 opacity-75 z-1',
          'max-sm:text-[4px] max-sm:tracking-[0.6px]',
        ].join(' ')}
      >
        {book.subtitle}
      </span>
      <div className={styles.coverArt} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <span className="cover-author mt-auto text-[7px] tracking-[0.5px] z-1">{book.author}</span>
    </div>
  )
}
export function BookCard({ book, onOpen }: { book: Book; onOpen: (book: Book) => void }) {
  return (
    <button
      className={styles.bookCard}
      onClick={() => onOpen(book)}
      aria-label={`預覽 ${book.title}`}
    >
      <div
        className={[
          'cover-stage relative pt-3 px-3 pb-[17px] bg-[#eeece5] rounded-[5px]',
          'max-lg:pt-4.5 max-lg:px-7 max-lg:pb-5.5',
          'max-md:pt-2.5 max-md:px-3 max-md:pb-4.5',
        ].join(' ')}
      >
        <BookCover book={book} />
        <span
          className={[
            'format-label absolute bottom-[7px] right-[7px] text-[8px] text-[#797d70] bg-[#f8f6ef]',
            'py-0.5 px-[5px] rounded-[2px]',
          ].join(' ')}
        >
          {book.format}
        </span>
      </div>
      <div className={styles.bookMeta}>
        <span className="book-category text-[#929384] text-[9px] tracking-[0.7px]">
          {book.category}
        </span>
        <h3>{book.title}</h3>
        <p>{book.author}</p>
      </div>
      <div
        className={[
          'book-progress mt-3.5 flex items-center gap-2.5 text-[9px] text-[#858b77]',
          '[&_>_span:last-child]:min-w-[29px] [&_>_span:last-child]:text-right',
        ].join(' ')}
      >
        <span
          className={[
            'progress-track block h-0.5 flex-1 bg-[#dbddcf] overflow-hidden',
            '[&_>_span]:block [&_>_span]:h-full [&_>_span]:bg-[#7c8969]',
          ].join(' ')}
        >
          <span style={{ width: `${book.progress}%` }} />
        </span>
        <span>
          {book.progress === 0 ? '未開始' : book.progress === 100 ? '已讀完' : `${book.progress}%`}
        </span>
      </div>
    </button>
  )
}

const styles = {
  bookCover: [
    'book-cover aspect-[2/3] relative pt-[17px] pr-[15px] pb-4 pl-[19px] flex flex-col',
    'overflow-hidden',
    '[border-radius:1px_3px_3px_1px]',
    'shadow-[5px_6px_9px_#22271c22,_1px_0_0_#ffffff50_inset]',
    "before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0",
    'before:w-2',
    'before:[background:linear-gradient(90deg,_#0002,_#ffffff15_55%,_#0001)]',
    'before:border-r before:border-solid before:border-r-[#0000000d]',
    'max-sm:pt-[15px] max-sm:pr-3 max-sm:pb-3.5 max-sm:pl-4',
  ].join(' '),
  coverTitle: [
    'cover-title font-display text-[23px] leading-[1.15] mt-[15px] tracking-[-0.5px]',
    'font-medium z-1',
    'max-xl:text-[21px]',
    'max-lg:text-[28px]',
    'max-md:text-[22px]',
    'max-sm:text-[clamp(16px,_5.2vw,_22px)]',
  ].join(' '),
  coverArt: [
    'cover-art absolute left-[30%] right-[16%] top-[46%] bottom-[16%]',
    '[&_i]:absolute [&_i]:border [&_i]:border-solid [&_i]:border-current [&_i]:w-full',
    '[&_i]:h-full [&_i]:rounded-[50%] [&_i]:opacity-50',
    '[&_i:nth-child(2)]:[transform:translateX(-15%)_scale(0.8)]',
    '[&_i:nth-child(3)]:[transform:translateX(15%)_scale(0.6)]',
  ].join(' '),
  bookCard: [
    'book-card min-w-0 border-0 p-0 bg-transparent text-ink w-full',
    '[&_.book-cover]:[transition:transform_0.25s,_box-shadow_0.25s]',
    '[&:hover_.book-cover]:[transform:translateY(-6px)_rotate(-2deg)]',
    '[&:hover_.book-cover]:shadow-[7px_12px_14px_#22271c25]',
  ].join(' '),
  bookMeta: [
    'book-meta mt-[17px]',
    '[&_h3]:text-[12px] [&_h3]:font-semibold [&_h3]:leading-[1.55] [&_h3]:mt-[5px]',
    '[&_h3]:mx-0 [&_h3]:mb-1 [&_h3]:min-h-9.5 [&_h3]:wrap-anywhere',
    '[&_p]:text-[10px] [&_p]:text-muted [&_p]:m-0 [&_p]:min-h-4',
    'max-lg:[&_h3]:min-h-auto',
    'max-md:mt-3',
    'max-sm:[&_h3]:min-h-[37px]',
    'max-sm:[&_p]:text-[9px]',
  ].join(' '),
}

const coverStyles: Record<string, string> = {
  '1': [
    'cover-1',
    '[&_.cover-art]:left-[22%] [&_.cover-art]:right-[22%] [&_.cover-art]:top-[44%]',
    '[&_.cover-art]:bottom-[17%]',
    '[&_.cover-art_i:nth-child(2)]:hidden',
    '[&_.cover-art_i:nth-child(3)]:hidden',
  ].join(' '),
  '2': [
    'cover-2',
    '[&_.cover-title]:leading-[1.65] [&_.cover-title]:text-[21px]',
    '[&_.cover-title]:tracking-[1px]',
    '[&_.cover-art]:[transform:rotate(-25deg)]',
    '[&_.cover-art]:top-[57%] [&_.cover-art]:bottom-[16%]',
    '[&_.cover-art_i]:rounded-[0]',
    'max-sm:[&_.cover-title]:text-[clamp(16px,_5vw,_21px)]',
  ].join(' '),
  '3': [
    'cover-3',
    '[&_.cover-art_i]:rounded-[0]',
    '[&_.cover-art]:top-[62%] [&_.cover-art]:bottom-[17%]',
    '[&_.cover-art]:[transform:rotate(45deg)]',
    '[&_.cover-title]:text-[19px]',
    'max-sm:[&_.cover-title]:text-[clamp(15px,_4.5vw,_19px)]',
  ].join(' '),
  '4': [
    'cover-4',
    '[&_.cover-title]:text-[29px]',
    '[&_.cover-art]:top-[52%] [&_.cover-art]:bottom-[24%] [&_.cover-art]:left-[19%]',
    '[&_.cover-art]:right-[19%]',
    '[&_.cover-art_i]:[border-radius:70%_0]',
    '[&_.cover-art_i]:[transform:rotate(45deg)]',
    '[&_.cover-art_i:nth-child(2)]:[transform:rotate(45deg)_scale(0.35)]',
    '[&_.cover-art_i:nth-child(2)]:bg-current',
    '[&_.cover-art_i:nth-child(3)]:hidden',
    'max-sm:[&_.cover-title]:text-[clamp(22px,_6vw,_27px)]',
  ].join(' '),
  '5': [
    'cover-5',
    '[&_.cover-title]:leading-[1.65] [&_.cover-title]:text-[21px]',
    '[&_.cover-title]:tracking-[1px]',
    '[&_.cover-art]:top-[58%] [&_.cover-art]:bottom-[16%]',
    '[&_.cover-art]:[transform:rotate(15deg)]',
    '[&_.cover-art_i]:rounded-[0]',
    '[&_.cover-art_i]:[border-width:0_0_1px]',
    'max-sm:[&_.cover-title]:text-[clamp(16px,_5vw,_21px)]',
  ].join(' '),
  '6': [
    'cover-6',
    '[&_.cover-title]:text-[30px]',
    '[&_.cover-art]:top-[54%] [&_.cover-art]:bottom-[18%]',
    '[&_.cover-art]:[transform:rotate(-30deg)]',
    '[&_.cover-art_i]:rounded-[0]',
    'max-sm:[&_.cover-title]:text-[clamp(22px,_6vw,_27px)]',
  ].join(' '),
}
