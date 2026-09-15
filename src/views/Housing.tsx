import { useMemo, useState } from 'preact/hooks';

import { HOUSING_FIXATION } from '../lib/catalog';
import { latest } from '../lib/sdmx';
import { STALE_AFTER_DAYS, daysSince, repricings, type QuoteBasis } from '../lib/offers';
import { dodgeOffsets, lenderStyles, nearest, quotesFor, quoteValue, type Quote } from '../lib/quotes';
import { bps, day, esc, fixationLong, formatPeriod, pct } from '../lib/format';
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
  repricedWhen,
  sourcesFor,
  type PageProps,
  type Range,
} from '../components/offerParts';

/**
 * The ECB's fixation buckets, as extents on the fixation axis. A 5-year fix
 * belongs to "over 1 and up to 5", a 10-year fix to "over 5 and up to 10".
 */
const BANDS = [
  { id: 'hl_var', label: 'variable or fixed up to 1 year', from: -1.9, to: 1 },
  { id: 'hl_1_5', label: 'fixed over 1 and up to 5 years', from: 1, to: 5 },
  { id: 'hl_5_10', label: 'fixed over 5 and up to 10 years', from: 5, to: 10 },
  { id: 'hl_10p', label: 'fixed over 10 years', from: 10, to: 26.9 },
] as const;

function bandFor(years: number) {
  if (years <= 1) return BANDS[0];
  if (years <= 5) return BANDS[1];
  if (years <= 10) return BANDS[2];
  return BANDS[3];
}

const BASES: { id: QuoteBasis; label: string }[] = [
  { id: 'effective', label: 'Effective rate' },
  { id: 'nominal', label: 'Nominal rate' },
];

const SHORT: Record<string, string> = {
  hl_var: 'Variable / up to 1y',
  hl_1_5: 'Fixed 1–5y',
  hl_5_10: 'Fixed 5–10y',
  hl_10p: 'Fixed over 10y',
};

const VIEWS: MarketView[] = [
  {
    id: 'fixation',
    label: 'By fixation',
    lines: (e, pal) =>
      HOUSING_FIXATION.map((d, i) => ({
        name: SHORT[d.id] ?? d.label,
        observations: obs(e, d.id),
        color: pal.series[i] ?? pal.ink,
      })),
  },
  {
    id: 'book',
    label: 'New vs existing',
    lines: (e, pal) => [
      { name: 'New loans', observations: obs(e, 'hl_total'), color: pal.series[0] ?? pal.ink },
      { name: 'All outstanding loans', observations: obs(e, 'hl_stock'), color: pal.series[1] ?? pal.ink },
    ],
  },
  {
    id: 'reneg',
    label: 'Renegotiated',
    lines: (e, pal) => [
      { name: 'Genuinely new contracts', observations: obs(e, 'hl_pure'), color: pal.series[0] ?? pal.ink },
      { name: 'Renegotiated loans', observations: obs(e, 'hl_reneg'), color: pal.series[1] ?? pal.ink },
    ],
  },
  {
    id: 'fees',
    label: 'Rate vs APRC',
    lines: (e, pal) => [
      { name: 'Agreed rate', observations: obs(e, 'hl_total'), color: pal.series[0] ?? pal.ink },
      { name: 'APRC incl. fees', observations: obs(e, 'hl_aprc'), color: pal.series[1] ?? pal.ink },
    ],
  },
  { id: 'volume', label: 'Volume', volume: (e) => obs(e, 'hl_volume') },
];

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function quoteTip(q: Quote, basis: QuoteBasis, ecbLine: string, color: string): string {
  const other: QuoteBasis = basis === 'effective' ? 'nominal' : 'effective';
  const otherValue = quoteValue(q, other);
  const source = q.kind === 'calculator' ? 'Calculator quote' : 'Representative example';
  const dated = q.offer.statedAt ? `Bank's date ${day(q.offer.statedAt)}` : 'No date stated by the bank';
  return [
    `<div class="tt-head">${esc(q.lender)}</div>`,
    tipRow(color, pct(quoteValue(q, basis)), `${basis}, ${fixationLong(q.x).toLowerCase()}`),
    otherValue !== null ? `<div class="tt-dim">${pct(otherValue)} ${other}</div>` : '',
    // Conditions often open with the source kind already; say it once.
    `<div class="tt-line">${
      q.offer.conditions?.startsWith(source) ? '' : `${esc(source)} · `
    }${esc(q.offer.product)}</div>`,
    q.offer.conditions ? `<div class="tt-dim">${esc(truncate(q.offer.conditions, 160))}</div>` : '',
    `<div class="tt-dim">${esc(dated)} · checked ${esc(day(q.offer.observedAt))}</div>`,
    ecbLine ? `<div class="tt-line">${esc(ecbLine)}</div>` : '',
    q.stale
      ? `<div class="tt-warn">Outdated: the bank's own date is more than ${STALE_AFTER_DAYS.mortgage} days old</div>`
      : '',
  ].join('');
}

function quoteFact(label: string, q: Quote | undefined, basis: QuoteBasis): FactItem {
  return {
    label,
    value: pct(q ? quoteValue(q, basis) : undefined),
    detail: q ? `${q.lender}${q.kind === 'calculator' ? ' · calculator' : ''}` : 'No current quote',
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
      `<div class="tt-head">ECB concluded average</div>${tipRow(pal.market, pct(value), what)}<div class="tt-dim">${esc(formatPeriod(period))} · Austria · ${note}</div>`;

    const bands: CurveBand[] =
      basis === 'effective'
        ? aprc
          ? [{ from: -1.9, to: 26.9, value: aprc.value, tip: ecbTip(aprc.value, 'APRC, new housing loans', aprc.period, 'all fixation periods') }]
          : []
        : BANDS.flatMap((b) => {
            const o = bucket(b.id);
            return o ? [{ from: b.from, to: b.to, value: o.value, tip: ecbTip(o.value, `new loans ${b.label}`, o.period, 'agreed rate') }] : [];
          });

    const ecbLine = (q: Quote) => {
      if (basis === 'effective') return aprc ? `ECB concluded APRC, all fixations: ${pct(aprc.value)}` : '';
      const b = bandFor(q.x);
      const o = bucket(b.id);
      return o ? `ECB concluded, ${b.label}: ${pct(o.value)}` : '';
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
      label: (s) => (/calculator/i.test(s.product) ? `${s.provider} · calculator` : s.provider),
    });
    const band = bandFor(fixation);
    const reference: StepLine[] = data
      ? [
          {
            name: 'ECB average',
            label: basis === 'effective' ? 'ECB concluded APRC, all fixations' : `ECB concluded, ${band.label}`,
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

  const other: QuoteBasis = basis === 'effective' ? 'nominal' : 'effective';
  // Lenders with quotes today but none on this basis would vanish from the curve without a word.
  const unpublished = lenders.filter(
    (l) =>
      !hidden.has(l) &&
      quotes.some((q) => q.lender === l) &&
      !quotes.some((q) => q.lender === l && quoteValue(q, basis) !== null),
  );

  return (
    <>
      <PageHead title="Housing loans">
        <p class="lede">
          Lowest advertised {basis} rates across {current.length} current quotes from{' '}
          {new Set(current.map((q) => q.lender)).size} lenders, checked {day(board?.generatedAt)}.
        </p>
        <Facts
          items={[
            quoteFact('Variable', lowest((q) => q.x === 0), basis),
            quoteFact('Fixed 10 years', lowest((q) => q.x === 10), basis),
            quoteFact('Fixed 20 years or longer', lowest((q) => q.x >= 20), basis),
            {
              label: 'ECB concluded average',
              value: pct(ecbTotal?.value),
              detail: ecbTotal
                ? `${formatPeriod(ecbTotal.period)} · all new loans${basis === 'effective' ? ', APRC' : ''}`
                : 'Loading…',
            },
          ]}
        />
      </PageHead>

      <Controls>
        <Segmented label="Rate" options={BASES} value={basis} onChange={setBasis} />
        <Switch label="Outdated examples" checked={showOutdated} onChange={setShowOutdated} />
        <LenderChips lenders={lenders} styles={styles} hidden={hidden} onChange={setHidden} onHover={setHover} />
      </Controls>

      <Section
        title="Advertised today, by fixation period"
        meta="One dot per quote. A lender's calculator ladder is joined by a line."
      >
        <Chart
          option={curve}
          height={380}
          onPick={(v) => {
            const f = nearest(fixations, v);
            if (f !== undefined) setFixation(f);
          }}
          highlight={hover}
          ariaLabel="Advertised Austrian housing loan rates by initial fixation period, one marker per lender, against ECB concluded averages"
        />
        <CurveKey
          band={basis === 'effective' ? 'ECB concluded APRC, all fixations' : 'ECB concluded average per fixation bucket'}
          hollow={`Example older than ${STALE_AFTER_DAYS.mortgage} days by the bank's own date`}
        />
        {unpublished.length > 0 ? (
          <p class="hint">
            Not shown: {unpublished.join(', ')} publish{unpublished.length === 1 ? 'es' : ''} no {basis} rate —
            switch to {other} to include {unpublished.length === 1 ? 'it' : 'them'}.
          </p>
        ) : null}
        <Numbers
          head={['Lender', 'Product', 'Fixation', 'Nominal', 'Effective', "Bank's date", 'Checked']}
          rows={[...quotes]
            .sort((a, b) => a.x - b.x || (quoteValue(a, basis) ?? 99) - (quoteValue(b, basis) ?? 99))
            .map((q) => [
              q.lender,
              <a href={q.offer.sourceUrl} target="_blank" rel="noreferrer">
                {q.offer.product}
              </a>,
              q.x === 0 ? 'Variable' : `${q.x} years`,
              pct(q.nominal),
              pct(q.effective),
              q.offer.statedAt ? `${day(q.offer.statedAt)}${q.stale ? ' (outdated)' : ''}` : '–',
              day(q.offer.observedAt),
            ])}
        />
      </Section>

      <Section
        title={`How advertised rates moved: ${fixationLong(fixation).toLowerCase()}`}
        meta="Each lender's quote held until it was replaced; grey is the ECB concluded average."
        controls={
          <>
            <Segmented
              label="Fixation"
              options={fixations.map((f) => ({ id: f, label: f === 0 ? 'Variable' : `${f}y` }))}
              value={fixation}
              onChange={setFixation}
            />
            <Segmented label="Range" options={RANGES} value={range} onChange={setRange} />
          </>
        }
      >
        <Chart
          option={past.option}
          height={320}
          highlight={hover}
          ariaLabel={`Advertised housing loan rates over time, ${fixationLong(fixation).toLowerCase()}`}
        />
        {past.earliest && daysSince(past.earliest) < 120 ? (
          <p class="hint">
            Recorded from {day(past.earliest)}. No usable archive captures exist for these quotes before that.
          </p>
        ) : null}
        {past.missing.length > 0 ? (
          <p class="hint">
            No {basis} rate published by {past.missing.join(', ')} — switch to {other} to include{' '}
            {past.missing.length === 1 ? 'it' : 'them'}.
          </p>
        ) : null}
        <ChangeList
          changes={changes.slice(0, 6)}
          styles={styles}
          empty="No repricing on record for this fixation yet."
        />
        <Numbers
          head={['Repriced', 'Lender', 'Before', 'After', 'Change']}
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
        title="Concluded new lending"
        meta="ECB MFI interest rate statistics for Austria: all new housing loans, volume-weighted, monthly, published about five weeks later."
        views={VIEWS}
        ecb={ecb}
        window={ecbWindow}
        onWindow={onWindow}
      />

      <div class="page-foot">
        <About>
          <p>
            <strong>Calculator quotes</strong> are read from the banks&rsquo; own calculators. bank99, Bank
            Austria and Oberbank are asked for one profile, €300,000 over 25 years; Bank Burgenland and
            Raiffeisen Bausparkasse publish rate tables that ignore loan size. They are current on the day
            they were read.
          </p>
          <p>
            <strong>Representative examples</strong> are the worked examples lenders must publish under §6
            HIKrG, each at a loan size and term the bank picks, so they compare only loosely. What dates
            them is the bank&rsquo;s own <em>Stand</em>. An example older than {STALE_AFTER_DAYS.mortgage}{' '}
            days by that date is drawn hollow, and its history line stops there.
          </p>
          <p>
            <strong>History</strong> before daily reading began is rebuilt from Internet Archive captures of
            the same pages. Captures are roughly monthly, so where a bank states no date, a repricing is
            dated to the first capture that shows it.
          </p>
          <p>
            <strong>ECB averages</strong> cover every new housing loan in Austria that month, volume-weighted.
            The agreed rate is split by fixation bucket; the APRC, which includes fees, exists only across all
            fixations. Effective rates are the ones to compare between banks.
          </p>
        </About>
        <SourceList sources={sourcesFor(board, 'mortgage')} />
      </div>
    </>
  );
}
