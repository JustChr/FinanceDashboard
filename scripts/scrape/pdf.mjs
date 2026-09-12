/**
 * Just enough PDF to read a rate sheet.
 *
 * The large Austrian banks — the Sparkassen, the Raiffeisen banks, Bank Austria —
 * do not put their savings rates in HTML. They publish a *Konditionenaushang*, a
 * PDF they are legally obliged to display, and that is the only place the real
 * numbers appear. Skipping PDFs means skipping the institutions that hold most
 * of the retail money, which is precisely the money the ECB average is built on.
 *
 * This extracts the text-showing operators and nothing else: no layout, no
 * tables, no fonts. That is enough, because the probes downstream match on the
 * words around a rate rather than on position. Scanned or image-only PDFs yield
 * nothing and are reported as a failed source rather than silently empty.
 *
 * Deliberately dependency-free. A full PDF library would pull megabytes into a
 * workflow whose entire job is to read a few dozen numbers a day.
 */

import { inflateSync, inflateRawSync } from 'node:zlib';

/** Octal and single-character escapes inside a PDF literal string. */
const ESCAPES = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };

/**
 * PDF literal strings are Latin-1-ish with backslash escapes. Austrian rate
 * sheets are full of `ä`, `ö` and `ü`, so the byte values have to survive intact
 * rather than being read as UTF-8.
 */
function decodeLiteral(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = raw[++i];
    if (next === undefined) break;
    if (next >= '0' && next <= '7') {
      let octal = next;
      while (octal.length < 3 && raw[i + 1] >= '0' && raw[i + 1] <= '7') octal += raw[++i];
      out += String.fromCharCode(parseInt(octal, 8));
    } else if (next === '\n') {
      // A backslash at end of line is a continuation, not a character.
    } else {
      out += ESCAPES[next] ?? next;
    }
  }
  return out;
}

/**
 * Hex strings are bytes, and the encoding is not stated in the string itself.
 *
 * A leading `FE FF` byte-order mark means UTF-16BE, which is what generators
 * emit for anything with an umlaut — and an Austrian rate sheet is full of them.
 * Read byte-wise, that text arrives as `þÿ` followed by every second character
 * being a null, which is how whole table cells go missing.
 */
function decodeHex(raw) {
  const hex = raw.replace(/[^0-9a-f]/gi, '');
  const bytes = [];
  for (let i = 0; i + 1 < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return out;
  }

  return bytes.map((b) => String.fromCharCode(b)).join('');
}

/**
 * Pulls the decompressed content of every stream in the file.
 *
 * Streams that are not Flate-compressed, or that fail to inflate, are skipped:
 * a rate sheet has many streams (fonts, images, metadata) and only the content
 * streams matter, so one unreadable stream must not abort the document.
 */
function* streams(buffer) {
  const marker = Buffer.from('stream');
  const endMarker = Buffer.from('endstream');

  let index = 0;
  while ((index = buffer.indexOf(marker, index)) !== -1) {
    // Skip `endstream`, which also contains the word `stream`.
    if (index >= 3 && buffer.slice(index - 3, index).toString('latin1') === 'end') {
      index += marker.length;
      continue;
    }

    let start = index + marker.length;
    if (buffer[start] === 0x0d) start++;
    if (buffer[start] === 0x0a) start++;

    const end = buffer.indexOf(endMarker, start);
    if (end === -1) break;

    const raw = buffer.slice(start, end);
    index = end + endMarker.length;

    try {
      yield inflateSync(raw).toString('latin1');
    } catch {
      try {
        yield inflateRawSync(raw).toString('latin1');
      } catch {
        // Not a Flate stream, or corrupt. Uncompressed content streams are rare
        // but legal, so fall back to the raw bytes if they look like operators.
        const text = raw.toString('latin1');
        if (text.includes('BT') && text.includes('Tj')) yield text;
      }
    }
  }
}

/**
 * Extracts the visible text of a content stream.
 *
 * `Tj` and `'` show one string; `TJ` shows an array of strings interleaved with
 * kerning numbers. The kerning is what separates words in many generators, so a
 * large negative adjustment is treated as a space — without that, `2,00 % p.a.`
 * arrives as `2,00%p.a.` and every probe expecting a space fails.
 */
function textOf(stream) {
  let out = '';
  const tokens = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>|-?\d+\.?\d*|TJ|Tj|'|"|Td|TD|T\*|ET/g;

  let pending = '';
  let match;
  while ((match = tokens.exec(stream)) !== null) {
    const token = match[0];

    if (token.startsWith('(')) {
      pending += decodeLiteral(token.slice(1, -1));
    } else if (token.startsWith('<')) {
      pending += decodeHex(token.slice(1, -1));
    } else if (token === 'TJ' || token === 'Tj' || token === "'" || token === '"') {
      out += pending;
      pending = '';
    } else if (token === 'Td' || token === 'TD' || token === 'T*' || token === 'ET') {
      // A new text position is a new line for our purposes.
      out += `${pending}\n`;
      pending = '';
    } else if (Number(token) < -100) {
      // Wide kerning gap inside a TJ array: the generator's word break.
      pending += ' ';
    }
  }
  return out + pending;
}

/**
 * Share of characters that could plausibly be prose.
 *
 * Image and colour-profile streams inflate cleanly and occasionally contain the
 * bytes `Tj` by coincidence, which drags a few hundred characters of binary
 * noise into the output. Noise cannot match a probe, but it can pad the text
 * enough to hide that a document yielded nothing readable, so whole streams are
 * judged and dropped rather than filtered character by character.
 */
function legibility(text) {
  if (text.length === 0) return 0;
  const readable = text.match(/[\p{L}\p{N}\s.,;:%()/–—+-]/gu);
  return (readable?.length ?? 0) / text.length;
}

/**
 * Language markers from tagged PDFs.
 *
 * Accessible PDFs — which a bank's legally-displayed rate sheet generally is —
 * emit the `/Lang` value into the content stream, so the text arrives peppered
 * with `de-DE` glued to the words around it: `de-DEBindung 12 Monate`.
 *
 * There is deliberately no trailing word boundary. The tag runs straight into
 * the following word far more often than not — `de-DESPARBUCH` — and requiring
 * a boundary leaves exactly those cases in place, which is worse than useless
 * because it corrupts the label a probe is trying to anchor on.
 */
const LANGUAGE_TAGS = /\b(?:de|en|fr|it)-(?:DE|AT|GB|US|CH|FR|IT)/g;

/** Flattens a PDF to single-spaced text, the same shape `htmlToText` returns. */
export function pdfToText(buffer) {
  let text = '';
  for (const stream of streams(buffer)) {
    if (!stream.includes('Tj') && !stream.includes('TJ')) continue;
    const extracted = textOf(stream);
    if (legibility(extracted) < 0.9) continue;
    text += `${extracted}\n`;
  }

  return text.replace(LANGUAGE_TAGS, ' ').replace(/\s+/g, ' ').trim();
}
