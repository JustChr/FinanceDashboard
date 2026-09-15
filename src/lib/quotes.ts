/**
 * The shape every offer chart draws.
 *
 * A product page plots today's offers on a curve — rate against fixation period
 * for loans, against term for savings — and each offer's history on a calendar.
 * Both need the same things from the raw board: which offers belong on one line,
 * how a lender is drawn, and where a quote's price actually held.
 */

import type { Palette } from './theme';
import {
  effectiveFrom,
  isStale,
  lapseOf,
  quoteOf,
  unseenLapseOf,
  type Offer,
  type OfferCategory,
  type QuoteBasis,
  type QuoteSeries,
} from './offers';

export type QuoteKind = 'calculator' | 'example' | 'rate sheet';

export interface Quote {
  offer: Offer;
  lender: string;
  /** Offers from one lender that belong on one connected line. */
  family: string;
  /** Fixation in years for loans, term in months for deposits; 0 is variable / instant. */
  x: number;
  nominal: number | null;
  effective: number | null;
  stale: boolean;
  kind: QuoteKind;
  /** A teaser rate that reverts, or a headline offer with strings attached. */
  promotional: boolean;
}

/** The part of a product name that says which rung it is, not which product. */
const LOAN_RUNG = /,\s*(variable|fixed|\d+y fixed|full-term fixed)$/i;
const DEPOSIT_RUNG = /,\s*(promotional|standard|base rate|headline offer)$/i;

export function quotesFor(offers: Offer[], category: OfferCategory): Quote[] {
  return offers
    .filter((o) => o.category === category)
    .map((offer) => {
      const deposit = category === 'deposit';
      const stem = offer.product.replace(deposit ? DEPOSIT_RUNG : LOAN_RUNG, '');
      return {
        offer,
        lender: offer.provider,
        family: `${offer.provider}|${stem}`,
        x: deposit ? (offer.termMonths ?? 0) : (offer.fixationYears ?? 0),
        nominal: offer.rate,
        effective: offer.effectiveRate,
        stale: isStale(offer),
        kind: deposit ? 'rate sheet' : /calculator/i.test(offer.product) ? 'calculator' : 'example',
        promotional: /promotional|headline/i.test(offer.product),
      };
    });
}

export const quoteValue = (q: Quote, basis: QuoteBasis): number | null =>
  basis === 'effective' ? q.effective : q.nominal;

export const byName = (a: string, b: string) => a.localeCompare(b, 'de', { sensitivity: 'base' });

export interface LenderStyle {
  color: string;
  /** ECharts symbol name; only lenders past the eighth hue get a second shape. */
  symbol: 'circle' | 'rect' | 'triangle' | 'diamond';
}

const SHAPES = ['circle', 'rect', 'triangle', 'diamond'] as const;

/**
 * One colour per lender, assigned across everything the page could show —
 * never by position in a filtered view, so hiding a lender repaints nobody.
 *
 * The lenders with the most data take the first slots: only the first three
 * hues stay distinguishable when every line is on screen at once, and the
 * lenders with long histories are the ones drawn next to each other most.
 * Past eight lenders the hues repeat with a different marker shape.
 */
export function lenderStyles(
  lenders: string[],
  pal: Palette,
  weight: Map<string, number> = new Map(),
): Map<string, LenderStyle> {
  const n = pal.series.length;
  const ranked = [...lenders].sort((a, b) => (weight.get(b) ?? 0) - (weight.get(a) ?? 0) || byName(a, b));
  return new Map(
    ranked.map((name, i) => [
      name,
      { color: pal.series[i % n] ?? pal.muted, symbol: SHAPES[Math.floor(i / n) % SHAPES.length] ?? 'circle' },
    ]),
  );
}

/**
 * A fixed sideways offset per lender, so quotes at the same fixation stand next
 * to each other instead of on top of each other. Fixed by lender rather than by
 * who is visible, for the same reason colours are.
 */
export function dodgeOffsets(lenders: string[], step: number): Map<string, number> {
  const mid = (lenders.length - 1) / 2;
  return new Map(lenders.map((name, i) => [name, (i - mid) * step]));
}

export function nearest(options: number[], value: number): number | undefined {
  return options.reduce<number | undefined>(
    (best, o) => (best === undefined || Math.abs(o - value) < Math.abs(best - value) ? o : best),
    undefined,
  );
}

/**
 * The corners of one quote's step line on a calendar.
 *
 * A quote is drawn from the day it took effect until its successor did — capped
 * where its Stand lapses under the staleness rule, or, with no Stand, a year
 * after it was last seen. Either leaves a gap instead of carrying an abandoned
 * quote forward as if it were a price.
 */
export function stepPoints(
  series: QuoteSeries,
  basis: QuoteBasis,
  category: OfferCategory,
): [string, number | null][] {
  const points: [string, number | null][] = [];

  series.episodes.forEach((episode, i) => {
    const previous = series.episodes[i - 1];
    const next = series.episodes[i + 1];
    const from = effectiveFrom(episode, previous);
    const replaced = next ? effectiveFrom(next, episode) : episode.lastSeen;
    const lapse = [lapseOf(episode, category), unseenLapseOf(episode)]
      .filter((d): d is string => d !== null)
      .sort()[0];
    const to = lapse !== undefined && lapse < replaced ? lapse : replaced;
    const value = quoteOf(episode, basis);

    if (value === null || to < from) {
      points.push([from, null]);
      return;
    }
    points.push([from, value], [to, value]);
    if (next && to < replaced) points.push([to, null]);
  });

  return points;
}

/** The value a step line holds on a given day, or `null` where it is not drawn. */
export function valueAt(points: [string, number | null][], t: number, holdDays = 1): number | null {
  const last = points[points.length - 1];
  if (!last || t > Date.parse(last[0]) + holdDays * 86_400_000) return null;
  let value: number | null = null;
  for (const [date, v] of points) {
    if (Date.parse(date) <= t) value = v;
    else break;
  }
  return value;
}

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}
