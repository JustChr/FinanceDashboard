const DASH = '–';

export const pct = (v: number | undefined | null, digits = 2): string =>
  v === undefined || v === null || !Number.isFinite(v) ? DASH : `${v.toFixed(digits)}%`;

export const bps = (v: number | undefined | null): string => {
  if (v === undefined || v === null || !Number.isFinite(v)) return DASH;
  const n = Math.round(v * 100);
  return `${n > 0 ? '+' : ''}${n} bp`;
};

/** Unsigned basis points, for gaps where the direction is stated in words. */
export const bpsAbs = (v: number | undefined | null): string =>
  v === undefined || v === null || !Number.isFinite(v) ? DASH : `${Math.abs(Math.round(v * 100))} bp`;

export const ratio = (v: number | undefined | null): string =>
  v === undefined || v === null || !Number.isFinite(v) ? DASH : v.toFixed(2);

/** MIR volumes arrive in millions of euro. */
export function eurMillions(v: number | undefined | null): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return DASH;
  if (Math.abs(v) >= 1000) return `€${(v / 1000).toFixed(1)}bn`;
  return `€${Math.round(v)}m`;
}

export function eur(v: number | undefined | null): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return DASH;
  return `€${v.toLocaleString('en-GB')}`;
}

export const years = (v: number | undefined): string =>
  v === undefined || !Number.isFinite(v) ? DASH : `${v.toFixed(1)} yrs`;

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

/** Deposit terms read better as years once they pass a year. */
export function formatTerm(months: number | null): string {
  if (months === null) return 'Instant access';
  if (months % 12 === 0 && months >= 12) {
    const y = months / 12;
    return `${y} year${y === 1 ? '' : 's'}`;
  }
  return `${months} months`;
}

/** "today", "3 days ago" — the age of a scraped rate. */
export function formatAge(days: number): string {
  if (!Number.isFinite(days)) return 'unknown';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
