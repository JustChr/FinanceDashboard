import { useMemo } from 'preact/hooks';

import type { DashboardData } from '../lib/data';
import { HOUSING_FIXATION } from '../lib/catalog';
import { latest } from '../lib/sdmx';
import {
  changeOver,
  ladder,
  repricingGap,
  repricingHorizonYears,
  rollingSum,
  spread,
  termPremium,
} from '../lib/metrics';
import { bps, bpsAbs, eurMillions, formatPeriod, pct, years } from '../lib/format';
import { Chart, CHART_COLORS, Legend } from '../components/Chart';
import { ladderChart, timeChart, volumeChart } from '../components/charts';
import { Callout, Card, Stat, StatRow, changeTone } from '../components/ui';

/** Axis labels; the catalogue labels are too long for a chart axis. */
const SHORT: Record<string, string> = {
  hl_var: 'Variable / ≤1Y',
  hl_1_5: 'Fixed 1–5Y',
  hl_5_10: 'Fixed 5–10Y',
  hl_10p: 'Fixed >10Y',
};

export function Housing({ data }: { data: DashboardData }) {
  return (
    <div class="grid">
      <FixationLadder data={data} />
      <FixationHistory data={data} />
      <FrontBackBook data={data} />
      <Renegotiation data={data} />
      <LendingVolume data={data} />
      <FeeLoad data={data} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function FixationLadder({ data }: { data: DashboardData }) {
  const rungs = useMemo(() => ladder(HOUSING_FIXATION, data.at, data.ea), [data]);
  const premium = termPremium(rungs);

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

  const inverted = premium !== undefined && premium < 0;

  return (
    <Card
      span={7}
      title="What a fixation period costs today"
      sub={`New housing loans to Austrian households by initial rate fixation · ${formatPeriod(data.asOf)}`}
    >
      <Chart
        option={option}
        height={215}
        ariaLabel="Austrian and euro-area housing loan rates by initial rate fixation period"
      />
      <Legend
        shape="dot"
        items={[
          { label: 'Austria', color: CHART_COLORS.austria },
          { label: 'Euro area', color: CHART_COLORS.euroArea },
        ]}
      />
      <Callout>
        {inverted ? (
          <>
            The ladder is <strong>inverted</strong>: fixing for more than ten years costs{' '}
            <strong>{bpsAbs(premium)}</strong> less than staying variable. Borrowers are being paid
            to take the long fix, which is the market pricing cuts that have not happened yet.
          </>
        ) : (
          <>
            Fixing for more than ten years costs <strong>{bpsAbs(premium)}</strong> more than
            staying variable — the normal shape, where the borrower pays a premium for certainty.
          </>
        )}
      </Callout>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function FixationHistory({ data }: { data: DashboardData }) {
  const rungs = useMemo(() => ladder(HOUSING_FIXATION, data.at, data.ea), [data]);

  const option = useMemo(
    () =>
      timeChart(
        HOUSING_FIXATION.map((d, i) => ({
          name: SHORT[d.id] ?? d.label,
          observations: data.at.get(d.id)?.observations ?? [],
          color: CHART_COLORS.ladder[i] ?? CHART_COLORS.benchmark,
          width: d.id === 'hl_var' ? 2.2 : 1.6,
        })),
      ),
    [data],
  );

  return (
    <Card
      span={5}
      title="Fixation ladder through the cycle"
      sub="The bands cross when expectations turn — long fixed leads, variable follows the policy rate"
    >
      <Chart
        option={option}
        height={215}
        ariaLabel="Austrian housing loan rates by fixation period over time"
      />
      <Legend
        items={HOUSING_FIXATION.map((d, i) => ({
          label: SHORT[d.id] ?? d.label,
          color: CHART_COLORS.ladder[i] ?? CHART_COLORS.benchmark,
        }))}
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
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function FrontBackBook({ data }: { data: DashboardData }) {
  const front = data.at.get('hl_total');
  const back = data.at.get('hl_stock');

  const gap = useMemo(() => repricingGap(front, back), [front, back]);
  const horizon = repricingHorizonYears(front, back);
  const frontNow = latest(front);
  const backNow = latest(back);
  const gapNow = gap.at(-1);

  const option = useMemo(
    () =>
      timeChart([
        {
          name: 'New business',
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
        {
          name: 'Gap',
          observations: gap,
          color: CHART_COLORS.benchmark,
          dashed: true,
          width: 1.4,
        },
      ]),
    [front, back, gap],
  );

  return (
    <Card
      span={7}
      title="Front book versus back book"
      sub="What new borrowers pay, against what the existing mortgage stock still pays"
    >
      <StatRow>
        <Stat label="New business" value={pct(frontNow?.value)} note={formatPeriod(frontNow?.period)} />
        <Stat label="Outstanding stock" value={pct(backNow?.value)} note="Average across the book" />
        <Stat
          label="Repricing gap"
          value={bpsAbs(gapNow?.value)}
          note={gapNow && gapNow.value > 0 ? 'Front book above stock' : 'Stock above front book'}
          tone={gapNow && gapNow.value > 0 ? 'positive' : 'negative'}
        />
        <Stat
          label="Time to close"
          value={years(horizon)}
          note="At the stock's twelve-month drift"
        />
      </StatRow>
      <Chart
        option={option}
        height={225}
        ariaLabel="Austrian housing loan rates on new business versus outstanding amounts"
      />
      <Legend
        items={[
          { label: 'New business', color: CHART_COLORS.asset },
          { label: 'Outstanding stock', color: CHART_COLORS.liability },
          { label: 'Gap', color: CHART_COLORS.benchmark },
        ]}
      />
      <Callout>
        Austrian mortgage balances are overwhelmingly long-fixed, so the back book trails the front
        book by years. That lag is income the bank has already contracted but not yet earned — and,
        for a borrower whose fixation is expiring, the size of the payment shock waiting for them.
      </Callout>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function Renegotiation({ data }: { data: DashboardData }) {
  const pure = data.at.get('hl_pure');
  const reneg = data.at.get('hl_reneg');

  const discount = useMemo(
    () => (pure && reneg ? spread(reneg.observations, pure.observations) : []),
    [pure, reneg],
  );

  const option = useMemo(
    () =>
      timeChart([
        {
          name: 'Genuinely new contracts',
          observations: pure?.observations ?? [],
          color: CHART_COLORS.asset,
          width: 2,
        },
        {
          name: 'Renegotiated',
          observations: reneg?.observations ?? [],
          color: CHART_COLORS.positive,
          width: 2,
        },
      ]),
    [pure, reneg],
  );

  const now = discount.at(-1);

  return (
    <Card
      span={5}
      title="Does renegotiating pay?"
      sub="Repriced existing borrowers against genuinely new contracts"
    >
      <StatRow>
        <Stat
          label={now && now.value < 0 ? 'Renegotiation discount' : 'Renegotiation premium'}
          value={bpsAbs(now?.value)}
          note={formatPeriod(now?.period)}
          tone={now && now.value < 0 ? 'positive' : 'negative'}
        />
      </StatRow>
      <Chart
        option={option}
        height={185}
        ariaLabel="Austrian housing loan rates on new contracts versus renegotiated loans"
      />
      <Legend
        items={[
          { label: 'New contracts', color: CHART_COLORS.asset },
          { label: 'Renegotiated', color: CHART_COLORS.positive },
        ]}
      />
      <Callout>
        {now && now.value < 0 ? (
          <>
            Existing borrowers who renegotiate are currently getting{' '}
            <strong>{bpsAbs(now.value)}</strong> better than a new applicant. Banks defend a book
            they already have more cheaply than they win one they do not.
          </>
        ) : (
          <>
            Renegotiating currently costs <strong>{bpsAbs(now?.value)}</strong> more than a new
            contract — the bank is pricing for retention, not acquisition.
          </>
        )}
      </Callout>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function LendingVolume({ data }: { data: DashboardData }) {
  const volume = data.at.get('hl_volume');

  const annual = useMemo(
    () => rollingSum(volume?.observations ?? [], 12),
    [volume],
  );

  const option = useMemo(
    () => volumeChart(volume?.observations ?? [], CHART_COLORS.asset),
    [volume],
  );

  const now = latest(volume);
  const annualNow = annual.at(-1);
  // The peak of the rolling annual total, not of a single month, so one strong
  // month does not become the yardstick.
  const peak = annual.reduce<(typeof annual)[number] | undefined>(
    (best, o) => (best === undefined || o.value > best.value ? o : best),
    undefined,
  );

  return (
    <Card
      span={7}
      title="How much is actually being lent"
      sub="New housing loan volume reported by Austrian banks, each month"
    >
      <StatRow>
        <Stat label="Latest month" value={eurMillions(now?.value)} note={formatPeriod(now?.period)} />
        <Stat label="Trailing 12 months" value={eurMillions(annualNow?.value)} note="Rolling total" />
        <Stat
          label="Versus the peak"
          value={annualNow && peak ? `${Math.round((annualNow.value / peak.value) * 100)}%` : '–'}
          note={peak ? `Peak ${formatPeriod(peak.period)}` : undefined}
        />
      </StatRow>
      <Chart
        option={option}
        height={200}
        ariaLabel="Monthly new housing loan volumes in Austria"
      />
      <Callout>
        Rates and volumes have to be read together. A high headline rate on collapsed volume is a
        market that has stopped clearing, not a profitable one — and the volume-weighted MIR average
        is dominated by whichever fixation borrowers are actually choosing that month.
      </Callout>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function FeeLoad({ data }: { data: DashboardData }) {
  const rate = data.at.get('hl_total');
  const aprc = data.at.get('hl_aprc');

  const load = useMemo(
    () => (rate && aprc ? spread(aprc.observations, rate.observations) : []),
    [rate, aprc],
  );

  const option = useMemo(
    () =>
      timeChart(
        [
          {
            name: 'Fees and ancillary costs',
            observations: load,
            color: CHART_COLORS.liability,
            width: 2,
            area: true,
          },
        ],
        { zeroLine: true },
      ),
    [load],
  );

  const now = load.at(-1);
  const change = changeOver(aprc, 12);

  return (
    <Card
      span={5}
      title="The part that is not interest"
      sub="APRC minus the headline rate — what fees add to a housing loan"
    >
      <StatRow>
        <Stat label="Fee load" value={bpsAbs(now?.value)} note={formatPeriod(now?.period)} />
        <Stat label="APRC" value={pct(latest(aprc)?.value)} note={`${bps(change)} over 12m`} />
      </StatRow>
      <Chart
        option={option}
        height={185}
        ariaLabel="Gap between the annual percentage rate of charge and the headline housing loan rate"
      />
      <Callout>
        The APRC is the number a borrower should compare, and the only one that is comparable across
        banks. The gap widens when fixed fees are spread over smaller loans, so it tends to rise
        exactly when lending volumes fall.
      </Callout>
    </Card>
  );
}
