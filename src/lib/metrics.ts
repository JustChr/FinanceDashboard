/**
 * ALM metrics derived from the raw series.
 *
 * These are the point of the dashboard: a rate level is available anywhere, but
 * pass-through and margin have to be computed.
 */

import type { Observation, Series } from './sdmx';
import { observationAt } from './sdmx';

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
  deposit: Series | undefined,
  policy: Observation[],
  anchor: string,
): number | undefined {
  if (!deposit || policy.length === 0) return undefined;

  const d0 = observationAt(deposit, anchor);
  const d1 = deposit.observations[deposit.observations.length - 1];
  const p0 = policy.find((o) => o.period >= anchor);
  const p1 = policy[policy.length - 1];
  if (!d0 || !d1 || !p0 || !p1) return undefined;

  const policyMove = p1.value - p0.value;
  if (Math.abs(policyMove) < MIN_POLICY_MOVE) return undefined;

  return (d1.value - d0.value) / policyMove;
}

/** Beta as a running series, so the ratchet is visible rather than a single number. */
export function betaSeries(
  deposit: Series | undefined,
  policyMonthly: Observation[],
  anchor: string,
): Observation[] {
  if (!deposit) return [];

  const policyAt = new Map(policyMonthly.map((o) => [o.period, o.value]));
  const d0 = observationAt(deposit, anchor);
  const p0 = policyMonthly.find((o) => o.period >= anchor);
  if (!d0 || !p0) return [];

  const out: Observation[] = [];
  for (const d of deposit.observations) {
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
