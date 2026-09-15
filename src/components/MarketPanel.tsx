import { useMemo, useState } from 'preact/hooks';
import type { EChartsOption } from 'echarts';

import type { EcbData, LoadState } from '../lib/data';
import { windowStart, type WindowId } from '../lib/catalog';
import type { OenbData } from '../lib/oenb';
import type { Observation } from '../lib/sdmx';
import { observationAt, shiftMonths } from '../lib/sdmx';
import { bps, eurMillions, formatPeriod, num, pct, pp } from '../lib/format';
import { t } from '../i18n';
import { rollingSum, sumByPeriod } from '../lib/metrics';
import { usePalette, type Palette } from '../lib/theme';
import { Chart } from './Chart';
import { timeChart, volumeChart, type BarSpec, type LineSpec } from './charts';
import { Numbers, Pending, Section, Segmented, WindowPicker } from './ui';

/**
 * One view of the statistics behind a product: a set of monthly lines, or
 * volume columns. A page offers several views of the same panel rather than a
 * card for each, so the question changes and the page length does not.
 */
export interface MarketView {
  id: string;
  label: string;
  /** Monthly lines. OeNB series arrive in full and are cut to the ECB window. */
  lines?: (ecb: EcbData, pal: Palette, oenb: OenbData | undefined) => LineSpec[];
  /** Volume columns instead of lines, stacked when there is more than one. */
  bars?: (ecb: EcbData, pal: Palette) => BarSpec[];
  suffix?: string;
  decimals?: number;
  zeroLine?: boolean;
  /** The lines are shares of a whole, so a change reads in percentage points. */
  share?: boolean;
}

export const obs = (ecb: EcbData, id: string, area: 'at' | 'ea' = 'at'): Observation[] =>
  ecb[area].get(id)?.observations ?? [];

export function MarketPanel({
  title,
  meta,
  views,
  ecb,
  oenb,
  window,
  onWindow,
}: {
  title: string;
  meta: string;
  views: MarketView[];
  ecb: LoadState<EcbData>;
  oenb?: OenbData;
  window: WindowId;
  onWindow: (id: WindowId) => void;
}) {
  const pal = usePalette();
  const [viewId, setViewId] = useState(views[0]?.id ?? '');
  const view = views.find((v) => v.id === viewId) ?? views[0];
  const data = ecb.data;

  const built = useMemo(() => {
    if (!data || !view) return undefined;
    // The ECB answers for the chosen window; committed OeNB files hold everything.
    const start = windowStart(data.window);
    const clip = <S extends { observations: Observation[] }>(s: S): S => ({
      ...s,
      observations: s.observations.filter((o) => o.period >= start),
    });

    if (view.bars) {
      const specs = view
        .bars(data, pal)
        .map(clip)
        .filter((s) => s.observations.length > 0);
      const totals = sumByPeriod(specs.map((s) => s.observations));
      const annual = rollingSum(totals, 12).at(-1);
      const last = totals.at(-1);
      const split = specs.length > 1;
      const valueIn = (s: BarSpec, period: string) => s.observations.find((o) => o.period === period)?.value;
      return {
        option: volumeChart(pal, specs) as EChartsOption,
        summary: last
          ? [
              `${formatPeriod(last.period)}: ${eurMillions(last.value)}`,
              ...(split
                ? specs.flatMap((s) => {
                    const v = valueIn(s, last.period);
                    return v === undefined ? [] : [`${s.name} ${eurMillions(v)}`];
                  })
                : []),
              t.panel.lastYear(eurMillions(annual?.value)),
            ].join(' · ')
          : '',
        rows: totals
          .slice(-13)
          .reverse()
          .map((o) => [
            formatPeriod(o.period),
            ...(split ? specs.map((s) => eurMillions(valueIn(s, o.period))) : []),
            eurMillions(o.value),
          ]),
        head: split ? [t.panel.volumeHead[0] ?? '', ...specs.map((s) => s.name), t.panel.total] : t.panel.volumeHead,
      };
    }
    const specs = (view.lines?.(data, pal, oenb) ?? []).map(clip);
    const change = view.share ? pp : bps;
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
          now && then && suffix === '%' ? change(now.value - then.value) : '–',
        ];
      }),
    };
  }, [data, oenb, view, pal]);

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
