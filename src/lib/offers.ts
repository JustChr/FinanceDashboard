/**
 * What Austrian banks currently advertise.
 *
 * The ECB tells us what was *concluded* — volume-weighted, and about five weeks
 * late. It cannot tell us what is on offer today, and no public API anywhere
 * publishes bank product rates. Bank sites send no CORS headers either, so the
 * browser cannot read them directly.
 *
 * So this half of the dashboard is built the other way round: a scheduled
 * workflow (`.github/workflows/offers.yml`) scrapes published condition pages,
 * writes `public/data/offers.json`, and commits it. The page then loads that
 * file same-origin. Rates a scraper cannot reach fall back to a hand-verified
 * entry in the same shape, and every figure carries the URL it came from and the
 * date it was last confirmed, so a stale number is visible as stale rather than
 * quietly wrong.
 */

export type OfferCategory = 'deposit' | 'mortgage' | 'consumer';

/** `scraped` was read from the source page today; `curated` was checked by hand. */
export type OfferMethod = 'scraped' | 'curated';

/**
 * How the provider sets and publishes its rate.
 *
 * `direct` banks run one national rate and compete on it publicly. `branch`
 * networks price at the counter, often per local institution. The gap between
 * the two is wider than the gap between any two terms, and it is the main reason
 * the ECB volume-weighted average sits so far below the best advertised offer.
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
  sourceUrl: string;
  method: OfferMethod;
  /** ISO date on which this figure was last confirmed against the source. */
  observedAt: string;
  /**
   * The date the *provider* stamps on the figure — its `Stand`, where one is
   * published. `null` when the page states none.
   *
   * This is not the same thing as `observedAt`, and on housing loans the
   * difference is the whole point. A representative example under HIKrG is
   * refreshed when the bank chooses, not when we read it, so a scrape today can
   * faithfully report a rate the bank set a year ago. Without this field the
   * board would show a fresh `observedAt` next to a stale number and imply a
   * currency the figure does not have.
   */
  statedAt: string | null;
}

export interface OfferSource {
  provider: string;
  url: string;
  /**
   * `partial` means the page loaded but not every expected rate was found;
   * `unavailable` is an institution we deliberately do not scrape, listed so the
   * board can say why a bank that size is absent.
   */
  status: 'ok' | 'partial' | 'failed' | 'unavailable';
  checkedAt: string;
  note?: string;
}

export interface OfferBoard {
  generatedAt: string;
  offers: Offer[];
  sources: OfferSource[];
}

/**
 * How long a figure stays current, by what it prices.
 *
 * These differ by an order of magnitude because the underlying publishing
 * behaviour does. Deposit pricing moves on days, so a fortnight is generous. A
 * housing-loan representative example is a legal disclosure a bank refreshes
 * when it feels like it — the observed spread across Austrian lenders runs from
 * same-day to a year — so holding mortgages to the deposit threshold would
 * paint the entire board stale and make the signal useless.
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

/**
 * The date a figure actually dates from.
 *
 * The provider's own `Stand` wins over the day we read the page: reading a
 * year-old rate sheet today does not make its rate a day old, and showing it as
 * one would be the single most misleading thing this board could do.
 */
export const ratedAt = (offer: Offer): string => offer.statedAt ?? offer.observedAt;

export const isStale = (offer: Offer, now = new Date()): boolean =>
  daysSince(ratedAt(offer), now) > STALE_AFTER_DAYS[offer.category];

/**
 * Loads the committed offer board.
 *
 * A missing or malformed file is not fatal: the ECB panels are the backbone of
 * the dashboard and must still render if a scrape run never landed.
 */
export async function loadOffers(signal: AbortSignal): Promise<OfferBoard | undefined> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/offers.json`, { signal });
    if (!res.ok) return undefined;
    const board = (await res.json()) as OfferBoard;
    return Array.isArray(board?.offers) ? board : undefined;
  } catch (err) {
    if (signal.aborted) throw err;
    return undefined;
  }
}

/** Highest advertised rate in a category, ignoring entries with no rate. */
export function bestRate(offers: Offer[], category: OfferCategory): Offer | undefined {
  return offers
    .filter((o) => o.category === category && o.rate !== null)
    .reduce<Offer | undefined>(
      (best, o) => (best === undefined || (o.rate ?? 0) > (best.rate ?? 0) ? o : best),
      undefined,
    );
}

/** Lowest advertised rate in a category — the relevant extreme for borrowing. */
export function cheapestRate(offers: Offer[], category: OfferCategory): Offer | undefined {
  return offers
    .filter((o) => o.category === category && o.rate !== null)
    .reduce<Offer | undefined>(
      (best, o) =>
        best === undefined || (o.rate ?? Infinity) < (best.rate ?? Infinity) ? o : best,
      undefined,
    );
}

/** Groups a deposit board into instant-access and fixed-term buckets. */
export function splitDeposits(offers: Offer[]): { instant: Offer[]; term: Offer[] } {
  const deposits = offers.filter((o) => o.category === 'deposit');
  return {
    instant: deposits.filter((o) => o.termMonths === null),
    term: deposits
      .filter((o) => o.termMonths !== null)
      .sort((a, b) => (a.termMonths ?? 0) - (b.termMonths ?? 0)),
  };
}

/* ------------------------------------------------------------------ *
 * Housing-loan history
 *
 * `offers.json` says what a bank advertises today. `housing-history.json`
 * says what it advertised before, as pricing episodes: one per distinct quote,
 * with the first and last day it was seen. It is written by the daily scrape
 * and backfilled from Internet Archive captures of the same pages — see
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
  conditions: string | null;
  sourceUrl: string;
  episodes: QuoteEpisode[];
}

export interface QuoteHistory {
  generatedAt: string;
  series: Record<string, QuoteSeries>;
}

/** Loads the committed history; like the board, its absence is not fatal. */
export async function loadHousingHistory(signal: AbortSignal): Promise<QuoteHistory | undefined> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/housing-history.json`, { signal });
    if (!res.ok) return undefined;
    const history = (await res.json()) as QuoteHistory;
    return history?.series && typeof history.series === 'object' ? history : undefined;
  } catch (err) {
    if (signal.aborted) throw err;
    return undefined;
  }
}

export type QuoteBasis = 'effective' | 'nominal';

/**
 * Which figure a lender's history is drawn in.
 *
 * Effective wherever the lender publishes one, because only the effective rate
 * includes fees and is defined identically across banks. A lender that never
 * publishes one is drawn in nominal rather than dropped, and labelled so.
 * Switching between the two inside one lender's line would draw its fee load as
 * a repricing.
 */
export const basisOf = (series: QuoteSeries): QuoteBasis =>
  series.episodes.some((e) => e.effectiveRate !== null) ? 'effective' : 'nominal';

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
 * lender that stamps none.
 *
 * Quotes are held to the board's own staleness rule: once the latest Stand is
 * older than `STALE_AFTER_DAYS.mortgage`, the quote is a disclosure nobody
 * updated, not a price. bank99 left a 0,51 % example online until late 2023,
 * while the lenders beside it quoted over 4 %; drawn at face value, that would
 * be the cheapest mortgage in Austria for two years of the hiking cycle.
 */
export function lapseOf(episode: QuoteEpisode): string | null {
  const stamp = episode.restatedAt ?? episode.statedAt;
  return stamp === null ? null : addDays(stamp, STALE_AFTER_DAYS.mortgage);
}

export const isQuoteStale = (episode: QuoteEpisode, now = new Date()): boolean =>
  daysSince(episode.restatedAt ?? episode.statedAt ?? episode.lastSeen, now) >
  STALE_AFTER_DAYS.mortgage;

export interface Repricing {
  id: string;
  series: QuoteSeries;
  date: string;
  before: number;
  after: number;
  basis: QuoteBasis;
  episode: QuoteEpisode;
  /**
   * Set when the evidence brackets the repricing rather than pinning it: the
   * last day the old quote was seen. A Stand pins the date only if it predates
   * the first sighting — Hypo NOE stamps its example with the day it is
   * generated, which says when we looked, not when the bank decided.
   */
  earliest?: string;
}

/**
 * Every change in a lender's headline quote, newest first.
 *
 * Compared on the lender's drawing basis only, and across a missing figure
 * rather than to it: an effective rate the scraper discarded is a gap in the
 * evidence, not a repricing to nothing. Moves under a basis point are left out
 * — effective rates are recomputed from fees and wobble in the fourth decimal
 * without the bank deciding anything.
 */
export function repricings(history: QuoteHistory): Repricing[] {
  const log: Repricing[] = [];

  for (const [id, series] of Object.entries(history.series)) {
    const basis = basisOf(series);
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
          basis,
          episode,
          ...(bracketed ? { earliest: previous.lastSeen } : {}),
        });
      }
      last = value;
    });
  }

  return log.sort((a, b) => b.date.localeCompare(a.date));
}

/** Highest advertised rate within one kind of provider, for the direct/branch gap. */
export function bestIn(
  offers: Offer[],
  network: ProviderNetwork,
  predicate: (offer: Offer) => boolean,
): Offer | undefined {
  return offers
    .filter((o) => o.network === network && o.rate !== null && predicate(o))
    .reduce<Offer | undefined>(
      (best, o) => (best === undefined || (o.rate ?? 0) > (best.rate ?? 0) ? o : best),
      undefined,
    );
}
