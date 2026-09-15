/**
 * Pieces the product pages share: turning quotes into curve lines, histories
 * into step lines, the list of recent repricings, and which sources a page
 * owes its reader.
 */

import type { EcbData, LoadState, OfferData } from '../lib/data';
import type { WindowId } from '../lib/catalog';
import {
  hasBasis,
  type OfferBoard,
  type OfferCategory,
  type OfferSource,
  type QuoteBasis,
  type QuoteHistory,
  type QuoteSeries,
  type Repricing,
} from '../lib/offers';
import { byName, groupBy, stepPoints, type LenderStyle, type Quote } from '../lib/quotes';
import { bps, formatPeriod, pct } from '../lib/format';
import type { CurveLine, StepLine } from './charts';

export interface PageProps {
  offers: OfferData;
  ecb: LoadState<EcbData>;
  ecbWindow: WindowId;
  onWindow: (id: WindowId) => void;
}

export type Range = '1y' | '3y' | 'all';

export const RANGES: { id: Range; label: string }[] = [
  { id: '1y', label: '1Y' },
  { id: '3y', label: '3Y' },
  { id: 'all', label: 'All' },
];

const shiftDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Calendar extent of a history chart; "All" never shows less than a year. */
export function historyWindow(range: Range, today: string, earliest: string | undefined) {
  const yearAgo = shiftDays(today, -365);
  const start =
    range === '1y'
      ? yearAgo
      : range === '3y'
        ? shiftDays(today, -3 * 365)
        : earliest && earliest < yearAgo
          ? earliest
          : yearAgo;
  return { start, end: shiftDays(today, 14) };
}

/** Every lender a page could draw, from today's board and from its history. */
export function allLenders(quotes: Quote[], history: QuoteHistory | undefined): string[] {
  return [
    ...new Set([...quotes.map((q) => q.lender), ...Object.values(history?.series ?? {}).map((s) => s.provider)]),
  ].sort(byName);
}

/** How much each lender puts on a page: today's quotes plus recorded episodes. */
export function lenderWeights(quotes: Quote[], history: QuoteHistory | undefined): Map<string, number> {
  const weights = new Map<string, number>();
  const add = (name: string, n: number) => weights.set(name, (weights.get(name) ?? 0) + n);
  for (const q of quotes) add(q.lender, 1);
  for (const s of Object.values(history?.series ?? {})) add(s.provider, s.episodes.length);
  return weights;
}

export function buildCurveLines(options: {
  quotes: Quote[];
  styles: Map<string, LenderStyle>;
  dodge: Map<string, number>;
  toAxis: (x: number) => number;
  value: (q: Quote) => number | null;
  tip: (q: Quote) => string;
}): CurveLine[] {
  const { quotes, styles, dodge, toAxis, value, tip } = options;
  const families = [...groupBy(quotes, (q) => q.family)].sort(
    ([a, qa], [b, qb]) => qb.length - qa.length || byName(a, b),
  );
  const drawn = new Map<string, number>();
  const lines: CurveLine[] = [];

  for (const [, members] of families) {
    const lender = members[0]?.lender ?? '';
    const style = styles.get(lender);
    const points = members
      .map((q) => ({ q, y: value(q) }))
      .filter((p): p is { q: Quote; y: number } => p.y !== null)
      .sort((a, b) => a.q.x - b.q.x);
    if (!style || points.length === 0) continue;

    const previous = drawn.get(lender) ?? 0;
    drawn.set(lender, previous + 1);
    lines.push({
      name: lender,
      color: style.color,
      symbol: style.symbol,
      // A lender's second product at the same rungs is dashed; its main ladder stays solid.
      dashed: previous > 0,
      connect: new Set(points.map((p) => p.q.x)).size > 1,
      points: points.map((p) => ({
        x: toAxis(p.q.x) + (dodge.get(lender) ?? 0),
        y: p.y,
        hollow: p.q.stale,
        tip: tip(p.q),
      })),
    });
  }
  return lines;
}

export function buildHistoryLines(options: {
  history: QuoteHistory | undefined;
  include: (series: QuoteSeries) => boolean;
  basis: QuoteBasis;
  category: OfferCategory;
  styles: Map<string, LenderStyle>;
  label: (series: QuoteSeries) => string;
  scale?: number;
}): { lines: StepLine[]; missing: string[]; earliest: string | undefined } {
  const { history, include, basis, category, styles, label, scale = 1 } = options;
  const picked = Object.values(history?.series ?? {})
    .filter(include)
    .sort((a, b) => byName(a.provider, b.provider) || b.episodes.length - a.episodes.length);

  const drawn = new Map<string, number>();
  const lines: StepLine[] = picked
    .filter((s) => hasBasis(s, basis))
    .map((series) => {
      const previous = drawn.get(series.provider) ?? 0;
      drawn.set(series.provider, previous + 1);
      return {
        name: series.provider,
        label: label(series),
        color: styles.get(series.provider)?.color ?? '#888',
        dashed: previous > 0,
        points: stepPoints(series, basis, category).map(
          ([date, v]): [string, number | null] => [date, v === null ? null : v * scale],
        ),
      };
    });

  const missing = [
    ...new Set(picked.filter((s) => !hasBasis(s, basis)).map((s) => s.provider)),
  ].filter((p) => !lines.some((l) => l.name === p));

  const earliest = lines
    .map((l) => l.points.find((p) => p[1] !== null)?.[0])
    .filter((d): d is string => d !== undefined)
    .sort()[0];

  return { lines, missing, earliest };
}

/** A repricing's date, or the window it fell in when the evidence only brackets it. */
export const repricedWhen = (r: Repricing): string =>
  r.earliest ? `${formatPeriod(r.earliest)} – ${formatPeriod(r.date)}` : formatPeriod(r.date);

export function ChangeList({
  changes,
  styles,
  scale = 1,
  empty,
}: {
  changes: Repricing[];
  styles: Map<string, LenderStyle>;
  scale?: number;
  empty: string;
}) {
  if (changes.length === 0) return <p class="hint">{empty}</p>;
  return (
    <>
      <h3 class="subhead">Latest changes</h3>
      <ol class="changes">
        {changes.map((r) => {
          const style = styles.get(r.series.provider);
          return (
            <li key={`${r.id}-${r.date}`}>
              <span class="who">
                <i class={`sw sw-${style?.symbol ?? 'circle'}`} style={`--c:${style?.color ?? 'currentColor'}`} />
                {r.series.provider}
              </span>
              <span class="move">
                {pct(r.before * scale)} → <b>{pct(r.after * scale)}</b>
              </span>
              <span class="when">
                <time>{repricedWhen(r)}</time> ·{' '}
                <a href={r.episode.evidence} target="_blank" rel="noreferrer">
                  {r.episode.via === 'archive' ? 'archived page' : 'source'}
                </a>
              </span>
              <span class="delta">{bps((r.after - r.before) * scale)}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** What the marks on a curve mean, under the chart rather than in a paragraph. */
export function CurveKey({ band, hollow }: { band: string; hollow?: string }) {
  return (
    <p class="key">
      <span>
        <i class="k-dot" />
        Current offer
      </span>
      {hollow ? (
        <span>
          <i class="k-ring" />
          {hollow}
        </span>
      ) : null}
      <span>
        <i class="k-band" />
        {band}
      </span>
      <span class="k-hint">Click a column to follow it over time</span>
    </p>
  );
}

const UNREAD_KEYWORDS: Record<OfferCategory, RegExp> = {
  mortgage: /housing|bauspar/i,
  deposit: /savings|volksbank/i,
  consumer: /consumer/i,
};

/**
 * The sources behind one product: pages its offers link to, every source of a
 * lender whose offers link elsewhere (calculators), and the institutions listed
 * as unreadable for this product.
 */
export function sourcesFor(board: OfferBoard | undefined, category: OfferCategory): OfferSource[] {
  if (!board) return [];
  const offers = board.offers.filter((o) => o.category === category);
  const urls = new Set(offers.map((o) => o.sourceUrl));
  const byUrl = board.sources.filter((s) => urls.has(s.url));
  const covered = new Set(byUrl.map((s) => s.provider));
  const providers = new Set(offers.map((o) => o.provider));

  return board.sources.filter(
    (s) =>
      urls.has(s.url) ||
      (providers.has(s.provider) && !covered.has(s.provider)) ||
      (s.status !== 'ok' && UNREAD_KEYWORDS[category].test(s.provider)),
  );
}
