/**
 * Builds `public/data/offers.json` — the advertised half of the dashboard.
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

import { fetchPage, parseGermanDate, parseRate, plausible } from './html.mjs';
import { BOUNDS, SOURCES, UNAVAILABLE } from './sources.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUTPUT = resolve(ROOT, 'public/data/offers.json');
const CURATED = resolve(HERE, 'curated.json');

const today = () => new Date().toISOString().slice(0, 10);

/** Runs one probe and returns a rate only if it is present and plausible. */
function probe(text, pattern, category) {
  if (!pattern) return null;
  const match = text.match(pattern);
  if (!match) return null;
  const value = parseRate(match[1]);
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

async function scrapeSource(source) {
  const checkedAt = today();
  let text;

  try {
    text = await fetchPage(source.url, { includeScripts: source.includeScripts ?? false });
  } catch (err) {
    return {
      offers: [],
      source: {
        provider: source.provider,
        url: source.url,
        status: 'failed',
        checkedAt,
        note: `Page could not be read: ${err.message}`,
      },
    };
  }

  const offers = [];
  const missed = [];
  const statedAt = statedDate(text, source.stand);

  for (const spec of source.offers) {
    const rate = probe(text, spec.rate, source.category);
    const effectiveRate = probe(text, spec.effectiveRate, source.category);

    if (rate === null && effectiveRate === null) {
      missed.push(spec.id);
      continue;
    }

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
      sourceUrl: source.url,
      method: 'scraped',
      observedAt: checkedAt,
      statedAt,
    });
  }

  // A source that publishes a Stand and stops publishing it is worth saying out
  // loud: the rates keep scraping fine, and their age silently becomes a guess.
  const lostDate = source.stand && statedAt === null;

  return {
    offers,
    source: {
      provider: source.provider,
      url: source.url,
      status: missed.length === 0 ? 'ok' : offers.length === 0 ? 'failed' : 'partial',
      checkedAt,
      ...(missed.length > 0 || lostDate
        ? {
            note: [
              missed.length > 0 ? `No rate found for: ${missed.join(', ')}` : null,
              lostDate ? 'No Stand date found; age falls back to the scrape date' : null,
            ]
              .filter(Boolean)
              .join('. '),
          }
        : {}),
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

async function main() {
  // Sequential rather than parallel: a handful of requests once a day should
  // look like a visitor, not like a burst against six banks at once.
  const results = [];
  for (const source of SOURCES) {
    const result = await scrapeSource(source);
    results.push(result);
    const found = result.offers.length;
    console.log(
      `${result.source.status.padEnd(7)} ${source.provider} — ${found}/${source.offers.length} rates · ${source.url}`,
    );
    if (result.source.note) console.log(`        ${result.source.note}`);
  }

  const scraped = results.flatMap((r) => r.offers);
  const scrapedIds = new Set(scraped.map((o) => o.id));

  // Curated entries fill gaps rather than override: a live rate always wins.
  const curated = (await loadCurated()).filter((o) => !scrapedIds.has(o.id));

  // Institutions we cannot reach are part of the board's output, not an
  // omission: the page has to be able to say why a bank this size is missing.
  const unavailable = UNAVAILABLE.map((entry) => ({
    provider: entry.provider,
    url: entry.url,
    status: 'unavailable',
    checkedAt: today(),
    note: entry.reason,
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

  // A run where nothing at all was reachable is a real failure worth a red
  // build; a run that lost one bank is not.
  if (scraped.length === 0) {
    console.error('No source yielded a single rate — check the adapters.');
    process.exitCode = 1;
  }
}

await main();
