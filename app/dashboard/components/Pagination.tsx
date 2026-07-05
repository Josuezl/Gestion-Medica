import Link from 'next/link'

// Paginación truncada: primera, última y ±2 alrededor de la actual, con '…' en los huecos.
function paginationItems(currentPage: number, totalPages: number): (number | 'gap')[] {
  const items: (number | 'gap')[] = []
  for (let page = 1; page <= totalPages; page++) {
    if (page === 1 || page === totalPages || Math.abs(page - currentPage) <= 2) {
      items.push(page)
    } else if (items[items.length - 1] !== 'gap') {
      items.push('gap')
    }
  }
  return items
}

interface PaginationProps {
  currentPage: number
  totalPages: number
  basePath: string
  searchQuery?: string
}

export default function Pagination({ currentPage, totalPages, basePath, searchQuery }: PaginationProps) {
  if (totalPages <= 1) return null

  const pageHref = (page: number) =>
    `${basePath}?page=${page}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`

  return (
    <div style={{ padding: '1.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', flexWrap: 'wrap' }}>
      {currentPage > 1 && (
        <Link href={pageHref(currentPage - 1)} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
          ‹ Anterior
        </Link>
      )}
      {paginationItems(currentPage, totalPages).map((item, i) =>
        item === 'gap' ? (
          <span key={`gap-${i}`} style={{ padding: '0.5rem 0.25rem', color: '#64748b' }}>…</span>
        ) : (
          <Link
            key={item}
            href={pageHref(item)}
            className={`btn ${currentPage === item ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.5rem 1rem', minWidth: '40px' }}
          >
            {item}
          </Link>
        )
      )}
      {currentPage < totalPages && (
        <Link href={pageHref(currentPage + 1)} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
          Siguiente ›
        </Link>
      )}
    </div>
  )
}
