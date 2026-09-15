/**
 * Chart builders.
 *
 * Every page draws the same few shapes — today's offers along a fixation or
 * term axis, offer history on a calendar, monthly ECB series, and a dumbbell of
 * Austria against the euro area — so styling, null handling and tooltips live
 * here once. Colours always come from the palette, never from a literal, so
 * both colour schemes stay validated.
 */

import type { EChartsOption } from 'echarts';

import type { Observation } from '../lib/sdmx';
import type { Palette } from '../lib/theme';
import {
  PERCENT,
  bps,
  day,
  decimal,
  esc,
  eurBillions,
  eurMillionsFull,
  fixationShort,
  formatPeriod,
  num,
  pct,
  termShort,
} from '../lib/format';
import { valueAt } from '../lib/quotes';
import { t } from '../i18n';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function base(pal: Palette): EChartsOption {
  return {
    backgroundColor: 'transparent',
    animationDuration: 300,
    animationDurationUpdate: 250,
    textStyle: { fontFamily: FONT, color: pal.ink2 },
    grid: { left: 4, right: 20, top: 16, bottom: 4, containLabel: true },
    tooltip: {
      backgroundColor: pal.tooltipBg,
      borderColor: pal.tooltipBorder,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: pal.ink, fontSize: 12, fontFamily: FONT },
      extraCssText:
        'border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.08);max-width:340px;white-space:normal;line-height:1.45;',
    },
  };
}

const axisLabel = (pal: Palette) => ({ color: pal.muted, fontSize: 11, fontFamily: FONT });

/** The per-cent sign as the page's language sets it; any other suffix passes through. */
const unit = (suffix: string) => (suffix === '%' ? PERCENT : suffix);

function rateAxis(pal: Palette, suffix = '%') {
  return {
    type: 'value' as const,
    scale: true,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { ...axisLabel(pal), formatter: (v: number) => `${decimal(v)}${unit(suffix)}` },
    splitLine: { lineStyle: { color: pal.grid } },
  };
}

function legend(pal: Palette) {
  return {
    top: 0,
    left: 0,
    icon: 'roundRect',
    itemWidth: 14,
    itemHeight: 3,
    itemGap: 18,
    textStyle: { color: pal.ink2, fontSize: 12, fontFamily: FONT },
    inactiveColor: pal.axis,
  };
}

/**
 * A rate axis padded around its data and rounded to a clean step, so the
 * lowest marks and reference bands never sit on the axis line itself.
 */
function paddedExtent(lo: number, hi: number, step: number) {
  const pad = Math.max(step / 2, (hi - lo) * 0.08);
  return {
    min: Math.floor((lo - pad) / step) * step,
    max: Math.ceil((hi + pad) / step) * step,
  };
}

/** A tooltip row: a short stroke of the series colour, the value, then the name. */
export const tipRow = (color: string, value: string, label: string) =>
  `<div class="tt-row"><i style="background:${color}"></i><b>${esc(value)}</b><span>${esc(label)}</span></div>`;

/* ------------------------------------------------------------------ */
/* Today's offers along a fixation or term axis                        */
/* ------------------------------------------------------------------ */

export type CurveAxis = 'fixation' | 'term';

/**
 * Axis space for each curve.
 *
 * Fixation periods are offered at 0, 5, 10… years, so a linear axis spaces them
 * truthfully. Deposit terms bunch at 1–12 months and spread to seven years; on
 * a linear axis the short end collapses into one smear, so terms sit on a
 * square-root scale that keeps order and relative distance readable.
 */
export const CURVE_AXES: Record<CurveAxis, { to: (x: number) => number; from: (v: number) => number }> = {
  fixation: { to: (x) => x, from: (v) => v },
  term: { to: (x) => Math.sqrt(Math.max(0, x)), from: (v) => Math.max(0, v) ** 2 },
};

export interface CurvePoint {
  /** Already in axis space, dodge included. */
  x: number;
  y: number;
  hollow: boolean;
  tip: string;
}

export interface CurveLine {
  /** The lender; shared by all of its lines so highlighting finds them all. */
  name: string;
  color: string;
  symbol: string;
  dashed: boolean;
  /** Connect the dots — only when the points are rungs of one product. */
  connect: boolean;
  points: CurvePoint[];
}

export interface CurveBand {
  /** Axis-space extent. */
  from: number;
  to: number;
  value: number;
  tip: string;
}

export function curveChart(
  pal: Palette,
  lines: CurveLine[],
  bands: CurveBand[],
  options: { axis: CurveAxis; selected?: { from: number; to: number } },
): EChartsOption {
  const { axis, selected } = options;
  const b = base(pal);
  const values = [...lines.flatMap((l) => l.points.map((p) => p.y)), ...bands.map((band) => band.value)];
  const extent = values.length ? paddedExtent(Math.min(...values), Math.max(...values), 0.25) : {};

  const xAxis =
    axis === 'fixation'
      ? {
          min: -2.4,
          max: 27,
          customValues: [0, 5, 10, 15, 20, 25],
          formatter: (v: number) => fixationShort(v),
          name: t.charts.fixationAxis,
        }
      : {
          min: -0.55,
          max: Math.sqrt(92),
          customValues: [0, 3, 6, 12, 24, 36, 60, 84].map(Math.sqrt),
          formatter: (v: number) => termShort(Math.round(v * v)),
          name: t.charts.termAxis,
        };

  return {
    ...b,
    grid: { left: 4, right: 20, top: 16, bottom: 26, containLabel: true },
    tooltip: { ...b.tooltip, trigger: 'item' },
    xAxis: {
      type: 'value',
      min: xAxis.min,
      max: xAxis.max,
      name: xAxis.name,
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: { color: pal.muted, fontSize: 11, fontFamily: FONT },
      axisLine: { lineStyle: { color: pal.axis } },
      axisTick: { show: true, customValues: xAxis.customValues, lineStyle: { color: pal.axis } },
      axisLabel: { ...axisLabel(pal), customValues: xAxis.customValues, formatter: xAxis.formatter },
      splitLine: { show: false },
    },
    yAxis: { ...rateAxis(pal), ...extent },
    series: [
      {
        name: 'selection',
        type: 'line',
        data: [],
        silent: true,
        ...(selected
          ? {
              markArea: {
                silent: true,
                itemStyle: { color: pal.select },
                data: [[{ xAxis: selected.from }, { xAxis: selected.to }]],
              },
            }
          : {}),
      },
      {
        name: t.common.ecbAverage,
        type: 'line',
        data: bands.flatMap((band) => [
          [band.from, band.value],
          [band.to, band.value],
          [band.to, null],
        ]),
        symbol: 'none',
        connectNulls: false,
        triggerLineEvent: true,
        z: 1,
        lineStyle: { color: pal.market, width: 6, opacity: 0.35, cap: 'butt' },
        emphasis: { disabled: true },
        tooltip: {
          formatter: (p: { dataIndex: number }) => bands[Math.floor(p.dataIndex / 3)]?.tip ?? '',
        },
      },
      ...lines.map((line) => ({
        name: line.name,
        type: 'line' as const,
        z: 3,
        data: line.points.map((p) => ({
          value: [p.x, p.y],
          tip: p.tip,
          // Hollow is drawn as a surface-filled marker with a coloured ring,
          // which reads the same on either background.
          itemStyle: p.hollow
            ? { color: pal.surface, borderColor: line.color, borderWidth: 2 }
            : { color: line.color, borderColor: pal.surface, borderWidth: 1.5 },
        })),
        symbol: line.symbol,
        symbolSize: 11,
        showAllSymbol: true,
        lineStyle: {
          color: line.color,
          width: line.connect ? 1.6 : 0,
          opacity: 0.7,
          type: line.dashed ? ('dashed' as const) : ('solid' as const),
        },
        itemStyle: { color: line.color },
        emphasis: { focus: 'series' as const, scale: 1.25, lineStyle: { width: line.connect ? 2.4 : 0 } },
        blur: { itemStyle: { opacity: 0.18 }, lineStyle: { opacity: 0.1 } },
        tooltip: { formatter: (p: { data: { tip: string } }) => p.data.tip },
      })),
    ] as EChartsOption['series'],
  };
}

/* ------------------------------------------------------------------ */
/* Offer history on a calendar                                         */
/* ------------------------------------------------------------------ */

export interface StepLine {
  /** Lender name, shared across its lines for highlighting. */
  name: string;
  /** What the tooltip calls this line. */
  label: string;
  color: string;
  points: [string, number | null][];
  dashed?: boolean;
  /** A monthly reference series rather than a quote; drawn quieter, held a month. */
  reference?: boolean;
}

/**
 * Quotes on a true calendar axis, held flat until the next quote replaces them —
 * nothing is interpolated between restatements, because nobody was ever offered
 * the rate in between. The tooltip reads every line's value on the hovered day
 * from the steps themselves, not from whichever corner happens to be nearest.
 */
export function historyChart(
  pal: Palette,
  lines: StepLine[],
  options: { start: string; end: string },
): EChartsOption {
  const b = base(pal);

  // Scale to what is inside the window, not the whole history: a 2021 low
  // would otherwise flatten the last three years against the top of the chart.
  const t0 = Date.parse(options.start);
  const t1 = Date.parse(options.end);
  let lo = Infinity;
  let hi = -Infinity;
  for (const line of lines) {
    const entering = valueAt(line.points, t0, line.reference ? 45 : 1);
    const inside = line.points
      .filter(([d, v]) => v !== null && Date.parse(d) >= t0 && Date.parse(d) <= t1)
      .map(([, v]) => v as number);
    for (const v of entering === null ? inside : [entering, ...inside]) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  const extent = Number.isFinite(lo) ? paddedExtent(lo, hi, 0.25) : {};

  const lastPoint = (points: [string, number | null][]) => {
    let last = -1;
    points.forEach((p, i) => {
      if (p[1] !== null) last = i;
    });
    return last;
  };

  return {
    ...b,
    tooltip: {
      ...b.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: pal.axis } },
      formatter: (params: unknown) => {
        const first = (params as { axisValue: number }[])[0];
        if (!first) return '';
        const time = first.axisValue;
        const rows = lines
          .map((l) => ({ l, v: valueAt(l.points, time, l.reference ? 45 : 1) }))
          .filter((r): r is { l: StepLine; v: number } => r.v !== null)
          .sort((a, c) => c.v - a.v);
        return `<div class="tt-head">${day(new Date(time).toISOString())}</div>${
          rows.length
            ? rows.map((r) => tipRow(r.l.color, pct(r.v), r.l.label)).join('')
            : `<div class="tt-dim">${esc(t.charts.noQuote)}</div>`
        }`;
      },
    },
    xAxis: {
      type: 'time',
      min: options.start,
      max: options.end,
      axisLine: { lineStyle: { color: pal.axis } },
      axisTick: { show: false },
      axisLabel: { ...axisLabel(pal), hideOverlap: true },
      splitLine: { show: false },
    },
    yAxis: { ...rateAxis(pal), ...extent },
    series: lines.map((line) => {
      const last = lastPoint(line.points);
      return {
        name: line.name,
        type: 'line',
        z: line.reference ? 1 : 3,
        data: line.points.map((p, i) =>
          i === last && !line.reference
            ? { value: p, symbol: 'circle', symbolSize: 8, itemStyle: { borderColor: pal.surface, borderWidth: 1.5 } }
            : p,
        ),
        symbol: 'none',
        showSymbol: !line.reference,
        showAllSymbol: true,
        connectNulls: false,
        lineStyle: {
          color: line.color,
          width: line.reference ? 2 : 2,
          opacity: line.reference ? 0.55 : 1,
          type: line.dashed ? 'dashed' : 'solid',
        },
        itemStyle: { color: line.color },
        emphasis: { focus: 'series', lineStyle: { width: 3 } },
        blur: { lineStyle: { opacity: 0.12 }, itemStyle: { opacity: 0.12 } },
      };
    }) as EChartsOption['series'],
  };
}

/* ------------------------------------------------------------------ */
/* Monthly ECB series                                                  */
/* ------------------------------------------------------------------ */

export interface LineSpec {
  name: string;
  observations: Observation[];
  color: string;
  width?: number;
  /** Policy rates change on a date and hold; draw them as steps. */
  step?: boolean;
  area?: boolean;
}

/**
 * A multi-series monthly chart over the union of every series' periods.
 *
 * Aligned to that union rather than to the first series: MIR breakdowns start at
 * different dates, and a shorter series plotted against a longer one's axis
 * would silently shift by months. The legend is ECharts' own, so a click hides a
 * line and a hover emphasises it.
 */
export function timeChart(
  pal: Palette,
  specs: LineSpec[],
  options: { suffix?: string; decimals?: number; zeroLine?: boolean } = {},
): EChartsOption {
  const { suffix = '%', decimals = 2, zeroLine = false } = options;
  const periods = [...new Set(specs.flatMap((s) => s.observations.map((o) => o.period)))].sort();
  const b = base(pal);
  const withLegend = specs.length > 1;

  const align = (observations: Observation[]) => {
    const at = new Map(observations.map((o) => [o.period, o.value]));
    return periods.map((p) => {
      const v = at.get(p);
      return v === undefined ? null : Number(v.toFixed(4));
    });
  };

  return {
    ...b,
    grid: { left: 4, right: 20, top: withLegend ? 40 : 16, bottom: 4, containLabel: true },
    ...(withLegend ? { legend: legend(pal) } : {}),
    tooltip: {
      ...b.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: pal.axis } },
      valueFormatter: (value) => (typeof value === 'number' ? `${num(value, decimals)}${unit(suffix)}` : '–'),
    },
    xAxis: {
      type: 'category',
      data: periods.map(formatPeriod),
      boundaryGap: false,
      axisLine: { lineStyle: { color: pal.axis } },
      axisTick: { show: false },
      axisLabel: { ...axisLabel(pal), hideOverlap: true },
    },
    yAxis: rateAxis(pal, suffix),
    series: specs.map((spec, index) => ({
      name: spec.name,
      type: 'line',
      data: align(spec.observations),
      showSymbol: false,
      connectNulls: true,
      ...(spec.step ? { step: 'end' } : {}),
      lineStyle: { color: spec.color, width: spec.width ?? 2 },
      itemStyle: { color: spec.color },
      emphasis: { focus: 'series' },
      blur: { lineStyle: { opacity: 0.15 } },
      ...(spec.area ? { areaStyle: { color: spec.color, opacity: 0.08 } } : {}),
      ...(zeroLine && index === 0
        ? {
            markLine: {
              silent: true,
              symbol: 'none',
              label: { show: false },
              lineStyle: { color: pal.axis, type: 'solid', width: 1 },
              data: [{ yAxis: 0 }],
            },
          }
        : {}),
    })) as EChartsOption['series'],
  };
}

export interface BarSpec {
  name: string;
  observations: Observation[];
  color: string;
}

/**
 * New-business volume as thin columns, stacked when a total is split into parts;
 * MIR volumes arrive in millions of euro. Aligned to the union of months, since
 * the parts start years after the total does.
 */
export function volumeChart(pal: Palette, specs: BarSpec[]): EChartsOption {
  const periods = [...new Set(specs.flatMap((s) => s.observations.map((o) => o.period)))].sort();
  const b = base(pal);
  const withLegend = specs.length > 1;
  return {
    ...b,
    grid: { left: 4, right: 20, top: withLegend ? 40 : 16, bottom: 4, containLabel: true },
    ...(withLegend ? { legend: legend(pal) } : {}),
    tooltip: {
      ...b.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: pal.select } },
      valueFormatter: (value) => (typeof value === 'number' ? eurMillionsFull(value) : '–'),
    },
    xAxis: {
      type: 'category',
      data: periods.map(formatPeriod),
      axisLine: { lineStyle: { color: pal.axis } },
      axisTick: { show: false },
      axisLabel: { ...axisLabel(pal), hideOverlap: true },
    },
    yAxis: {
      ...rateAxis(pal),
      scale: false,
      axisLabel: { ...axisLabel(pal), formatter: (v: number) => eurBillions(v) },
    },
    series: specs.map((spec, index) => {
      const at = new Map(spec.observations.map((o) => [o.period, o.value]));
      return {
        name: spec.name,
        type: 'bar',
        stack: 'volume',
        data: periods.map((p) => {
          const v = at.get(p);
          return v === undefined ? null : Number(v.toFixed(1));
        }),
        itemStyle: { color: spec.color, borderRadius: index === specs.length - 1 ? [2, 2, 0, 0] : 0 },
        barMaxWidth: 8,
        barCategoryGap: '30%',
      };
    }) as EChartsOption['series'],
  };
}

/* ------------------------------------------------------------------ */
/* Austria against the euro area                                       */
/* ------------------------------------------------------------------ */

export interface DumbbellRow {
  label: string;
  at: number | null;
  ea: number | null;
}

/**
 * One row per product: a dot for Austria, a dot for the euro area, and a
 * hairline between them. Position encodes the rate, so the axis can be cropped
 * to the data without exaggerating a gap the way a truncated bar would.
 */
export function dumbbellChart(pal: Palette, rows: DumbbellRow[]): EChartsOption {
  const b = base(pal);
  const austria = pal.series[0] ?? pal.ink;

  return {
    ...b,
    grid: { left: 4, right: 20, top: 34, bottom: 4, containLabel: true },
    legend: { ...legend(pal), icon: 'circle', itemWidth: 8, itemHeight: 8 },
    tooltip: {
      ...b.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: pal.select } },
      formatter: (params: unknown) => {
        const index = (params as { dataIndex: number }[])[0]?.dataIndex ?? -1;
        const row = rows[index];
        if (!row) return '';
        return `<div class="tt-head">${esc(row.label)}</div>${
          row.at !== null ? tipRow(austria, pct(row.at), t.common.austria) : ''
        }${row.ea !== null ? tipRow(pal.market, pct(row.ea), t.common.euroArea) : ''}${
          row.at !== null && row.ea !== null
            ? `<div class="tt-dim">${esc(t.charts.austriaGap(bps(row.at - row.ea)))}</div>`
            : ''
        }`;
      },
    },
    xAxis: rateAxis(pal),
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.map((r) => r.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: pal.ink2, fontSize: 12, fontFamily: FONT },
    },
    series: [
      {
        name: t.common.euroArea,
        type: 'scatter',
        symbolSize: 10,
        data: rows.map((r, i) => [r.ea, i]),
        itemStyle: { color: pal.market, borderColor: pal.surface, borderWidth: 1.5 },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          lineStyle: { color: pal.axis, width: 2, type: 'solid' },
          data: rows.flatMap((r, i) =>
            r.at !== null && r.ea !== null ? [[{ coord: [r.ea, i] }, { coord: [r.at, i] }]] : [],
          ),
        },
      },
      {
        name: t.common.austria,
        type: 'scatter',
        symbolSize: 11,
        z: 3,
        data: rows.map((r, i) => [r.at, i]),
        itemStyle: { color: austria, borderColor: pal.surface, borderWidth: 1.5 },
      },
    ] as EChartsOption['series'],
  };
}
