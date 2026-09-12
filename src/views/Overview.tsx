import { Fragment } from 'preact';
import { useMemo } from 'preact/hooks';

import type { DashboardData } from '../lib/data';
import {
  CONSUMER_RATES,
  CORPORATE_RATES,
  DEPOSIT_CORE,
  DEPOSIT_MATURITY,
  DEPOSIT_STOCK,
  HOUSING_CORE,
  HOUSING_FIXATION,
  HOUSING_STOCK,
  type MirDef,
} from '../lib/catalog';
import { latest, observationAt, shiftMonths } from '../lib/sdmx';
import { repricingGap, spread } from '../lib/metrics';
import { bestRate, splitDeposits } from '../lib/offers';
import { bps, bpsAbs, formatPeriod, pct } from '../lib/format';
import { Chart, CHART_COLORS, Legend } from '../components/Chart';
import { timeChart } from '../components/charts';
import { Callout, Card, Stat, StatRow, changeTone } from '../components/ui';

export function Overview({ data }: { data: DashboardData }) {
  return (
    <div class="grid">
      <Headlines data={data} />
      <ThreeLayers data={data} />
      <Margin data={data} />
      <SummaryTable data={data} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Headlines({ data }: { data: DashboardData }) {
  const housingNew = latest(data.at.get('hl_total'));
  const housingStock = latest(data.at.get('hl_stock'));
  const depositNew = latest(data.at.get('dep_term'));
  const overnight = latest(data.at.get('dep_on'));

  const housingGap = repricingGap(data.at.get('hl_total'), data.at.get('hl_stock')).at(-1);
  const fixVsVar = useMemo(() => {
    const variable = latest(data.at.get('hl_var'));
    const long = latest(data.at.get('hl_10p'));
    return variable && long ? long.value - variable.value : undefined;
  }, [data]);

  return (
    <Card
      span={12}
      title="Where Austrian retail pricing stands"
      sub={`ECB MFI interest rate statistics · ${formatPeriod(data.asOf)}`}
    >
      <StatRow>
        <Stat label="New housing loan" value={pct(housingNew?.value)} note="All fixation periods" />
        <Stat label="Existing mortgage book" value={pct(housingStock?.value)} note="Outstanding average" />
        <Stat
          label="Fix over 10Y versus variable"
          value={bpsAbs(fixVsVar)}
          note={fixVsVar !== undefined && fixVsVar < 0 ? 'Long fix is cheaper' : 'Long fix costs more'}
          tone={fixVsVar !== undefined && fixVsVar < 0 ? 'positive' : undefined}
        />
        <Stat label="New term deposit" value={pct(depositNew?.value)} note="Household, agreed maturity" />
        <Stat label="Overnight deposit" value={pct(overnight?.value)} note="Instant access" />
        <Stat
          label="Mortgage repricing gap"
          value={bpsAbs(housingGap?.value)}
          note="New business over stock"
        />
      </StatRow>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

/** The framing that makes the rest of the dashboard legible. */
function ThreeLayers({ data }: { data: DashboardData }) {
  const board = data.offers;
  const { term } = splitDeposits(board?.offers ?? []);
  const best = bestRate(term, 'deposit');
  const market = latest(data.at.get('dep_term'));
  const dfr = data.policy.dfr;

  return (
    <Card
      span={5}
      title="Three different answers to 'what is the rate?'"
      sub="Each layer measures something else, and the distance between them is the story"
    >
      <table class="rates layers">
        <tbody>
          <tr>
            <td>
              <span class="layer-tag benchmark">Benchmark</span>
              <div class="note">What money costs the bank — ECB deposit facility</div>
            </td>
            <td class="num strong">{pct(dfr)}</td>
          </tr>
          <tr>
            <td>
              <span class="layer-tag concluded">Concluded</span>
              <div class="note">
                What savers actually got last month, every euro weighted — ECB MIR
              </div>
            </td>
            <td class="num strong">{pct(market?.value)}</td>
          </tr>
          <tr>
            <td>
              <span class="layer-tag advertised">Advertised</span>
              <div class="note">
                The best term deposit on offer today{best ? ` — ${best.provider}` : ''}
              </div>
            </td>
            <td class="num strong">{pct(best?.rate)}</td>
          </tr>
        </tbody>
      </table>
      <Callout>
        A headline rate quoted without saying which of these three it is tells you almost nothing.
        The ECB layer is authoritative but five weeks old and volume-weighted; the advertised layer
        is live but is a shop window, often for new money only. This dashboard keeps them separate
        on purpose.
      </Callout>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function Margin({ data }: { data: DashboardData }) {
  const option = useMemo(() => {
    const benchmark = data.estrMonthly;
    const housing = data.at.get('hl_total');
    const overnight = data.at.get('dep_on');

    return timeChart(
      [
        {
          name: 'Lending margin over €STR',
          observations: housing ? spread(housing.observations, benchmark) : [],
          color: CHART_COLORS.asset,
          width: 2,
          area: true,
        },
        {
          name: 'Deposit funding benefit',
          observations: overnight ? spread(benchmark, overnight.observations) : [],
          color: CHART_COLORS.liability,
          width: 2,
          area: true,
        },
      ],
      { zeroLine: true },
    );
  }, [data]);

  return (
    <Card
      span={7}
      title="Commercial margin over €STR"
      sub="Housing loan rate above €STR, and €STR above the overnight deposit rate"
    >
      <Chart
        option={option}
        height={250}
        ariaLabel="Lending margin over €STR and deposit funding benefit for Austrian banks"
      />
      <Legend
        items={[
          { label: 'Lending margin (loan − €STR)', color: CHART_COLORS.asset },
          { label: 'Deposit benefit (€STR − deposit)', color: CHART_COLORS.liability },
        ]}
      />
      <Callout>
        Using €STR as the transfer price is a first-order stand-in for an internal FTP curve. The
        two areas move in opposite directions through a cycle: the deposit benefit does the work
        when rates rise, the lending margin when they fall.
      </Callout>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

const SECTIONS: { label: string; defs: MirDef[] }[] = [
  {
    label: 'Housing loans',
    defs: [
      ...HOUSING_CORE.filter((d) => d.dataType === 'R' && d.busCov === 'N'),
      ...HOUSING_FIXATION,
      ...HOUSING_STOCK.filter((d) => d.id === 'hl_stock'),
    ],
  },
  {
    label: 'Savings and deposits',
    defs: [
      ...DEPOSIT_CORE.filter((d) => d.dataType === 'R'),
      ...DEPOSIT_MATURITY,
      ...DEPOSIT_STOCK.filter((d) => d.id === 'dep_term_stock'),
    ],
  },
  { label: 'Consumer credit', defs: CONSUMER_RATES.filter((d) => d.dataType === 'R') },
  { label: 'Corporates', defs: CORPORATE_RATES },
];

function SummaryTable({ data }: { data: DashboardData }) {
  return (
    <Card
      span={12}
      title="Every series on one page"
      sub={
        <>
          Volume-weighted rates reported by Austrian banks · {formatPeriod(data.asOf)} · the
          12-month change is coloured from the bank&rsquo;s margin perspective: green where the move
          widens net interest income, red where it compresses it.
        </>
      }
    >
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
            {SECTIONS.map((section) => (
              <Fragment key={section.label}>
                <tr class="section-label">
                  <td colSpan={5}>{section.label}</td>
                </tr>
                {section.defs.map((def) => (
                  <SummaryRow key={def.id} def={def} data={data} />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SummaryRow({ def, data }: { def: MirDef; data: DashboardData }) {
  const series = data.at.get(def.id);
  const now = latest(series);
  const then = now ? observationAt(series, shiftMonths(now.period, -12)) : undefined;
  const change = now && then ? now.value - then.value : undefined;
  const eaNow = latest(data.ea.get(def.id));
  const vsEa = now && eaNow ? now.value - eaNow.value : undefined;

  return (
    <tr>
      <td>
        <div class="rate-name">
          <span class={`swatch ${def.side}`} />
          <span>
            {def.label}
            {def.note ? <span class="note">{def.note}</span> : null}
          </span>
        </div>
      </td>
      <td class="num">{pct(now?.value)}</td>
      <td class={`num delta ${changeTone(change, def.side)}`}>{bps(change)}</td>
      <td class="num">{pct(eaNow?.value)}</td>
      <td class="num">{bps(vsEa)}</td>
    </tr>
  );
}
