import { useAppStore } from '@/state/store';
import { formatInteger } from '@/utils/formatters';

type Props = {
  totalRows: number;
  page: number;
  pageSize: number;
  pageCount: number;
  rangeStart: number;
  rangeEnd: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

const PAGE_SIZES = [50, 100, 250, 500];

export function TablePager({
  totalRows,
  page,
  pageSize,
  pageCount,
  rangeStart,
  rangeEnd,
  onPageChange,
  onPageSizeChange
}: Props) {
  const uiLang = useAppStore((state) => state.uiLang);
  const t = uiLang === 'fr'
    ? { showing: 'Affichage', of: 'sur', rowsPerPage: 'Lignes par page', prev: 'Préc.', next: 'Suiv.', page: 'Page', rows: 'lignes' }
    : { showing: 'Showing', of: 'of', rowsPerPage: 'Rows per page', prev: 'Prev', next: 'Next', page: 'Page', rows: 'rows' };

  return <section className="card p-3 mb-3">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="text-xs text-[var(--text-muted)]">
        {t.showing} {rangeStart}-{rangeEnd} {t.of} {formatInteger(totalRows)} {t.rows}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-[var(--text-muted)]">
          {t.rowsPerPage}
          <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="card px-2 py-1 block mt-1">
            {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button type="button" className="card px-3 py-2 text-xs" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>
            {t.prev}
          </button>
          <div className="text-xs text-[var(--text-muted)] min-w-[4.5rem] text-center">
            {t.page} {page} / {pageCount}
          </div>
          <button type="button" className="card px-3 py-2 text-xs" disabled={page >= pageCount} onClick={() => onPageChange(Math.min(pageCount, page + 1))}>
            {t.next}
          </button>
        </div>
      </div>
    </div>
  </section>;
}
