/**
 * Adapter-writing aid. Prints every rate-shaped match on a page, with the text
 * around it, so a probe can be written against wording that is actually there.
 *
 *   node scripts/scrape/inspect.mjs https://www.addiko.at/festgeld/
 *   node scripts/scrape/inspect.mjs https://bank99.at/kredit/rundumkredit99 "sollzins[^.]{0,90}"
 *
 * A page that prints almost no text is client-rendered: the rates exist only
 * after JavaScript runs, and no probe here will reach them.
 */

import { fetchPage } from './html.mjs';

const url = process.argv[2];
const pattern = process.argv[3] ?? '\\d+[.,]\\d+\\s*%';

try {
  const text = await fetchPage(url, { timeoutMs: 30_000 });
  const matches = [...text.matchAll(new RegExp(pattern, 'gi'))];
  console.log(`OK ${url}\n   chars=${text.length} matches=${matches.length}`);
  const seen = new Set();
  for (const m of matches) {
    const context = text.slice(Math.max(0, m.index - 120), m.index + m[0].length + 50).trim();
    if (seen.has(context)) continue;
    seen.add(context);
    console.log('  ·', context);
    if (seen.size >= 24) break;
  }
} catch (err) {
  console.log(`FAIL ${url}: ${err.message}`);
}
