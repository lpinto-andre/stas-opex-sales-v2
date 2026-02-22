export const toFiscalYear = (date: Date): number => (date.getMonth() + 1 >= 5 ? date.getFullYear() + 1 : date.getFullYear());

export const parseDate = (value: unknown): Date | null => {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const ms = (value - 25569) * 86400 * 1000;
    return new Date(ms);
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
};
