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
      className={`book-cover cover-${book.coverStyle ?? book.id}`}
      style={{ backgroundColor: book.color, color: book.ink }}
    >
      <span className="cover-edition">
        PAGEFORGE COLLECTION / {book.coverStyle ?? book.id.padStart(2, '0')}
      </span>
      <span className="cover-title">{book.title}</span>
      <span className="cover-subtitle">{book.subtitle}</span>
      <div className="cover-art" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <span className="cover-author">{book.author}</span>
    </div>
  )
}
export function BookCard({ book, onOpen }: { book: Book; onOpen: (book: Book) => void }) {
  return (
    <button className="book-card" onClick={() => onOpen(book)} aria-label={`預覽 ${book.title}`}>
      <div className="cover-stage">
        <BookCover book={book} />
        <span className="format-label">{book.format}</span>
      </div>
      <div className="book-meta">
        <span className="book-category">{book.category}</span>
        <h3>{book.title}</h3>
        <p>{book.author}</p>
      </div>
      <div className="book-progress">
        <span className="progress-track">
          <span style={{ width: `${book.progress}%` }} />
        </span>
        <span>
          {book.progress === 0 ? '未開始' : book.progress === 100 ? '已讀完' : `${book.progress}%`}
        </span>
      </div>
    </button>
  )
}
