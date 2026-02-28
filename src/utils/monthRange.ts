export const isValidMonth = (value: string) => /^\d{4}-\d{2}$/.test(value);

export const safeMonthInput = (value: string) => (/^\d{0,4}(?:-\d{0,2})?$/.test(value) ? value : null);

export const monthStart = (value: string) => (isValidMonth(value) ? `${value}-01` : '');

export const monthEnd = (value: string) => {
  if (!isValidMonth(value)) return '';
  const [year, month] = value.split('-').map(Number);
  const date = new Date(year, month, 0);
  return `${year}-${String(month).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
