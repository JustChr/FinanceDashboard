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

/** Plausibility envelopes by category — a probe outside these is treated as a miss. */
export const BOUNDS = {
  deposit: { min: 0, max: 8 },
  mortgage: { min: 0, max: 15 },
  consumer: { min: 0, max: 25 },
};

/** Matches `2,50 %` / `2.50%` immediately after a label. */
const after = (label) => new RegExp(`${label}[^%]{0,40}?(\\d+[.,]\\d+)\\s*%`, 'i');

/** Matches `2,50 % … für 12 Monate`, where the rate precedes its term. */
const beforeTerm = (term) =>
  new RegExp(`(\\d+[.,]\\d+)\\s*%[^%]{0,80}?für\\s*${term}\\s*Monate`, 'i');

export const SOURCES = [
  {
    provider: 'Addiko Bank',
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
    provider: 'bank99',
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
];
