/**
 * Turning a bank's rate page into something a probe can match against.
 *
 * These adapters deliberately do not use CSS selectors. A bank redesign changes
 * class names and DOM nesting constantly, but the *words* next to a rate — the
 * term, the product name, the per-cent sign — are the thing the bank is legally
 * and commercially committed to keeping legible. Matching flattened text with a
 * proximity window survives redesigns that would break any selector, and needs
 * no HTML parser dependency in the workflow.
 */

import { pdfToText } from './pdf.mjs';

/**
 * Blocks whose text content is markup machinery, never visible rate copy.
 *
 * The lookbehind matters more than it looks: a self-closing `<svg … />` has no
 * closing tag, so without it the pattern runs on to the next `</svg>` far down
 * the page and swallows every rate in between. That failure is silent — the
 * scrape simply finds nothing — so it has to be excluded structurally.
 */
const DROPPED_ELEMENTS = /<(script|style|noscript|svg|head)\b[^>]*(?<!\/)>[\s\S]*?<\/\1\s*>/gi;

/** The same, but keeping `<script>` bodies — see `includeScripts` below. */
const DROPPED_EXCEPT_SCRIPTS = /<(style|noscript|svg|head)\b[^>]*(?<!\/)>[\s\S]*?<\/\1\s*>/gi;

/**
 * Unescapes HTML that has been embedded inside a JSON string.
 *
 * Content-managed pages increasingly ship their copy as JSON in a `<script>`
 * block and render it in the browser, so the markup arrives escaped:
 * `<strong>Sollzinssatz</strong>`. Left alone it survives
 * tag-stripping intact and glues itself to the words a probe is anchored on.
 */
function decodeJsonEscapes(text) {
  return text
    .replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\(["/\\])/g, '$1');
}

const ENTITIES = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'",
  euro: '€',
  ndash: '–',
  mdash: '—',
  shy: '',
};

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const key = entity.toLowerCase();
    if (key in ENTITIES) return ENTITIES[key];
    if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith('#')) return String.fromCodePoint(Number(key.slice(1)));
    return match;
  });
}

/**
 * Flattens HTML to single-spaced text.
 *
 * Tags become a single space rather than nothing: `<td>12 Monate</td><td>2,8 %`
 * must not collapse into `12 Monate2,8 %`, which would defeat every probe.
 *
 * `includeScripts` keeps `<script>` bodies in the text. It is off by default
 * because script text is mostly machinery and matching against it invites false
 * positives — but several banks, Erste and bank99 among them, publish their
 * legally required representative example *only* inside an embedded JSON blob.
 * Dropping scripts is the obvious way to clean a page and it silently hides
 * exactly those sources, so this is opt-in per source rather than global.
 */
export function htmlToText(html, { includeScripts = false } = {}) {
  const source = includeScripts ? decodeJsonEscapes(html) : html;
  return decodeEntities(
    source
      .replace(includeScripts ? DROPPED_EXCEPT_SCRIPTS : DROPPED_ELEMENTS, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses an Austrian-format number. German decimal commas are the norm on these
 * pages; a thousands separator in a rate is impossible, so a dot is a decimal
 * point too and both spellings are accepted.
 *
 * Internal whitespace is stripped before parsing. PDF rate sheets position
 * glyphs individually, so a rate routinely extracts as `1, 5 00` — the spaces
 * are an artefact of kerning, not of the number.
 */
export function parseRate(raw) {
  if (raw === undefined || raw === null) return null;
  const value = Number(String(raw).replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/**
 * Parses the date a bank stamps on its own figure — `Stand: 08.07.2026`.
 *
 * Whitespace is stripped first for the same reason `parseRate` strips it: a PDF
 * positions glyphs individually, so BAWAG's sheet extracts its date as
 * `22.0 9 .2025`. A two-digit year is rejected rather than guessed at, because
 * guessing the century on a rate sheet is how a 2025 figure becomes a 1925 one.
 */
export function parseGermanDate(raw) {
  if (raw === undefined || raw === null) return null;
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(raw).replace(/\s+/g, ''));
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/**
 * Rejects values outside the range a retail rate can plausibly occupy.
 *
 * This is the guard that keeps a page redesign from publishing nonsense: a probe
 * that drifts onto a deposit-guarantee figure or a percentage of customers
 * satisfied yields something like 100 or 98.1, and must fail loudly rather than
 * reach the board.
 */
export function plausible(value, { min = 0, max = 25 } = {}) {
  return value !== null && value >= min && value <= max;
}

/**
 * The user agent stays identifiable on purpose. A site that refuses it is
 * refusing us specifically, and the answer to that is to record the refusal —
 * never to drop the identification until the request is let through.
 */
export const USER_AGENT =
  'ALMDeskBot/1.0 (+https://github.com/JustChr/FinanceDashboard; daily rate board)';

/**
 * Flattens a fetched body, HTML or PDF, to text.
 *
 * Both halves of the Austrian market have to be handled, because they publish
 * differently: the direct banks put rates in HTML, while the branch networks
 * publish a *Konditionenaushang* PDF and nothing else. The magic bytes are
 * checked as well as the headers, because an archive capture does not always
 * replay the original content type.
 */
export function bodyToText(buffer, { contentType = '', url = '', includeScripts = false } = {}) {
  const isPdf =
    contentType.includes('pdf') ||
    buffer.subarray(0, 5).toString('latin1') === '%PDF-' ||
    (url && new URL(url).pathname.toLowerCase().endsWith('.pdf'));
  if (isPdf) return pdfToText(buffer);
  return htmlToText(buffer.toString('utf8'), { includeScripts });
}

/** A polite, identifiable fetch with a hard timeout, returning flattened text. */
export async function fetchPage(url, { timeoutMs = 25_000, includeScripts = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/pdf',
        'Accept-Language': 'de-AT,de;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    return bodyToText(Buffer.from(await res.arrayBuffer()), {
      contentType: res.headers.get('content-type') ?? '',
      url: res.url,
      includeScripts,
    });
  } finally {
    clearTimeout(timer);
  }
}
