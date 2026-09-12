import { useMemo } from 'preact/hooks';

import type { DashboardData } from '../lib/data';
import { CONSUMER_RATES } from '../lib/catalog';
import { latest } from '../lib/sdmx';
import { changeOver, ladder, spread } from '../lib/metrics';
import { bps, bpsAbs, formatPeriod, pct } from '../lib/format';
import { Chart, CHART_COLORS, Legend } from '../components/Chart';
import { ladderChart, timeChart } from '../components/charts';
import { Callout, Card, Stat, StatRow, changeTone } from '../components/ui';

const FIXATION = CONSUMER_RATES.filter((d) => ['cc_var', 'cc_1_5', 'cc_5p'].includes(d.id));

const SHORT: Record<string, string> = {
  cc_var: 'Variable / ≤1Y',
  cc_1_5: 'Fixed 1–5Y',
  cc_5p: 'Fixed >5Y',
};

export function Consumer({ data }: { data: DashboardData }) {
  return (
    <div class="grid">
      <ConsumerLadder data={data} />
      <ConsumerHistory data={data} />
      <ConsumerFees data={data} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ConsumerLadder({ data }: { data: DashboardData }) {
  const rungs = useMemo(() => ladder(FIXATION, data.at, data.ea), [data]);
  const total = latest(data.at.get('cc_total'));
  const totalEa = latest(data.ea.get('cc_total'));
  const overdraft = latest(data.at.get('od_hh'));

  const option = useMemo(
    () =>
      ladderChart(
        rungs.map((r) => SHORT[r.def.id] ?? r.def.label),
        [{ name: 'Austria', values: rungs.map((r) => r.at ?? null), color: CHART_COLORS.austria }],
      ),
    [rungs],
  );

  return (
    <Card
      span={6}
      title="Consumer credit by fixation"
      sub={`New consumer loans to Austrian households · ${formatPeriod(data.asOf)}`}
    >
      <StatRow>
        <Stat label="All consumer credit" value={pct(total?.value)} note="Volume-weighted" />
        <Stat
          label="Versus euro area"
          value={bpsAbs(total && totalEa ? total.value - totalEa.value : undefined)}
          note={total && totalEa && total.value > totalEa.value ? 'Austria dearer' : 'Austria cheaper'}
        />
        <Stat label="Overdrafts" value={pct(overdraft?.value)} note="Revolving credit" tone="negative" />
      </StatRow>
      <Chart
        option={option}
        height={195}
        ariaLabel="Austrian consumer credit rates by initial rate fixation period"
      />
      <div class="table-wrap">
        <table class="rates compact">
          <thead>
            <tr>
              <th>Fixation</th>
              <th>Austria</th>
              <th>12m</th>
              <th>Euro area</th>
            </tr>
          </thead>
          <tbody>
            {rungs.map((r) => (
              <tr key={r.def.id}>
                <td>{SHORT[r.def.id] ?? r.def.label}</td>
                <td class="num">{pct(r.at)}</td>
                <td class={`num delta ${changeTone(r.change12m, 'asset')}`}>{bps(r.change12m)}</td>
                <td class="num">{pct(r.ea)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Callout>
        Consumer credit is priced on the borrower, not on the funding curve, so the ladder is far
        flatter than the housing one and sits several points above it. An overdraft at{' '}
        <strong>{pct(overdraft?.value)}</strong> is the most expensive money a household routinely
        borrows, and it is the one nobody shops for.
      </Callout>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function ConsumerHistory({ data }: { data: DashboardData }) {
  const option = useMemo(
    () =>
      timeChart([
        {
          name: 'Consumer credit',
          observations: data.at.get('cc_total')?.observations ?? [],
          color: CHART_COLORS.austria,
          width: 2.2,
        },
        {
          name: 'Overdrafts',
          observations: data.at.get('od_hh')?.observations ?? [],
          color: CHART_COLORS.negative,
        },
        {
          name: 'Housing loans',
          observations: data.at.get('hl_total')?.observations ?? [],
          color: CHART_COLORS.asset,
        },
        {
          name: 'Euro area, consumer',
          observations: data.ea.get('cc_total')?.observations ?? [],
          color: CHART_COLORS.euroArea,
          dashed: true,
        },
      ]),
    [data],
  );

  return (
    <Card
      span={6}
      title="Unsecured against secured"
      sub="Consumer credit and overdrafts against the housing loan rate"
    >
      <Chart
        option={option}
        height={250}
        ariaLabel="Austrian consumer credit, overdraft and housing loan rates over time"
      />
      <Legend
        items={[
          { label: 'Consumer credit', color: CHART_COLORS.austria },
          { label: 'Overdrafts', color: CHART_COLORS.negative },
          { label: 'Housing loans', color: CHART_COLORS.asset },
          { label: 'Euro area, consumer', color: CHART_COLORS.euroArea },
        ]}
      />
      <Callout>
        The spread between the blue and red lines is the value of collateral. It barely moves with
        the policy rate, because it is a credit-risk premium rather than a funding cost — which is
        why consumer credit lagged so far behind housing loans on the way up.
      </Callout>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function ConsumerFees({ data }: { data: DashboardData }) {
  const rate = data.at.get('cc_total');
  const aprc = data.at.get('cc_aprc');

  const load = useMemo(
    () => (rate && aprc ? spread(aprc.observations, rate.observations) : []),
    [rate, aprc],
  );

  const option = useMemo(
    () =>
      timeChart(
        [
          {
            name: 'Consumer credit APRC',
            observations: aprc?.observations ?? [],
            color: CHART_COLORS.liability,
            width: 2.2,
          },
          {
            name: 'Headline rate',
            observations: rate?.observations ?? [],
            color: CHART_COLORS.austria,
            width: 2,
          },
        ],
      ),
    [aprc, rate],
  );

  const now = load.at(-1);

  return (
    <Card
      span={12}
      title="What the fees add"
      sub="Annual percentage rate of charge against the headline consumer credit rate"
    >
      <StatRow>
        <Stat label="Headline rate" value={pct(latest(rate)?.value)} note="Interest only" />
        <Stat label="APRC" value={pct(latest(aprc)?.value)} note="Including fees" />
        <Stat label="Fee load" value={bpsAbs(now?.value)} note={formatPeriod(now?.period)} tone="negative" />
        <Stat label="APRC, 12m change" value={bps(changeOver(aprc, 12))} note="Percentage points" />
      </StatRow>
      <Chart
        option={option}
        height={210}
        ariaLabel="Austrian consumer credit annual percentage rate of charge against the headline rate"
      />
      <Legend
        items={[
          { label: 'APRC', color: CHART_COLORS.liability },
          { label: 'Headline rate', color: CHART_COLORS.austria },
        ]}
      />
      <Callout>
        The fee load on consumer credit is an order of magnitude larger than on housing loans,
        because the same fixed arrangement costs are spread across a far smaller loan. This is the
        gap the representative examples on the Bank offers tab make visible per product.
      </Callout>
    </Card>
  );
}
