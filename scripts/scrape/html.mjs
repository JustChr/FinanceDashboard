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

/**
 * Blocks whose text content is markup machinery, never visible rate copy.
 *
 * The lookbehind matters more than it looks: a self-closing `<svg … />` has no
 * closing tag, so without it the pattern runs on to the next `</svg>` far down
 * the page and swallows every rate in between. That failure is silent — the
 * scrape simply finds nothing — so it has to be excluded structurally.
 */
const DROPPED_ELEMENTS = /<(script|style|noscript|svg|head)\b[^>]*(?<!\/)>[\s\S]*?<\/\1\s*>/gi;

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
 */
export function htmlToText(html) {
  return decodeEntities(
    html
      .replace(DROPPED_ELEMENTS, ' ')
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
 * A polite, identifiable fetch with a hard timeout, returning flattened text.
 *
 * Handles both HTML pages and PDFs, because the two halves of the Austrian
 * market publish differently: the direct banks put rates in HTML, while the
 * branch networks publish a *Konditionenaushang* PDF and nothing else.
 *
 * The user agent stays identifiable on purpose. A site that refuses it is
 * refusing us specifically, and the answer to that is to record the refusal —
 * never to drop the identification until the request is let through.
 */
export async function fetchPage(url, { timeoutMs = 25_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'ALMDeskBot/1.0 (+https://github.com/JustChr/FinanceDashboard; daily rate board)',
        Accept: 'text/html,application/xhtml+xml,application/pdf',
        'Accept-Language': 'de-AT,de;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const type = res.headers.get('content-type') ?? '';
    if (type.includes('pdf') || new URL(res.url).pathname.toLowerCase().endsWith('.pdf')) {
      const { pdfToText } = await import('./pdf.mjs');
      return pdfToText(Buffer.from(await res.arrayBuffer()));
    }
    return htmlToText(await res.text());
  } finally {
    clearTimeout(timer);
  }
}
