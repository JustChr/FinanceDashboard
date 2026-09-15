/**
 * Builds `public/data/oenb.json`: Austrian interest rate statistics the ECB
 * does not publish, from the Oesterreichische Nationalbank's web service.
 *
 * The OeNB sends no CORS headers, so the page cannot ask it directly. Run by
 * `.github/workflows/offers.yml` after the scrape; the file is committed with
 * the offers and loaded same-origin.
 *
 * Two gaps it fills:
 *
 * - New-business volume by fixation. The ECB carries Austrian volume only as a
 *   total; the OeNB publishes the two shortest buckets, which gives the variable
 *   share of new lending.
 * - Rates on Spareinlagen — Sparbuch and Kapitalsparbuch money — by agreed
 *   maturity, an Austrian breakdown with no ECB series.
 *
 * A failed or partial answer never replaces good data: a series the OeNB did not
 * return keeps what the previous file held.
 *
 * Web service guide: https://www.oenb.at/en/Statistics/User-Defined-Tables/webservice.html
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { USER_AGENT } from '../scrape/html.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT = resolve(ROOT, 'public/data/oenb.json');
const ENDPOINT = 'https://www.oenb.at/isadataservice/data';
/** "Interest rates of credit institutions" in the OeNB's content tree. */
const HIERARCHY = '23';
/** MIR begins in January 2003; the positions report NaN before it. */
const START = '2003-01';

/**
 * Dashboard id → OeNB position: all Austrian MFIs, business with Austrian
 * households, new business. The position titles say "in euro area"; the region
 * dimension is Austria.
 */
const SERIES = {
  housing_volume: 'VDBZSBSVN10010',
  housing_volume_var: 'VDBZSME41BSVN10110',
  housing_volume_1_5: 'VDBZSME41BSVN10510',
  consumer_volume: 'VDBZSBSVN19010',
  consumer_volume_var: 'VDBZSME41BSVN19110',
  savings_le1: 'VDBZSME41BSZN1C110',
  savings_1_2: 'VDBZSME41BSZN1C210',
  savings_2p: 'VDBZSME41BSZN1C410',
};

const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/** Reads the OeNB's XML into monthly series by position, without relying on attribute order. */
function parseOenb(xml) {
  const out = new Map();
  // Attributes are matched as quoted values, not up to the first `>`: titles
  // escape `<` but not `>`, as in "agreed maturity > 2 y".
  for (const [, head, body] of xml.matchAll(/<dataSet\b((?:\s+\w+="[^"]*")*)\s*>([\s\S]*?)<\/dataSet>/g)) {
    const attr = (name) => decode(new RegExp(`\\b${name}="([^"]*)"`).exec(head)?.[1] ?? '');
    if (attr('freq') !== 'M') continue;
    const observations = [];
    for (const [, tag] of body.matchAll(/<obs\b([^>]*?)\/?>/g)) {
      // Months before a series began arrive as "NaN" and are dropped here.
      const value = Number(/\bvalue="([^"]*)"/.exec(tag)?.[1]);
      const period = /\bperiode="(\d{4}-\d{2})"/.exec(tag)?.[1];
      if (period && Number.isFinite(value)) observations.push({ period, value });
    }
    observations.sort((a, b) => a.period.localeCompare(b.period));
    out.set(attr('pos'), { title: attr('posTitle'), unit: attr('unitText'), observations });
  }
  return out;
}

async function loadPrevious() {
  try {
    return JSON.parse(await readFile(OUTPUT, 'utf8')).series ?? {};
  } catch {
    return {};
  }
}

async function main() {
  const params = new URLSearchParams({ lang: 'EN', hierid: HIERARCHY, freq: 'M', starttime: START });
  for (const pos of Object.values(SERIES)) params.append('pos', pos);
  const url = `${ENDPOINT}?${params}`;
  const previous = await loadPrevious();

  let fetched = new Map();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fetched = parseOenb(await res.text());
  } catch (err) {
    console.error(`OeNB web service could not be read: ${err.message}`);
  }

  const series = {};
  let fresh = 0;
  for (const [id, pos] of Object.entries(SERIES)) {
    const got = fetched.get(pos);
    if (got && got.observations.length > 0) {
      series[id] = { pos, ...got };
      fresh++;
      console.log(`ok      ${id} — ${pos}, ${got.observations.length} months to ${got.observations.at(-1).period}`);
    } else if (previous[id]) {
      series[id] = previous[id];
      console.log(`kept    ${id} — ${pos} not returned, previous series kept`);
    } else {
      console.log(`missing ${id} — ${pos} not returned and nothing to keep`);
    }
  }

  if (fresh === 0) {
    // Leave the committed file as it is, generatedAt included, so its age stays true.
    console.error('No OeNB series returned; public/data/oenb.json left unchanged.');
    process.exitCode = 1;
    return;
  }

  const json = JSON.stringify({ generatedAt: new Date().toISOString(), source: url, series }, null, 2)
    // One observation per line: a pretty-printed month over four lines is most of the file.
    .replace(/\{\n\s+"period": "([^"]+)",\n\s+"value": ([^\n]+)\n\s+\}/g, '{ "period": "$1", "value": $2 }');
  await writeFile(OUTPUT, `${json}\n`, 'utf8');
  console.log(`\nWrote ${fresh} of ${Object.keys(SERIES).length} OeNB series to public/data/oenb.json`);
}

await main();
