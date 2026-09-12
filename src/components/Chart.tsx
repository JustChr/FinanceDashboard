import { useEffect, useRef } from 'preact/hooks';
// Importing from `echarts/core` and registering only what we draw keeps the
// bundle at a fraction of the full library, which matters on a Pages site with
// no server-side compression control.
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

export const CHART_COLORS = {
  asset: '#4da3ff',
  liability: '#f2a33c',
  benchmark: '#7d8a9e',
  austria: '#ef3340',
  euroArea: '#8b95a8',
  positive: '#3ecf8e',
  negative: '#ff6b6b',
  grid: '#1f2836',
  axis: '#5d6b80',
} as const;

/** Shared axis/grid styling so every chart in the dashboard reads as one system. */
export function baseOption(): EChartsOption {
  return {
    backgroundColor: 'transparent',
    grid: { left: 8, right: 12, top: 28, bottom: 4, containLabel: true },
    textStyle: { fontFamily: 'inherit', color: '#7d8a9e' },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(11, 15, 22, 0.95)',
      borderColor: CHART_COLORS.grid,
      borderWidth: 1,
      textStyle: { color: '#e4e9f2', fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: CHART_COLORS.axis, type: 'dashed' } },
    },
    xAxis: {
      type: 'category',
      axisLine: { lineStyle: { color: CHART_COLORS.grid } },
      axisTick: { show: false },
      axisLabel: { color: CHART_COLORS.axis, fontSize: 11 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: CHART_COLORS.axis, fontSize: 11 },
      splitLine: { lineStyle: { color: CHART_COLORS.grid, type: 'dashed' } },
    },
  };
}

interface ChartProps {
  option: EChartsOption;
  height?: number;
  /** Accessible description; charts are otherwise opaque to screen readers. */
  ariaLabel: string;
}

export function Chart({ option, height = 240, ariaLabel }: ChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<echarts.ECharts>();

  useEffect(() => {
    if (!container.current) return;
    const chart = echarts.init(container.current, undefined, { renderer: 'canvas' });
    instance.current = chart;

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container.current);

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

  return (
    <div
      ref={container}
      class="chart"
      style={{ height: `${height}px` }}
      role="img"
      aria-label={ariaLabel}
    />
  );
}
