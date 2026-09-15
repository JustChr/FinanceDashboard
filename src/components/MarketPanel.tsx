import { useMemo, useState } from 'preact/hooks';
import type { EChartsOption } from 'echarts';

import type { EcbData, LoadState } from '../lib/data';
import type { WindowId } from '../lib/catalog';
import type { Observation } from '../lib/sdmx';
import { observationAt, shiftMonths } from '../lib/sdmx';
import { bps, eurMillions, formatPeriod, num, pct } from '../lib/format';
import { t } from '../i18n';
import { rollingSum } from '../lib/metrics';
import { usePalette, type Palette } from '../lib/theme';
import { Chart } from './Chart';
import { timeChart, volumeChart, type LineSpec } from './charts';
import { Numbers, Pending, Section, Segmented, WindowPicker } from './ui';

/**
 * One view of the ECB statistics behind a product: a set of monthly lines, or
 * a volume column chart. A page offers several views of the same panel rather
 * than a card for each, so the question changes and the page length does not.
 */
export interface MarketView {
  id: string;
  label: string;
  /** Monthly lines. */
  lines?: (ecb: EcbData, pal: Palette) => LineSpec[];
  /** A single volume series instead of lines. */
  volume?: (ecb: EcbData) => Observation[];
  suffix?: string;
  decimals?: number;
  zeroLine?: boolean;
}

export const obs = (ecb: EcbData, id: string, area: 'at' | 'ea' = 'at'): Observation[] =>
  ecb[area].get(id)?.observations ?? [];

export function MarketPanel({
  title,
  meta,
  views,
  ecb,
  window,
  onWindow,
}: {
  title: string;
  meta: string;
  views: MarketView[];
  ecb: LoadState<EcbData>;
  window: WindowId;
  onWindow: (id: WindowId) => void;
}) {
  const pal = usePalette();
  const [viewId, setViewId] = useState(views[0]?.id ?? '');
  const view = views.find((v) => v.id === viewId) ?? views[0];
  const data = ecb.data;

  const built = useMemo(() => {
    if (!data || !view) return undefined;
    if (view.volume) {
      const series = view.volume(data);
      const annual = rollingSum(series, 12).at(-1);
      const last = series.at(-1);
      return {
        option: volumeChart(pal, series, pal.series[0] ?? pal.ink) as EChartsOption,
        summary: last
          ? `${formatPeriod(last.period)}: ${eurMillions(last.value)} · ${t.panel.lastYear(eurMillions(annual?.value))}`
          : '',
        rows: series
          .slice(-13)
          .reverse()
          .map((o) => [formatPeriod(o.period), eurMillions(o.value)]),
        head: t.panel.volumeHead,
      };
    }
    const specs = view.lines?.(data, pal) ?? [];
    const suffix = view.suffix ?? '%';
    const decimals = view.decimals ?? 2;
    const fmt = (v: number | undefined) =>
      v === undefined ? '–' : suffix === '%' ? pct(v, decimals) : num(v, decimals);
    // Head the summary with the month most series share; a series that is ahead
    // or behind (a daily policy rate, a late MIR breakdown) names its own month.
    const periods = specs.map((s) => s.observations.at(-1)?.period).filter((p): p is string => !!p);
    const counts = new Map<string, number>();
    for (const p of periods) counts.set(p, (counts.get(p) ?? 0) + 1);
    const common = [...counts].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0];
    return {
      option: timeChart(pal, specs, { suffix, decimals, zeroLine: view.zeroLine }),
      summary: common
        ? `${formatPeriod(common)}: ${specs
            .map((s) => {
              const last = s.observations.at(-1);
              const own = last && last.period !== common ? ` (${formatPeriod(last.period)})` : '';
              return `${s.name} ${fmt(last?.value)}${own}`;
            })
            .join(' · ')}`
        : '',
      head: t.panel.linesHead,
      rows: specs.map((s) => {
        const now = s.observations.at(-1);
        const then = now
          ? observationAt({ key: '', title: '', unit: '', observations: s.observations }, shiftMonths(now.period.slice(0, 7), -12))
          : undefined;
        return [
          s.name,
          fmt(now?.value),
          formatPeriod(now?.period),
          fmt(then?.value),
          now && then && suffix === '%' ? bps(now.value - then.value) : '–',
        ];
      }),
    };
  }, [data, view, pal]);

  return (
    <Section
      title={title}
      meta={meta}
      controls={
        <>
          <Segmented
            label={t.common.view}
            options={views.map((v) => ({ id: v.id, label: v.label }))}
            value={view?.id ?? ''}
            onChange={setViewId}
          />
          <WindowPicker active={window} loading={ecb.loading} onSelect={onWindow} />
        </>
      }
    >
      {built ? (
        <div class={ecb.loading ? 'refreshing' : ''}>
          <p class="summary">{built.summary}</p>
          <Chart option={built.option} height={320} ariaLabel={`${title}: ${view?.label ?? ''}`} />
          <Numbers head={built.head} rows={built.rows} />
        </div>
      ) : (
        <Pending error={ecb.error} height={352} />
      )}
    </Section>
  );
}
