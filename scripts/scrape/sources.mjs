/**
 * Declarative rate probes, one block per published condition page.
 *
 * Each probe is a regex with a single capture group, matched against the page
 * flattened to text. The `[^%]{0,N}` fences matter: they stop a probe drifting
 * across an intervening per-cent sign and picking up the rate for a different
 * term, which is the failure mode that would put a wrong number on the board
 * while still looking like a success.
 *
 * Every entry here was verified against the live page on 2026-09-12. When a bank
 * redesigns, the probe returns nothing, the source is marked `partial` or
 * `failed`, and the previous value survives as a curated fallback rather than
 * the board silently emptying.
 */

/**
 * Institutions that cannot be covered, and why.
 *
 * These are listed on the board rather than silently omitted. A savings board
 * that quietly skipped the largest branch networks would imply the Austrian
 * market looks like its direct banks, when the opposite is true: most retail
 * money sits with these institutions at far lower rates, which is most of why
 * the ECB volume-weighted average sits so far below the best advertised offer.
 */
export const UNAVAILABLE = [
  {
    provider: 'Erste Bank / Sparkasse — savings',
    url: 'https://www.sparkasse.at/sgruppe/privatkunden/sparen-anlegen',
    reason:
      'Savings rates appear only after JavaScript runs, and the published Konditionenaushang covers fees rather than interest. No static document states a deposit rate. Its housing-loan example is published and is on the board.',
  },
  {
    provider: 'UniCredit Bank Austria',
    url: 'https://www.bankaustria.at/privatkunden-finanzierungen-und-kredite-wohnkredit.jsp',
    reason:
      'Returns HTTP 403 to an identified client on every path, its own robots.txt included, so no crawl policy can even be read. Re-checked for the housing board on 2026-09-12 with the same result. Getting past that would mean removing the identification, which this scraper will not do.',
  },
  {
    provider: 'Volksbank',
    url: 'https://www.volksbank.at/zib/private/sparen/sparprodukte.page',
    reason:
      'Eight independent regional Volksbanks, each setting its own rates; the group site carries product descriptions but no figures, on savings or on housing loans.',
  },
  {
    provider: 'Raiffeisen — housing loans',
    url: 'https://www.raiffeisen.at/de/privatkunden/kredit-leasing/wohnfinanzierung.html',
    reason:
      'The housing pages render their calculator client-side and state no example. The one Raiffeisen document that does — the generic HIKrG information sheet — is boilerplate quoting 1,75%, a rate from the negative-rate era, so it is not a current offer. Savings are covered separately from the branch rate sheets.',
  },
  {
    provider: 'Bausparkassen (s Bausparkasse, start:bausparkasse)',
    url: 'https://www.sbausparkasse.at/de/finanzieren/darlehen-infos/produktseite-finanzieren-ueberblick',
    reason:
      'Bauspardarlehen rates are legally capped and genuinely published, but only after JavaScript runs; Raiffeisen Bausparkasse additionally refuses identified clients with HTTP 403. Wüstenrot is the one that states its band in a static document.',
  },
];

/** Plausibility envelopes by category — a probe outside these is treated as a miss. */
export const BOUNDS = {
  deposit: { min: 0, max: 8 },
  mortgage: { min: 0, max: 15 },
  consumer: { min: 0, max: 25 },
};

/**
 * A rate, tolerating the internal spaces a PDF's per-glyph positioning inserts.
 *
 * `parseRate` strips them again. Matching `1, 5 00 %` is not optional: the
 * branch networks publish only PDF rate sheets, and those place every digit
 * separately, so a pattern demanding `\d+[.,]\d+` reads none of them.
 */
const RATE = '(\\d[\\d\\s.,]{0,12}?)';

/** Matches `2,50 %` / `2.50%` shortly after a label. */
const after = (label) => new RegExp(`${label}[^%]{0,40}?${RATE}\\s*%`, 'i');

/** Matches `2,50 % … für 12 Monate`, where the rate precedes its term. */
const beforeTerm = (term) =>
  new RegExp(`${RATE}\\s*%[^%]{0,80}?für\\s*${term}\\s*Monate`, 'i');

/**
 * Matches the `n`-th rate after a label.
 *
 * Rate sheets routinely show the parts before the total — `Basiszinssatz 0,125%
 * plus Premiumzinssatz 0,375%  0,500%`. The number a saver actually earns is
 * the third one, and taking the first would understate it by 37 basis points.
 */
const afterNth = (label, n) =>
  new RegExp(
    `${label}(?:[^%]{0,80}?\\d[\\d\\s.,]{0,12}?%){${n - 1}}[^%]{0,80}?${RATE}\\s*%`,
    'i',
  );

/** A term in months, not matching inside a longer number: `6` but not `36`. */
const months = (n) => `\\b${n}\\s*Monate`;

/**
 * The date a provider stamps on its own figures.
 *
 * Whitespace is tolerated inside the date itself because PDFs position glyphs
 * individually: BAWAG's sheet reads `STAND: 22.0 9 .2025`. `parseGermanDate`
 * strips those spaces again.
 */
const STAND = /(?:Stand|STAND|Gültig ab)[:,]?\s*([\d\s]{1,4}\.[\d\s]{1,4}\.\s?\d{4})/;

export const SOURCES = [
  {
    provider: 'Addiko Bank',
    network: 'direct',
    category: 'deposit',
    url: 'https://www.addiko.at/festgeld/',
    offers: [3, 6, 12, 18, 24, 36].map((months) => ({
      id: `addiko-festgeld-${months}m`,
      product: 'Festgeld',
      termMonths: months,
      amountMin: 5000,
      amountMax: 150000,
      conditions: 'Guaranteed rate, before 25% KESt',
      rate: beforeTerm(months),
    })),
  },
  {
    provider: 'Addiko Bank',
    network: 'direct',
    category: 'deposit',
    url: 'https://www.addiko.at/tagesgeld/',
    offers: [
      {
        id: 'addiko-tagesgeld-neu',
        product: 'Tagesgeld, promotional',
        termMonths: null,
        conditions: 'New customers, first 4 months',
        rate: after('ersten\\s*\\d+\\s*Monate\\)?:?'),
      },
      {
        id: 'addiko-tagesgeld-basis',
        product: 'Tagesgeld, standard',
        termMonths: null,
        conditions: 'Rate once the promotion expires',
        rate: after('Bestandskunden:?'),
      },
    ],
  },
  {
    provider: 'Anadi Bank',
    network: 'direct',
    category: 'deposit',
    url: 'https://anadibank.com/sparen',
    offers: [
      ...[3, 6, 12, 24].map((months) => ({
        id: `anadi-festgeld-${months}m`,
        product: 'Online-Festgeld',
        termMonths: months,
        conditions: 'Before 25% KESt',
        rate: beforeTerm(months),
      })),
      {
        id: 'anadi-tagesgeld-neu',
        product: 'Online-Sparen, promotional',
        termMonths: null,
        conditions: 'New customers, first three months',
        rate: after('NEUKUNDENAKTION:?'),
      },
      {
        id: 'anadi-tagesgeld-basis',
        product: 'Online-Sparen, standard',
        termMonths: null,
        conditions: 'Rate once the promotion expires',
        rate: after('danach aktuell'),
      },
    ],
  },
  {
    provider: 'bank99',
    network: 'direct',
    category: 'deposit',
    url: 'https://bank99.at/sparen',
    offers: [
      ...[6, 9, 12, 24, 36].map((months) => ({
        id: `bank99-fixsparen-${months}m`,
        product: 'fixsparen99',
        termMonths: months,
        conditions: 'Single deposit, paid out at maturity',
        rate: after(`Fixzins\\s*${months}\\s*Monate:?`),
      })),
      {
        id: 'bank99-flexsparen-neu',
        product: 'flexsparen99, promotional',
        termMonths: null,
        conditions: 'New customers, first 3 months',
        rate: after('Neukund\\*?innen:?'),
      },
      {
        id: 'bank99-flexsparen-basis',
        product: 'flexsparen99, base rate',
        termMonths: null,
        conditions: 'Base rate after the promotion; bonus is discretionary',
        rate: after('Danach Basiszins:?'),
      },
    ],
  },
  {
    provider: 'easybank',
    network: 'direct',
    category: 'deposit',
    url: 'https://www.easybank.at/easybank/sparen/easy-geldmarkt',
    offers: [6, 12, 24, 60].map((months) => ({
      id: `easybank-geldmarkt-${months}m`,
      product: 'easy geldmarkt',
      termMonths: months,
      amountMin: 100,
      conditions: 'Fixed rate; balance earns 0.01% after maturity',
      rate: beforeTerm(months),
    })),
  },
  {
    provider: 'Kommunalkredit Invest',
    network: 'direct',
    category: 'deposit',
    url: 'https://www.kommunalkreditinvest.at/',
    offers: [
      {
        id: 'kommunalkredit-festgeld-24m',
        product: 'Festgeld, headline offer',
        termMonths: 24,
        amountMin: 10000,
        conditions: 'Headline tier; other terms priced from the Konditionenblatt',
        rate: after('2\\s*Jahre\\s*Laufzeit\\s*mit'),
      },
      {
        id: 'kommunalkredit-tagesgeld',
        product: 'Tagesgeld',
        termMonths: null,
        conditions: 'Base rate, no lock-up',
        rate: after('Tagesgeld'),
      },
    ],
  },
  {
    provider: 'BAWAG P.S.K.',
    network: 'branch',
    category: 'deposit',
    url: 'https://www.bawag.at/resource/blob/19432/0638361522857c99fb5fab37c5424620/angebote-in-ihrer-bawag-psk-filiale-zinsaushang-konditionen-sparen-pdf-data.pdf',
    offers: [
      ...[6, 12, 24, 36, 60, 84].map((term) => ({
        id: `bawag-sparbox-fix-${term}m`,
        product: 'SparBox Fix',
        termMonths: term,
        amountMin: 100,
        conditions: 'Branch rate sheet; no early withdrawal',
        rate: after(months(term)),
      })),
      {
        id: 'bawag-sparbox-flex',
        product: 'SparBox Flex',
        termMonths: null,
        conditions: 'Base rate, eBanking required',
        rate: after('SparBox Flexfixer Grundzinssatz'),
      },
    ],
  },
  /*
   * Raiffeisen is not one bank. It is roughly three hundred legally independent
   * local cooperatives, each setting its own rates and publishing its own
   * Schalteraushang, so there is no such thing as "the" Raiffeisen savings rate.
   * Two are carried here under their real names: the same branded product,
   * Raiffeisen Online Sparen, pays materially different rates at each, which is
   * the point rather than an inconsistency. The Sparkassen are federated the
   * same way.
   */
  {
    provider: 'Raiffeisenbank Montfort',
    network: 'branch',
    category: 'deposit',
    url: 'https://www.raiba.at/others/Schalteraushang/37422/barrierefrei/Einlagenzinsen.pdf',
    offers: [
      {
        id: 'raiba-montfort-online-sparen',
        product: 'Raiffeisen Online Sparen',
        termMonths: null,
        conditions: 'Base plus premium rate, via Mein ELBA',
        rate: afterNth('Raiffeisen Online Sparen täglich fällig', 3),
      },
      ...[12, 24, 36].map((term) => ({
        id: `raiba-montfort-online-fix-${term}m`,
        product: 'Raiffeisen Online Sparen fix',
        termMonths: term,
        amountMin: 1000,
        conditions: 'Reverts to the base rate at maturity',
        rate: after(`\\b${term}\\s*Monate\\s*Laufzeit`),
      })),
      ...[12, 24, 36].map((term) => ({
        id: `raiba-montfort-vermoegen-${term}m`,
        product: 'Vermögenssparbuch',
        termMonths: term,
        conditions: 'Passbook with a fixed term',
        rate: after(`Vermögenssparbuch mit ${term}monatiger`),
      })),
    ],
  },
  {
    provider: 'Raiffeisenbank Region St. Pölten',
    network: 'branch',
    category: 'deposit',
    url: 'https://www.raiffeisen.at/noew/region-st-poelten/de/meine-bank/raiffeisen-bankengruppe/rechtliches/digitaler-schalteraushang/_jcr_content/root/responsivegrid/tabaccordioncontaine/tabAccordionElements/tabaccordionelement_965095676/items/downloadlist_copy.download.html/1/Konditionen%20Sparen.pdf',
    offers: [
      {
        id: 'raiba-stp-online-sparen',
        product: 'Raiffeisen Online Sparen',
        termMonths: null,
        conditions: 'Same product name as at other Raiffeisen banks, different rate',
        // The FIX and JUGENDCLUB variants follow the same heading, so both are
        // excluded explicitly rather than by relying on which appears first.
        rate: after('ONLINE SPAREN(?!\\s*(?:FIX|JUGEND))'),
      },
      {
        id: 'raiba-stp-sparbuch',
        product: 'Sparbuch',
        termMonths: 1,
        conditions: 'Classic passbook, one-month notice',
        rate: after('SPARBUCH\\s*mit\\s*1monatiger\\s*Bindung'),
      },
      {
        id: 'raiba-stp-online-fix-6m',
        product: 'Raiffeisen Online Sparen fix',
        termMonths: 6,
        conditions: 'Branch rate sheet',
        rate: after('ONLINE SPAREN FIX\\s*Bindung\\s*6\\s*Monate'),
      },
    ],
  },
  {
    provider: 'bank99',
    network: 'direct',
    category: 'consumer',
    url: 'https://bank99.at/kredit/rundumkredit99',
    offers: [
      {
        id: 'bank99-rundumkredit-fix',
        product: 'rundumkredit99, fixed',
        fixationYears: null,
        conditions: 'Representative example under §5 VKrG; rate is not credit-scored',
        rate: after('fix\\s*\\(Sollzins p\\.a\\.\\)'),
        effectiveRate: after('fix\\s*\\(Effektivzins p\\.a\\.\\)\\s*(?:z\\.B\\.)?'),
      },
      {
        id: 'bank99-rundumkredit-var',
        product: 'rundumkredit99, variable',
        fixationYears: 0,
        conditions: 'Representative example under §5 VKrG; rate is not credit-scored',
        rate: after('variabel\\s*\\(Sollzins p\\.a\\.\\)'),
        effectiveRate: after('variabel\\s*\\(Effektivzins p\\.a\\.\\)\\s*(?:z\\.B\\.)?'),
      },
    ],
  },

  /* ---------------------------------------------------------------- *
   * Housing loans.
   *
   * These work differently from every deposit source above, and the
   * difference is worth understanding before editing them.
   *
   * Austrian banks do not publish a mortgage rate card — pricing is
   * credit-scored, so there is no "the rate". What they must publish is a
   * *repräsentatives Beispiel* under §6 HIKrG: a worked example at one stated
   * profile, carrying a nominal rate, an effective rate that includes the fees,
   * and usually the reference rate it is pegged to. That example is the offer
   * layer for housing, and it is a genuinely different object from a deposit
   * rate: it is comparable across banks only because the profile is fixed, and
   * it is refreshed when the bank chooses rather than when the market moves.
   * Hence `stand` on every source here — see `statedAt` in `src/lib/offers.ts`.
   *
   * What is deliberately *not* here: the generic "Allgemeine Informationen
   * gemäß HIKrG" PDFs. Every lender publishes one and they look like the
   * jackpot — uniform, legally mandated, easy to parse. They are boilerplate.
   * Raiffeisen's quotes 1,75% variable and Dolomitenbank's 2,3061%, both below
   * today's Euribor, and Dolomitenbank's says so outright: the example "dient
   * nur zu allgemeinen Informationszwecken … stellen kein konkret beworbenes
   * Kreditprodukt dar". Only product pages and product-specific sheets carry
   * live numbers. Before adding a source, back out its margin over the
   * reference rate and sanity-check it against the MIR series on the dashboard.
   * ---------------------------------------------------------------- */

  {
    provider: 'Erste Bank / Sparkasse',
    network: 'branch',
    category: 'mortgage',
    url: 'https://www.sparkasse.at/wohnbaufinanzierung',
    // The example lives in a JSON blob inside a <script>, not in rendered HTML.
    includeScripts: true,
    stand: STAND,
    // Austria's largest lender, and the only one publishing a whole fixation
    // ladder rather than a single point — which is the same shape as the MIR
    // ladder in the housing panel, so the two can be read against each other.
    // Only effective rates are published; the nominal is given as a margin.
    offers: [
      { id: 'erste-wohnbau-variabel', product: 'Wohnbaufinanzierung, variable', fixationYears: 0, nth: 1 },
      { id: 'erste-wohnbau-fix-10j', product: 'Wohnbaufinanzierung, 10y fixed', fixationYears: 10, nth: 2 },
      { id: 'erste-wohnbau-fix-voll', product: 'Wohnbaufinanzierung, full-term fixed', fixationYears: 25, nth: 3 },
    ].map(({ id, product, fixationYears, nth }) => ({
      id,
      product,
      fixationYears,
      conditions: '§6 HIKrG example, €100,000 over 25 years; variable tracks 3M-Euribor +1.00%',
      effectiveRate: afterNth('Effektivzinssatz', nth),
    })),
  },
  {
    provider: 'Oberbank',
    network: 'branch',
    category: 'mortgage',
    url: 'https://www.oberbank.at/wohnbaufinanzierung',
    stand: STAND,
    offers: [
      {
        id: 'oberbank-wohnbau-variabel',
        product: 'Wohnbaufinanzierung',
        fixationYears: 0,
        conditions: '§6 HIKrG example, €300,000 incl. fees over 25 years; pegged to 3M-Euribor',
        rate: after('Wohnbaufinanzierung\\s*mit'),
        effectiveRate: after('Effektiver\\s*Jahreszins:?'),
      },
    ],
  },
  {
    provider: 'Hypo NOE',
    network: 'branch',
    category: 'mortgage',
    // Regenerated daily — the example carries the current date as its
    // Kreditaufnahme, which is the freshest housing figure on the board.
    url: 'https://www.hyponoe.at/wohnkredit/berechnungsbeispiel',
    stand: /Kreditaufnahme\s+([\d\s]{1,4}\.[\d\s]{1,4}\.\s?\d{4})/,
    offers: [
      {
        id: 'hyponoe-wohnkredit-variabel',
        product: 'Wohnkredit',
        fixationYears: 0,
        // No effective rate is probed on purpose. The page states an effective
        // rate identical to the nominal one while also itemising ~€5,000 of
        // fees, which cannot both be true; publishing it would put a figure on
        // the board that its own source contradicts.
        conditions: '§6 HIKrG example, €200,000 over 25 years; 3M-Euribor +1.125%',
        rate: after('Sollzinssatz\\s*variabel'),
      },
    ],
  },
  {
    provider: 'BKS Bank',
    network: 'branch',
    category: 'mortgage',
    url: 'https://www.bks.at/wohnkredit',
    stand: STAND,
    offers: [
      {
        id: 'bks-wohnkredit-variabel',
        product: 'Wohn- & Sanierungskredit',
        fixationYears: 0,
        // The surrounding figures on this page are a calculator's default
        // state and do not reconcile with each other; the rate pair does, and
        // is in line with its peers. No Stand is published, so this one falls
        // back to the scrape date and will age out faster than it should.
        conditions: 'Musterrechnung, variable; loan size not stated on the page',
        rate: after('Jährlicher\\s*Zinssatz'),
        effectiveRate: after('Effektiver\\s*Jahreszins'),
      },
    ],
  },
  {
    provider: 'BAWAG P.S.K.',
    network: 'branch',
    category: 'mortgage',
    url: 'https://www.bawag.at/resource/blob/20702/decec9fd91baf6766724ca061004bd87/kreditbox-wohnen-produktinformationsblatt-data.pdf',
    stand: STAND,
    offers: [
      {
        id: 'bawag-kreditbox-wohnen',
        product: 'KreditBox Wohnen',
        fixationYears: 0,
        // This sheet carries two representative examples and the consumer one
        // comes first, so both probes are anchored on the 360-month term that
        // only the mortgage example has. If BAWAG restates it over a different
        // term the probes miss and the source reports partial — which is the
        // intended failure, far better than publishing the 8,65% consumer rate
        // as a housing rate.
        conditions: '§6 HIKrG example, €260,000 over 30 years',
        rate: new RegExp(`Laufzeit\\s*360\\s*Monate;?\\s*Nominalzinssatz[^%]{0,20}?${RATE}\\s*%`, 'i'),
        effectiveRate: new RegExp(
          `Laufzeit\\s*360\\s*Monate[\\s\\S]{0,220}?Effektiver\\s*Jahreszinssatz[^%]{0,20}?${RATE}\\s*%`,
          'i',
        ),
      },
    ],
  },
  {
    provider: 'Hypo Vorarlberg',
    network: 'branch',
    category: 'mortgage',
    // The `cHash` is TYPO3's file-link signature and the download 404s without
    // it. It survives content edits but not a re-upload, so a sudden failure
    // here means finding the new link on the Wohnbaufinanzierung page.
    url: 'https://www.hypovbg.at/download/5332/2603_BRO_Wohnbaufinanzierung_W030.pdf?cHash=ba8b6d76eaedb74efe323580972517c3',
    // The brochure dates its own example rather than the document.
    stand: /entspricht\s*per\s+([\d\s]{1,4}\.[\d\s]{1,4}\.\s?\d{4})/,
    offers: [
      {
        id: 'hypovbg-wohnbau-variabel',
        product: 'Wohnbaufinanzierung',
        fixationYears: 0,
        // The only 6M-Euribor peg on the board; everything else tracks 3M.
        conditions: 'Representative example, €400,000 over 35 years; 6M-Euribor +1.50%, rounded to ⅛',
        rate: after('Sollzinssatz\\s*von'),
        effectiveRate: after('Effektiver\\s*Jahreszinssatz'),
      },
    ],
  },
  {
    provider: 'bank99',
    network: 'direct',
    category: 'mortgage',
    url: 'https://bank99.at/wohnfinanzierung/wohnkredit99',
    includeScripts: true,
    stand: STAND,
    offers: [
      {
        id: 'bank99-wohnkredit-variabel',
        product: 'wohnkredit99',
        fixationYears: 0,
        // The same page also carries a consumer example at 7,44%. Both probes
        // are anchored on wording unique to the housing one — `Sollzinssatz
        // variabel:` and the longer `Jahreszinssatz` — so neither can drift
        // onto it.
        conditions: '§6 HIKrG example, €200,000 over 20 years; tracks the 3M-Euribor average',
        rate: after('Sollzinssatz\\s*variabel:'),
        effectiveRate: after('Effektiver\\s*Jahreszinssatz:'),
      },
    ],
  },
];
