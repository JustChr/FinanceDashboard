/**
 * Series catalogue for the Austrian bank-pricing panel.
 *
 * Every key below was verified against the live ECB Data Portal API. MIR keys
 * follow the 10-dimension order:
 *   FREQ.REF_AREA.BS_REP_SECTOR.BS_ITEM.MATURITY_NOT_IRATE
 *   .DATA_TYPE_MIR.AMOUNT_CAT.BS_COUNT_SECTOR.CURRENCY_TRANS.IR_BUS_COV
 *
 * Counterparty sector: 2250 = households, 2240 = non-financial corporations.
 */

export type Side = 'asset' | 'liability';

export interface RateDefinition {
  id: string;
  label: string;
  /** Short note on what the series actually measures. */
  note: string;
  side: Side;
  /** Full MIR key for a given reference area (AT, U2, ...). */
  mirKey: (refArea: string) => string;
}

/** ECB hiking cycle began July 2022; the anchor for cumulative deposit beta. */
export const CYCLE_START = '2022-06';

/** How far back the charts and the history request reach. */
export const HISTORY_START = '2019-01';

export const LOAN_RATES: RateDefinition[] = [
  {
    id: 'house',
    label: 'House purchase',
    note: 'New business, households',
    side: 'asset',
    mirKey: (a) => `M.${a}.B.A2C.A.R.A.2250.EUR.N`,
  },
  {
    id: 'corp',
    label: 'Corporate borrowing',
    note: 'Cost-of-borrowing composite, NFCs',
    side: 'asset',
    mirKey: (a) => `M.${a}.B.A2I.AM.R.A.2240.EUR.N`,
  },
  {
    id: 'corp_large',
    label: 'Corporate loans over €1M',
    note: 'New business, NFCs',
    side: 'asset',
    mirKey: (a) => `M.${a}.B.A2A.A.R.1.2240.EUR.N`,
  },
  {
    id: 'consumer',
    label: 'Consumer credit',
    note: 'New business, households',
    side: 'asset',
    mirKey: (a) => `M.${a}.B.A2B.A.R.A.2250.EUR.N`,
  },
  {
    id: 'overdraft_hh',
    label: 'Overdrafts, households',
    note: 'Revolving loans and overdrafts',
    side: 'asset',
    mirKey: (a) => `M.${a}.B.A2Z1.A.R.A.2250.EUR.N`,
  },
];

export const DEPOSIT_RATES: RateDefinition[] = [
  {
    id: 'on_hh',
    label: 'Overnight, households',
    note: 'The stickiest liability, core of deposit beta',
    side: 'liability',
    mirKey: (a) => `M.${a}.B.L21.A.R.A.2250.EUR.N`,
  },
  {
    id: 'on_nfc',
    label: 'Overnight, corporates',
    note: 'Reprices faster than retail',
    side: 'liability',
    mirKey: (a) => `M.${a}.B.L21.A.R.A.2240.EUR.N`,
  },
  {
    id: 'term_hh',
    label: 'Term deposits, households',
    note: 'Agreed maturity, new business',
    side: 'liability',
    mirKey: (a) => `M.${a}.B.L22.A.R.A.2250.EUR.N`,
  },
  {
    id: 'term_nfc',
    label: 'Term deposits, corporates',
    note: 'Agreed maturity, new business',
    side: 'liability',
    mirKey: (a) => `M.${a}.B.L22.A.R.A.2240.EUR.N`,
  },
  {
    id: 'notice_hh',
    label: 'Redeemable at notice',
    note: 'Households, savings-book style',
    side: 'liability',
    mirKey: (a) => `M.${a}.B.L23.A.R.A.2250.EUR.N`,
  },
];

export const ALL_RATES: RateDefinition[] = [...LOAN_RATES, ...DEPOSIT_RATES];

/** Lookup from definition id to the SDMX key actually returned by the API. */
export function seriesKeyFor(def: RateDefinition, refArea: string): string {
  return `MIR.${def.mirKey(refArea)}`;
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
