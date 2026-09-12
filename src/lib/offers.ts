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
