/**
 * Austrian statistics the ECB does not carry, from the Oesterreichische
 * Nationalbank.
 *
 * Two gaps are filled here. The ECB publishes Austrian new-business volume only
 * as a total, so how new lending splits between variable and fixed rates has to
 * come from the OeNB. And the OeNB breaks term deposits down into Spareinlagen —
 * Sparbuch and Kapitalsparbuch money — which is Austrian and has no ECB series.
 *
 * The OeNB web service sends no CORS headers, so the browser cannot read it.
 * `scripts/stats/oenb.mjs` fetches it in the daily offers workflow and commits
 * `public/data/oenb.json`, which the page loads same-origin like the offers.
 */

import type { Observation } from './sdmx';
import { loadJson } from './offers';

export interface OenbSeries {
  /** The OeNB position code, so a figure can be checked at the source. */
  pos: string;
  title: string;
  unit: string;
  observations: Observation[];
}

export interface OenbData {
  generatedAt: string;
  series: Record<string, OenbSeries>;
}

export const loadOenb = (signal: AbortSignal) =>
  loadJson<OenbData>('oenb.json', signal, (d) => !!d?.series && typeof d.series === 'object');

export const oenbObs = (data: OenbData | undefined, id: string): Observation[] =>
  data?.series[id]?.observations ?? [];
