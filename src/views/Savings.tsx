import { useMemo, useState } from 'preact/hooks';

import { CYCLE_START } from '../lib/catalog';
import { latest } from '../lib/sdmx';
import { betaSeries } from '../lib/metrics';
import { oenbObs } from '../lib/oenb';
import { STALE_AFTER_DAYS, repricings } from '../lib/offers';
import { dodgeOffsets, lenderStyles, nearest, quotesFor, type Quote } from '../lib/quotes';
import { day, esc, eur, formatPeriod, formatTerm, lowerFirst, pct, productName, termShort } from '../lib/format';
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
  sourcesFor,
  type PageProps,
  type Range,
} from '../components/offerParts';

/** Austrian capital gains tax on interest. */
const KEST = 0.25;

/** The ECB's deposit buckets, in months. Overnight sits on the instant-access column. */
const BANDS = [
  { id: 'dep_on', label: t.savings.bands.dep_on, from: 0, to: 0 },
  { id: 'dep_term_le1', label: t.savings.bands.dep_term_le1, from: 1, to: 12 },
  { id: 'dep_term_1_2', label: t.savings.bands.dep_term_1_2, from: 12, to: 24 },
  { id: 'dep_term_2p', label: t.savings.bands.dep_term_2p, from: 24, to: 90 },
] as const;

function bandFor(months: number) {
  if (months === 0) return BANDS[0];
  if (months <= 12) return BANDS[1];
  if (months <= 24) return BANDS[2];
  return BANDS[3];
}

const toAxis = CURVE_AXES.term.to;
const bandExtent = (b: (typeof BANDS)[number]) =>
  b.to === 0 ? { from: -0.4, to: 0.4 } : { from: toAxis(b.from), to: toAxis(b.to) };

const { deposits } = t.common;

const VIEWS: MarketView[] = [
  {
    id: 'products',
    label: t.savings.byProduct,
    lines: (e, pal) => [
      { name: deposits.overnight, observations: obs(e, 'dep_on'), color: pal.series[0] ?? pal.ink },
      { name: deposits.termTo1, observations: obs(e, 'dep_term_le1'), color: pal.series[1] ?? pal.ink },
      { name: deposits.term1to2, observations: obs(e, 'dep_term_1_2'), color: pal.series[2] ?? pal.ink },
      { name: deposits.termOver2, observations: obs(e, 'dep_term_2p'), color: pal.series[3] ?? pal.ink },
      { name: deposits.notice, observations: obs(e, 'dep_notice'), color: pal.series[4] ?? pal.ink },
      { name: t.common.depositFacility, observations: e.dfrMonthly, color: pal.market, step: true, width: 1.5 },
    ],
  },
  {
    id: 'notice',
    label: t.savings.notice,
    lines: (e, pal) => [
      { name: t.savings.noticeTo3m, observations: obs(e, 'dep_notice_le3'), color: pal.series[0] ?? pal.ink },
      { name: t.savings.noticeOver3m, observations: obs(e, 'dep_notice_3p'), color: pal.series[1] ?? pal.ink },
      { name: deposits.overnight, observations: obs(e, 'dep_on'), color: pal.market },
    ],
  },
  {
    id: 'savingsDeposits',
    label: t.savings.savingsDeposits,
    lines: (e, pal, oenb) => [
      { name: t.savings.savingsTo1, observations: oenbObs(oenb, 'savings_le1'), color: pal.series[0] ?? pal.ink },
      { name: t.savings.savings1to2, observations: oenbObs(oenb, 'savings_1_2'), color: pal.series[1] ?? pal.ink },
      { name: t.savings.savingsOver2, observations: oenbObs(oenb, 'savings_2p'), color: pal.series[2] ?? pal.ink },
      { name: t.savings.allTermTo1, observations: obs(e, 'dep_term_le1'), color: pal.market },
    ],
  },
  {
    id: 'book',
    label: t.common.newVsExisting,
    lines: (e, pal) => [
      { name: t.savings.newTerm, observations: obs(e, 'dep_term'), color: pal.series[0] ?? pal.ink },
      { name: t.savings.outstandingTerm, observations: obs(e, 'dep_term_stock'), color: pal.series[1] ?? pal.ink },
    ],
  },
  {
    id: 'beta',
    label: t.savings.passThrough,
    suffix: '',
    zeroLine: true,
    lines: (e, pal) => [
      { name: t.savings.overnightAustria, observations: betaSeries(e.at.get('dep_on'), e.dfrMonthly, CYCLE_START), color: pal.series[0] ?? pal.ink },
      { name: t.savings.termAustria, observations: betaSeries(e.at.get('dep_term'), e.dfrMonthly, CYCLE_START), color: pal.series[1] ?? pal.ink },
      { name: t.savings.overnightEuroArea, observations: betaSeries(e.ea.get('dep_on'), e.dfrMonthly, CYCLE_START), color: pal.market },
    ],
  },
  {
    id: 'volume',
    label: t.common.volume,
    bars: (e, pal) => [{ name: t.charts.newLending, observations: obs(e, 'dep_term_volume'), color: pal.series[0] ?? pal.ink }],
  },
];

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const termLong = (months: number) => (months === 0 ? lowerFirst(t.format.instantAccess) : formatTerm(months));

export function Savings({ offers, ecb, ecbWindow, onWindow }: PageProps) {
  const pal = usePalette();
  const { board, deposit: history } = offers;
  const data = ecb.data;

  const [afterTax, setAfterTax] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [hover, setHover] = useState<string | null>(null);
  const [term, setTerm] = useState(12);
  // Daily savings records are young; a year keeps today's offers readable against the ECB line.
  const [range, setRange] = useState<Range>('1y');
  const scale = afterTax ? 1 - KEST : 1;

  const all = useMemo(() => quotesFor(board?.offers ?? [], 'deposit'), [board]);
  const lenders = useMemo(() => allLenders(all, history), [all, history]);
  const styles = useMemo(() => lenderStyles(lenders, pal, lenderWeights(all, history)), [lenders, all, history, pal]);
  const dodge = useMemo(() => dodgeOffsets(lenders, 0.06), [lenders]);
  const terms = useMemo(() => [...new Set(all.map((q) => q.x))].sort((a, b) => a - b), [all]);

  // Terms at least two providers offer, so the history selector stays short.
  const termOptions = useMemo(() => {
    const counts = new Map<number, Set<string>>();
    for (const q of all) counts.set(q.x, (counts.get(q.x) ?? new Set()).add(q.lender));
    const common = terms.filter((t) => (counts.get(t)?.size ?? 0) >= 2);
    return (common.includes(term) ? common : [...common, term].sort((a, b) => a - b)).map((t) => ({
      id: t,
      label: termShort(t),
    }));
  }, [all, terms, term]);

  const quotes = useMemo(() => all.filter((q) => !hidden.has(q.lender)), [all, hidden]);
  const value = (q: Quote) => (q.nominal === null ? null : q.nominal * scale);
  const current = quotes.filter((q) => !q.stale && q.nominal !== null);
  const highest = (holds: (q: Quote) => boolean) =>
    current
      .filter(holds)
      .reduce<Quote | undefined>((best, q) => (best === undefined || (q.nominal ?? 0) > (best.nominal ?? 0) ? q : best), undefined);

  const fact = (label: string, q: Quote | undefined): FactItem => ({
    label,
    value: pct(q ? value(q) : undefined),
    detail: q ? `${q.lender}${q.promotional ? ` · ${t.savings.promotional}` : ''}` : t.savings.noOffer,
  });
  const ecbTerm = data ? latest(data.at.get('dep_term_le1')) : undefined;

  const curve = useMemo(() => {
    const bucket = (id: string) => (data ? latest(data.at.get(id)) : undefined);
    const bands: CurveBand[] = BANDS.flatMap((b) => {
      const o = bucket(b.id);
      if (!o) return [];
      return [
        {
          ...bandExtent(b),
          value: o.value * scale,
          tip: `<div class="tt-head">${esc(t.common.ecbConcludedAverage)}</div>${tipRow(pal.market, pct(o.value * scale), t.savings.newIn(b.label))}<div class="tt-dim">${esc(formatPeriod(o.period))} · ${esc(t.common.austria)} · ${esc(t.savings.households)}</div>`,
        },
      ];
    });

    const tip = (q: Quote) => {
      const color = styles.get(q.lender)?.color ?? pal.ink;
      const b = bandFor(q.x);
      const o = bucket(b.id);
      const conditions = localized(q.offer.conditions, q.offer.conditionsDe);
      return [
        `<div class="tt-head">${esc(q.lender)}</div>`,
        tipRow(color, pct(value(q)), `${afterTax ? t.savings.afterTax : t.savings.beforeTax}, ${termLong(q.x)}`),
        `<div class="tt-line">${esc(productName(q.offer.product))} · ${esc(
          q.offer.network === 'branch' ? t.savings.branchBank : t.savings.directBank,
        )}</div>`,
        conditions ? `<div class="tt-dim">${esc(truncate(conditions, 160))}</div>` : '',
        q.offer.amountMin ? `<div class="tt-dim">${esc(t.savings.minimum(eur(q.offer.amountMin)))}</div>` : '',
        `<div class="tt-dim">${esc(t.common.checked(day(q.offer.observedAt)))}</div>`,
        o ? `<div class="tt-line">${esc(t.common.ecbConcluded(b.label))}: ${pct(o.value * scale)}</div>` : '',
        q.stale ? `<div class="tt-warn">${esc(t.savings.unconfirmed(STALE_AFTER_DAYS.deposit))}</div>` : '',
      ].join('');
    };

    const lines = buildCurveLines({ quotes, styles, dodge, toAxis, value, tip });
    return curveChart(pal, lines, bands, {
      axis: 'term',
      selected: { from: toAxis(term) - 0.3, to: toAxis(term) + 0.3 },
    });
  }, [quotes, styles, dodge, data, pal, term, scale, afterTax]);

  const today = (board?.generatedAt ?? new Date().toISOString()).slice(0, 10);

  const past = useMemo(() => {
    const { lines, earliest } = buildHistoryLines({
      history,
      include: (s) => (s.termMonths ?? 0) === term && !hidden.has(s.provider),
      basis: 'nominal',
      category: 'deposit',
      styles,
      label: (s) => `${s.provider} · ${productName(s.product)}`,
      scale,
    });
    const band = bandFor(term);
    const reference: StepLine[] = data
      ? [
          {
            name: t.common.ecbAverage,
            label: t.common.ecbConcluded(band.label),
            color: pal.market,
            reference: true,
            points: obs(data, band.id).map((o): [string, number] => [`${o.period}-15`, o.value * scale]),
          },
        ]
      : [];
    return { option: historyChart(pal, [...reference, ...lines], historyWindow(range, today, earliest)), earliest };
  }, [history, term, hidden, styles, data, pal, range, today, scale]);

  const changes = useMemo(
    () =>
      history
        ? repricings(history, 'nominal').filter((r) => (r.series.termMonths ?? 0) === term && !hidden.has(r.series.provider))
        : [],
    [history, term, hidden],
  );

  return (
    <>
      <PageHead title={t.app.pages.savings}>
        <p class="lede">
          {t.savings.lede(afterTax, new Set(current.map((q) => q.lender)).size, day(board?.generatedAt))}
        </p>
        <Facts
          items={[
            fact(t.format.instantAccess, highest((q) => q.x === 0)),
            fact(t.savings.fixed1, highest((q) => q.x === 12)),
            fact(t.savings.fixed2, highest((q) => q.x >= 24)),
            {
              label: t.savings.ecbTerm,
              value: pct(ecbTerm ? ecbTerm.value * scale : undefined),
              detail: ecbTerm ? t.savings.allBanks(formatPeriod(ecbTerm.period)) : t.common.loading,
            },
          ]}
        />
      </PageHead>

      <Controls>
        <Switch label={t.savings.taxSwitch} checked={afterTax} onChange={setAfterTax} />
        <LenderChips lenders={lenders} styles={styles} hidden={hidden} onChange={setHidden} onHover={setHover} />
      </Controls>

      <Section title={t.savings.curveTitle} meta={t.savings.curveMeta}>
        <Chart
          option={curve}
          height={380}
          onPick={(v) => {
            const picked = nearest(terms.map(toAxis), v);
            if (picked !== undefined) setTerm(Math.round(CURVE_AXES.term.from(picked)));
          }}
          highlight={hover}
          ariaLabel={t.savings.curveAria}
        />
        <CurveKey band={t.savings.bandPerBucket} />
        <Numbers
          head={t.savings.offersHead}
          rows={[...quotes]
            .sort((a, b) => a.x - b.x || (b.nominal ?? 0) - (a.nominal ?? 0))
            .map((q) => [
              q.lender,
              <a href={q.offer.sourceUrl} target="_blank" rel="noreferrer">
                {productName(q.offer.product)}
              </a>,
              termLong(q.x),
              pct(value(q)),
              q.offer.amountMin === null ? '–' : eur(q.offer.amountMin),
              q.offer.network === 'branch' ? t.savings.branch : t.savings.direct,
              day(q.offer.observedAt),
            ])}
        />
      </Section>

      <Section
        title={t.savings.historyTitle(termLong(term))}
        meta={t.savings.historyMeta}
        controls={
          <>
            <Segmented label={t.savings.term} options={termOptions} value={term} onChange={setTerm} />
            <Segmented label={t.common.range} options={RANGES} value={range} onChange={setRange} />
          </>
        }
      >
        <Chart option={past.option} height={320} highlight={hover} ariaLabel={t.savings.historyAria(termLong(term))} />
        {past.earliest ? <p class="hint">{t.savings.recordedFrom(day(past.earliest))}</p> : null}
        <ChangeList changes={changes.slice(0, 6)} styles={styles} scale={scale} empty={t.savings.noChange} />
      </Section>

      <MarketPanel
        title={t.savings.panelTitle}
        meta={t.savings.panelMeta}
        views={VIEWS}
        ecb={ecb}
        oenb={offers.oenb}
        window={ecbWindow}
        onWindow={onWindow}
      />

      <div class="page-foot">
        <About>{t.savings.about()}</About>
        <SourceList sources={sourcesFor(board, 'deposit')} />
      </div>
    </>
  );
}
