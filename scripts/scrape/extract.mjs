/**
 * Reading offers out of a flattened page.
 *
 * Shared by the daily scrape and the archive backfill, so a probe means exactly
 * the same thing against today's page and against a capture from 2019. If the
 * two paths each carried their own copy, history and the live board would drift
 * apart the first time a probe was fixed in only one of them.
 */

import { parseGermanDate, parseRate, plausible } from './html.mjs';
import { BOUNDS } from './sources.mjs';

/**
 * Runs one probe and returns a rate only if it is present and plausible.
 *
 * `scale` divides the captured number before the plausibility check, for sources
 * that store a rate in other units: Bank Burgenland's calculator config holds
 * 4,38 % as `4380`. Checking after scaling means a wrong scale fails as
 * implausible instead of publishing a 4380 % mortgage.
 */
function probe(text, pattern, category, scale = 1) {
  if (!pattern) return null;
  const match = text.match(pattern);
  if (!match) return null;
  const parsed = parseRate(match[1]);
  const value = parsed === null ? null : parsed / scale;
  return plausible(value, BOUNDS[category]) ? value : null;
}

/**
 * The date the provider stamps on its own figures, if the page carries one.
 *
 * Deliberately looked up once per source rather than per offer: a page states
 * one `Stand` covering everything on it, and hunting for a nearer one per rate
 * would just find whichever date happened to sit closest in the flattened text.
 */
function statedDate(text, pattern) {
  if (!pattern) return null;
  return parseGermanDate(text.match(pattern)?.[1]);
}

/**
 * A nominal and effective rate as a pair the source does not contradict.
 *
 * An effective rate includes fees, so on a loan that charges any it cannot sit
 * below the nominal rate. Pages print exactly that anyway: Oberbank's example in
 * 2022 read 1,15 % nominal and 1,09 % effective while itemising its fees. The
 * effective figure is dropped and the nominal kept — the same call made for Hypo
 * NOE, because a number its own source contradicts should not reach the board,
 * and the nominal rate is the one the example is built from.
 */
export function reconcile(rate, effectiveRate) {
  if (rate !== null && effectiveRate !== null && effectiveRate < rate) {
    return { rate, effectiveRate: null, contradicted: true };
  }
  return { rate, effectiveRate, contradicted: false };
}

/**
 * Every offer a source's probes can find in `text`.
 *
 * `missed` lists specs where neither rate matched; `contradicted` lists specs
 * whose effective rate was discarded by `reconcile`.
 */
export function readOffers(source, text) {
  const statedAt = statedDate(text, source.stand);
  const found = [];
  const missed = [];
  const contradicted = [];

  for (const spec of source.offers) {
    const pair = reconcile(
      probe(text, spec.rate, source.category, spec.scale),
      probe(text, spec.effectiveRate, source.category, spec.scale),
    );

    if (pair.rate === null && pair.effectiveRate === null) {
      missed.push(spec.id);
      continue;
    }
    if (pair.contradicted) contradicted.push(spec.id);
    found.push({ spec, rate: pair.rate, effectiveRate: pair.effectiveRate });
  }

  return { statedAt, found, missed, contradicted };
}
