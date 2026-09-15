/**
 * What Austrian banks currently advertise, and what they advertised before.
 *
 * The ECB tells us what was *concluded* — volume-weighted, and about five weeks
 * late. It cannot tell us what is on offer today, and no public API anywhere
 * publishes bank product rates. Bank sites send no CORS headers either, so the
 * browser cannot read them directly.
 *
 * So this half of the dashboard is built the other way round: a scheduled
 * workflow (`.github/workflows/offers.yml`) scrapes published condition pages,
 * writes `public/data/offers.json` plus one history file per product, and
 * commits them. The page then loads those files same-origin. Every figure
 * carries the URL it came from and the date it was last confirmed, so a stale
 * number is visible as stale rather than quietly wrong.
 */

export type OfferCategory = 'deposit' | 'mortgage' | 'consumer';

/** `scraped` was read from the source page today; `curated` was checked by hand. */
export type OfferMethod = 'scraped' | 'curated';

/**
 * How the provider sets and publishes its rate.
 *
 * `direct` banks run one national rate and compete on it publicly. `branch`
 * networks price at the counter, often per local institution.
 */
export type ProviderNetwork = 'direct' | 'branch';

export interface Offer {
  id: string;
  provider: string;
  /** Product name as the provider markets it: Festgeld, Tagesgeld, Sparbuch… */
  product: string;
  category: OfferCategory;
  network: ProviderNetwork;
  /** Deposit term in months; `null` for instant access. */
  termMonths: number | null;
  /** Loan rate fixation in years; `0` means variable, `null` not applicable. */
  fixationYears: number | null;
  /** Nominal advertised rate, per cent per annum. */
  rate: number | null;
  /** Effective rate — Effektivzinssatz on loans, where the provider publishes one. */
  effectiveRate: number | null;
  amountMin: number | null;
  amountMax: number | null;
  /** Strings attached: new money only, salary account required, and so on. */
  conditions: string | null;
  /** The same in German. Boards written before German was added carry English only. */
  conditionsDe?: string | null;
  sourceUrl: string;
  method: OfferMethod;
  /** ISO date on which this figure was last confirmed against the source. */
  observedAt: string;
  /**
   * The date the *provider* stamps on the figure — its `Stand`, where one is
   * published. `null` when the page states none.
   *
   * A representative example under HIKrG is refreshed when the bank chooses,
   * not when we read it, so a scrape today can faithfully report a rate the bank
   * set a year ago.
   */
  statedAt: string | null;
}

export interface OfferSource {
  provider: string;
  /** German label, for the unavailable entries whose name carries words of ours ("— savings"). */
  providerDe?: string;
  url: string;
  /**
   * `partial` means the page loaded but not every expected rate was found;
   * `unavailable` is an institution we deliberately do not scrape, listed so the
   * page can say why a bank that size is absent.
   */
  status: 'ok' | 'partial' | 'failed' | 'unavailable';
  checkedAt: string;
  note?: string;
  noteDe?: string;
}

export interface OfferBoard {
  generatedAt: string;
  offers: Offer[];
  sources: OfferSource[];
}

/**
 * How long a figure stays current, by what it prices.
 *
 * Deposit pricing moves on days, so a fortnight is generous. A housing-loan
 * representative example is a legal disclosure a bank refreshes when it feels
 * like it, so holding mortgages to the deposit threshold would paint every
 * example stale.
 */
export const STALE_AFTER_DAYS: Record<OfferCategory, number> = {
  deposit: 14,
  consumer: 60,
  mortgage: 120,
};

export function daysSince(iso: string, now = new Date()): number {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

/** The provider's own `Stand` wins over the day we read the page. */
export const ratedAt = (offer: Offer): string => offer.statedAt ?? offer.observedAt;

export const isStale = (offer: Offer, now = new Date()): boolean =>
  daysSince(ratedAt(offer), now) > STALE_AFTER_DAYS[offer.category];

async function loadJson<T>(file: string, signal: AbortSignal, valid: (v: T) => boolean) {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`, { signal });
    if (!res.ok) return undefined;
    const parsed = (await res.json()) as T;
    return valid(parsed) ? parsed : undefined;
  } catch (err) {
    if (signal.aborted) throw err;
    return undefined;
  }
}

/**
 * Loads the committed offer board. A missing or malformed file is not fatal:
 * the ECB panels must still render if a scrape run never landed.
 */
export const loadOffers = (signal: AbortSignal) =>
  loadJson<OfferBoard>('offers.json', signal, (b) => Array.isArray(b?.offers));

/* ------------------------------------------------------------------ *
 * Offer history
 *
 * One file per product, as pricing episodes: one per distinct quote, with the
 * first and last day it was seen. Written by the daily scrape; the housing file
 * is also backfilled from Internet Archive captures — see
 * `scripts/scrape/history.mjs`.
 * ------------------------------------------------------------------ */

export interface QuoteEpisode {
  rate: number | null;
  effectiveRate: number | null;
  /** Earliest Stand the bank stamped on this quote. */
  statedAt: string | null;
  /** Latest Stand, where the bank re-dated the quote without changing it. */
  restatedAt?: string;
  firstSeen: string;
  lastSeen: string;
  via: 'scrape' | 'archive' | 'curated';
  /** Where the quote can be checked: the live page, or the archive capture. */
  evidence: string;
}

export interface QuoteSeries {
  provider: string;
  product: string;
  network: ProviderNetwork;
  fixationYears: number | null;
  /** Deposit files only. */
  termMonths?: number | null;
  conditions: string | null;
  sourceUrl: string;
  episodes: QuoteEpisode[];
}

export interface QuoteHistory {
  generatedAt: string;
  series: Record<string, QuoteSeries>;
}

export const loadHistory = (file: string, signal: AbortSignal) =>
  loadJson<QuoteHistory>(file, signal, (h) => !!h?.series && typeof h.series === 'object');

/**
 * Effective wherever the lender publishes one, because only the effective rate
 * includes fees and is defined identically across banks.
 */
export type QuoteBasis = 'effective' | 'nominal';

export const hasBasis = (series: QuoteSeries, basis: QuoteBasis): boolean =>
  series.episodes.some((e) => quoteOf(e, basis) !== null);

export const quoteOf = (episode: QuoteEpisode, basis: QuoteBasis): number | null =>
  basis === 'effective' ? episode.effectiveRate : episode.rate;

const addDays = (iso: string, days: number): string =>
  new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * The day an episode's price took effect, as far as the evidence reaches.
 *
 * The bank's Stand where it gave one, because the first day a quote was seen —
 * above all in a monthly archive capture — can be weeks after the bank set it.
 * Never earlier than the previous quote was last seen, though: a Stand claiming
 * otherwise was stamped on a page that visibly still showed the old rate.
 */
export function effectiveFrom(episode: QuoteEpisode, previous?: QuoteEpisode): string {
  const claimed =
    episode.statedAt !== null && episode.statedAt < episode.firstSeen
      ? episode.statedAt
      : episode.firstSeen;
  return previous && claimed < previous.lastSeen ? previous.lastSeen : claimed;
}

/**
 * The day a stamped quote stops counting as a current offer, or `null` for a
 * provider that stamps none.
 *
 * bank99 left a 0,51 % example online until late 2023, while the lenders beside
 * it quoted over 4 %; drawn at face value, that would be the cheapest mortgage
 * in Austria for two years of the hiking cycle.
 */
export function lapseOf(episode: QuoteEpisode, category: OfferCategory): string | null {
  const stamp = episode.restatedAt ?? episode.statedAt;
  return stamp === null ? null : addDays(stamp, STALE_AFTER_DAYS[category]);
}

export interface Repricing {
  id: string;
  series: QuoteSeries;
  date: string;
  before: number;
  after: number;
  episode: QuoteEpisode;
  /**
   * Set when the evidence brackets the repricing rather than pinning it: the
   * last day the old quote was seen. A Stand pins the date only if it predates
   * the first sighting.
   */
  earliest?: string;
}

/**
 * Every change in a quote on one basis, newest first.
 *
 * Compared across a missing figure rather than to it: an effective rate the
 * scraper discarded is a gap in the evidence, not a repricing to nothing. Moves
 * under a basis point are left out — effective rates are recomputed from fees
 * and wobble in the fourth decimal without the bank deciding anything.
 */
export function repricings(history: QuoteHistory, basis: QuoteBasis): Repricing[] {
  const log: Repricing[] = [];

  for (const [id, series] of Object.entries(history.series)) {
    let last: number | undefined;

    series.episodes.forEach((episode, i) => {
      const value = quoteOf(episode, basis);
      if (value === null) return;
      if (last !== undefined && Math.abs(value - last) >= 0.01) {
        const previous = series.episodes[i - 1];
        const date = effectiveFrom(episode, previous);
        const pinned = episode.statedAt !== null && episode.statedAt < episode.firstSeen;
        // Within a month is the archive's normal capture spacing; call that a date.
        const bracketed =
          !pinned && previous !== undefined && daysSince(previous.lastSeen, new Date(date)) > 31;
        log.push({
          id,
          series,
          date,
          before: last,
          after: value,
          episode,
          ...(bracketed ? { earliest: previous.lastSeen } : {}),
        });
      }
      last = value;
    });
  }

  return log.sort((a, b) => b.date.localeCompare(a.date));
}
