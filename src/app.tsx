import { useMemo } from 'preact/hooks';
import type { EChartsOption } from 'echarts';

import { useDashboard, type DashboardData } from './lib/data';
import { CYCLE_START, DEPOSIT_RATES, LOAN_RATES } from './lib/catalog';
import { latest, observationAt, shiftMonths, type Observation } from './lib/sdmx';
import { betaSeries, cumulativeBeta, spread } from './lib/metrics';
import { bps, formatPeriod, pct, ratio } from './lib/format';
import { Chart, CHART_COLORS, baseOption } from './components/Chart';

export function App() {
  const { data, loading, error } = useDashboard();

  if (loading) return <Shell><div class="status">Loading ECB Data Portal…</div></Shell>;
  if (error || !data) {
    return (
      <Shell>
        <div class="status error">
          Could not reach the ECB Data Portal. {error}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <PolicyStrip data={data} />
      <div class="grid">
        <DepositBetaCard data={data} />
        <BetaChartCard data={data} />
        <RatesTableCard data={data} />
        <MarginChartCard data={data} />
      </div>
      <Foot data={data} />
    </Shell>
  );
}

function Shell({ children }: { children: preact.ComponentChildren }) {
  return (
    <div class="app">
      <header class="masthead">
        <div>
          <h1>
            ALM Desk <span class="flag">Austria</span>
          </h1>
          <p>
            Bank loan and deposit pricing, pass-through and commercial margin —
            built from ECB MFI interest rate statistics, live from the ECB Data
            Portal.
          </p>
        </div>
      </header>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PolicyStrip({ data }: { data: DashboardData }) {
  const estr = latest(data.estr);
  const euribor = latest(data.euribor3m);

  return (
    <div class="policy-strip">
      <Chip label="Deposit facility" value={pct(data.policy.dfr)} note={formatPeriod(data.policy.asOf)} />
      <Chip label="Main refinancing" value={pct(data.policy.mro)} note="ECB policy" />
      <Chip label="Marginal lending" value={pct(data.policy.mlf)} note="ECB policy" />
      <Chip label="€STR" value={pct(estr?.value, 3)} note={formatPeriod(estr?.period)} highlight />
      <Chip
        label="Euribor 3M"
        value={pct(euribor?.value)}
        note={`${formatPeriod(euribor?.period)} · monthly`}
      />
    </div>
  );
}

function Chip(props: { label: string; value: string; note: string; highlight?: boolean }) {
  return (
    <div class={`policy-chip${props.highlight ? ' highlight' : ''}`}>
      <div class="label">{props.label}</div>
      <div class="value num">{props.value}</div>
      <div class="label" style={{ textTransform: 'none', letterSpacing: 0 }}>
        {props.note}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DepositBetaCard({ data }: { data: DashboardData }) {
  const onHh = data.at.get('on_hh');
  const termHh = data.at.get('term_hh');

  const betaOn = cumulativeBeta(onHh, data.dfrMonthly, CYCLE_START);
  const betaTerm = cumulativeBeta(termHh, data.dfrMonthly, CYCLE_START);
  const betaOnEa = cumulativeBeta(data.ea.get('on_hh'), data.dfrMonthly, CYCLE_START);

  const onNow = latest(onHh);
  const estrNow = data.estrMonthly[data.estrMonthly.length - 1];
  const gap = onNow && estrNow ? estrNow.value - onNow.value : undefined;

  return (
    <section class="card span-4">
      <h2>Deposit beta, households</h2>
      <p class="sub">
        Cumulative pass-through of the deposit facility rate since {formatPeriod(CYCLE_START)}
      </p>

      <div class="headline">
        <span class="big num">{ratio(betaOn)}</span>
        <span class="unit">overnight</span>
      </div>

      <table class="rates" style={{ marginTop: 10 }}>
        <tbody>
          <tr>
            <td>Term deposits, households</td>
            <td class="num">{ratio(betaTerm)}</td>
          </tr>
          <tr>
            <td>Overnight, euro area</td>
            <td class="num">{ratio(betaOnEa)}</td>
          </tr>
          <tr>
            <td>Overnight rate below €STR</td>
            <td class="num">{bps(gap === undefined ? undefined : -gap)}</td>
          </tr>
        </tbody>
      </table>

      <div class="callout">
        Austrian households earn <strong>{pct(onNow?.value)}</strong> on overnight
        deposits while €STR sits at <strong>{pct(estrNow?.value)}</strong>. A beta
        of <strong>{ratio(betaOn)}</strong> means only{' '}
        {betaOn === undefined ? '–' : Math.round(betaOn * 100)} cents of each euro
        of policy movement reached the retail depositor.
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function BetaChartCard({ data }: { data: DashboardData }) {
  const option = useMemo<EChartsOption>(() => {
    const onHh = betaSeries(data.at.get('on_hh'), data.dfrMonthly, CYCLE_START);
    const termHh = betaSeries(data.at.get('term_hh'), data.dfrMonthly, CYCLE_START);
    const onEa = betaSeries(data.ea.get('on_hh'), data.dfrMonthly, CYCLE_START);

    const periods = onHh.map((o) => o.period);
    const align = (s: Observation[]) => {
      const at = new Map(s.map((o) => [o.period, o.value]));
      return periods.map((p) => {
        const v = at.get(p);
        return v === undefined ? null : Number(v.toFixed(3));
      });
    };

    return {
      ...baseOption(),
      xAxis: { ...baseOption().xAxis, data: periods.map(formatPeriod) },
      series: [
        line('Overnight, AT households', align(onHh), CHART_COLORS.liability, 2.2),
        line('Term deposits, AT households', align(termHh), CHART_COLORS.asset, 1.8),
        line('Overnight, euro area', align(onEa), CHART_COLORS.euroArea, 1.4, true),
      ],
    };
  }, [data]);

  return (
    <section class="card span-8">
      <h2>Pass-through since the hiking cycle began</h2>
      <p class="sub">
        Cumulative beta, anchored at {formatPeriod(CYCLE_START)}. Rising after the
        peak means deposits repriced up while policy fell — the ratchet that
        compresses margin in an easing cycle.
      </p>
      <Chart
        option={option}
        height={270}
        ariaLabel="Cumulative deposit beta for Austrian household overnight and term deposits versus the euro area"
      />
      <div class="legend">
        <span><i style={{ background: CHART_COLORS.liability }} />Overnight, AT</span>
        <span><i style={{ background: CHART_COLORS.asset }} />Term, AT</span>
        <span><i style={{ background: CHART_COLORS.euroArea }} />Overnight, euro area</span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function RatesTableCard({ data }: { data: DashboardData }) {
  const asOf = latest(data.at.get('house'))?.period;
  const yearAgo = asOf ? shiftMonths(asOf, -12) : undefined;

  const row = (def: (typeof LOAN_RATES)[number]) => {
    const at = data.at.get(def.id);
    const ea = data.ea.get(def.id);
    const now = latest(at);
    const then = yearAgo ? observationAt(at, yearAgo) : undefined;
    const change = now && then ? now.value - then.value : undefined;
    const eaNow = latest(ea);
    const vsEa = now && eaNow ? now.value - eaNow.value : undefined;

    return (
      <tr key={def.id}>
        <td>
          <div class="rate-name">
            <span class={`swatch ${def.side}`} />
            <span>
              {def.label}
              <span class="note">{def.note}</span>
            </span>
          </div>
        </td>
        <td class="num">{pct(now?.value)}</td>
        <td class={`num delta ${changeClass(change, def.side)}`}>{bps(change)}</td>
        <td class="num">{pct(eaNow?.value)}</td>
        <td class="num">{bps(vsEa)}</td>
      </tr>
    );
  };

  return (
    <section class="card span-12">
      <h2>Austrian bank pricing, new business</h2>
      <p class="sub">
        Volume-weighted rates reported by Austrian MFIs · {formatPeriod(asOf)} ·
        euro-area comparison alongside. The 12-month change is coloured from the
        bank&rsquo;s margin perspective: green where the move widens net interest
        income, red where it compresses it.
      </p>
      <div class="table-wrap">
      <table class="rates">
        <thead>
          <tr>
            <th>Product</th>
            <th>Austria</th>
            <th>12m change</th>
            <th>Euro area</th>
            <th>AT vs EA</th>
          </tr>
        </thead>
        <tbody>
          <tr class="section-label"><td colSpan={5}>Assets — lending</td></tr>
          {LOAN_RATES.map(row)}
          <tr class="section-label"><td colSpan={5}>Liabilities — deposits</td></tr>
          {DEPOSIT_RATES.map(row)}
        </tbody>
      </table>
      </div>
    </section>
  );
}

/** Rising loan rates help the bank; rising deposit rates hurt it. */
function changeClass(change: number | undefined, side: 'asset' | 'liability'): string {
  if (change === undefined || Math.abs(change) < 0.005) return '';
  const good = side === 'asset' ? change > 0 : change < 0;
  return good ? 'up' : 'down';
}

/* ------------------------------------------------------------------ */

function MarginChartCard({ data }: { data: DashboardData }) {
  const option = useMemo<EChartsOption>(() => {
    const benchmark = data.estrMonthly;
    const house = data.at.get('house');
    const onHh = data.at.get('on_hh');

    const loanSpread = house ? spread(house.observations, benchmark) : [];
    // Deposit margin is the benchmark minus what the bank pays: funding benefit.
    const depositSpread = onHh ? spread(benchmark, onHh.observations) : [];

    const periods = loanSpread.map((o) => o.period);
    const align = (s: Observation[]) => {
      const at = new Map(s.map((o) => [o.period, o.value]));
      return periods.map((p) => {
        const v = at.get(p);
        return v === undefined ? null : Number(v.toFixed(3));
      });
    };

    return {
      ...baseOption(),
      xAxis: { ...baseOption().xAxis, data: periods.map(formatPeriod) },
      yAxis: { ...baseOption().yAxis, axisLabel: { color: CHART_COLORS.axis, fontSize: 11, formatter: '{value}%' } },
      series: [
        area('Lending margin over €STR', align(loanSpread), CHART_COLORS.asset),
        area('Deposit funding benefit', align(depositSpread), CHART_COLORS.liability),
      ],
    };
  }, [data]);

  return (
    <section class="card span-12">
      <h2>Commercial margin over €STR</h2>
      <p class="sub">
        Housing-loan rate above €STR, and €STR above the overnight deposit rate.
        Using €STR as the transfer price is a first-order stand-in for an internal
        FTP curve.
      </p>
      <Chart
        option={option}
        height={260}
        ariaLabel="Lending margin over €STR and deposit funding benefit for Austrian banks"
      />
      <div class="legend">
        <span><i style={{ background: CHART_COLORS.asset }} />Lending margin (loan rate − €STR)</span>
        <span><i style={{ background: CHART_COLORS.liability }} />Deposit benefit (€STR − deposit rate)</span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function line(
  name: string,
  data: (number | null)[],
  color: string,
  width = 2,
  dashed = false,
): EChartsOption['series'] extends (infer S)[] ? S : never {
  return {
    name,
    type: 'line',
    data,
    smooth: false,
    showSymbol: false,
    connectNulls: true,
    lineStyle: { color, width, type: dashed ? 'dashed' : 'solid' },
    itemStyle: { color },
  } as never;
}

function area(name: string, data: (number | null)[], color: string) {
  return {
    name,
    type: 'line',
    data,
    smooth: false,
    showSymbol: false,
    connectNulls: true,
    lineStyle: { color, width: 2 },
    itemStyle: { color },
    areaStyle: { color, opacity: 0.1 },
  } as never;
}

function Foot({ data }: { data: DashboardData }) {
  const asOf = latest(data.at.get('house'))?.period;
  return (
    <footer class="foot">
      <p>
        Source: <a href="https://data.ecb.europa.eu/" target="_blank" rel="noreferrer">ECB Data Portal</a>{' '}
        (MIR, EST, FM dataflows), fetched live in the browser. MFI interest rate
        statistics are monthly and published with roughly a five-week lag; latest
        observation {formatPeriod(asOf)}.
      </p>
      <p>
        Euribor is shown at monthly frequency as published by the ECB. Daily
        Euribor is licensed by EMMI and is not redistributed here.
      </p>
    </footer>
  );
}
