/**
 * Chart builders.
 *
 * Every panel draws the same few shapes — monthly series on a shared time axis,
 * a ladder of dots across fixation periods, or a column of volumes — so the
 * alignment, null handling and axis formatting live here once rather than being
 * re-derived in each view.
 */

import type { EChartsOption } from 'echarts';

import type { Observation } from '../lib/sdmx';
import { formatPeriod } from '../lib/format';
import { baseOption, CHART_COLORS } from './Chart';

export interface LineSpec {
  name: string;
  observations: Observation[];
  color: string;
  dashed?: boolean;
  width?: number;
  /** Fill under the line; use for one or two series, never a whole ladder. */
  area?: boolean;
}

export interface TimeChartOptions {
  /** Axis and tooltip unit. */
  suffix?: string;
  decimals?: number;
  /** Draw a reference line at zero — essential on any spread chart. */
  zeroLine?: boolean;
  /** Let the axis fit the data instead of anchoring at zero. */
  scale?: boolean;
}

/**
 * Builds a multi-series time chart over the union of every series' periods.
 *
 * Series are aligned to that union rather than to the first series: MIR
 * breakdowns start at different dates, and a shorter series plotted against a
 * longer one's axis would silently shift by months.
 */
export function timeChart(specs: LineSpec[], options: TimeChartOptions = {}): EChartsOption {
  const { suffix = '%', decimals = 2, zeroLine = false, scale = true } = options;

  const periods = [...new Set(specs.flatMap((s) => s.observations.map((o) => o.period)))].sort();

  const align = (observations: Observation[]) => {
    const at = new Map(observations.map((o) => [o.period, o.value]));
    return periods.map((p) => {
      const v = at.get(p);
      return v === undefined ? null : Number(v.toFixed(3));
    });
  };

  const base = baseOption();

  return {
    ...base,
    tooltip: {
      ...base.tooltip,
      valueFormatter: (value) =>
        typeof value === 'number' ? `${value.toFixed(decimals)}${suffix}` : '–',
    },
    xAxis: { ...base.xAxis, data: periods.map(formatPeriod) },
    yAxis: {
      ...base.yAxis,
      scale,
      axisLabel: { color: CHART_COLORS.axis, fontSize: 11, formatter: `{value}${suffix}` },
    },
    series: specs.map((spec, index) => ({
      name: spec.name,
      type: 'line',
      data: align(spec.observations),
      smooth: false,
      showSymbol: false,
      connectNulls: true,
      lineStyle: {
        color: spec.color,
        width: spec.width ?? 1.8,
        type: spec.dashed ? 'dashed' : 'solid',
      },
      itemStyle: { color: spec.color },
      ...(spec.area ? { areaStyle: { color: spec.color, opacity: 0.1 } } : {}),
      // One zero line, not one per series.
      ...(zeroLine && index === 0
        ? {
            markLine: {
              silent: true,
              symbol: 'none',
              label: { show: false },
              lineStyle: { color: CHART_COLORS.axis, type: 'solid', width: 1, opacity: 0.5 },
              data: [{ yAxis: 0 }],
            },
          }
        : {}),
    })) as EChartsOption['series'],
  };
}

export interface StepSpec {
  name: string;
  /** `[isoDate, value]` corners; a `null` value breaks the line. */
  points: [string, number | null][];
  color: string;
  dashed?: boolean;
  width?: number;
  /**
   * Dot the latest value. A quote first seen today is a zero-length step and
   * would otherwise not be drawn at all; the dot also marks where "now" is.
   */
  marker?: boolean;
}

function withMarker(points: [string, number | null][]) {
  let last = -1;
  points.forEach((p, i) => {
    if (p[1] !== null) last = i;
  });
  return points.map((p, i) => (i === last ? { value: p, symbol: 'circle', symbolSize: 7 } : p));
}

/**
 * Series on a true calendar axis.
 *
 * `timeChart` spaces periods evenly, which is right for monthly statistics and
 * wrong for offer quotes: a bank restates its example whenever it chooses, so
 * two repricings a fortnight apart and two a year apart would sit the same
 * distance apart on a category axis. Here distance is time. The caller supplies
 * the corners, so a quote holds flat until the next one replaces it — nothing is
 * interpolated between restatements, because nobody was ever offered the rate
 * in between.
 */
export function stepTimeChart(
  specs: StepSpec[],
  options: { start?: string; decimals?: number } = {},
): EChartsOption {
  const { start, decimals = 2 } = options;
  const base = baseOption();

  return {
    ...base,
    tooltip: {
      ...base.tooltip,
      valueFormatter: (value) => (typeof value === 'number' ? `${value.toFixed(decimals)}%` : '–'),
    },
    xAxis: {
      ...base.xAxis,
      type: 'time',
      min: start,
      axisLabel: { color: CHART_COLORS.axis, fontSize: 11, hideOverlap: true },
    },
    yAxis: {
      ...base.yAxis,
      scale: true,
      axisLabel: { color: CHART_COLORS.axis, fontSize: 11, formatter: '{value}%' },
    },
    series: specs.map((spec) => ({
      name: spec.name,
      type: 'line',
      data: spec.marker ? withMarker(spec.points) : spec.points,
      // Symbols are off per series and switched back on per datum by `marker`.
      symbol: 'none',
      showSymbol: spec.marker ?? false,
      showAllSymbol: true,
      connectNulls: false,
      lineStyle: {
        color: spec.color,
        width: spec.width ?? 2,
        type: spec.dashed ? 'dashed' : 'solid',
      },
      itemStyle: { color: spec.color },
    })) as EChartsOption['series'],
  };
}

export interface LadderSpec {
  name: string;
  values: (number | null)[];
  color: string;
}

/**
 * A ladder across fixation periods or maturities, drawn as connected dots.
 *
 * Deliberately not a bar chart. The rungs of these ladders sit within a few tens
 * of basis points of each other, so a zero-based bar chart flattens the whole
 * story into four identical columns, while a bar chart on a truncated axis lies:
 * bar *length* stops encoding the value, and a 20 bp difference looks like a
 * doubling. Dots encode value by position, which stays honest on a cropped axis
 * and reads as what it actually is — a term structure.
 */
export function ladderChart(
  categories: string[],
  rungs: LadderSpec[],
  options: { suffix?: string; decimals?: number } = {},
): EChartsOption {
  const { suffix = '%', decimals = 2 } = options;
  const base = baseOption();

  return {
    ...base,
    grid: { left: 8, right: 16, top: 20, bottom: 4, containLabel: true },
    tooltip: {
      ...base.tooltip,
      valueFormatter: (value) =>
        typeof value === 'number' ? `${value.toFixed(decimals)}${suffix}` : '–',
    },
    xAxis: { ...base.xAxis, data: categories, boundaryGap: true },
    yAxis: {
      ...base.yAxis,
      scale: true,
      axisLabel: { color: CHART_COLORS.axis, fontSize: 11, formatter: `{value}${suffix}` },
    },
    series: rungs.map((rung) => ({
      name: rung.name,
      type: 'line',
      data: rung.values.map((v) => (v === null ? null : Number(v.toFixed(3)))),
      showSymbol: true,
      symbol: 'circle',
      symbolSize: 11,
      connectNulls: true,
      // The connecting line is a reading aid between rungs, not the message.
      lineStyle: { color: rung.color, width: 1.5, opacity: 0.45 },
      itemStyle: { color: rung.color },
    })) as EChartsOption['series'],
  };
}

/** A single series drawn as columns — new-business volumes, mostly. */
export function volumeChart(
  observations: Observation[],
  color: string,
  options: { suffix?: string } = {},
): EChartsOption {
  const base = baseOption();
  const suffix = options.suffix ?? 'm';

  return {
    ...base,
    tooltip: {
      ...base.tooltip,
      valueFormatter: (value) =>
        typeof value === 'number' ? `€${Math.round(value).toLocaleString('en-GB')}${suffix}` : '–',
    },
    xAxis: { ...base.xAxis, data: observations.map((o) => formatPeriod(o.period)) },
    yAxis: {
      ...base.yAxis,
      axisLabel: {
        color: CHART_COLORS.axis,
        fontSize: 11,
        formatter: (value: number) => `€${Math.round(value / 1000)}bn`,
      },
    },
    series: [
      {
        type: 'bar',
        data: observations.map((o) => Number(o.value.toFixed(1))),
        itemStyle: { color, opacity: 0.75 },
        barMaxWidth: 10,
      },
    ] as EChartsOption['series'],
  };
}
