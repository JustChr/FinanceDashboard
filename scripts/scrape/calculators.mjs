/**
 * Calculator flows that take more than one request.
 *
 * Each function here returns `{ offer, url, text }` documents for `index.mjs`
 * to run the source's probes against — see `documentsOf` there. The flows fetch
 * and assemble; they never decide a rate themselves.
 */

import { htmlToText, request } from './html.mjs';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/* ------------------------------------------------------------------ *
 * UniCredit Bank Austria
 * ------------------------------------------------------------------ */

const BANK_AUSTRIA_PAGE = 'https://www.bankaustria.at/kreditrechner.jsp';
const BANK_AUSTRIA_API = 'https://rechner.bankaustria.at/api/calculate-mortgage-periods/';

/** The value of one attribute on one tag, or null. */
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;

/** A hidden input's `value`, looked up by its name. */
function hiddenValue(html, name) {
  const tag = html.match(new RegExp(`<input type="hidden" name="${name}"[^>]*>`))?.[0];
  return tag ? attr(tag, 'value') : null;
}

/**
 * Bank Austria's Wohnkredit calculator, read the way its page runs it.
 *
 * The rates live only on the calculator page, as attributes of the housing
 * form's rate field (verified 2026-09-14):
 * `data-variable-interest-rate="3.625"` and
 * `data-fixed-interest-rate="5:3.10|10:3.75|15:3.95|20:4.05|25:4.25"`, beside the
 * fees as hidden inputs. `rechner.bankaustria.at` then amortises whatever rate
 * it is sent — it holds no pricing of its own, and refuses a request without
 * one. So the page is read for the rates and fees, and the bank's own API is
 * asked for the effective rate at our profile, with the parameters the page's
 * script sends:
 *
 * - variable: fixation `interest_period_1` equal to the whole term, at the
 *   variable rate (the script turns a fixation of 0 into exactly that);
 * - fixed N years: the fixed rate for N, then `interest_rate_2` — the rate the
 *   script assumes once the fixation ends, the variable rate.
 *
 * Only the page needs the browser user agent; the API answers identified.
 */
export async function bankAustriaQuotes({ amount, years, fixations }) {
  const page = await request(BANK_AUSTRIA_PAGE, { browser: true });
  if (!page.ok) throw new Error(`HTTP ${page.status}`);

  const rateTag = page.text.match(/<input type="hidden" name="interest_rate_1"[^>]*>/)?.[0];
  const variable = rateTag && attr(rateTag, 'data-variable-interest-rate');
  const ladder = rateTag && attr(rateTag, 'data-fixed-interest-rate');
  if (!variable || !ladder) throw new Error('Rate attributes not found on the calculator page');

  const fixed = Object.fromEntries(ladder.split('|').map((pair) => pair.split(':')));
  const fees = Object.fromEntries(
    ['accountFeeMonthly', 'processingFeePerc', 'riskFeePerc', 'entryFeePerc', 'estimateFee', 'estimateFeePerc'].map(
      (name) => [name, hiddenValue(page.text, name) ?? ''],
    ),
  );

  const docs = [];
  for (const fixation of fixations) {
    const offer = fixation === 0 ? 'bankaustria-rechner-variabel' : `bankaustria-rechner-fix-${fixation}j`;
    const rate = fixation === 0 ? variable : fixed[fixation];
    if (rate === undefined) {
      docs.push({ offer, url: BANK_AUSTRIA_PAGE, error: new Error(`No ${fixation}-year rate published`) });
      continue;
    }

    const params = new URLSearchParams({
      credit_value: String(amount),
      retention: String(years),
      typ: '1',
      new: '1',
      ...fees,
      interest_period_1: String(fixation === 0 ? years : fixation),
      interest_rate_1: rate,
      ...(fixation !== 0 && fixation < years ? { interest_rate_2: variable } : {}),
    });
    const url = `${BANK_AUSTRIA_API}?${params}`;

    await sleep(1000);
    const res = await request(url);
    docs.push(res.ok ? { offer, url, text: res.text } : { offer, url, error: new Error(`HTTP ${res.status}`) });
  }
  return docs;
}

/* ------------------------------------------------------------------ *
 * Oberbank
 * ------------------------------------------------------------------ */

const OBERBANK_PAGE = 'https://www.oberbank.at/eshop-wohnbau';

/** `300000` as the form expects it: `300.000,00`. */
const germanAmount = (amount) =>
  `${Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')},00`;

/**
 * Oberbank's eShop calculator, a JSF (Mojarra) form inside a Liferay portlet.
 *
 * Oberbank's robots.txt disallows the `p_p_id` URLs this form posts to; reading
 * it anyway is a named exception decided on 2026-09-14, made with identified
 * requests — the exception is about the crawl policy, not about hiding who asks.
 *
 * One page load for the session cookie and view state, then one partial-ajax
 * POST that does what the Berechnen button does. Three things it took to get
 * an answer rather than an empty 515-byte response, verified 2026-09-14:
 *
 * - The POST goes to the form's `javax.faces.encodedURL` (the portlet's
 *   resource phase), not to its `action`.
 * - The `javax.faces.*` parameters must carry the portlet namespace — the
 *   response's own `parameterPrefix` — or the portlet never sees them.
 * - The button submits only `@this`; amount and term are normally sent by
 *   their own blur events, so they are named in `partial.execute` explicitly.
 *
 * The form is located by its Berechnen button rather than by id: the
 * `j_idt…` ids are generated and change when the view is rebuilt.
 */
export async function oberbankQuote({ offer, amount, years }) {
  const page = await request(OBERBANK_PAGE);
  if (!page.ok) throw new Error(`HTTP ${page.status}`);

  const button = page.text.match(/name="([^"]*:calcBtn:cmdBtn)"/)?.[1];
  if (!button) throw new Error('Calculator button not found');
  const formId = button.slice(0, button.indexOf(':calcBtn'));
  const namespace = formId.slice(0, formId.indexOf(':') + 1);

  const start = page.text.indexOf(`id="${formId}"`);
  const form = page.text.slice(start, page.text.indexOf('</form>', start));
  const fields = {};
  for (const [tag] of form.matchAll(/<input[^>]*>/g)) {
    const name = attr(tag, 'name');
    if (!name || ['checkbox', 'submit', 'button'].includes(attr(tag, 'type'))) continue;
    const value = (attr(tag, 'value') ?? '').replace(/&amp;/g, '&');
    fields[name] = value === 'undefined' ? '' : value;
  }
  const field = (suffix) => Object.keys(fields).find((name) => name.endsWith(suffix));
  const amountField = field(':amount');
  const termField = field(':retention');
  const endpoint = fields[field('javax.faces.encodedURL')];
  if (!amountField || !termField || !endpoint) throw new Error('Calculator form fields not found');

  fields[amountField] = germanAmount(amount);
  fields[termField] = String(years);

  const jsf = {
    'javax.faces.source': button,
    'javax.faces.partial.event': 'click',
    'javax.faces.partial.execute': `${button} ${amountField} ${termField}`,
    'javax.faces.partial.render': `${formId}:calcPanel`,
    'javax.faces.behavior.event': 'action',
    'javax.faces.partial.ajax': 'true',
  };
  const body = new URLSearchParams({
    ...fields,
    [formId]: formId,
    [button]: button,
    ...Object.fromEntries(Object.entries(jsf).map(([name, value]) => [namespace + name, value])),
  });

  await sleep(1500);
  const res = await request(endpoint, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Faces-Request': 'partial/ajax',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: page.headers
        .getSetCookie()
        .map((cookie) => cookie.split(';')[0])
        .join('; '),
      Referer: OBERBANK_PAGE,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!res.text.includes('calcPanel')) throw new Error('Calculator returned no result panel');

  // The result panel is HTML inside the partial response's CDATA.
  return [{ offer, url: OBERBANK_PAGE, text: htmlToText(res.text.replace(/<!\[CDATA\[|\]\]>/g, ' ')) }];
}
