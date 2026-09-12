const DASH = '–';

export const pct = (v: number | undefined, digits = 2): string =>
  v === undefined || !Number.isFinite(v) ? DASH : `${v.toFixed(digits)}%`;

export const bps = (v: number | undefined): string => {
  if (v === undefined || !Number.isFinite(v)) return DASH;
  const n = Math.round(v * 100);
  return `${n > 0 ? '+' : ''}${n} bp`;
};

export const ratio = (v: number | undefined): string =>
  v === undefined || !Number.isFinite(v) ? DASH : v.toFixed(2);

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** `2026-08` becomes `Aug 2026`; `2026-09-11` becomes `11 Sep 2026`. */
export function formatPeriod(period: string | undefined): string {
  if (!period) return DASH;
  const parts = period.split('-');
  const year = parts[0];
  const month = Number(parts[1]);
  if (!year || !month) return period;
  const name = MONTHS[month - 1] ?? '';
  return parts[2] ? `${Number(parts[2])} ${name} ${year}` : `${name} ${year}`;
}
