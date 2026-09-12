import { useEffect, useState } from 'preact/hooks';
import {
  fetchSeries,
  groupKeys,
  latest,
  type Observation,
  type Series,
} from './sdmx';
import {
  ALL_RATES,
  ESTR_KEY,
  EURIBOR_3M_KEY,
  HISTORY_START,
  POLICY_RATES,
  seriesKeyFor,
} from './catalog';
import { toMonthEnd } from './metrics';

/** Index of BS_ITEM within a MIR key, used to batch sibling series. */
const BS_ITEM_INDEX = 3;

export interface DashboardData {
  /** Austrian MIR series, indexed by the catalogue rate id. */
  at: Map<string, Series>;
  /** Euro-area equivalents, for the comparison column. */
  ea: Map<string, Series>;
  estr: Series | undefined;
  estrMonthly: Observation[];
  dfrMonthly: Observation[];
  policy: { dfr?: number; mro?: number; mlf?: number; asOf?: string };
  euribor3m: Series | undefined;
}

export interface LoadState {
  data: DashboardData | undefined;
  loading: boolean;
  error: string | undefined;
}

/** Fetches the MIR block for one reference area and indexes it by rate id. */
async function loadMir(refArea: string, signal: AbortSignal): Promise<Map<string, Series>> {
  const wanted = ALL_RATES.map((r) => r.mirKey(refArea));
  const queries = groupKeys(wanted, BS_ITEM_INDEX);

  const batches = await Promise.all(
    queries.map((q) => fetchSeries('MIR', q, { startPeriod: HISTORY_START, signal })),
  );

  const byKey = new Map<string, Series>();
  for (const series of batches.flat()) byKey.set(series.key, series);

  const byId = new Map<string, Series>();
  for (const def of ALL_RATES) {
    const series = byKey.get(seriesKeyFor(def, refArea));
    // A missing series is normal: not every MIR breakdown exists for every
    // country. The panel renders a dash rather than failing.
    if (series) byId.set(def.id, series);
  }
  return byId;
}

export async function loadDashboard(signal: AbortSignal): Promise<DashboardData> {
  const [at, ea, estrList, dfrList, mroList, mlfList, euriborList] = await Promise.all([
    loadMir('AT', signal),
    loadMir('U2', signal),
    fetchSeries('EST', ESTR_KEY, { startPeriod: HISTORY_START, signal }),
    fetchSeries('FM', POLICY_RATES.dfr.key, { startPeriod: HISTORY_START, signal }),
    fetchSeries('FM', POLICY_RATES.mro.key, { lastNObservations: 1, signal }),
    fetchSeries('FM', POLICY_RATES.mlf.key, { lastNObservations: 1, signal }),
    fetchSeries('FM', EURIBOR_3M_KEY, { startPeriod: HISTORY_START, signal }),
  ]);

  const estr = estrList[0];
  const dfr = dfrList[0];

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
  };
}

export function useDashboard(): LoadState {
  const [state, setState] = useState<LoadState>({
    data: undefined,
    loading: true,
    error: undefined,
  });

  useEffect(() => {
    const controller = new AbortController();

    loadDashboard(controller.signal)
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
  }, []);

  return state;
}
