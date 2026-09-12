/**
 * ALM metrics derived from the raw series.
 *
 * These are the point of the dashboard: a rate level is available anywhere, but
 * pass-through, the front-book/back-book gap and the fixation term premium all
 * have to be computed.
 */

import type { Observation, Series } from './sdmx';
import { observationAt, shiftMonths } from './sdmx';
import type { MirDef } from './catalog';

/**
 * Minimum cumulative policy move, in percentage points, before a pass-through
 * ratio is meaningful.
 *
 * This is not a cosmetic threshold. Beta is a ratio, so early in a cycle a tiny
 * denominator makes it explode: in September 2022 a 50 bp policy move against a
 * few basis points of deposit repricing produced a beta near 1.0, which is an
 * artefact rather than a bank passing through everything. Requiring a full
 * percentage point of policy movement first keeps the series interpretable.
 */
const MIN_POLICY_MOVE = 1.0;

/**
 * Cumulative deposit beta: the share of a policy-rate move a bank has passed
 * through to depositors, measured from a cycle anchor.
 *
 *   beta = (deposit_rate_t - deposit_rate_anchor)
 *        / (policy_rate_t  - policy_rate_anchor)
 *
 * A beta of 0.20 means 20 cents of every euro of policy tightening reached the
 * depositor. Low retail betas are the main reason net interest income expands
 * in a hiking cycle, and the main risk when rates fall but betas ratchet.
 */
export function cumulativeBeta(
  series: Series | undefined,
  policy: Observation[],
  anchor: string,
): number | undefined {
  if (!series || policy.length === 0) return undefined;

  const d0 = observationAt(series, anchor);
  const d1 = series.observations[series.observations.length - 1];
  const p0 = policy.find((o) => o.period >= anchor);
  const p1 = policy[policy.length - 1];
  if (!d0 || !d1 || !p0 || !p1) return undefined;

  const policyMove = p1.value - p0.value;
  if (Math.abs(policyMove) < MIN_POLICY_MOVE) return undefined;

  return (d1.value - d0.value) / policyMove;
}

/** Beta as a running series, so the ratchet is visible rather than a single number. */
export function betaSeries(
  series: Series | undefined,
  policyMonthly: Observation[],
  anchor: string,
): Observation[] {
  if (!series) return [];

  const policyAt = new Map(policyMonthly.map((o) => [o.period, o.value]));
  const d0 = observationAt(series, anchor);
  const p0 = policyMonthly.find((o) => o.period >= anchor);
  if (!d0 || !p0) return [];

  const out: Observation[] = [];
  for (const d of series.observations) {
    if (d.period < anchor) continue;
    const p = policyAt.get(d.period);
    if (p === undefined) continue;
    const move = p - p0.value;
    if (Math.abs(move) < MIN_POLICY_MOVE) continue;
    out.push({ period: d.period, value: (d.value - d0.value) / move });
  }
  return out;
}

/**
 * Collapses a daily series to month-end observations so it can be compared
 * against monthly MIR data on a shared axis.
 */
export function toMonthEnd(observations: Observation[]): Observation[] {
  const byMonth = new Map<string, Observation>();
  for (const o of observations) {
    // Observations arrive sorted, so the last write for a month is its month-end.
    byMonth.set(o.period.slice(0, 7), { period: o.period.slice(0, 7), value: o.value });
  }
  return [...byMonth.values()].sort((a, b) => a.period.localeCompare(b.period));
}

/** Pointwise spread between two monthly series, over their overlapping periods. */
export function spread(a: Observation[], b: Observation[]): Observation[] {
  const bAt = new Map(b.map((o) => [o.period, o.value]));
  const out: Observation[] = [];
  for (const o of a) {
    const other = bAt.get(o.period);
    if (other !== undefined) out.push({ period: o.period, value: o.value - other });
  }
  return out;
}

/**
 * Commercial margin: what the bank earns over its own marginal funding cost.
 * Using the policy/market rate as the transfer price is the standard first-order
 * approximation to an internal FTP curve.
 */
export function marginOverBenchmark(
  rate: Series | undefined,
  benchmarkMonthly: Observation[],
): Observation[] {
  if (!rate) return [];
  return spread(rate.observations, benchmarkMonthly);
}

/* ------------------------------------------------------------------ */
/* Front book versus back book                                         */
/* ------------------------------------------------------------------ */

/**
 * The repricing gap: new business minus the outstanding stock.
 *
 * This is the single most useful number on the lending side. Austrian mortgage
 * balances are overwhelmingly long-fixed, so the back book moves years behind
 * the front book. A positive gap on loans is unearned interest income still to
 * come as old contracts roll; a positive gap on deposits is funding cost the
 * bank has not yet paid but will.
 */
export function repricingGap(
  front: Series | undefined,
  back: Series | undefined,
): Observation[] {
  if (!front || !back) return [];
  return spread(front.observations, back.observations);
}

/**
 * How long the back book would take to reach the front book, in years, if new
 * business held its current rate and the stock closed the gap at its recent
 * pace. Undefined when the stock is moving the wrong way or barely at all —
 * extrapolating a flat series gives a meaningless horizon.
 */
export function repricingHorizonYears(
  front: Series | undefined,
  back: Series | undefined,
  lookbackMonths = 12,
): number | undefined {
  const f = front?.observations.at(-1);
  const b = back?.observations.at(-1);
  if (!f || !b || !back) return undefined;

  const earlier = observationAt(back, shiftMonths(b.period, -lookbackMonths));
  if (!earlier) return undefined;

  const gap = f.value - b.value;
  const drift = (b.value - earlier.value) / (lookbackMonths / 12);
  // The stock must be closing the gap, not widening it or standing still.
  if (Math.abs(drift) < 0.05 || Math.sign(drift) !== Math.sign(gap)) return undefined;

  return Math.abs(gap / drift);
}

/* ------------------------------------------------------------------ */
/* Ladders                                                             */
/* ------------------------------------------------------------------ */

export interface LadderRung {
  def: MirDef;
  at: number | undefined;
  ea: number | undefined;
  /** Change over the trailing twelve months, in percentage points. */
  change12m: number | undefined;
}

/**
 * A snapshot across one breakdown — fixation periods for loans, agreed
 * maturities for deposits — at the latest period each series offers.
 */
export function ladder(
  defs: MirDef[],
  atSeries: Map<string, Series>,
  eaSeries: Map<string, Series>,
): LadderRung[] {
  return defs.map((def) => {
    const series = atSeries.get(def.id);
    const now = series?.observations.at(-1);
    const then = now ? observationAt(series, shiftMonths(now.period, -12)) : undefined;

    return {
      def,
      at: now?.value,
      ea: eaSeries.get(def.id)?.observations.at(-1)?.value,
      change12m: now && then ? now.value - then.value : undefined,
    };
  });
}

/**
 * Term premium across a ladder: the longest rung minus the shortest.
 *
 * Negative means the curve is inverted — borrowers are being paid to fix long,
 * which is what happens when the market expects cuts and is the clearest signal
 * on the housing panel.
 *
 * Returns undefined unless both end rungs are present, rather than falling back
 * to whichever rungs did report. The callers describe this number in words
 * ("fixing for more than ten years costs…"), so silently measuring the 5–10Y
 * rung instead would caption the wrong maturity.
 */
export function termPremium(rungs: LadderRung[]): number | undefined {
  const shortest = rungs.at(0)?.at;
  const longest = rungs.at(-1)?.at;
  if (shortest === undefined || longest === undefined) return undefined;
  return longest - shortest;
}

/** Change in a series over a trailing number of months, in percentage points. */
export function changeOver(series: Series | undefined, months: number): number | undefined {
  const now = series?.observations.at(-1);
  if (!now || !series) return undefined;
  const then = observationAt(series, shiftMonths(now.period, -months));
  return then ? now.value - then.value : undefined;
}

/** Highest and lowest observation in a series, for "versus the peak" framing. */
export function extremes(
  series: Series | undefined,
): { max: Observation; min: Observation } | undefined {
  if (!series || series.observations.length === 0) return undefined;
  let max = series.observations[0]!;
  let min = series.observations[0]!;
  for (const o of series.observations) {
    if (o.value > max.value) max = o;
    if (o.value < min.value) min = o;
  }
  return { max, min };
}

/**
 * Rolling sum over a window, used to turn monthly new-business volumes into a
 * twelve-month total that is not dominated by seasonality.
 */
export function rollingSum(observations: Observation[], months: number): Observation[] {
  const out: Observation[] = [];
  for (let i = months - 1; i < observations.length; i++) {
    let total = 0;
    for (let j = i - months + 1; j <= i; j++) total += observations[j]!.value;
    out.push({ period: observations[i]!.period, value: total });
  }
  return out;
}
