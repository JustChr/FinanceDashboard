import { useMemo, useState } from 'preact/hooks';

import { CYCLE_START } from '../lib/catalog';
import { latest } from '../lib/sdmx';
import { betaSeries } from '../lib/metrics';
import { STALE_AFTER_DAYS, repricings } from '../lib/offers';
import { dodgeOffsets, lenderStyles, nearest, quotesFor, type Quote } from '../lib/quotes';
import { day, esc, eur, formatPeriod, formatTerm, pct, termShort } from '../lib/format';
import { usePalette } from '../lib/theme';
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
  { id: 'dep_on', label: 'overnight deposits', from: 0, to: 0 },
  { id: 'dep_term_le1', label: 'term deposits up to 1 year', from: 1, to: 12 },
  { id: 'dep_term_1_2', label: 'term deposits over 1 and up to 2 years', from: 12, to: 24 },
  { id: 'dep_term_2p', label: 'term deposits over 2 years', from: 24, to: 90 },
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

const VIEWS: MarketView[] = [
  {
    id: 'products',
    label: 'By product',
    lines: (e, pal) => [
      { name: 'Overnight', observations: obs(e, 'dep_on'), color: pal.series[0] ?? pal.ink },
      { name: 'Term up to 1y', observations: obs(e, 'dep_term_le1'), color: pal.series[1] ?? pal.ink },
      { name: 'Term 1–2y', observations: obs(e, 'dep_term_1_2'), color: pal.series[2] ?? pal.ink },
      { name: 'Term over 2y', observations: obs(e, 'dep_term_2p'), color: pal.series[3] ?? pal.ink },
      { name: 'At notice', observations: obs(e, 'dep_notice'), color: pal.series[4] ?? pal.ink },
      { name: 'ECB deposit facility', observations: e.dfrMonthly, color: pal.market, step: true, width: 1.5 },
    ],
  },
  {
    id: 'book',
    label: 'New vs existing',
    lines: (e, pal) => [
      { name: 'New term deposits', observations: obs(e, 'dep_term'), color: pal.series[0] ?? pal.ink },
      { name: 'All outstanding term deposits', observations: obs(e, 'dep_term_stock'), color: pal.series[1] ?? pal.ink },
    ],
  },
  {
    id: 'beta',
    label: 'Pass-through',
    suffix: '',
    zeroLine: true,
    lines: (e, pal) => [
      { name: 'Overnight, Austria', observations: betaSeries(e.at.get('dep_on'), e.dfrMonthly, CYCLE_START), color: pal.series[0] ?? pal.ink },
      { name: 'Term, Austria', observations: betaSeries(e.at.get('dep_term'), e.dfrMonthly, CYCLE_START), color: pal.series[1] ?? pal.ink },
      { name: 'Overnight, euro area', observations: betaSeries(e.ea.get('dep_on'), e.dfrMonthly, CYCLE_START), color: pal.market },
    ],
  },
  { id: 'volume', label: 'Volume', volume: (e) => obs(e, 'dep_term_volume') },
];

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const termLong = (months: number) => (months === 0 ? 'instant access' : formatTerm(months));

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
    detail: q ? `${q.lender}${q.promotional ? ' · promotional' : ''}` : 'No current offer',
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
          tip: `<div class="tt-head">ECB concluded average</div>${tipRow(pal.market, pct(o.value * scale), `new ${b.label}`)}<div class="tt-dim">${esc(formatPeriod(o.period))} · Austria · households</div>`,
        },
      ];
    });

    const tip = (q: Quote) => {
      const color = styles.get(q.lender)?.color ?? pal.ink;
      const b = bandFor(q.x);
      const o = bucket(b.id);
      return [
        `<div class="tt-head">${esc(q.lender)}</div>`,
        tipRow(color, pct(value(q)), `${afterTax ? 'after 25% tax' : 'before tax'}, ${termLong(q.x)}`),
        `<div class="tt-line">${esc(q.offer.product)} · ${q.offer.network === 'branch' ? 'branch bank' : 'direct bank'}</div>`,
        q.offer.conditions ? `<div class="tt-dim">${esc(truncate(q.offer.conditions, 160))}</div>` : '',
        q.offer.amountMin ? `<div class="tt-dim">Minimum ${esc(eur(q.offer.amountMin))}</div>` : '',
        `<div class="tt-dim">Checked ${esc(day(q.offer.observedAt))}</div>`,
        o ? `<div class="tt-line">ECB concluded, ${esc(b.label)}: ${pct(o.value * scale)}</div>` : '',
        q.stale ? `<div class="tt-warn">Not confirmed for more than ${STALE_AFTER_DAYS.deposit} days</div>` : '',
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
      label: (s) => `${s.provider} · ${s.product}`,
      scale,
    });
    const band = bandFor(term);
    const reference: StepLine[] = data
      ? [
          {
            name: 'ECB average',
            label: `ECB concluded, ${band.label}`,
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
      <PageHead title="Savings">
        <p class="lede">
          Highest advertised rates {afterTax ? 'after 25% capital gains tax' : 'before tax'} from{' '}
          {new Set(current.map((q) => q.lender)).size} banks, checked {day(board?.generatedAt)}.
        </p>
        <Facts
          items={[
            fact('Instant access', highest((q) => q.x === 0)),
            fact('Fixed 1 year', highest((q) => q.x === 12)),
            fact('Fixed 2 years or longer', highest((q) => q.x >= 24)),
            {
              label: 'ECB concluded, term up to 1 year',
              value: pct(ecbTerm ? ecbTerm.value * scale : undefined),
              detail: ecbTerm ? `${formatPeriod(ecbTerm.period)} · all Austrian banks` : 'Loading…',
            },
          ]}
        />
      </PageHead>

      <Controls>
        <Switch label="After 25% tax (KESt)" checked={afterTax} onChange={setAfterTax} />
        <LenderChips lenders={lenders} styles={styles} hidden={hidden} onChange={setHidden} onHover={setHover} />
      </Controls>

      <Section title="Advertised today, by term" meta="One dot per rate. A bank's term ladder is joined by a line.">
        <Chart
          option={curve}
          height={380}
          onPick={(v) => {
            const t = nearest(terms.map(toAxis), v);
            if (t !== undefined) setTerm(Math.round(CURVE_AXES.term.from(t)));
          }}
          highlight={hover}
          ariaLabel="Advertised Austrian savings rates by term, one marker per bank, against ECB concluded averages"
        />
        <CurveKey band="ECB concluded average per maturity bucket" />
        <Numbers
          head={['Bank', 'Product', 'Term', 'Rate', 'Minimum', 'Type', 'Checked']}
          rows={[...quotes]
            .sort((a, b) => a.x - b.x || (b.nominal ?? 0) - (a.nominal ?? 0))
            .map((q) => [
              q.lender,
              <a href={q.offer.sourceUrl} target="_blank" rel="noreferrer">
                {q.offer.product}
              </a>,
              termLong(q.x),
              pct(value(q)),
              q.offer.amountMin === null ? '–' : eur(q.offer.amountMin),
              q.offer.network === 'branch' ? 'Branch' : 'Direct',
              day(q.offer.observedAt),
            ])}
        />
      </Section>

      <Section
        title={`How advertised rates moved: ${termLong(term)}`}
        meta="Each bank's rate held until it changed; grey is the ECB concluded average."
        controls={
          <>
            <Segmented label="Term" options={termOptions} value={term} onChange={setTerm} />
            <Segmented label="Range" options={RANGES} value={range} onChange={setRange} />
          </>
        }
      >
        <Chart
          option={past.option}
          height={320}
          highlight={hover}
          ariaLabel={`Advertised savings rates over time, ${termLong(term)}`}
        />
        {past.earliest ? (
          <p class="hint">
            Savings offers are recorded daily from {day(past.earliest)}; earlier movement shows only in the ECB
            average.
          </p>
        ) : null}
        <ChangeList
          changes={changes.slice(0, 6)}
          styles={styles}
          scale={scale}
          empty="No rate change recorded for this term since daily reading began."
        />
      </Section>

      <MarketPanel
        title="Concluded deposits"
        meta="ECB MFI interest rate statistics for Austrian households: new business, volume-weighted, monthly. Pass-through is the share of the ECB's move since mid-2022 that reached savers."
        views={VIEWS}
        ecb={ecb}
        window={ecbWindow}
        onWindow={onWindow}
      />

      <div class="page-foot">
        <About>
          <p>
            <strong>Direct banks</strong> (Addiko, Anadi, bank99, easybank, Kommunalkredit Invest) publish one
            national rate in HTML. <strong>Branch networks</strong> (BAWAG P.S.K., Raiffeisen) publish only the
            rate sheet they must display; Raiffeisen is some three hundred independent banks, so two are shown
            under their own names.
          </p>
          <p>
            Rates are before 25% capital gains tax unless the tax switch is on. Promotional rates that revert
            are listed next to the rate they revert to.
          </p>
          <p>
            <strong>ECB averages</strong> are every euro placed with Austrian banks that month, volume-weighted,
            so they sit close to the branch networks where most money is. Erste Bank, Bank Austria and Volksbank
            publish no readable savings rates and are missing.
          </p>
        </About>
        <SourceList sources={sourcesFor(board, 'deposit')} />
      </div>
    </>
  );
}
