/**
 * Every word the dashboard shows, in English.
 *
 * `de.tsx` is typed against this object, so a string added here and forgotten
 * there fails the typecheck instead of showing up in English on the German page.
 * Numbers and dates arrive already formatted by `lib/format`; an entry decides
 * only the words around them.
 */

import type { ComponentChildren } from 'preact';

export type Basis = 'effective' | 'nominal';

const other = (basis: Basis): Basis => (basis === 'effective' ? 'nominal' : 'effective');
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const en = {
  /** The other language, as the switch in the header offers it. */
  otherLanguage: { label: 'Deutsch', code: 'de', path: 'de/' },

  app: {
    brand: 'Austria',
    nav: 'Products',
    pages: { housing: 'Housing loans', savings: 'Savings', consumer: 'Consumer credit', market: 'Rates & ECB' },
    offersChecked: (date: string) => `Offers checked ${date}`,
    ecbTo: (period: string) => `ECB statistics to ${period}`,
    footer: (ecb: ComponentChildren, oenb: ComponentChildren, github: ComponentChildren) => (
      <>
        Rate statistics from the {ecb}, fetched live, and from the {oenb}, read daily. Offers are read once a day from
        each bank&rsquo;s own pages and calculators; they are indicative, not an offer. Source code on {github}.
      </>
    ),
  },

  format: {
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    monthsLong: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ],
    day: (day: number, month: string, year: string) => `${day} ${month} ${year}`,
    bp: 'bp',
    pp: 'pp',
    euro: (amount: string) => `€${amount}`,
    millions: (amount: string) => `€${amount}m`,
    billions: (amount: string) => `€${amount}bn`,
    yrs: 'yrs',
    instantAccess: 'Instant access',
    termMonths: (n: number) => `${n} ${plural(n, 'month', 'months')}`,
    termYears: (n: number) => `${n} ${plural(n, 'year', 'years')}`,
    instant: 'Instant',
    monthsShort: (n: string) => `${n}m`,
    yearsShort: (n: string) => `${n}y`,
    variable: 'Variable',
    variableRate: 'Variable rate',
    fixedFor: (years: string) => `Fixed for ${years} years`,
    fixedWholeTerm: 'Fixed for the whole term',
    /** The rungs the scraper appends to a product name: "Tagesgeld, promotional". */
    rungs: {} as Record<string, string>,
  },

  common: {
    loading: 'Loading…',
    showNumbers: 'Show numbers',
    about: 'About this data',
    sources: (read: number, total: number) => `Sources · ${read} of ${total} read on the last run`,
    status: { ok: 'read', partial: 'partial', failed: 'failed', unavailable: 'unavailable' },
    lenders: 'Lenders',
    showAll: 'Show all',
    view: 'View',
    range: 'Range',
    ranges: { '1y': '1Y', '3y': '3Y', all: 'All' },
    ecbHistory: 'ECB history',
    ecbWindows: { '5y': '5Y', '10y': '10Y', max: 'Since 2003' },
    ecbLoading: 'Loading ECB statistics…',
    ecbFailed: (error: string) => `Could not reach the ECB Data Portal. ${error}`,
    latestChanges: 'Latest changes',
    archivedPage: 'archived page',
    source: 'source',
    currentOffer: 'Current offer',
    pickHint: 'Click a column to follow it over time',
    checked: (date: string) => `Checked ${date}`,
    austria: 'Austria',
    euroArea: 'Euro area',
    basis: { effective: 'effective', nominal: 'nominal' } as Record<Basis, string>,
    basisRate: { effective: 'Effective rate', nominal: 'Nominal rate' } as Record<Basis, string>,
    ecbAverage: 'ECB average',
    ecbConcludedAverage: 'ECB concluded average',
    ecbConcluded: (what: string) => `ECB concluded, ${what}`,
    agreedRate: 'Agreed rate',
    aprcFees: 'APRC incl. fees',
    rateVsAprc: 'Rate vs APRC',
    byFixation: 'By fixation',
    newVsExisting: 'New vs existing',
    volume: 'Volume',
    fixationMix: 'Fixation mix',
    genuinelyNew: 'Genuinely new',
    renegotiated: 'Renegotiated',
    notSplit: 'Not split out',
    buckets: {
      variable: 'Variable / up to 1y',
      fixed1to5: 'Fixed 1–5y',
      fixed5to10: 'Fixed 5–10y',
      fixedOver10: 'Fixed over 10y',
      fixedOver5: 'Fixed over 5y',
    },
    deposits: {
      overnight: 'Overnight',
      notice: 'At notice',
      termTo1: 'Term up to 1y',
      term1to2: 'Term 1–2y',
      termOver2: 'Term over 2y',
    },
    depositFacility: 'ECB deposit facility',
    overdrafts: 'Overdrafts',
  },

  charts: {
    fixationAxis: 'Initial rate fixation',
    termAxis: 'Term',
    noQuote: 'No quote on record',
    newLending: 'New lending',
    austriaGap: (gap: string) => `Austria ${gap}`,
  },

  panel: {
    lastYear: (amount: string) => `last 12 months ${amount}`,
    volumeHead: ['Month', 'Volume'],
    total: 'Total',
    linesHead: ['Series', 'Latest', 'Month', '12 months earlier', 'Change'],
  },

  housing: {
    bands: {
      hl_var: 'variable or fixed up to 1 year',
      hl_1_5: 'fixed over 1 and up to 5 years',
      hl_5_10: 'fixed over 5 and up to 10 years',
      hl_10p: 'fixed over 10 years',
    },
    newLoans: 'New loans',
    outstanding: 'All outstanding loans',
    renegotiated: 'Renegotiated',
    genuinelyNew: 'Genuinely new contracts',
    renegotiatedLoans: 'Renegotiated loans',
    calculatorQuote: 'Calculator quote',
    example: 'Representative example',
    calculator: 'calculator',
    bankDate: (date: string) => `Bank's date ${date}`,
    noBankDate: 'No date stated by the bank',
    checked: (date: string) => `checked ${date}`,
    outdated: (days: number) => `Outdated: the bank's own date is more than ${days} days old`,
    noQuote: 'No current quote',
    aprcNewLoans: 'APRC, new housing loans',
    newLoansIn: (band: string) => `new secured loans ${band}`,
    ecbSecured: (band: string) => `ECB concluded, secured loans ${band}`,
    allFixations: 'all fixation periods',
    agreedRate: 'agreed rate',
    ecbAprcAll: 'ECB concluded APRC, all fixations',
    lede: (basis: Basis, quotes: number, lenders: number, date: string) =>
      `Lowest advertised ${basis} rates across ${quotes} current quotes from ${lenders} lenders, checked ${date}.`,
    fixed10: 'Fixed 10 years',
    fixed20: 'Fixed 20 years or longer',
    ecbDetail: (period: string, aprc: boolean) => `${period} · all new loans${aprc ? ', APRC' : ''}`,
    rate: 'Rate',
    outdatedExamples: 'Outdated examples',
    curveTitle: 'Advertised today, by fixation period',
    curveMeta: "One dot per quote. A lender's calculator ladder is joined by a line.",
    curveAria:
      'Advertised Austrian housing loan rates by initial fixation period, one marker per lender, against ECB concluded averages',
    bandPerBucket: 'ECB concluded average per fixation bucket, secured loans',
    hollow: (days: number) => `Example older than ${days} days by the bank's own date`,
    unpublished: (lenders: string[], basis: Basis) =>
      `Not shown: ${lenders.join(', ')} publish${plural(lenders.length, 'es', '')} no ${basis} rate — switch to ${other(basis)} to include ${plural(lenders.length, 'it', 'them')}.`,
    offersHead: ['Lender', 'Product', 'Fixation', 'Nominal', 'Effective', "Bank's date", 'Checked'],
    years: (years: string) => `${years} years`,
    outdatedMark: ' (outdated)',
    historyTitle: (fixation: string) => `How advertised rates moved: ${fixation}`,
    historyMeta: "Each lender's quote held until it was replaced; grey is the ECB concluded average.",
    fixation: 'Fixation',
    historyAria: (fixation: string) => `Advertised housing loan rates over time, ${fixation}`,
    recordedFrom: (date: string) =>
      `Recorded from ${date}. No usable archive captures exist for these quotes before that.`,
    missing: (lenders: string[], basis: Basis) =>
      `No ${basis} rate published by ${lenders.join(', ')} — switch to ${other(basis)} to include ${plural(lenders.length, 'it', 'them')}.`,
    noRepricing: 'No repricing on record for this fixation yet.',
    changesHead: ['Repriced', 'Lender', 'Before', 'After', 'Change'],
    panelTitle: 'Concluded new lending',
    panelMeta:
      'ECB and OeNB interest rate statistics for Austria: new housing loans, volume-weighted, monthly, published about five weeks later. The fixation ladder covers loans secured by collateral or guarantees.',
    about: (staleDays: number) => (
      <>
        <p>
          <strong>Calculator quotes</strong> are read from the banks&rsquo; own calculators. bank99, Bank Austria and
          Oberbank are asked for one profile, €300,000 over 25 years; Bank Burgenland publishes a rate table that
          ignores loan size. They are current on the day they were read.
        </p>
        <p>
          <strong>Representative examples</strong> are the worked examples lenders must publish under §6 HIKrG, each
          at a loan size and term the bank picks, so they compare only loosely. What dates them is the bank&rsquo;s own{' '}
          <em>Stand</em>. An example older than {staleDays} days by that date is drawn hollow, and its history line
          stops there.
        </p>
        <p>
          <strong>History</strong> before daily reading began is rebuilt from Internet Archive captures of the same
          pages. Captures are roughly monthly, so where a bank states no date, a repricing is dated to the first
          capture that shows it.
        </p>
        <p>
          <strong>ECB averages</strong> cover every new housing loan in Austria that month, volume-weighted. The bucket
          drawn behind each fixation is loans secured by collateral or guarantees, the kind a representative example
          describes. The APRC, which includes fees, exists only across all loans and fixations. Effective rates are the
          ones to compare between banks.
        </p>
        <p>
          <strong>Fixation mix</strong> is each bucket&rsquo;s share of new lending volume: for Austria from the OeNB,
          which publishes volumes for the two shortest buckets, for the euro area from the ECB. Neither splits fixation
          beyond ten years, so 15-, 20- and 25-year offers all fall in one bucket.
        </p>
      </>
    ),
  },

  savings: {
    bands: {
      dep_on: 'overnight deposits',
      dep_term_le1: 'term deposits up to 1 year',
      dep_term_1_2: 'term deposits over 1 and up to 2 years',
      dep_term_2p: 'term deposits over 2 years',
    },
    byProduct: 'By product',
    notice: 'Notice periods',
    noticeTo3m: 'Notice up to 3 months',
    noticeOver3m: 'Notice over 3 months',
    savingsDeposits: 'Savings deposits',
    savingsTo1: 'Savings deposits up to 1y',
    savings1to2: 'Savings deposits 1–2y',
    savingsOver2: 'Savings deposits over 2y',
    allTermTo1: 'All term deposits up to 1y',
    passThrough: 'Pass-through',
    newTerm: 'New term deposits',
    outstandingTerm: 'All outstanding term deposits',
    overnightAustria: 'Overnight, Austria',
    termAustria: 'Term, Austria',
    overnightEuroArea: 'Overnight, euro area',
    promotional: 'promotional',
    noOffer: 'No current offer',
    newIn: (band: string) => `new ${band}`,
    households: 'households',
    afterTax: 'after 25% tax',
    beforeTax: 'before tax',
    branchBank: 'branch bank',
    directBank: 'direct bank',
    minimum: (amount: string) => `Minimum ${amount}`,
    unconfirmed: (days: number) => `Not confirmed for more than ${days} days`,
    lede: (afterTax: boolean, banks: number, date: string) =>
      `Highest advertised rates ${afterTax ? 'after 25% capital gains tax' : 'before tax'} from ${banks} banks, checked ${date}.`,
    fixed1: 'Fixed 1 year',
    fixed2: 'Fixed 2 years or longer',
    ecbTerm: 'ECB concluded, term up to 1 year',
    allBanks: (period: string) => `${period} · all Austrian banks`,
    taxSwitch: 'After 25% tax (KESt)',
    curveTitle: 'Advertised today, by term',
    curveMeta: "One dot per rate. A bank's term ladder is joined by a line.",
    curveAria: 'Advertised Austrian savings rates by term, one marker per bank, against ECB concluded averages',
    bandPerBucket: 'ECB concluded average per maturity bucket',
    offersHead: ['Bank', 'Product', 'Term', 'Rate', 'Minimum', 'Type', 'Checked'],
    branch: 'Branch',
    direct: 'Direct',
    historyTitle: (term: string) => `How advertised rates moved: ${term}`,
    historyMeta: "Each bank's rate held until it changed; grey is the ECB concluded average.",
    term: 'Term',
    historyAria: (term: string) => `Advertised savings rates over time, ${term}`,
    recordedFrom: (date: string) =>
      `Savings offers are recorded daily from ${date}; earlier movement shows only in the ECB average.`,
    noChange: 'No rate change recorded for this term since daily reading began.',
    panelTitle: 'Concluded deposits',
    panelMeta:
      "ECB and OeNB interest rate statistics for Austrian households: new business, volume-weighted, monthly. Pass-through is the share of the ECB's move since mid-2022 that reached savers.",
    about: () => (
      <>
        <p>
          <strong>Direct banks</strong> (Addiko, Anadi, bank99, easybank, Kommunalkredit Invest) publish one national
          rate in HTML. <strong>Branch networks</strong> (BAWAG P.S.K., Raiffeisen) publish only the rate sheet they
          must display; Raiffeisen is some three hundred independent banks, so two are shown under their own names.
        </p>
        <p>
          Rates are before 25% capital gains tax unless the tax switch is on. Promotional rates that revert are listed
          next to the rate they revert to.
        </p>
        <p>
          <strong>ECB averages</strong> are every euro placed with Austrian banks that month, volume-weighted, so they
          sit close to the branch networks where most money is. Erste Bank, Bank Austria and Volksbank publish no
          readable savings rates and are missing.
        </p>
        <p>
          <strong>Notice deposits</strong> are split by notice period, up to and over three months.{' '}
          <strong>Savings deposits</strong> shows the rates on Sparbuch and Kapitalsparbuch money within term deposits,
          per maturity bucket: an Austrian breakdown the OeNB publishes and the ECB does not.
        </p>
      </>
    ),
  },

  consumer: {
    vsOther: 'vs other lending',
    secured: 'With collateral',
    allConsumer: 'All consumer credit',
    securedLoans: 'With collateral or guarantee',
    consumerEuroArea: 'Consumer credit, euro area',
    lede: (period: string | undefined) =>
      `What Austrian households concluded${period ? ` in ${period}` : ''}, and the few consumer-loan examples a bank publishes in readable form.`,
    ecbAgreed: 'ECB concluded, agreed rate',
    allNew: 'All new consumer loans',
    ecbAprc: 'ECB concluded, APRC',
    includingFees: 'Including fees',
    revolving: 'Revolving credit',
    lowest: 'Lowest advertised, effective',
    nonePublished: 'None published',
    title: 'Advertised today',
    meta: 'Representative examples under §5 VKrG. Consumer credit is priced per borrower, so almost no bank publishes a figure that can be read.',
    since: (date: string) => `Recorded daily from ${date}; no change so far.`,
    noHistory: 'No history recorded yet.',
    panelTitle: 'Concluded consumer credit',
    panelMeta: 'ECB and OeNB interest rate statistics for Austrian households: new business, volume-weighted, monthly.',
    about: () => (
      <>
        <p>
          The APRC includes arrangement fees and other charges. On consumer credit it sits far above the agreed rate,
          because the same fixed costs are spread over a much smaller loan than a mortgage.
        </p>
        <p>
          The ECB splits consumer credit by initial rate fixation: variable or up to one year, over one and up to five
          years, and over five years.
        </p>
        <p>
          Loans with collateral or a guarantee are shown on their own; the gap to all consumer credit is roughly what
          lending unsecured costs. Volumes separate genuinely new contracts from renegotiated ones, and the fixation mix
          is the share of new lending that is variable or fixed for up to a year: for Austria from the OeNB, for the
          euro area from the ECB.
        </p>
      </>
    ),
  },

  market: {
    policyMoney: 'Policy & money market',
    margins: 'Bank margins',
    housingOverEstr: 'Housing loans over €STR',
    estrOverOvernight: '€STR over overnight deposits',
    corporates: 'Corporates',
    allNewLoans: 'All new loans',
    outstanding: 'Outstanding',
    outstandingTerm: 'Outstanding term',
    costOfBorrowing: 'Cost of borrowing',
    overnightDeposits: 'Overnight deposits',
    termDeposits: 'Term deposits',
    lede: 'The benchmarks Austrian bank pricing moves against, and how Austria compares with the euro area.',
    mro: 'Main refinancing rate',
    ecb: 'ECB',
    asOf: (date: string) => `As of ${date}`,
    monthlyAverage: (period: string) => `${period} · monthly average`,
    panelTitle: 'Benchmarks and margins',
    panelMeta: "Monthly. Margins use €STR as a stand-in for the banks' own funding cost.",
    compareTitle: 'Austria against the euro area',
    compareMeta: (period: string) => `Latest month of each ECB series, up to ${period}. Hover a row for the gap.`,
    compareAria: (group: string) => `${group}: Austrian rates against the euro area`,
    compareHead: ['Product', 'Series', 'Austria', 'Euro area', 'Gap'],
    about: () => (
      <>
        <p>
          Policy rates, €STR and Euribor come from the ECB Data Portal. Euribor is shown as the ECB&rsquo;s monthly
          average: daily Euribor is licensed by EMMI and is not redistributed here, so €STR is the daily benchmark.
        </p>
        <p>
          Lending and deposit rates are MFI interest rate statistics, published about five weeks after the month they
          describe.
        </p>
      </>
    ),
  },
};

export type Messages = typeof en;
