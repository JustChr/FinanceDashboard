/**
 * Minimal client for the ECB Data Portal SDMX REST API.
 *
 * The API is public, key-less and sends `Access-Control-Allow-Origin: *`, so the
 * browser can call it directly — no proxy and therefore no backend. That is what
 * makes this dashboard viable on GitHub Pages.
 *
 * Docs: https://data.ecb.europa.eu/help/api/data
 */

const BASE = 'https://data-api.ecb.europa.eu/service/data';

export interface Observation {
  /** ISO-ish period as published: `2026-08` monthly, `2026-09-11` daily. */
  period: string;
  value: number;
}

export interface Series {
  /** Full SDMX key, e.g. `MIR.M.AT.B.A2C.A.R.A.2250.EUR.N`. */
  key: string;
  title: string;
  unit: string;
  observations: Observation[];
}

/**
 * Parses RFC4180-ish CSV. A hand-rolled `split(',')` corrupts this feed: ECB
 * `TITLE_COMPL` values routinely embed commas inside double quotes.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export interface QueryOptions {
  /** Inclusive start period, e.g. `2019-01`. */
  startPeriod?: string;
  /** Trailing-window shortcut; ignored when `startPeriod` is set. */
  lastNObservations?: number;
  /**
   * `dataonly` drops the attribute columns. This matters enormously: ECB CSV
   * repeats the full `TITLE_COMPL` on every observation row, so seven years of
   * the Austrian MIR block is 5 MB at `full` versus 68 KB at `dataonly`.
   */
  detail?: 'full' | 'dataonly';
  signal?: AbortSignal;
}

/**
 * Fetches one SDMX query and groups the flat CSV rows back into series.
 *
 * `key` may use SDMX wildcards (empty segment) and `+` alternation, so several
 * related series travel in a single round trip — e.g.
 * `M.AT.B.L21+L22.A.R.A.2250.EUR.N`.
 */
export async function fetchSeries(
  dataflow: string,
  key: string,
  options: QueryOptions = {},
): Promise<Series[]> {
  const params = new URLSearchParams({
    format: 'csvdata',
    detail: options.detail ?? 'dataonly',
  });
  if (options.startPeriod) {
    params.set('startPeriod', options.startPeriod);
  } else if (options.lastNObservations) {
    params.set('lastNObservations', String(options.lastNObservations));
  }

  const url = `${BASE}/${dataflow}/${key}?${params}`;
  const res = await fetch(url, {
    headers: { Accept: 'text/csv' },
    signal: options.signal,
  });

  // A query matching zero series is a 404 here, not an empty 200. Treat it as
  // "no data" so one discontinued series cannot blank the whole dashboard.
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`ECB API ${res.status} for ${dataflow}/${key}`);
  }

  const rows = parseCsv(await res.text());
  const header = rows[0];
  if (!header || rows.length < 2) return [];

  const col = (name: string) => header.indexOf(name);
  const iKey = col('KEY');
  const iPeriod = col('TIME_PERIOD');
  const iValue = col('OBS_VALUE');
  const iTitle = col('TITLE');
  const iUnit = col('UNIT');

  const grouped = new Map<string, Series>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length <= iValue) continue;

    const seriesKey = row[iKey] ?? '';
    const period = row[iPeriod] ?? '';
    const raw = row[iValue] ?? '';
    if (!seriesKey || !period || raw === '') continue;

    const value = Number(raw);
    if (!Number.isFinite(value)) continue;

    let series = grouped.get(seriesKey);
    if (!series) {
      series = {
        key: seriesKey,
        title: (iTitle >= 0 ? row[iTitle] : '')?.trim() || seriesKey,
        unit: (iUnit >= 0 ? row[iUnit] : '') ?? '',
        observations: [],
      };
      grouped.set(seriesKey, series);
    }
    series.observations.push({ period, value });
  }

  // The API does not guarantee chronological order across a multi-series query.
  for (const series of grouped.values()) {
    series.observations.sort((a, b) => a.period.localeCompare(b.period));
  }
  return [...grouped.values()];
}

export const latest = (s: Series | undefined): Observation | undefined =>
  s?.observations[s.observations.length - 1];

/** Observation at or immediately before `period` — for "vs 12 months ago". */
export function observationAt(
  s: Series | undefined,
  period: string,
): Observation | undefined {
  if (!s) return undefined;
  let found: Observation | undefined;
  for (const o of s.observations) {
    if (o.period <= period) found = o;
    else break;
  }
  return found;
}

/** Shifts a `YYYY-MM` period by a number of months. */
export function shiftMonths(period: string, months: number): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
