/**
 * Series catalogue for the Austrian retail-pricing dashboard.
 *
 * Every key below was verified against the live ECB Data Portal API. MIR keys
 * follow the 10-dimension order:
 *   FREQ.REF_AREA.BS_REP_SECTOR.BS_ITEM.MATURITY_NOT_IRATE
 *   .DATA_TYPE_MIR.AMOUNT_CAT.BS_COUNT_SECTOR.CURRENCY_TRANS.IR_BUS_COV
 *
 * Three dimensions carry most of the analytical weight here:
 *
 * - `MATURITY_NOT_IRATE` on *new business* is the initial rate fixation period
 *   (Zinsbindung); on *outstanding amounts* the same dimension is the original
 *   maturity of the loan instead. They are not interchangeable and are labelled
 *   separately below.
 * - `DATA_TYPE_MIR` selects the annualised agreed rate (`R`), the annual
 *   percentage rate of charge including fees (`C`), or new-business volume (`B`).
 * - `IR_BUS_COV` separates new business (`N`), new business excluding
 *   renegotiations (`P`), renegotiated loans only (`R`) and the outstanding
 *   stock (`O`). New versus outstanding is the front-book/back-book split.
 */

export type Area = 'AT' | 'U2';
export type Side = 'asset' | 'liability';

/** Counterparty sector codes. */
const HOUSEHOLDS = '2250';
const CORPORATES = '2240';

export interface MirDef {
  id: string;
  label: string;
  /** Short note on what the series actually measures. */
  note?: string;
  side: Side;
  /** BS_ITEM. */
  item: string;
  /** MATURITY_NOT_IRATE; `A` is the un-split total. */
  maturity: string;
  /** DATA_TYPE_MIR: rate, APRC or volume. */
  dataType: 'R' | 'C' | 'B';
  /** BS_COUNT_SECTOR. */
  sector: string;
  /** IR_BUS_COV. */
  busCov: 'N' | 'P' | 'R' | 'O';
  /** AMOUNT_CAT; `1` restricts to loans over one million euro. */
  amount: string;
  /** Whether to fetch the euro-area twin for comparison. */
  ea: boolean;
}

type DefInput = Omit<MirDef, 'dataType' | 'sector' | 'busCov' | 'amount' | 'ea'> &
  Partial<Pick<MirDef, 'dataType' | 'sector' | 'busCov' | 'amount' | 'ea'>>;

function def(d: DefInput): MirDef {
  return {
    dataType: 'R',
    sector: HOUSEHOLDS,
    busCov: 'N',
    amount: 'A',
    ea: false,
    ...d,
  };
}

/** Builds the full SDMX key for one definition in one reference area. */
export function mirKey(d: MirDef, area: Area): string {
  return ['M', area, 'B', d.item, d.maturity, d.dataType, d.amount, d.sector, 'EUR', d.busCov].join(
    '.',
  );
}

/** The key as the API echoes it back in the `KEY` column, dataflow included. */
export function seriesKeyFor(d: MirDef, area: Area): string {
  return `MIR.${mirKey(d, area)}`;
}

/* ------------------------------------------------------------------ */
/* Housing loans                                                       */
/* ------------------------------------------------------------------ */

/**
 * New housing loans split by initial rate fixation. This ladder is the heart of
 * the housing panel: it is where the choice between a variable and a fixed rate
 * is actually priced, and its shape inverts through a cycle.
 */
export const HOUSING_FIXATION: MirDef[] = [
  def({
    id: 'hl_var',
    label: 'Variable or fixed up to 1Y',
    note: 'Floating and short fixation',
    side: 'asset',
    item: 'A2C',
    maturity: 'F',
    ea: true,
  }),
  def({
    id: 'hl_1_5',
    label: 'Fixed 1–5 years',
    side: 'asset',
    item: 'A2C',
    maturity: 'I',
    ea: true,
  }),
  def({
    id: 'hl_5_10',
    label: 'Fixed 5–10 years',
    side: 'asset',
    item: 'A2C',
    maturity: 'O',
    ea: true,
  }),
  def({
    id: 'hl_10p',
    label: 'Fixed over 10 years',
    side: 'asset',
    item: 'A2C',
    maturity: 'P',
    ea: true,
  }),
];

export const HOUSING_CORE: MirDef[] = [
  def({
    id: 'hl_total',
    label: 'All new housing loans',
    note: 'Volume-weighted across every fixation period',
    side: 'asset',
    item: 'A2C',
    maturity: 'A',
    ea: true,
  }),
  def({
    id: 'hl_cob',
    label: 'Cost of borrowing, housing',
    note: 'ECB composite indicator',
    side: 'asset',
    item: 'A2C',
    maturity: 'AM',
    ea: true,
  }),
  def({
    id: 'hl_aprc',
    label: 'APRC, housing loans',
    note: 'Rate including fees and ancillary costs',
    side: 'asset',
    item: 'A2C',
    maturity: 'A',
    dataType: 'C',
  }),
  def({
    id: 'hl_volume',
    label: 'New housing lending',
    note: 'New business volume, euro million per month',
    side: 'asset',
    item: 'A2C',
    maturity: 'A',
    dataType: 'B',
  }),
  def({
    id: 'hl_pure',
    label: 'Excluding renegotiations',
    note: 'Genuinely new contracts only',
    side: 'asset',
    item: 'A2C',
    maturity: 'A',
    busCov: 'P',
  }),
  def({
    id: 'hl_reneg',
    label: 'Renegotiated only',
    note: 'Existing borrowers repriced',
    side: 'asset',
    item: 'A2C',
    maturity: 'A',
    busCov: 'R',
  }),
];

/**
 * The back book. The maturity dimension changes meaning here: `F`, `I` and `J`
 * are original maturities of the loan, not initial rate fixation periods.
 */
export const HOUSING_STOCK: MirDef[] = [
  def({
    id: 'hl_stock',
    label: 'All outstanding housing loans',
    note: 'The back book',
    side: 'asset',
    item: 'A22',
    maturity: 'A',
    busCov: 'O',
    ea: true,
  }),
  def({
    id: 'hl_stock_le1',
    label: 'Original maturity up to 1Y',
    side: 'asset',
    item: 'A22',
    maturity: 'F',
    busCov: 'O',
  }),
  def({
    id: 'hl_stock_1_5',
    label: 'Original maturity 1–5Y',
    side: 'asset',
    item: 'A22',
    maturity: 'I',
    busCov: 'O',
  }),
  def({
    id: 'hl_stock_5p',
    label: 'Original maturity over 5Y',
    note: 'Where nearly every mortgage balance sits',
    side: 'asset',
    item: 'A22',
    maturity: 'J',
    busCov: 'O',
  }),
];

/* ------------------------------------------------------------------ */
/* Deposits and savings                                                */
/* ------------------------------------------------------------------ */

/** Term deposits by agreed maturity — the savings-side equivalent of the ladder. */
export const DEPOSIT_MATURITY: MirDef[] = [
  def({
    id: 'dep_term_le1',
    label: 'Agreed maturity up to 1Y',
    side: 'liability',
    item: 'L22',
    maturity: 'F',
    ea: true,
  }),
  def({
    id: 'dep_term_1_2',
    label: 'Agreed maturity 1–2Y',
    side: 'liability',
    item: 'L22',
    maturity: 'G',
    ea: true,
  }),
  def({
    id: 'dep_term_2p',
    label: 'Agreed maturity over 2Y',
    side: 'liability',
    item: 'L22',
    maturity: 'H',
    ea: true,
  }),
];

export const DEPOSIT_CORE: MirDef[] = [
  def({
    id: 'dep_on',
    label: 'Overnight',
    note: 'Current and instant-access accounts',
    side: 'liability',
    item: 'L21',
    maturity: 'A',
    ea: true,
  }),
  def({
    id: 'dep_term',
    label: 'All term deposits',
    note: 'Agreed maturity, new business',
    side: 'liability',
    item: 'L22',
    maturity: 'A',
    ea: true,
  }),
  def({
    id: 'dep_notice',
    label: 'Redeemable at notice',
    note: 'Classic Sparbuch with a notice period',
    side: 'liability',
    item: 'L23',
    maturity: 'A',
    ea: true,
  }),
  def({
    id: 'dep_term_volume',
    label: 'New term deposits',
    note: 'New business volume, euro million per month',
    side: 'liability',
    item: 'L22',
    maturity: 'A',
    dataType: 'B',
  }),
];

export const DEPOSIT_STOCK: MirDef[] = [
  def({
    id: 'dep_term_stock',
    label: 'All outstanding term deposits',
    note: 'What savers are still actually earning',
    side: 'liability',
    item: 'L22',
    maturity: 'A',
    busCov: 'O',
    ea: true,
  }),
  def({
    id: 'dep_term_stock_le2',
    label: 'Outstanding, maturity up to 2Y',
    side: 'liability',
    item: 'L22',
    maturity: 'L',
    busCov: 'O',
  }),
  def({
    id: 'dep_term_stock_2p',
    label: 'Outstanding, maturity over 2Y',
    side: 'liability',
    item: 'L22',
    maturity: 'H',
    busCov: 'O',
  }),
];

/* ------------------------------------------------------------------ */
/* Consumer credit and corporates                                      */
/* ------------------------------------------------------------------ */

export const CONSUMER_RATES: MirDef[] = [
  def({ id: 'cc_total', label: 'All consumer credit', side: 'asset', item: 'A2B', maturity: 'A', ea: true }),
  def({
    id: 'cc_var',
    label: 'Variable or fixed up to 1Y',
    side: 'asset',
    item: 'A2B',
    maturity: 'F',
    ea: true,
  }),
  def({ id: 'cc_1_5', label: 'Fixed 1–5 years', side: 'asset', item: 'A2B', maturity: 'I', ea: true }),
  def({ id: 'cc_5p', label: 'Fixed over 5 years', side: 'asset', item: 'A2B', maturity: 'J', ea: true }),
  def({
    id: 'cc_aprc',
    label: 'APRC, consumer credit',
    note: 'Rate including fees and ancillary costs',
    side: 'asset',
    item: 'A2B',
    maturity: 'A',
    dataType: 'C',
  }),
  def({
    id: 'cc_stock',
    label: 'Outstanding consumer and other lending',
    side: 'asset',
    item: 'A25',
    maturity: 'A',
    busCov: 'O',
    ea: true,
  }),
  def({
    id: 'od_hh',
    label: 'Overdrafts',
    note: 'Revolving loans and overdrafts',
    side: 'asset',
    item: 'A2Z1',
    maturity: 'A',
    ea: true,
  }),
];

export const CORPORATE_RATES: MirDef[] = [
  def({
    id: 'nfc_cob',
    label: 'Corporate cost of borrowing',
    note: 'ECB composite, non-financial corporations',
    side: 'asset',
    item: 'A2I',
    maturity: 'AM',
    sector: CORPORATES,
    ea: true,
  }),
  def({
    id: 'nfc_on',
    label: 'Overnight, corporates',
    note: 'Reprices faster than retail',
    side: 'liability',
    item: 'L21',
    maturity: 'A',
    sector: CORPORATES,
    ea: true,
  }),
  def({
    id: 'nfc_term',
    label: 'Term deposits, corporates',
    side: 'liability',
    item: 'L22',
    maturity: 'A',
    sector: CORPORATES,
    ea: true,
  }),
];

export const ALL_DEFS: MirDef[] = [
  ...HOUSING_CORE,
  ...HOUSING_FIXATION,
  ...HOUSING_STOCK,
  ...DEPOSIT_CORE,
  ...DEPOSIT_MATURITY,
  ...DEPOSIT_STOCK,
  ...CONSUMER_RATES,
  ...CORPORATE_RATES,
];

export const DEF_BY_ID = new Map(ALL_DEFS.map((d) => [d.id, d]));

/* ------------------------------------------------------------------ */
/* Benchmarks and history windows                                      */
/* ------------------------------------------------------------------ */

/** ECB hiking cycle began July 2022; the anchor for cumulative pass-through. */
export const CYCLE_START = '2022-06';

/**
 * MIR reaches back to January 2003. Loading all of it for every series is about
 * half a megabyte of CSV — the ECB API serves no content encoding — so the
 * default window is ten years and the full run is opt-in.
 */
export const HISTORY_WINDOWS = [
  { id: '5y', label: '5Y', start: '2020-01' },
  { id: '10y', label: '10Y', start: '2015-01' },
  { id: 'max', label: 'Since 2003', start: '2003-01' },
] as const;

export type WindowId = (typeof HISTORY_WINDOWS)[number]['id'];
export const DEFAULT_WINDOW: WindowId = '10y';

export function windowStart(id: WindowId): string {
  return HISTORY_WINDOWS.find((w) => w.id === id)?.start ?? '2015-01';
}

/** ECB key policy rates (daily, `FM` dataflow). */
export const POLICY_RATES = {
  dfr: { key: 'D.U2.EUR.4F.KR.DFR.LEV', label: 'Deposit facility' },
  mro: { key: 'D.U2.EUR.4F.KR.MRR_FR.LEV', label: 'Main refinancing' },
  mlf: { key: 'D.U2.EUR.4F.KR.MLFR.LEV', label: 'Marginal lending' },
} as const;

/** The euro short-term rate: free, daily, and redistributable. */
export const ESTR_KEY = 'B.EU000A2X2A25.WT';

/**
 * Euribor is licensed by EMMI and daily redistribution requires a subscription.
 * The ECB publishes it freely at monthly frequency, which is what we use here.
 */
export const EURIBOR_3M_KEY = 'M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA';
