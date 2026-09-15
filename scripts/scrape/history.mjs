/**
 * Offer histories — `public/data/{housing,deposit,consumer}-history.json`.
 * Housing loans came first and carry the archive backfill; savings and
 * consumer credit are recorded from the daily scrape onward.
 *
 * `offers.json` is overwritten every morning, so on its own the board can only
 * say what a bank advertises today. This file keeps what it advertised before.
 *
 * It stores *pricing episodes*, not daily rows. An episode is one quote — a
 * nominal and effective rate pair — together with the first and last day it was
 * seen and the `Stand` the bank stamped on it. A daily scrape that reads the
 * same quote only moves `lastSeen`; a repricing opens a new episode. That keeps
 * the file small and its diffs readable, and it is the natural shape of the
 * data: a representative example is restated a few times a year, not daily.
 *
 * Episodes are rebuilt by folding observations in date order, never by patching
 * them in place. The daily scrape and the archive backfill therefore write
 * through the same function, observations can arrive in any order — a backfill
 * run after months of scraping slots in before them — and running either twice
 * produces the identical file.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * @typedef {object} Observation
 * @property {string} seenAt        ISO date the quote was read — scrape day or archive capture day
 * @property {string|null} statedAt ISO date the bank stamped on it, if it stamped one
 * @property {number|null} rate
 * @property {number|null} effectiveRate
 * @property {'scrape'|'archive'|'curated'} via
 * @property {string} evidence      URL the quote can be checked against
 */

export async function loadHistory(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return { generatedAt: parsed.generatedAt ?? null, series: parsed.series ?? {} };
  } catch {
    return { generatedAt: null, series: {} };
  }
}

export async function saveHistory(path, history) {
  const series = Object.fromEntries(
    Object.keys(history.series)
      .sort()
      .map((id) => [id, history.series[id]]),
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), series }, null, 2)}\n`,
    'utf8',
  );
}

const sameQuote = (a, b) => a.rate === b.rate && a.effectiveRate === b.effectiveRate;

/**
 * Folds observations into episodes.
 *
 * Consecutive reads of the same quote merge; a change starts a new episode, and
 * so does a return to an earlier quote, because 3.36% in 2025 and 3.36% again in
 * 2026 are two decisions by the bank, not one. `statedAt` keeps the earliest
 * Stand an episode carried and `restatedAt` the latest, so a bank re-dating an
 * unchanged example — which is itself a reconfirmation — stays visible.
 */
export function fold(observations) {
  const sorted = [...observations].sort(
    (a, b) =>
      a.seenAt.localeCompare(b.seenAt) ||
      String(a.rate).localeCompare(String(b.rate)) ||
      String(a.effectiveRate).localeCompare(String(b.effectiveRate)),
  );

  const episodes = [];
  for (const o of sorted) {
    // A Stand later than the day it was read is a misparse, not a date.
    const statedAt = o.statedAt && o.statedAt <= o.seenAt ? o.statedAt : null;
    const last = episodes.at(-1);

    if (last && sameQuote(last, o)) {
      if (o.seenAt > last.lastSeen) last.lastSeen = o.seenAt;
      if (statedAt) {
        if (!last.statedAt || statedAt < last.statedAt) last.statedAt = statedAt;
        if (!last.restatedAt || statedAt > last.restatedAt) last.restatedAt = statedAt;
      }
      continue;
    }

    episodes.push({
      rate: o.rate,
      effectiveRate: o.effectiveRate,
      statedAt,
      restatedAt: statedAt,
      firstSeen: o.seenAt,
      lastSeen: o.seenAt,
      via: o.via,
      evidence: o.evidence,
    });
  }

  return episodes.map(({ restatedAt, ...episode }) =>
    restatedAt && restatedAt !== episode.statedAt ? { ...episode, restatedAt } : episode,
  );
}

/** The inverse of `fold`, closely enough that re-folding is lossless. */
function toObservations(episodes) {
  return episodes.flatMap((e) => {
    const base = { rate: e.rate, effectiveRate: e.effectiveRate, via: e.via, evidence: e.evidence };
    return [
      { ...base, seenAt: e.firstSeen, statedAt: e.statedAt },
      { ...base, seenAt: e.lastSeen, statedAt: e.restatedAt ?? e.statedAt },
    ];
  });
}

/**
 * Merges new observations for one offer into the history.
 *
 * `meta` is the offer as the board describes it; its descriptive fields replace
 * the stored ones, so a corrected product name or condition propagates.
 */
export function record(history, meta, observations) {
  const existing = history.series[meta.id];
  history.series[meta.id] = {
    provider: meta.provider,
    product: meta.product,
    network: meta.network,
    fixationYears: meta.fixationYears ?? null,
    // Deposits are told apart by term, not fixation; loan files stay as they were.
    ...(meta.category === 'deposit' ? { termMonths: meta.termMonths ?? null } : {}),
    conditions: meta.conditions ?? null,
    sourceUrl: meta.sourceUrl,
    episodes: fold([...toObservations(existing?.episodes ?? []), ...observations]),
  };
}
