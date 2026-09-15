/**
 * Builds `public/data/offers.json` — the advertised half of the dashboard — and
 * extends the per-product history files (`housing-history.json`,
 * `deposit-history.json`, `consumer-history.json`) with today's quotes.
 *
 * Run by `.github/workflows/offers.yml` once a day. The output is committed to
 * the repository so the static site can load it same-origin; bank sites send no
 * CORS headers, so the browser could never read them directly.
 *
 * The contract this script keeps:
 *
 * 1. A number reaches the board only if a probe matched *and* the value is
 *    plausible for its category. A page redesign yields nothing rather than
 *    something wrong.
 * 2. Anything not scraped falls back to `curated.json`, carrying the date a
 *    human last checked it, so the page can show its age instead of implying it
 *    is live.
 * 3. Every offer keeps the URL it came from, so any figure can be checked.
 * 4. A failing source never fails the run. Partial data beats no board.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchPage } from './html.mjs';
import { dedupeQuotes, readOffers } from './extract.mjs';
import { loadHistory, record, saveHistory } from './history.mjs';
import { SOURCES, UNAVAILABLE } from './sources.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUTPUT = resolve(ROOT, 'public/data/offers.json');
/** One history file per product, each in the episode shape of `history.mjs`. */
const HISTORIES = [
  { category: 'mortgage', path: resolve(ROOT, 'public/data/housing-history.json') },
  { category: 'deposit', path: resolve(ROOT, 'public/data/deposit-history.json') },
  { category: 'consumer', path: resolve(ROOT, 'public/data/consumer-history.json') },
];
const CURATED = resolve(HERE, 'curated.json');

const today = () => new Date().toISOString().slice(0, 10);

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Groups a source's offers by the URL each is read from.
 *
 * Most sources are one page carrying every offer. A calculator is asked one
 * question per offer instead — bank99's answers a single loan profile and
 * fixation per request — so an offer may carry its own `url`, and each distinct
 * URL is fetched once.
 */
function byUrl(source) {
  const groups = new Map();
  for (const spec of source.offers) {
    const url = spec.url ?? source.url;
    groups.set(url, [...(groups.get(url) ?? []), spec]);
  }
  return groups;
}

/**
 * The documents a source's offers are read from, one at a time.
 *
 * Declarative sources are fetched by URL. A source with a `documents` function
 * runs its own flow instead — a calculator that must first be loaded for its
 * rates or its session and then asked, as Bank Austria's and Oberbank's are —
 * and hands back `{ offer, url, text }` per offer, or `{ offer, url, error }`
 * for one it could not get. Either way the probes still do the reading, so a
 * custom flow cannot put a number on the board that a probe did not match.
 */
async function* documentsOf(source) {
  if (source.documents) {
    let docs;
    try {
      docs = await source.documents();
    } catch (err) {
      yield { url: source.url, specs: source.offers, error: err };
      return;
    }
    const byId = new Map(source.offers.map((spec) => [spec.id, spec]));
    for (const doc of docs) {
      const spec = byId.get(doc.offer);
      if (spec) yield { url: doc.url, specs: [spec], text: doc.text, error: doc.error };
    }
    return;
  }

  let first = true;
  for (const [url, specs] of byUrl(source)) {
    // A pause between a calculator's questions, so a ladder of five quotes
    // arrives like someone moving a slider rather than as a burst.
    if (!first) await sleep(1000);
    first = false;
    try {
      const text = await fetchPage(url, {
        includeScripts: source.includeScripts ?? false,
        raw: source.raw ?? false,
        browser: source.browser ?? false,
      });
      yield { url, specs, text };
    } catch (err) {
      yield { url, specs, error: err };
    }
  }
}

async function scrapeSource(source) {
  const checkedAt = today();
  const offers = [];
  const missed = [];
  const failed = [];
  const contradicted = [];
  const unreadable = new Set();
  const seen = new Set();
  let lostDate = false;

  for await (const { url, specs, text, error } of documentsOf(source)) {
    specs.forEach((spec) => seen.add(spec.id));
    if (error) {
      unreadable.add(error.message);
      failed.push(...specs.map((spec) => spec.id));
      continue;
    }

    const read = readOffers({ ...source, offers: specs }, text);
    missed.push(...read.missed);
    contradicted.push(...read.contradicted);
    // A source that publishes a Stand and stops publishing it is worth saying
    // out loud: the rates keep scraping fine, and their age silently becomes a guess.
    if (source.stand && read.statedAt === null) lostDate = true;

    for (const { spec, rate, effectiveRate } of read.found) {
      offers.push({
        id: spec.id,
        provider: source.provider,
        product: spec.product,
        category: source.category,
        network: source.network,
        termMonths: spec.termMonths ?? null,
        fixationYears: spec.fixationYears ?? null,
        rate,
        effectiveRate,
        amountMin: spec.amountMin ?? null,
        amountMax: spec.amountMax ?? null,
        conditions: spec.conditions ?? null,
        conditionsDe: spec.conditionsDe ?? null,
        // The URL the figure was actually read from — for a calculator, the
        // exact question asked, so the quote can be re-asked and checked.
        sourceUrl: url,
        method: 'scraped',
        observedAt: checkedAt,
        statedAt: read.statedAt,
      });
    }
  }

  // An offer a custom flow never produced a document for is a miss, not silence.
  missed.push(...source.offers.filter((spec) => !seen.has(spec.id)).map((spec) => spec.id));

  const notes = [
    unreadable.size > 0 ? `Page could not be read: ${[...unreadable].join(', ')}` : null,
    missed.length > 0 ? `No rate found for: ${missed.join(', ')}` : null,
    contradicted.length > 0
      ? `Effective rate below nominal, not published: ${contradicted.join(', ')}`
      : null,
    lostDate ? 'No Stand date found; age falls back to the scrape date' : null,
  ].filter(Boolean);
  // The same notes for the German page, in the same order.
  const notesDe = [
    unreadable.size > 0 ? `Seite konnte nicht gelesen werden: ${[...unreadable].join(', ')}` : null,
    missed.length > 0 ? `Kein Zinssatz gefunden für: ${missed.join(', ')}` : null,
    contradicted.length > 0
      ? `Effektivzins unter Nominalzins, nicht veröffentlicht: ${contradicted.join(', ')}`
      : null,
    lostDate ? 'Kein Stand-Datum gefunden; das Alter richtet sich nach dem Abrufdatum' : null,
  ].filter(Boolean);

  return {
    offers,
    source: {
      provider: source.provider,
      url: source.url,
      status:
        missed.length + failed.length === 0 ? 'ok' : offers.length === 0 ? 'failed' : 'partial',
      checkedAt,
      ...(notes.length > 0 ? { note: notes.join('. '), noteDe: notesDe.join('. ') } : {}),
    },
  };
}

async function loadCurated() {
  try {
    const parsed = JSON.parse(await readFile(CURATED, 'utf8'));
    if (!Array.isArray(parsed.offers)) return [];
    // A hand-checked entry states its own date in `observedAt`; `statedAt` is
    // optional there, so normalise it rather than letting `undefined` through.
    return parsed.offers.map((offer) => ({ statedAt: null, ...offer }));
  } catch {
    return [];
  }
}

/**
 * Appends today's quotes for one product to its history file.
 *
 * Every product keeps the same episode shape. Savings rates move more often
 * than a housing-loan example, but still on decisions rather than daily noise,
 * so one episode per distinct rate stays small and readable.
 */
async function extendHistory(offers, { category, path }) {
  const history = await loadHistory(path);
  const matching = offers.filter((o) => o.category === category);

  for (const offer of matching) {
    record(history, offer, [
      {
        seenAt: offer.observedAt,
        statedAt: offer.statedAt,
        rate: offer.rate,
        effectiveRate: offer.effectiveRate,
        via: offer.method === 'curated' ? 'curated' : 'scrape',
        evidence: offer.sourceUrl,
      },
    ]);
  }

  await saveHistory(path, history);
  return matching.length;
}

async function main() {
  // Sequential rather than parallel: a handful of requests once a day should
  // look like a visitor, not like a burst against six banks at once.
  const results = [];
  // `archiveOnly` sources exist for `backfill.mjs`: pages that once published a
  // rate and are now refused or no longer carry it.
  for (const source of SOURCES.filter((s) => !s.archiveOnly)) {
    const result = await scrapeSource(source);
    results.push(result);
    const found = result.offers.length;
    console.log(
      `${result.source.status.padEnd(7)} ${source.provider} — ${found}/${source.offers.length} rates · ${source.url}`,
    );
    if (result.source.note) console.log(`        ${result.source.note}`);
  }

  // One price read twice — an example and a calculator agreeing — is listed
  // once, and the source that lost its row says why.
  const { offers: scraped, duplicates } = dedupeQuotes(results.flatMap((r) => r.offers));
  for (const result of results) {
    const same = result.offers.filter((o) => duplicates.has(o.id));
    if (same.length === 0) continue;
    const note = `Same quote as another listing today, shown once: ${same
      .map((o) => `${o.id} (same as ${duplicates.get(o.id)})`)
      .join(', ')}`;
    const noteDe = `Heute gleiches Angebot wie ein anderer Eintrag, nur einmal angezeigt: ${same
      .map((o) => `${o.id} (gleich wie ${duplicates.get(o.id)})`)
      .join(', ')}`;
    result.source.note = result.source.note ? `${result.source.note}. ${note}` : note;
    result.source.noteDe = result.source.noteDe ? `${result.source.noteDe}. ${noteDe}` : noteDe;
    console.log(`        ${note}`);
  }
  const scrapedIds = new Set(results.flatMap((r) => r.offers).map((o) => o.id));

  // Curated entries fill gaps rather than override: a live rate always wins.
  const curated = (await loadCurated()).filter((o) => !scrapedIds.has(o.id));

  // Institutions we cannot reach are part of the board's output, not an
  // omission: the page has to be able to say why a bank this size is missing.
  const unavailable = UNAVAILABLE.map((entry) => ({
    provider: entry.provider,
    ...(entry.providerDe ? { providerDe: entry.providerDe } : {}),
    url: entry.url,
    status: 'unavailable',
    checkedAt: today(),
    note: entry.reason,
    noteDe: entry.reasonDe,
  }));

  const board = {
    generatedAt: new Date().toISOString(),
    offers: [...scraped, ...curated].sort(
      (a, b) =>
        a.category.localeCompare(b.category) ||
        a.provider.localeCompare(b.provider) ||
        (a.termMonths ?? -1) - (b.termMonths ?? -1),
    ),
    sources: [...results.map((r) => r.source), ...unavailable],
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(board, null, 2)}\n`, 'utf8');

  console.log(
    `\nWrote ${board.offers.length} offers (${scraped.length} scraped, ${curated.length} curated) to public/data/offers.json`,
  );

  for (const target of HISTORIES) {
    const recorded = await extendHistory(board.offers, target);
    console.log(`Recorded ${recorded} ${target.category} quotes in ${target.path}`);
  }

  // A run where nothing at all was reachable is a real failure worth a red
  // build; a run that lost one bank is not.
  if (scraped.length === 0) {
    console.error('No source yielded a single rate — check the adapters.');
    process.exitCode = 1;
  }
}

await main();
