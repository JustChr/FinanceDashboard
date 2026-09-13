import { useEffect, useState } from 'preact/hooks';

import { fetchSeries, latest, type Observation, type Series } from './sdmx';
import {
  ALL_DEFS,
  ESTR_KEY,
  EURIBOR_3M_KEY,
  POLICY_RATES,
  mirKey,
  seriesKeyFor,
  windowStart,
  type Area,
  type MirDef,
  type WindowId,
} from './catalog';
import { toMonthEnd } from './metrics';
import { loadHousingHistory, loadOffers, type OfferBoard, type QuoteHistory } from './offers';

/**
 * Collapses the catalogue into as few SDMX requests as possible.
 *
 * Definitions that share every dimension except `BS_ITEM` and
 * `MATURITY_NOT_IRATE` can travel in one request using `+` alternation on both.
 * Grouping items by their maturity signature avoids requesting a cross product
 * that mostly does not exist — a query for `A2C+L22` across every maturity code
 * would return the union and waste bandwidth on series nobody asked for.
 */
export function planQueries(defs: MirDef[], area: Area): string[] {
  const buckets = new Map<string, Map<string, Set<string>>>();

  for (const d of defs) {
    const bucketId = [d.dataType, d.amount, d.sector, d.busCov].join('|');
    let byItem = buckets.get(bucketId);
    if (!byItem) {
      byItem = new Map();
      buckets.set(bucketId, byItem);
    }
    const maturities = byItem.get(d.item) ?? new Set<string>();
    maturities.add(d.maturity);
    byItem.set(d.item, maturities);
  }

  const queries: string[] = [];

  for (const [bucketId, byItem] of buckets) {
    const [dataType, amount, sector, busCov] = bucketId.split('|') as [
      MirDef['dataType'],
      string,
      string,
      MirDef['busCov'],
    ];

    // Items asking for the same maturity codes can share one request.
    const bySignature = new Map<string, string[]>();
    for (const [item, maturities] of byItem) {
      const signature = [...maturities].sort().join('+');
      const items = bySignature.get(signature) ?? [];
      items.push(item);
      bySignature.set(signature, items);
    }

    for (const [signature, items] of bySignature) {
      queries.push(
        mirKey(
          {
            id: '',
            label: '',
            side: 'asset',
            item: items.sort().join('+'),
            maturity: signature,
            dataType,
            amount,
            sector,
            busCov,
            ea: false,
          },
          area,
        ),
      );
    }
  }

  return queries;
}

export interface DashboardData {
  /** Austrian MIR series, indexed by the catalogue definition id. */
  at: Map<string, Series>;
  /** Euro-area equivalents, for the comparison columns. */
  ea: Map<string, Series>;
  estr: Series | undefined;
  estrMonthly: Observation[];
  dfrMonthly: Observation[];
  policy: { dfr?: number; mro?: number; mlf?: number; asOf?: string };
  euribor3m: Series | undefined;
  /** What banks currently advertise, from the scheduled scrape. */
  offers: OfferBoard | undefined;
  /** What banks advertised for housing loans before today. */
  housingHistory: QuoteHistory | undefined;
  /** Latest MIR observation period across the Austrian block. */
  asOf: string | undefined;
  window: WindowId;
}

export interface LoadState {
  data: DashboardData | undefined;
  loading: boolean;
  error: string | undefined;
}

/** Fetches the MIR block for one reference area and indexes it by definition id. */
async function loadMir(
  area: Area,
  defs: MirDef[],
  startPeriod: string,
  signal: AbortSignal,
): Promise<Map<string, Series>> {
  const batches = await Promise.all(
    planQueries(defs, area).map((q) => fetchSeries('MIR', q, { startPeriod, signal })),
  );

  const byKey = new Map<string, Series>();
  for (const series of batches.flat()) byKey.set(series.key, series);

  const byId = new Map<string, Series>();
  for (const d of defs) {
    const series = byKey.get(seriesKeyFor(d, area));
    // A missing series is normal: not every MIR breakdown exists for every
    // country. The panel renders a dash rather than failing.
    if (series) byId.set(d.id, series);
  }
  return byId;
}

export async function loadDashboard(
  window: WindowId,
  signal: AbortSignal,
): Promise<DashboardData> {
  const startPeriod = windowStart(window);
  const eaDefs = ALL_DEFS.filter((d) => d.ea);

  const [at, ea, estrList, dfrList, mroList, mlfList, euriborList, offers, housingHistory] =
    await Promise.all([
    loadMir('AT', ALL_DEFS, startPeriod, signal),
    loadMir('U2', eaDefs, startPeriod, signal),
    fetchSeries('EST', ESTR_KEY, { startPeriod, signal }),
    fetchSeries('FM', POLICY_RATES.dfr.key, { startPeriod, signal }),
    fetchSeries('FM', POLICY_RATES.mro.key, { lastNObservations: 1, signal }),
    fetchSeries('FM', POLICY_RATES.mlf.key, { lastNObservations: 1, signal }),
    fetchSeries('FM', EURIBOR_3M_KEY, { startPeriod, signal }),
    loadOffers(signal),
    loadHousingHistory(signal),
  ]);

  const estr = estrList[0];
  const dfr = dfrList[0];

  let asOf: string | undefined;
  for (const series of at.values()) {
    const last = latest(series)?.period;
    if (last && (!asOf || last > asOf)) asOf = last;
  }

  return {
    at,
    ea,
    estr,
    estrMonthly: toMonthEnd(estr?.observations ?? []),
    dfrMonthly: toMonthEnd(dfr?.observations ?? []),
    policy: {
      dfr: latest(dfr)?.value,
      mro: latest(mroList[0])?.value,
      mlf: latest(mlfList[0])?.value,
      asOf: latest(dfr)?.period,
    },
    euribor3m: euriborList[0],
    offers,
    housingHistory,
    asOf,
    window,
  };
}

export function useDashboard(window: WindowId): LoadState {
  const [state, setState] = useState<LoadState>({
    data: undefined,
    loading: true,
    error: undefined,
  });

  useEffect(() => {
    const controller = new AbortController();
    // Keep the previous window on screen while the new one loads; a full-page
    // spinner on every window change makes the toggle feel broken.
    setState((prev) => ({ ...prev, loading: true, error: undefined }));

    loadDashboard(window, controller.signal)
      .then((data) => setState({ data, loading: false, error: undefined }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          data: undefined,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load ECB data',
        });
      });

    return () => controller.abort();
  }, [window]);

  return state;
}
