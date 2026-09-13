/**
 * Rebuilds housing-loan offer history from the Internet Archive.
 *
 * The daily scrape only starts remembering on the day it first runs. The
 * Wayback Machine has been capturing most of these pages for years, and a
 * capture is the page exactly as the bank published it — so the same probes the
 * scrape uses can be replayed against it, and a repricing from 2023 lands in
 * `housing-history.json` just as if the scraper had been running then.
 *
 * What an archive capture can and cannot say:
 *
 * - It proves a quote was live on the capture day. It does not say when the
 *   quote started, so where a bank stamps a `Stand` that date is kept, and the
 *   board dates an episode from it.
 * - Captures are irregular — monthly at best for most of these pages — so a
 *   repricing between two captures is bracketed, not pinned. `month` resolution
 *   (the default) takes one capture per month; `day` takes one per day and is
 *   worth it only for a source that reprices often.
 * - A probe written against today's wording can miss older wording. A miss
 *   leaves a gap rather than a wrong number, the same contract as the scrape.
 *
 * Usage:
 *   npm run backfill
 *   npm run backfill -- --provider Oberbank --resolution day
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { bodyToText, USER_AGENT } from './html.mjs';
import { readOffers } from './extract.mjs';
import { loadHistory, record, saveHistory } from './history.mjs';
import { SOURCES } from './sources.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HISTORY = resolve(HERE, '../../public/data/housing-history.json');

const { values: args } = parseArgs({
  options: {
    provider: { type: 'string' },
    resolution: { type: 'string', default: 'month' },
  },
});

/** CDX `collapse` digits: one capture per month, or per day. */
const COLLAPSE = { month: 6, day: 8 };

/**
 * The archive is a shared public service with no paid tier behind it. One
 * request every couple of seconds keeps a full backfill to a few minutes and
 * well clear of its rate limits.
 */
const PAUSE_MS = 2000;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function politeFetch(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await sleep(30_000 * attempt);
    return politeFetch(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

/** Captures of a source's page, oldest first. */
async function captures(source) {
  // `archive` overrides the lookup where the live URL is not stable over time —
  // BAWAG re-hashes its PDF link on every upload, so only the prefix persists.
  const target = source.archive ?? { url: source.url, match: 'exact' };
  const params = new URLSearchParams({
    url: target.url.replace(/^https?:\/\//, ''),
    matchType: target.match,
    output: 'json',
    fl: 'timestamp,original',
    filter: 'statuscode:200',
    collapse: `timestamp:${COLLAPSE[args.resolution] ?? COLLAPSE.month}`,
  });
  const res = await politeFetch(`https://web.archive.org/cdx/search/cdx?${params}`);
  const rows = await res.json();
  return rows.slice(1).map(([timestamp, original]) => ({ timestamp, original }));
}

const isoDate = (timestamp) =>
  `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;

async function backfillSource(source, history) {
  const list = await captures(source);
  let matched = 0;

  for (const { timestamp, original } of list) {
    await sleep(PAUSE_MS);
    const seenAt = isoDate(timestamp);

    let text;
    try {
      // `id_` asks for the capture as originally served, without the archive's
      // toolbar and link rewriting spliced into it.
      const res = await politeFetch(`https://web.archive.org/web/${timestamp}id_/${original}`);
      text = bodyToText(Buffer.from(await res.arrayBuffer()), {
        contentType: res.headers.get('content-type') ?? '',
        url: original,
        includeScripts: source.includeScripts ?? false,
      });
    } catch (err) {
      console.log(`  ${seenAt} unreadable: ${err.message}`);
      continue;
    }

    const { statedAt, found, contradicted } = readOffers(source, text);
    if (found.length > 0) matched += 1;

    for (const { spec, rate, effectiveRate } of found) {
      record(
        history,
        {
          id: spec.id,
          provider: source.provider,
          product: spec.product,
          network: source.network,
          fixationYears: spec.fixationYears,
          conditions: spec.conditions,
          sourceUrl: source.url,
        },
        [
          {
            seenAt,
            statedAt,
            rate,
            effectiveRate,
            via: 'archive',
            evidence: `https://web.archive.org/web/${timestamp}/${original}`,
          },
        ],
      );
    }

    const quotes = found.map((f) => `${f.rate ?? '–'}/${f.effectiveRate ?? '–'}`).join(' ');
    console.log(
      `  ${seenAt} ${found.length > 0 ? quotes : 'no match'}${statedAt ? ` · Stand ${statedAt}` : ''}${
        contradicted.length > 0 ? ' · effective rate below nominal, dropped' : ''
      }`,
    );
  }

  return { captures: list.length, matched };
}

async function main() {
  const sources = SOURCES.filter(
    (s) =>
      s.category === 'mortgage' &&
      (!args.provider || s.provider.toLowerCase().includes(args.provider.toLowerCase())),
  );
  if (sources.length === 0) {
    console.error(`No housing source matches "${args.provider}".`);
    process.exitCode = 1;
    return;
  }

  const history = await loadHistory(HISTORY);

  for (const source of sources) {
    console.log(`\n${source.provider}`);
    try {
      const { captures: count, matched } = await backfillSource(source, history);
      console.log(`  ${matched} of ${count} captures yielded a quote`);
    } catch (err) {
      console.log(`  archive lookup failed: ${err.message}`);
    }
    // Saved after every source, so an interrupted run keeps what it found.
    await saveHistory(HISTORY, history);
  }
}

await main();
