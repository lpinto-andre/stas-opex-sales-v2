import { useEffect, useMemo, useState } from 'react';

export function usePaginatedRows<T>(rows: T[], defaultPageSize = 100) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  useEffect(() => {
    setPage(1);
  }, [rows.length, pageSize]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  const rangeStart = rows.length === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const rangeEnd = rows.length === 0 ? 0 : Math.min(rows.length, page * pageSize);

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    pageRows,
    rangeStart,
    rangeEnd
  };
}
