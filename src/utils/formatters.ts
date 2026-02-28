const integerFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const asFiniteNumber = (value: number) => (Number.isFinite(value) ? value : 0);

export const formatInteger = (value: number) => integerFormatter.format(Math.round(asFiniteNumber(value)));

export const formatCurrency = (value: number) => `$${formatInteger(value)}`;

export const formatPercent = (value: number) => `${formatInteger(asFiniteNumber(value) * 100)}%`;

export const formatFixed = (value: number, digits = 2) => asFiniteNumber(value).toFixed(Math.max(0, digits));
