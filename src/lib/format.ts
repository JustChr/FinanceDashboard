import { locale, t } from '../i18n';

const DASH = '–';

/** Grouping and decimal marks. Austrian pages write 300.000 and 3,45, which `de-DE` produces everywhere. */
const NUMBER_LOCALE = locale === 'de' ? 'de-DE' : 'en-GB';

const valid = (v: number | undefined | null): v is number => v !== undefined && v !== null && Number.isFinite(v);

/** A fixed number of decimals with the page's decimal mark: `3.45` or `3,45`. */
export function num(v: number, digits = 2): string {
  const s = v.toFixed(digits);
  return locale === 'de' ? s.replace('.', ',') : s;
}

/** As many decimals as the value has, up to three: axis ticks, fixation periods. */
export const decimal = (v: number): string => v.toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: 3 });

/** German sets the per-cent sign apart, held to its number by a no-break space. */
export const PERCENT = locale === 'de' ? ' %' : '%';

export const pct = (v: number | undefined | null, digits = 2): string =>
  valid(v) ? `${num(v, digits)}${PERCENT}` : DASH;

export const bps = (v: number | undefined | null): string => {
  if (!valid(v)) return DASH;
  const n = Math.round(v * 100);
  return `${n > 0 ? '+' : ''}${n} ${t.format.bp}`;
};

/** Unsigned basis points, for gaps where the direction is stated in words. */
export const bpsAbs = (v: number | undefined | null): string =>
  valid(v) ? `${Math.abs(Math.round(v * 100))} ${t.format.bp}` : DASH;

/** A change in a share, in percentage points: `+3.1 pp`. */
export const pp = (v: number | undefined | null): string => {
  if (!valid(v)) return DASH;
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? '+' : ''}${num(r, 1)} ${t.format.pp}`;
};

export const ratio =(v: number | undefined | null): string => (valid(v) ? num(v, 2) : DASH);

/** An amount in millions as billions, one decimal: axis ticks. */
export const eurBillions = (millions: number): string => t.format.billions(num(millions / 1000, 1));

/** An amount in millions to the million, grouped: tooltips. */
export const eurMillionsFull = (millions: number): string =>
  t.format.millions(Math.round(millions).toLocaleString(NUMBER_LOCALE));

/** MIR volumes arrive in millions of euro. */
export function eurMillions(v: number | undefined | null): string {
  if (!valid(v)) return DASH;
  if (Math.abs(v) >= 1000) return eurBillions(v);
  return t.format.millions(String(Math.round(v)));
}

export function eur(v: number | undefined | null): string {
  if (!valid(v)) return DASH;
  return t.format.euro(v.toLocaleString(NUMBER_LOCALE));
}

export const years = (v: number | undefined): string => (valid(v) ? `${num(v, 1)} ${t.format.yrs}` : DASH);

/** `2026-08` becomes `Aug 2026`; `2026-09-11` becomes `11 Sep 2026` (German: `11. Sep 2026`). */
export function formatPeriod(period: string | undefined): string {
  if (!period) return DASH;
  const parts = period.split('-');
  const year = parts[0];
  const month = Number(parts[1]);
  if (!year || !month) return period;
  const name = t.format.months[month - 1] ?? '';
  return parts[2] ? t.format.day(Number(parts[2]), name, year) : `${name} ${year}`;
}

/** Deposit terms read better as years once they pass a year. */
export function formatTerm(months: number | null): string {
  if (months === null) return t.format.instantAccess;
  if (months % 12 === 0 && months >= 12) return t.format.termYears(months / 12);
  return t.format.termMonths(months);
}

/** Axis-length term: "Instant", "6m", "2y". */
export function termShort(months: number): string {
  if (months <= 0) return t.format.instant;
  return months < 12 ? t.format.monthsShort(decimal(months)) : t.format.yearsShort(decimal(months / 12));
}

/** Axis-length fixation: "Variable", "10y". */
export const fixationShort = (years: number): string =>
  years === 0 ? t.format.variable : t.format.yearsShort(decimal(years));

/** Sentence-length fixation: "Variable rate", "Fixed for 10 years"; `null` is fixed for the whole term. */
export function fixationLong(years: number | null): string {
  if (years === null) return t.format.fixedWholeTerm;
  return years === 0 ? t.format.variableRate : t.format.fixedFor(decimal(years));
}

/**
 * A label used mid-sentence: "Fixed for 10 years" → "fixed for 10 years".
 * Only the first letter changes, so German nouns keep their capitals.
 */
export const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * A product name as the page shows it. The names are the banks' own and stay
 * as they are; only the rung the scraper appends after a comma — "Tagesgeld,
 * promotional" — is a word of ours, and translated.
 */
export function productName(product: string): string {
  const match = /^(.*), ([^,]+)$/.exec(product);
  const rung = match ? t.format.rungs[match[2] ?? ''] : undefined;
  return match && rung ? `${match[1]}, ${rung}` : product;
}

/** Escapes text for the HTML tooltips ECharts renders; bank names are data. */
export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A date as "14 Sep 2026", for ISO dates from the scrape. */
export const day = (iso: string | null | undefined): string =>
  iso ? formatPeriod(iso.slice(0, 10)) : DASH;
