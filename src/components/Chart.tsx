import { useEffect, useRef } from 'preact/hooks';
// Importing from `echarts/core` and registering only what we draw keeps the
// bundle at a fraction of the full library.
import * as echarts from 'echarts/core';
import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';

import { locale, t } from '../i18n';

echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  CanvasRenderer,
]);

type ChartLocale = NonNullable<NonNullable<Parameters<typeof echarts.init>[2]>['locale']>;

/**
 * Month names on the calendar axes. ECharts merges a locale object over its
 * English default, so the names are all it needs; everything else it would
 * translate is hidden or formatted by the chart builders.
 */
const CHART_LOCALE: ChartLocale =
  locale === 'de'
    ? ({ time: { month: t.format.monthsLong, monthAbbr: t.format.months } } as unknown as ChartLocale)
    : 'EN';

interface ChartProps {
  option: EChartsOption;
  height?: number;
  /** Accessible description; the canvas is otherwise opaque to screen readers. */
  ariaLabel: string;
  /**
   * Called with the x-axis value under a click anywhere in the plot, so a
   * column can be chosen without landing on a 10px marker.
   */
  onPick?: (x: number) => void;
  /** Series name to emphasise, e.g. while a lender chip is hovered. */
  highlight?: string | null;
}

export function Chart({ option, height = 300, ariaLabel, onPick, highlight }: ChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<echarts.ECharts>();
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: 'canvas', locale: CHART_LOCALE });
    instance.current = chart;

    chart.getZr().on('click', (event) => {
      if (!pick.current) return;
      const point = [event.offsetX, event.offsetY];
      if (!chart.containPixel({ gridIndex: 0 }, point)) return;
      const [x] = chart.convertFromPixel({ gridIndex: 0 }, point) as number[];
      if (x !== undefined && Number.isFinite(x)) pick.current(x);
    });

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart.dispose();
      instance.current = undefined;
    };
  }, []);

  useEffect(() => {
    // `true` discards the previous config so removed series do not linger.
    instance.current?.setOption(option, true);
  }, [option]);

  useEffect(() => {
    const chart = instance.current;
    if (!chart) return;
    chart.dispatchAction({ type: 'downplay' });
    if (highlight) chart.dispatchAction({ type: 'highlight', seriesName: highlight });
  }, [highlight, option]);

  return (
    <div
      ref={container}
      class={`chart${onPick ? ' pickable' : ''}`}
      style={{ height: `${height}px` }}
      role="img"
      aria-label={ariaLabel}
    />
  );
}
