import { useMemo, useState } from 'preact/hooks';

import { HOUSING_SECURED } from '../lib/catalog';
import { residual, shareOf } from '../lib/metrics';
import { oenbObs } from '../lib/oenb';
import { latest } from '../lib/sdmx';
import { STALE_AFTER_DAYS, daysSince, repricings, type QuoteBasis } from '../lib/offers';
import { dodgeOffsets, lenderStyles, nearest, quotesFor, quoteValue, type Quote } from '../lib/quotes';
import {
  bps,
  day,
  decimal,
  esc,
  fixationLong,
  fixationShort,
  formatPeriod,
  lowerFirst,
  pct,
  productName,
} from '../lib/format';
import { usePalette } from '../lib/theme';
import { localized, t } from '../i18n';
import { Chart } from '../components/Chart';
import { CURVE_AXES, curveChart, historyChart, tipRow, type CurveBand, type StepLine } from '../components/charts';
import { MarketPanel, obs, type MarketView } from '../components/MarketPanel';
import {
  About,
  Controls,
  Facts,
  LenderChips,
  Numbers,
  PageHead,
  Section,
  Segmented,
  SourceList,
  Switch,
  type FactItem,
} from '../components/ui';
import {
  ChangeList,
  CurveKey,
  RANGES,
  allLenders,
  buildCurveLines,
  buildHistoryLines,
  historyWindow,
  lenderWeights,
  repricedWhen,
  sourcesFor,
  type PageProps,
  type Range,
} from '../components/offerParts';

/**
 * The ECB's fixation buckets, as extents on the fixation axis. A 5-year fix
 * belongs to "over 1 and up to 5", a 10-year fix to "over 5 and up to 10".
 * Secured loans, because every offer on the curve is a mortgage-secured loan.
 */
const BANDS = [
  { id: 'hl_sec_var', label: t.housing.bands.hl_var, from: -1.9, to: 1 },
  { id: 'hl_sec_1_5', label: t.housing.bands.hl_1_5, from: 1, to: 5 },
  { id: 'hl_sec_5_10', label: t.housing.bands.hl_5_10, from: 5, to: 10 },
  { id: 'hl_sec_10p', label: t.housing.bands.hl_10p, from: 10, to: 26.9 },
] as const;

function bandFor(years: number) {
  if (years <= 1) return BANDS[0];
  if (years <= 5) return BANDS[1];
  if (years <= 10) return BANDS[2];
  return BANDS[3];
}

const BASES: { id: QuoteBasis; label: string }[] = [
  { id: 'effective', label: t.common.basisRate.effective },
  { id: 'nominal', label: t.common.basisRate.nominal },
];

const { buckets } = t.common;

const SHORT: Record<string, string> = {
  hl_sec_var: buckets.variable,
  hl_sec_1_5: buckets.fixed1to5,
  hl_sec_5_10: buckets.fixed5to10,
  hl_sec_10p: buckets.fixedOver10,
};

const VIEWS: MarketView[] = [
  {
    id: 'fixation',
    label: t.common.byFixation,
    lines: (e, pal) =>
      HOUSING_SECURED.map((d, i) => ({
        name: SHORT[d.id] ?? d.label,
        observations: obs(e, d.id),
        color: pal.series[i] ?? pal.ink,
      })),
  },
  {
    id: 'mix',
    label: t.common.fixationMix,
    share: true,
    decimals: 1,
    lines: (e, pal, oenb) => {
      const total = oenbObs(oenb, 'housing_volume');
      const variable = oenbObs(oenb, 'housing_volume_var');
      const fixed1to5 = oenbObs(oenb, 'housing_volume_1_5');
      return [
        { name: `${buckets.variable}, ${t.common.austria}`, observations: shareOf(variable, total), color: pal.series[0] ?? pal.ink },
        { name: `${buckets.fixed1to5}, ${t.common.austria}`, observations: shareOf(fixed1to5, total), color: pal.series[1] ?? pal.ink },
        {
          name: `${buckets.fixedOver5}, ${t.common.austria}`,
          observations: shareOf(residual(total, [variable, fixed1to5]), total),
          color: pal.series[2] ?? pal.ink,
        },
        {
          name: `${buckets.variable}, ${t.common.euroArea}`,
          observations: shareOf(obs(e, 'hl_volume_var', 'ea'), obs(e, 'hl_volume', 'ea')),
          color: pal.market,
        },
      ];
    },
  },
  {
    id: 'book',
    label: t.common.newVsExisting,
    lines: (e, pal) => [
      { name: t.housing.newLoans, observations: obs(e, 'hl_total'), color: pal.series[0] ?? pal.ink },
      { name: t.housing.outstanding, observations: obs(e, 'hl_stock'), color: pal.series[1] ?? pal.ink },
    ],
  },
  {
    id: 'reneg',
    label: t.housing.renegotiated,
    lines: (e, pal) => [
      { name: t.housing.genuinelyNew, observations: obs(e, 'hl_pure'), color: pal.series[0] ?? pal.ink },
      { name: t.housing.renegotiatedLoans, observations: obs(e, 'hl_reneg'), color: pal.series[1] ?? pal.ink },
    ],
  },
  {
    id: 'fees',
    label: t.common.rateVsAprc,
    lines: (e, pal) => [
      { name: t.common.agreedRate, observations: obs(e, 'hl_total'), color: pal.series[0] ?? pal.ink },
      { name: t.common.aprcFees, observations: obs(e, 'hl_aprc'), color: pal.series[1] ?? pal.ink },
    ],
  },
  {
    id: 'volume',
    label: t.common.volume,
    bars: (e, pal) => {
      const pure = obs(e, 'hl_volume_pure');
      const reneg = obs(e, 'hl_volume_reneg');
      return [
        { name: t.common.genuinelyNew, observations: pure, color: pal.series[0] ?? pal.ink },
        { name: t.common.renegotiated, observations: reneg, color: pal.series[1] ?? pal.ink },
        { name: t.common.notSplit, observations: residual(obs(e, 'hl_volume'), [pure, reneg]), color: pal.muted },
      ];
    },
  },
];

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function quoteTip(q: Quote, basis: QuoteBasis, ecbLine: string, color: string): string {
  const other: QuoteBasis = basis === 'effective' ? 'nominal' : 'effective';
  const otherValue = quoteValue(q, other);
  const source = q.kind === 'calculator' ? t.housing.calculatorQuote : t.housing.example;
  const conditions = localized(q.offer.conditions, q.offer.conditionsDe);
  const dated = q.offer.statedAt ? t.housing.bankDate(day(q.offer.statedAt)) : t.housing.noBankDate;
  return [
    `<div class="tt-head">${esc(q.lender)}</div>`,
    tipRow(color, pct(quoteValue(q, basis)), `${t.common.basis[basis]}, ${lowerFirst(fixationLong(q.x))}`),
    otherValue !== null ? `<div class="tt-dim">${pct(otherValue)} ${esc(t.common.basis[other])}</div>` : '',
    // Conditions often open with the source kind already; say it once.
    `<div class="tt-line">${
      conditions?.startsWith(source) ? '' : `${esc(source)} · `
    }${esc(productName(q.offer.product))}</div>`,
    conditions ? `<div class="tt-dim">${esc(truncate(conditions, 160))}</div>` : '',
    `<div class="tt-dim">${esc(dated)} · ${esc(t.housing.checked(day(q.offer.observedAt)))}</div>`,
    ecbLine ? `<div class="tt-line">${esc(ecbLine)}</div>` : '',
    q.stale ? `<div class="tt-warn">${esc(t.housing.outdated(STALE_AFTER_DAYS.mortgage))}</div>` : '',
  ].join('');
}

function quoteFact(label: string, q: Quote | undefined, basis: QuoteBasis): FactItem {
  return {
    label,
    value: pct(q ? quoteValue(q, basis) : undefined),
    detail: q ? `${q.lender}${q.kind === 'calculator' ? ` · ${t.housing.calculator}` : ''}` : t.housing.noQuote,
  };
}

export function Housing({ offers, ecb, ecbWindow, onWindow }: PageProps) {
  const pal = usePalette();
  const { board, housing: history } = offers;
  const data = ecb.data;

  const [basis, setBasis] = useState<QuoteBasis>('effective');
  const [showOutdated, setShowOutdated] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [hover, setHover] = useState<string | null>(null);
  const [fixation, setFixation] = useState(0);
  const [range, setRange] = useState<Range>('3y');

  const all = useMemo(() => quotesFor(board?.offers ?? [], 'mortgage'), [board]);
  const lenders = useMemo(() => allLenders(all, history), [all, history]);
  const styles = useMemo(() => lenderStyles(lenders, pal, lenderWeights(all, history)), [lenders, all, history, pal]);
  const dodge = useMemo(() => dodgeOffsets(lenders, 0.22), [lenders]);
  const fixations = useMemo(
    () =>
      [
        ...new Set([...all.map((q) => q.x), ...Object.values(history?.series ?? {}).map((s) => s.fixationYears ?? 0)]),
      ].sort((a, b) => a - b),
    [all, history],
  );

  const quotes = useMemo(
    () => all.filter((q) => !hidden.has(q.lender) && (showOutdated || !q.stale)),
    [all, hidden, showOutdated],
  );
  const current = quotes.filter((q) => !q.stale && quoteValue(q, basis) !== null);
  const lowest = (holds: (q: Quote) => boolean) =>
    current
      .filter(holds)
      .reduce<Quote | undefined>(
        (best, q) =>
          best === undefined || (quoteValue(q, basis) ?? Infinity) < (quoteValue(best, basis) ?? Infinity) ? q : best,
        undefined,
      );
  const ecbTotal = data ? latest(data.at.get(basis === 'effective' ? 'hl_aprc' : 'hl_total')) : undefined;

  const curve = useMemo(() => {
    const aprc = data ? latest(data.at.get('hl_aprc')) : undefined;
    const bucket = (id: string) => (data ? latest(data.at.get(id)) : undefined);
    const ecbTip = (value: number, what: string, period: string, note: string) =>
      `<div class="tt-head">${esc(t.common.ecbConcludedAverage)}</div>${tipRow(pal.market, pct(value), what)}<div class="tt-dim">${esc(formatPeriod(period))} · ${esc(t.common.austria)} · ${esc(note)}</div>`;

    const bands: CurveBand[] =
      basis === 'effective'
        ? aprc
          ? [
              {
                from: -1.9,
                to: 26.9,
                value: aprc.value,
                tip: ecbTip(aprc.value, t.housing.aprcNewLoans, aprc.period, t.housing.allFixations),
              },
            ]
          : []
        : BANDS.flatMap((b) => {
            const o = bucket(b.id);
            return o
              ? [
                  {
                    from: b.from,
                    to: b.to,
                    value: o.value,
                    tip: ecbTip(o.value, t.housing.newLoansIn(b.label), o.period, t.housing.agreedRate),
                  },
                ]
              : [];
          });

    const ecbLine = (q: Quote) => {
      if (basis === 'effective') return aprc ? `${t.housing.ecbAprcAll}: ${pct(aprc.value)}` : '';
      const b = bandFor(q.x);
      const o = bucket(b.id);
      return o ? `${t.housing.ecbSecured(b.label)}: ${pct(o.value)}` : '';
    };

    const lines = buildCurveLines({
      quotes,
      styles,
      dodge,
      toAxis: CURVE_AXES.fixation.to,
      value: (q) => quoteValue(q, basis),
      tip: (q) => quoteTip(q, basis, ecbLine(q), styles.get(q.lender)?.color ?? pal.ink),
    });

    return curveChart(pal, lines, bands, {
      axis: 'fixation',
      selected: { from: fixation - 2.4, to: fixation + 2.4 },
    });
  }, [quotes, styles, dodge, basis, data, pal, fixation]);

  const today = (board?.generatedAt ?? history?.generatedAt ?? new Date().toISOString()).slice(0, 10);

  const past = useMemo(() => {
    const { lines, missing, earliest } = buildHistoryLines({
      history,
      include: (s) => (s.fixationYears ?? 0) === fixation && !hidden.has(s.provider),
      basis,
      category: 'mortgage',
      styles,
      label: (s) => (/calculator/i.test(s.product) ? `${s.provider} · ${t.housing.calculator}` : s.provider),
    });
    const band = bandFor(fixation);
    const reference: StepLine[] = data
      ? [
          {
            name: t.common.ecbAverage,
            label: basis === 'effective' ? t.housing.ecbAprcAll : t.housing.ecbSecured(band.label),
            color: pal.market,
            reference: true,
            points: obs(data, basis === 'effective' ? 'hl_aprc' : band.id).map(
              (o): [string, number] => [`${o.period}-15`, o.value],
            ),
          },
        ]
      : [];
    return {
      option: historyChart(pal, [...reference, ...lines], historyWindow(range, today, earliest)),
      missing,
      earliest,
    };
  }, [history, fixation, hidden, basis, styles, data, pal, range, today]);

  const changes = useMemo(
    () =>
      history
        ? repricings(history, basis).filter(
            (r) => (r.series.fixationYears ?? 0) === fixation && !hidden.has(r.series.provider),
          )
        : [],
    [history, basis, fixation, hidden],
  );

  // Lenders with quotes today but none on this basis would vanish from the curve without a word.
  const unpublished = lenders.filter(
    (l) =>
      !hidden.has(l) &&
      quotes.some((q) => q.lender === l) &&
      !quotes.some((q) => q.lender === l && quoteValue(q, basis) !== null),
  );
  const fixationPhrase = lowerFirst(fixationLong(fixation));

  return (
    <>
      <PageHead title={t.app.pages.housing}>
        <p class="lede">
          {t.housing.lede(basis, current.length, new Set(current.map((q) => q.lender)).size, day(board?.generatedAt))}
        </p>
        <Facts
          items={[
            quoteFact(t.format.variable, lowest((q) => q.x === 0), basis),
            quoteFact(t.housing.fixed10, lowest((q) => q.x === 10), basis),
            quoteFact(t.housing.fixed20, lowest((q) => q.x >= 20), basis),
            {
              label: t.common.ecbConcludedAverage,
              value: pct(ecbTotal?.value),
              detail: ecbTotal
                ? t.housing.ecbDetail(formatPeriod(ecbTotal.period), basis === 'effective')
                : t.common.loading,
            },
          ]}
        />
      </PageHead>

      <Controls>
        <Segmented label={t.housing.rate} options={BASES} value={basis} onChange={setBasis} />
        <Switch label={t.housing.outdatedExamples} checked={showOutdated} onChange={setShowOutdated} />
        <LenderChips lenders={lenders} styles={styles} hidden={hidden} onChange={setHidden} onHover={setHover} />
      </Controls>

      <Section title={t.housing.curveTitle} meta={t.housing.curveMeta}>
        <Chart
          option={curve}
          height={380}
          onPick={(v) => {
            const f = nearest(fixations, v);
            if (f !== undefined) setFixation(f);
          }}
          highlight={hover}
          ariaLabel={t.housing.curveAria}
        />
        <CurveKey
          band={basis === 'effective' ? t.housing.ecbAprcAll : t.housing.bandPerBucket}
          hollow={t.housing.hollow(STALE_AFTER_DAYS.mortgage)}
        />
        {unpublished.length > 0 ? <p class="hint">{t.housing.unpublished(unpublished, basis)}</p> : null}
        <Numbers
          head={t.housing.offersHead}
          rows={[...quotes]
            .sort((a, b) => a.x - b.x || (quoteValue(a, basis) ?? 99) - (quoteValue(b, basis) ?? 99))
            .map((q) => [
              q.lender,
              <a href={q.offer.sourceUrl} target="_blank" rel="noreferrer">
                {productName(q.offer.product)}
              </a>,
              q.x === 0 ? t.format.variable : t.housing.years(decimal(q.x)),
              pct(q.nominal),
              pct(q.effective),
              q.offer.statedAt ? `${day(q.offer.statedAt)}${q.stale ? t.housing.outdatedMark : ''}` : '–',
              day(q.offer.observedAt),
            ])}
        />
      </Section>

      <Section
        title={t.housing.historyTitle(fixationPhrase)}
        meta={t.housing.historyMeta}
        controls={
          <>
            <Segmented
              label={t.housing.fixation}
              options={fixations.map((f) => ({ id: f, label: fixationShort(f) }))}
              value={fixation}
              onChange={setFixation}
            />
            <Segmented label={t.common.range} options={RANGES} value={range} onChange={setRange} />
          </>
        }
      >
        <Chart option={past.option} height={320} highlight={hover} ariaLabel={t.housing.historyAria(fixationPhrase)} />
        {past.earliest && daysSince(past.earliest) < 120 ? (
          <p class="hint">{t.housing.recordedFrom(day(past.earliest))}</p>
        ) : null}
        {past.missing.length > 0 ? <p class="hint">{t.housing.missing(past.missing, basis)}</p> : null}
        <ChangeList changes={changes.slice(0, 6)} styles={styles} empty={t.housing.noRepricing} />
        <Numbers
          head={t.housing.changesHead}
          rows={changes.map((r) => [
            repricedWhen(r),
            r.series.provider,
            pct(r.before),
            pct(r.after),
            bps(r.after - r.before),
          ])}
        />
      </Section>

      <MarketPanel
        title={t.housing.panelTitle}
        meta={t.housing.panelMeta}
        views={VIEWS}
        ecb={ecb}
        oenb={offers.oenb}
        window={ecbWindow}
        onWindow={onWindow}
      />

      <div class="page-foot">
        <About>{t.housing.about(STALE_AFTER_DAYS.mortgage)}</About>
        <SourceList sources={sourcesFor(board, 'mortgage')} />
      </div>
    </>
  );
}
