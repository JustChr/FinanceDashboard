import { useMemo } from 'preact/hooks';

import type { DashboardData } from '../lib/data';
import { CYCLE_START, DEPOSIT_MATURITY } from '../lib/catalog';
import { latest } from '../lib/sdmx';
import {
  betaSeries,
  cumulativeBeta,
  ladder,
  repricingGap,
  rollingSum,
  spread,
} from '../lib/metrics';
import { bps, bpsAbs, eurMillions, formatPeriod, pct, ratio } from '../lib/format';
import { Chart, CHART_COLORS, Legend } from '../components/Chart';
import { ladderChart, timeChart, volumeChart } from '../components/charts';
import { Callout, Card, Stat, StatRow, changeTone } from '../components/ui';

const SHORT: Record<string, string> = {
  dep_term_le1: 'Up to 1Y',
  dep_term_1_2: '1–2Y',
  dep_term_2p: 'Over 2Y',
};

export function Savings({ data }: { data: DashboardData }) {
  return (
    <div class="grid">
      <MaturityLadder data={data} />
      <SavingsHistory data={data} />
      <DepositFrontBack data={data} />
      <DepositBeta data={data} />
      <TermVolume data={data} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MaturityLadder({ data }: { data: DashboardData }) {
  const rungs = useMemo(() => ladder(DEPOSIT_MATURITY, data.at, data.ea), [data]);

  const overnight = latest(data.at.get('dep_on'));
  const shortTerm = latest(data.at.get('dep_term_le1'));
  const liquidityCost =
    overnight && shortTerm ? shortTerm.value - overnight.value : undefined;

  const option = useMemo(
    () =>
      ladderChart(
        rungs.map((r) => SHORT[r.def.id] ?? r.def.label),
        [
          { name: 'Austria', values: rungs.map((r) => r.at ?? null), color: CHART_COLORS.austria },
          { name: 'Euro area', values: rungs.map((r) => r.ea ?? null), color: CHART_COLORS.euroArea },
        ],
      ),
    [rungs],
  );

  return (
    <Card
      span={7}
      title="What locking money up is worth"
      sub={`New household term deposits by agreed maturity · ${formatPeriod(data.asOf)}`}
    >
      <StatRow>
        <Stat label="Overnight" value={pct(overnight?.value)} note="Instant access" />
        <Stat label="Term, up to 1Y" value={pct(shortTerm?.value)} note="Agreed maturity" />
        <Stat
          label="Cost of instant access"
          value={bpsAbs(liquidityCost)}
          note="Given up by not fixing"
          tone="negative"
        />
      </StatRow>
      <Chart
        option={option}
        height={200}
        ariaLabel="Austrian and euro-area household term deposit rates by agreed maturity"
      />
      <Legend
        shape="dot"
        items={[
          { label: 'Austria', color: CHART_COLORS.austria },
          { label: 'Euro area', color: CHART_COLORS.euroArea },
        ]}
      />
      <Callout>
        Austrian savers give up <strong>{bpsAbs(liquidityCost)}</strong> by leaving money on an
        instant-access account rather than fixing it for a year. That gap is the single largest
        source of retail funding margin in the country, and it exists because most balances never
        move.
      </Callout>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function SavingsHistory({ data }: { data: DashboardData }) {
  const rungs = useMemo(() => ladder(DEPOSIT_MATURITY, data.at, data.ea), [data]);

  const option = useMemo(
    () =>
      timeChart([
        {
          name: 'Overnight',
          observations: data.at.get('dep_on')?.observations ?? [],
          color: CHART_COLORS.liability,
          width: 2.2,
        },
        {
          name: 'Term, up to 1Y',
          observations: data.at.get('dep_term_le1')?.observations ?? [],
          color: CHART_COLORS.asset,
        },
        {
          name: 'Term, over 2Y',
          observations: data.at.get('dep_term_2p')?.observations ?? [],
          color: CHART_COLORS.ladder[4] ?? CHART_COLORS.benchmark,
        },
        {
          name: 'Redeemable at notice',
          observations: data.at.get('dep_notice')?.observations ?? [],
          color: CHART_COLORS.positive,
          dashed: true,
        },
        {
          name: 'Deposit facility',
          observations: data.dfrMonthly,
          color: CHART_COLORS.benchmark,
          dashed: true,
          width: 1.2,
        },
      ]),
    [data],
  );

  return (
    <Card
      span={5}
      title="Savings rates through the cycle"
      sub="Every household deposit product against the ECB deposit facility"
    >
      <Chart
        option={option}
        height={200}
        ariaLabel="Austrian household deposit rates by product over time"
      />
      <Legend
        items={[
          { label: 'Overnight', color: CHART_COLORS.liability },
          { label: 'Term ≤1Y', color: CHART_COLORS.asset },
          { label: 'Term >2Y', color: CHART_COLORS.ladder[4] ?? CHART_COLORS.benchmark },
          { label: 'At notice', color: CHART_COLORS.positive },
          { label: 'Deposit facility', color: CHART_COLORS.benchmark },
        ]}
      />
      <div class="table-wrap">
        <table class="rates compact">
          <thead>
            <tr>
              <th>Maturity</th>
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
                <td class={`num delta ${changeTone(r.change12m, 'liability')}`}>
                  {bps(r.change12m)}
                </td>
                <td class="num">{pct(r.ea)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function DepositFrontBack({ data }: { data: DashboardData }) {
  const front = data.at.get('dep_term');
  const back = data.at.get('dep_term_stock');

  const gap = useMemo(() => repricingGap(front, back), [front, back]);
  const frontNow = latest(front);
  const backNow = latest(back);
  const gapNow = gap.at(-1);

  const option = useMemo(
    () =>
      timeChart([
        {
          name: 'New term deposits',
          observations: front?.observations ?? [],
          color: CHART_COLORS.asset,
          width: 2.2,
        },
        {
          name: 'Outstanding stock',
          observations: back?.observations ?? [],
          color: CHART_COLORS.liability,
          width: 2.2,
        },
      ]),
    [front, back],
  );

  return (
    <Card
      span={6}
      title="What savers earn versus what they are offered"
      sub="New term deposits against the rate on the whole outstanding book"
    >
      <StatRow>
        <Stat label="New business" value={pct(frontNow?.value)} note={formatPeriod(frontNow?.period)} />
        <Stat label="Outstanding stock" value={pct(backNow?.value)} note="Average across the book" />
        <Stat
          label="Gap"
          value={bpsAbs(gapNow?.value)}
          note={gapNow && gapNow.value > 0 ? 'New money paid more' : 'Old money paid more'}
        />
      </StatRow>
      <Chart
        option={option}
        height={210}
        ariaLabel="Austrian household term deposit rates on new business versus outstanding amounts"
      />
      <Legend
        items={[
          { label: 'New business', color: CHART_COLORS.asset },
          { label: 'Outstanding stock', color: CHART_COLORS.liability },
        ]}
      />
      <Callout>
        The mirror image of the lending panel. Savers who fixed at the top of the cycle are still
        being paid it; savers rolling over now are repricing downward. For the bank this gap is
        funding cost still to be paid, and it closes as old deposits mature.
      </Callout>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function DepositBeta({ data }: { data: DashboardData }) {
  const betaOn = cumulativeBeta(data.at.get('dep_on'), data.dfrMonthly, CYCLE_START);
  const betaTerm = cumulativeBeta(data.at.get('dep_term'), data.dfrMonthly, CYCLE_START);
  const betaNotice = cumulativeBeta(data.at.get('dep_notice'), data.dfrMonthly, CYCLE_START);

  const option = useMemo(
    () =>
      timeChart(
        [
          {
            name: 'Overnight',
            observations: betaSeries(data.at.get('dep_on'), data.dfrMonthly, CYCLE_START),
            color: CHART_COLORS.liability,
            width: 2.2,
          },
          {
            name: 'Term deposits',
            observations: betaSeries(data.at.get('dep_term'), data.dfrMonthly, CYCLE_START),
            color: CHART_COLORS.asset,
          },
          {
            name: 'Overnight, euro area',
            observations: betaSeries(data.ea.get('dep_on'), data.dfrMonthly, CYCLE_START),
            color: CHART_COLORS.euroArea,
            dashed: true,
          },
        ],
        { suffix: '', decimals: 2, scale: true },
      ),
    [data],
  );

  return (
    <Card
      span={6}
      title="How much of the ECB's move reached savers"
      sub={`Cumulative pass-through of the deposit facility rate since ${formatPeriod(CYCLE_START)}`}
    >
      <StatRow>
        <Stat label="Overnight" value={ratio(betaOn)} note="Share passed through" />
        <Stat label="Term deposits" value={ratio(betaTerm)} note="Share passed through" />
        <Stat label="At notice" value={ratio(betaNotice)} note="Share passed through" />
      </StatRow>
      <Chart
        option={option}
        height={210}
        ariaLabel="Cumulative deposit beta for Austrian household products versus the euro area"
      />
      <Legend
        items={[
          { label: 'Overnight, AT', color: CHART_COLORS.liability },
          { label: 'Term, AT', color: CHART_COLORS.asset },
          { label: 'Overnight, euro area', color: CHART_COLORS.euroArea },
        ]}
      />
      <Callout>
        A beta of {betaOn === undefined ? '–' : ratio(betaOn)} on overnight money means only{' '}
        {betaOn === undefined ? '–' : Math.round(betaOn * 100)} cents of every euro of policy
        movement reached the instant-access saver. Watch it <em>rise</em> after the policy peak:
        that is the ratchet, where deposits keep repricing up while the policy rate falls.
      </Callout>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function TermVolume({ data }: { data: DashboardData }) {
  const volume = data.at.get('dep_term_volume');
  const annual = useMemo(() => rollingSum(volume?.observations ?? [], 12), [volume]);

  const option = useMemo(
    () => volumeChart(volume?.observations ?? [], CHART_COLORS.liability),
    [volume],
  );

  const spreadToOvernight = useMemo(() => {
    const term = data.at.get('dep_term_le1');
    const on = data.at.get('dep_on');
    return term && on ? spread(term.observations, on.observations) : [];
  }, [data]);

  return (
    <Card
      span={12}
      title="Savers vote with their money"
      sub="New term deposit volume each month, against what fixing was worth at the time"
    >
      <StatRow>
        <Stat label="Latest month" value={eurMillions(latest(volume)?.value)} note={formatPeriod(latest(volume)?.period)} />
        <Stat label="Trailing 12 months" value={eurMillions(annual.at(-1)?.value)} note="Rolling total" />
        <Stat
          label="Term premium now"
          value={bpsAbs(spreadToOvernight.at(-1)?.value)}
          note="One-year term over overnight"
        />
      </StatRow>
      <Chart
        option={option}
        height={190}
        ariaLabel="Monthly new term deposit volumes for Austrian households"
      />
      <Callout>
        Term deposit flows track the premium over instant access with a lag. When the gap widens,
        money migrates out of overnight accounts and the bank's funding cost rises even with no
        headline rate change — repricing by mix rather than by price.
      </Callout>
    </Card>
  );
}
