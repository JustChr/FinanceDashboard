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
 *
 * Returns character codes rather than a string: when the font carries a
 * `/ToUnicode` map those codes are glyph indices that mean nothing until they
 * are mapped, and mapping has to happen before they become text.
 */
function literalCodes(raw) {
  const codes = [];
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') {
      codes.push(raw.charCodeAt(i));
      continue;
    }
    const next = raw[++i];
    if (next === undefined) break;
    if (next >= '0' && next <= '7') {
      let octal = next;
      while (octal.length < 3 && raw[i + 1] >= '0' && raw[i + 1] <= '7') octal += raw[++i];
      codes.push(parseInt(octal, 8));
    } else if (next === '\n') {
      // A backslash at end of line is a continuation, not a character.
    } else {
      codes.push((ESCAPES[next] ?? next).charCodeAt(0));
    }
  }
  return codes;
}

/**
 * Hex strings are bytes, and the encoding is not stated in the string itself.
 *
 * A leading `FE FF` byte-order mark means UTF-16BE, which is what generators
 * emit for anything with an umlaut — and an Austrian rate sheet is full of them.
 * Read byte-wise, that text arrives as `þÿ` followed by every second character
 * being a null, which is how whole table cells go missing.
 */
function decodeHex(raw, cmap) {
  const hex = raw.replace(/[^0-9a-f]/gi, '');
  const bytes = [];
  for (let i = 0; i + 1 < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }

  if (cmap) {
    // A subset font's codes are usually two bytes wide; fall back to one byte
    // when that yields nothing, rather than returning an empty cell.
    if (hex.length % 4 === 0) {
      let wide = '';
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        wide += cmap.get((bytes[i] << 8) | bytes[i + 1]) ?? '';
      }
      if (wide.trim() !== '') return wide;
    }
    return bytes.map((b) => cmap.get(b) ?? '').join('');
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

/** Inflates a stream body, tolerating both zlib and raw-deflate wrapping. */
function inflate(raw) {
  try {
    return inflateSync(raw);
  } catch {
    try {
      return inflateRawSync(raw);
    } catch {
      return null;
    }
  }
}

/** The bytes between `stream` and `endstream`, decompressed where possible. */
function streamBody(object) {
  const match = /stream\r?\n/.exec(object.toString('latin1'));
  if (!match) return null;
  const end = object.lastIndexOf(Buffer.from('endstream'));
  if (end === -1) return null;

  const raw = object.slice(match.index + match[0].length, end);
  return inflate(raw) ?? raw;
}

/**
 * Every indirect object in the file, by number.
 *
 * Objects do not all live at the top level. Modern generators pack most of the
 * document — including the font dictionaries this module needs — into compressed
 * `/ObjStm` object streams, which have to be inflated and split before anything
 * inside them is visible. A parser that only scans for `N 0 obj` sees a fraction
 * of the file and finds no fonts at all.
 */
function loadObjects(buffer) {
  const objects = new Map();
  const text = buffer.toString('latin1');

  const header = /(\d+)\s+0\s+obj/g;
  let match;
  while ((match = header.exec(text)) !== null) {
    const start = match.index + match[0].length;
    const end = text.indexOf('endobj', start);
    if (end === -1) continue;
    objects.set(Number(match[1]), buffer.slice(start, end));
  }

  for (const object of [...objects.values()]) {
    if (!object.includes('/ObjStm')) continue;
    const body = streamBody(object);
    if (!body) continue;

    const head = object.toString('latin1');
    const count = Number(/\/N\s+(\d+)/.exec(head)?.[1]);
    const first = Number(/\/First\s+(\d+)/.exec(head)?.[1]);
    if (!Number.isFinite(count) || !Number.isFinite(first)) continue;

    const offsets = body.slice(0, first).toString('latin1').trim().split(/\s+/).map(Number);
    for (let i = 0; i < count; i++) {
      const number = offsets[2 * i];
      const offset = offsets[2 * i + 1];
      if (!Number.isFinite(number) || !Number.isFinite(offset)) break;
      const next = i + 1 < count ? first + offsets[2 * i + 3] : body.length;
      objects.set(number, body.slice(first + offset, next));
    }
  }

  return objects;
}

/**
 * Reads a `/ToUnicode` CMap into a glyph-code → text map.
 *
 * Subsetted fonts — which is what a bank's DTP tool emits — number their glyphs
 * from 1 in the order they happen to be used, so the content stream says
 * `\001\002\003` and means nothing without this table. Without it the document
 * extracts as control characters, the legibility guard drops every stream, and
 * the file looks like an unreadable scan when it is in fact perfectly good text.
 */
function parseCMap(body) {
  const text = body.toString('latin1');
  const cmap = new Map();
  const codePoints = (hex) => {
    let out = '';
    for (let i = 0; i + 3 < hex.length + 1; i += 4) {
      out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    }
    return out;
  };

  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, from, to] of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) {
      cmap.set(parseInt(from, 16), codePoints(to));
    }
  }

  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    // `<lo> <hi> <base>` walks a contiguous run of code points…
    for (const [, lo, hi, base] of block[1].matchAll(
      /<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi,
    )) {
      const start = parseInt(lo, 16);
      const stop = Math.min(parseInt(hi, 16), start + 0xffff);
      const first = parseInt(base, 16);
      for (let i = 0; start + i <= stop; i++) cmap.set(start + i, String.fromCharCode(first + i));
    }
    // …while `<lo> <hi> [ <a> <b> … ]` spells each destination out.
    for (const [, lo, , list] of block[1].matchAll(
      /<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*\[([\s\S]*?)\]/gi,
    )) {
      const start = parseInt(lo, 16);
      let i = 0;
      for (const [, hex] of list.matchAll(/<([0-9a-f]+)>/gi)) cmap.set(start + i++, codePoints(hex));
    }
  }

  return cmap;
}

/** Font object number → its `/ToUnicode` map, for every font that has one. */
function fontMaps(objects) {
  const maps = new Map();
  for (const [number, object] of objects) {
    if (!object.includes('/Font')) continue;
    const ref = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(object.toString('latin1'));
    if (!ref) continue;
    const body = objects.get(Number(ref[1]));
    if (body) maps.set(number, parseCMap(streamBody(body) ?? body));
  }
  return maps;
}

/** The balanced `<< … >>` dictionary following `key`, as latin-1 text. */
function dictionaryAfter(text, key) {
  const open = new RegExp(`${key}\\s*<<`).exec(text);
  if (!open) return '';
  let depth = 0;
  for (let i = open.index + open[0].length - 2; i < text.length - 1; i++) {
    const pair = text.slice(i, i + 2);
    if (pair === '<<') depth++;
    else if (pair === '>>' && --depth === 0) return text.slice(open.index, i + 2);
  }
  return '';
}

/**
 * Resource name (`/F0`) → font object, for one page.
 *
 * This has to be done per page and cannot be collected document-wide. Every page
 * carries its own `/Resources`, and `/F0` routinely names a *different* subset
 * font on each one. A single shared table therefore decodes page 1 correctly and
 * turns every later page into convincing-looking gibberish — which is worse than
 * failing, because the legibility guard still passes it.
 */
function pageFonts(objects, page) {
  let resources = dictionaryAfter(page, '/Resources');
  if (!resources) {
    const ref = /\/Resources\s+(\d+)\s+0\s+R/.exec(page);
    const target = ref && objects.get(Number(ref[1]));
    resources = target ? target.toString('latin1') : '';
  }

  let fonts = dictionaryAfter(resources, '/Font');
  if (!fonts) {
    const ref = /\/Font\s+(\d+)\s+0\s+R/.exec(resources);
    const target = ref && objects.get(Number(ref[1]));
    fonts = target ? target.toString('latin1') : '';
  }

  const names = new Map();
  for (const [, name, number] of fonts.matchAll(/\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+0\s+R/g)) {
    names.set(name, Number(number));
  }
  return names;
}

/**
 * Extracts the visible text of a content stream.
 *
 * `Tj` and `'` show one string; `TJ` shows an array of strings interleaved with
 * kerning numbers. The kerning is what separates words in many generators, so a
 * large negative adjustment is treated as a space — without that, `2,00 % p.a.`
 * arrives as `2,00%p.a.` and every probe expecting a space fails.
 */
function textOf(buffer, maps, names) {
  // Latin-1 explicitly, never the default UTF-8: these bytes are a single-byte
  // encoding, and decoding them as UTF-8 turns every `ü` in a German rate sheet
  // into a replacement character — which then fails to match any probe
  // anchored on a word like `Gültig` or `Vermögen`.
  const stream = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : buffer;
  let out = '';
  const tokens =
    /\/([A-Za-z0-9_.+-]+)\s+[\d.]+\s+Tf|\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>|-?\d+\.?\d*|TJ|Tj|'|"|Td|TD|T\*|ET/g;

  let pending = '';
  let cmap;
  let match;
  while ((match = tokens.exec(stream)) !== null) {
    const token = match[0];

    if (match[1] !== undefined) {
      // `Tf` selects the font every following string is written in.
      cmap = maps.get(names.get(match[1]));
    } else if (token.startsWith('(')) {
      const codes = literalCodes(token.slice(1, -1));
      pending += cmap
        ? codes.map((code) => cmap.get(code) ?? '').join('')
        : codes.map((code) => String.fromCharCode(code)).join('');
    } else if (token.startsWith('<')) {
      pending += decodeHex(token.slice(1, -1), cmap);
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

/** Walks the page tree, decoding each page with its own fonts. */
function pageText(objects, maps) {
  const parts = [];
  const seen = new Set();

  for (const object of objects.values()) {
    const head = object.toString('latin1');
    if (!/\/Type\s*\/Page(?![s])/.test(head)) continue;

    const names = pageFonts(objects, head);
    const contents = [];
    const single = /\/Contents\s+(\d+)\s+0\s+R/.exec(head);
    if (single) contents.push(Number(single[1]));
    const array = /\/Contents\s*\[([^\]]*)\]/.exec(head);
    if (array) {
      for (const [, number] of array[1].matchAll(/(\d+)\s+0\s+R/g)) contents.push(Number(number));
    }

    for (const number of contents) {
      if (seen.has(number)) continue;
      seen.add(number);
      const body = objects.get(number);
      const stream = body && streamBody(body);
      if (stream) parts.push(textOf(stream, maps, names));
    }
  }

  return parts;
}

/**
 * Sweeps every stream, ignoring the page tree.
 *
 * Kept as a fallback for files whose page tree this parser cannot follow: those
 * are usually the older, simply-encoded sheets that need no font mapping at all,
 * so a document-wide font table is safe here in a way it would not be above.
 */
function sweepText(objects, maps) {
  const names = new Map();
  for (const object of objects.values()) {
    for (const block of object.toString('latin1').matchAll(/\/Font\s*<<([\s\S]*?)>>/g)) {
      for (const [, name, number] of block[1].matchAll(/\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+0\s+R/g)) {
        if (!names.has(name)) names.set(name, Number(number));
      }
    }
  }

  const parts = [];
  for (const object of objects.values()) {
    if (object.includes('/ObjStm') || object.includes('/Font')) continue;
    const stream = streamBody(object);
    if (!stream || (!stream.includes('Tj') && !stream.includes('TJ'))) continue;
    const extracted = textOf(stream, maps, names);
    if (legibility(extracted) < 0.9) continue;
    parts.push(extracted);
  }
  return parts;
}

/** Flattens a PDF to single-spaced text, the same shape `htmlToText` returns. */
export function pdfToText(buffer) {
  const objects = loadObjects(buffer);
  const maps = fontMaps(objects);

  let parts = pageText(objects, maps);
  if (parts.join('').trim() === '') parts = sweepText(objects, maps);

  return parts
    .join('\n')
    .replace(LANGUAGE_TAGS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
