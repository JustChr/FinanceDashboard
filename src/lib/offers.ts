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

export interface Offer {
  id: string;
  provider: string;
  /** Product name as the provider markets it: Festgeld, Tagesgeld, Sparbuch… */
  product: string;
  category: OfferCategory;
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
}

export interface OfferSource {
  provider: string;
  url: string;
  /** `partial` means the page loaded but not every expected rate was found. */
  status: 'ok' | 'partial' | 'failed';
  checkedAt: string;
  note?: string;
}

export interface OfferBoard {
  generatedAt: string;
  offers: Offer[];
  sources: OfferSource[];
}

/**
 * An advertised rate more than this old is shown as stale rather than current.
 * Deposit pricing moves on days, not months, so a fortnight is generous.
 */
export const STALE_AFTER_DAYS = 14;

export function daysSince(iso: string, now = new Date()): number {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

export const isStale = (offer: Offer, now = new Date()): boolean =>
  daysSince(offer.observedAt, now) > STALE_AFTER_DAYS;

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
