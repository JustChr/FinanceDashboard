import { useMemo, useState } from 'preact/hooks';

import type { DashboardData } from '../lib/data';
import { HOUSING_FIXATION, windowStart } from '../lib/catalog';
import {
  STALE_AFTER_DAYS,
  basisOf,
  daysSince,
  effectiveFrom,
  isQuoteStale,
  lapseOf,
  quoteOf,
  repricings,
  type QuoteBasis,
  type QuoteHistory,
  type QuoteSeries,
  type Repricing,
} from '../lib/offers';
import { formatAge, formatFixation } from '../lib/format';
import { stepTimeChart, type StepSpec } from '../components/charts';
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
  const history = data.housingHistory;

  return (
    <div class="grid">
      {history && Object.keys(history.series).length > 0 ? (
        <>
          <AdvertisedNow data={data} history={history} />
          <AdvertisedHistory data={data} history={history} />
        </>
      ) : null}
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

/**
 * A quote seen within this many days of the last history run is still on the
 * lender's page. Older than that, the source has dropped or reworded it, and it
 * belongs in the history chart rather than in a table titled "now".
 */
const STILL_PUBLISHED_DAYS = 7;

function AdvertisedNow({ data, history }: { data: DashboardData; history: QuoteHistory }) {
  const rows = useMemo(() => {
    const log = repricings(history);
    const asOf = new Date(history.generatedAt);

    return Object.entries(history.series)
      .map(([id, series]) => {
        const episode = series.episodes[series.episodes.length - 1];
        return episode ? { id, series, episode, change: log.find((r) => r.id === id) } : undefined;
      })
      .filter((row): row is NonNullable<typeof row> => row !== undefined)
      .filter((row) => daysSince(row.episode.lastSeen, asOf) <= STILL_PUBLISHED_DAYS)
      .sort(
        (a, b) =>
          (a.series.fixationYears ?? 99) - (b.series.fixationYears ?? 99) ||
          (a.episode.effectiveRate ?? a.episode.rate ?? 99) -
            (b.episode.effectiveRate ?? b.episode.rate ?? 99),
      );
  }, [history]);

  const current = rows.filter((r) => !isQuoteStale(r.episode));
  const effective = current
    .map((r) => r.episode.effectiveRate)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const cheapestVariable = current
    .filter((r) => r.series.fixationYears === 0 && r.episode.effectiveRate !== null)
    .reduce<(typeof current)[number] | undefined>(
      (best, r) =>
        best === undefined || (r.episode.effectiveRate ?? 99) < (best.episode.effectiveRate ?? 99)
          ? r
          : best,
      undefined,
    );
  const median =
    effective.length === 0
      ? undefined
      : effective.length % 2
        ? effective[(effective.length - 1) / 2]
        : ((effective[effective.length / 2 - 1] ?? 0) + (effective[effective.length / 2] ?? 0)) / 2;
  const aprc = latest(data.at.get('hl_aprc'));
  const gap = median !== undefined && aprc ? median - aprc.value : undefined;

  return (
    <Card
      span={12}
      title="What lenders advertise for housing loans now"
      sub={`Each lender's current representative example · ${rows.length} quotes from ${new Set(rows.map((r) => r.series.provider)).size} lenders`}
    >
      <StatRow>
        <Stat
          label="Lowest variable, effective"
          value={pct(cheapestVariable?.episode.effectiveRate)}
          note={cheapestVariable?.series.provider}
          tone="positive"
        />
        <Stat
          label="Median advertised, effective"
          value={pct(median)}
          note={`${effective.length} current quotes`}
        />
        <Stat label="Concluded APRC" value={pct(aprc?.value)} note={`ECB MIR · ${formatPeriod(aprc?.period)}`} />
        <Stat
          label="Advertised over concluded"
          value={bpsAbs(gap)}
          note={gap !== undefined && gap < 0 ? 'Advertised below concluded' : 'Median advertised above'}
        />
      </StatRow>
      <div class="table-wrap">
        <table class="rates">
          <thead>
            <tr>
              <th>Lender</th>
              <th>Product</th>
              <th>Rate type</th>
              <th>Nominal</th>
              <th>Effective</th>
              <th>Last repriced</th>
              <th>Bank&rsquo;s Stand</th>
              <th>Checked</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, series, episode, change }) => (
              <tr key={id} class={isQuoteStale(episode) ? 'stale' : ''}>
                <td class="provider">
                  {series.provider}
                  {series.network === 'direct' ? <span class="badge">direct</span> : null}
                </td>
                <td>{series.product}</td>
                <td>{formatFixation(series.fixationYears)}</td>
                <td class="num">{pct(episode.rate)}</td>
                <td class="num strong">{pct(episode.effectiveRate)}</td>
                <td class={`num delta ${change ? changeTone(change.after - change.before, 'asset') : ''}`}>
                  {change ? `${bps(change.after - change.before)} · ${repricedWhen(change)}` : 'None on record'}
                </td>
                <td>{formatPeriod(episode.restatedAt ?? episode.statedAt ?? undefined)}</td>
                <td class="source">
                  <a href={series.sourceUrl} target="_blank" rel="noreferrer">
                    {formatAge(daysSince(episode.lastSeen))}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Callout>
        Most rows are the representative examples Austrian lenders must publish under §6 HIKrG —
        the closest thing to a public rate card, but each at a loan size and term the bank picks.
        Where a lender&rsquo;s own calculator can be read, it supplies quotes instead: bank99, Bank
        Austria and Oberbank are asked for one fixed profile, €300,000 over 25 years, while Bank
        Burgenland and Raiffeisen Bausparkasse publish rate tables that ignore loan size. The freshness that matters
        for an example is its <em>Stand</em>: a bank can leave one untouched for a year while we
        confirm it daily. A calculator quote is live pricing, current on the day it was checked. Rows older than {STALE_AFTER_DAYS.mortgage} days by their own Stand are greyed
        out and left out of the figures above.
        {gap !== undefined ? (
          <>
            {' '}
            The median advertised effective rate sits <strong>{bpsAbs(gap)}</strong>{' '}
            {gap < 0 ? 'below' : 'above'} the APRC borrowers actually concluded — examples are
            priced for a standard profile, while concluded business includes every borrower who
            negotiated.
          </>
        ) : null}
      </Callout>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

type FixationGroup = 'variable' | 'fixed-short' | 'fixed-long';

/**
 * Fixed rates split at ten years — where the ECB's own buckets split (5–10Y
 * against over 10Y). It also keeps every lender to at most two lines per view,
 * which matters: a lender's fixations share its colour and only the dash tells
 * two apart, so a ladder of four in one view would be unreadable.
 */
const GROUPS: { id: FixationGroup; label: string; holds: (s: QuoteSeries) => boolean }[] = [
  { id: 'variable', label: 'Variable', holds: (s) => s.fixationYears === 0 },
  {
    id: 'fixed-short',
    label: 'Fixed up to 10Y',
    holds: (s) => s.fixationYears !== 0 && (s.fixationYears ?? 0) <= 10,
  },
  { id: 'fixed-long', label: 'Fixed over 10Y', holds: (s) => (s.fixationYears ?? 0) > 10 },
];

/** A repricing's date, or the window it fell in when the evidence only brackets it. */
const repricedWhen = (r: Repricing): string =>
  r.earliest ? `${formatPeriod(r.earliest)} – ${formatPeriod(r.date)}` : formatPeriod(r.date);

/**
 * The corners of one lender's step line.
 *
 * A quote is drawn from the day it took effect until its successor did — capped
 * where its Stand lapses under the board's staleness rule, which leaves a gap
 * instead of carrying an abandoned example forward as if it were a price.
 */
function stepPoints(series: QuoteSeries, basis: QuoteBasis): [string, number | null][] {
  const points: [string, number | null][] = [];

  series.episodes.forEach((episode, i) => {
    const previous = series.episodes[i - 1];
    const next = series.episodes[i + 1];
    const from = effectiveFrom(episode, previous);
    const replaced = next ? effectiveFrom(next, episode) : episode.lastSeen;
    const lapse = lapseOf(episode);
    const to = lapse !== null && lapse < replaced ? lapse : replaced;
    const value = quoteOf(episode, basis);

    if (value === null || to < from) {
      points.push([from, null]);
      return;
    }
    points.push([from, value], [to, value]);
    if (next && to < replaced) points.push([to, null]);
  });

  return points;
}

function AdvertisedHistory({ data, history }: { data: DashboardData; history: QuoteHistory }) {
  const [group, setGroup] = useState<FixationGroup>('variable');

  // Colour follows the lender across the whole history, not its position in
  // the filtered view, so switching the filter never repaints anyone.
  const colors = useMemo(() => {
    const providers = [...new Set(Object.values(history.series).map((s) => s.provider))].sort();
    return new Map(
      providers.map((p, i) => [p, CHART_COLORS.lenders[i] ?? CHART_COLORS.benchmark] as const),
    );
  }, [history]);

  const lines = useMemo(() => {
    const holds = GROUPS.find((g) => g.id === group)?.holds ?? (() => true);
    const shown = Object.values(history.series)
      .filter(holds)
      .sort(
        (a, b) =>
          a.provider.localeCompare(b.provider) || (a.fixationYears ?? 0) - (b.fixationYears ?? 0),
      );

    return shown.map((series, i): StepSpec => {
      const basis = basisOf(series);
      // Two fixations from one lender share its colour; the longer is dashed.
      const sibling = i > 0 && shown[i - 1]?.provider === series.provider;
      const fixation = group !== 'variable' ? ` · ${formatFixation(series.fixationYears)}` : '';
      return {
        name: `${series.provider}${fixation}${basis === 'nominal' ? ' (nominal)' : ''}`,
        color: colors.get(series.provider) ?? CHART_COLORS.benchmark,
        dashed: sibling,
        marker: true,
        points: stepPoints(series, basis),
      };
    });
  }, [history, group, colors]);

  const aprc = data.at.get('hl_aprc');
  const option = useMemo(
    () =>
      stepTimeChart(
        [
          ...lines,
          {
            name: 'Concluded APRC (ECB)',
            color: CHART_COLORS.benchmark,
            dashed: true,
            width: 1.4,
            points: (aprc?.observations ?? []).map((o) => [`${o.period}-15`, o.value]),
          },
        ],
        { start: `${windowStart(data.window)}-01` },
      ),
    [lines, aprc, data.window],
  );

  const log = useMemo(() => {
    const holds = GROUPS.find((g) => g.id === group)?.holds ?? (() => true);
    return repricings(history)
      .filter((r) => holds(r.series))
      .slice(0, 10);
  }, [history, group]);

  // Where no archive capture exists, a lender's history starts the day the
  // scraper first read it — worth saying, or a near-empty chart reads as broken.
  const trackedSince = lines
    .map((l) => l.points.find((p) => p[1] !== null)?.[0])
    .filter((d): d is string => d !== undefined)
    .sort()[0];
  const recentlyTracked = trackedSince !== undefined && daysSince(trackedSince) < 90;

  return (
    <Card
      span={12}
      title="How advertised housing loan rates have moved"
      sub="Each lender's representative example or calculator quote over time, effective rate where published, against what borrowers concluded"
    >
      <div class="chart-filter" role="group" aria-label="Rate type">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={g.id === group}
            class={`window-btn${g.id === group ? ' active' : ''}`}
            onClick={() => setGroup(g.id)}
          >
            {g.label} ({Object.values(history.series).filter(g.holds).length})
          </button>
        ))}
      </div>
      <Chart
        option={option}
        height={280}
        ariaLabel="Advertised Austrian housing loan rates by lender over time, against the ECB concluded APRC"
      />
      <Legend
        items={[
          ...lines.map((l) => ({ label: l.dashed ? `${l.name} (dashed)` : l.name, color: l.color })),
          { label: 'Concluded APRC (ECB, dashed)', color: CHART_COLORS.benchmark },
        ]}
      />
      <div class="table-wrap">
        <table class="rates compact">
          <thead>
            <tr>
              <th>Repriced</th>
              <th>Lender</th>
              <th>Before</th>
              <th>After</th>
              <th>Change</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {log.length === 0 ? (
              <tr>
                <td colSpan={6} class="conditions">
                  No repricing on record yet for this rate type.
                </td>
              </tr>
            ) : null}
            {log.map((r) => (
              <tr key={`${r.id}-${r.date}`}>
                <td>{repricedWhen(r)}</td>
                <td class="provider">
                  {r.series.provider}
                  {r.series.fixationYears !== 0 ? ` · ${formatFixation(r.series.fixationYears)}` : ''}
                </td>
                <td class="num">{pct(r.before)}</td>
                <td class="num strong">{pct(r.after)}</td>
                <td class={`num delta ${changeTone(r.after - r.before, 'asset')}`}>
                  {bps(r.after - r.before)}
                </td>
                <td class="source">
                  <a href={r.episode.evidence} target="_blank" rel="noreferrer">
                    {r.episode.via === 'archive' ? 'archived page' : 'live page'}
                  </a>
                  {r.basis === 'nominal' ? <span class="badge">nominal</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {recentlyTracked ? (
        <Callout>
          <strong>
            {group !== 'variable' ? 'Fixed-rate' : 'This'} history starts on{' '}
            {formatPeriod(trackedSince)}.
          </strong>{' '}
          The Internet Archive holds no usable captures of these pages, so their record builds up
          daily from the first day the scraper read them.
        </Callout>
      ) : null}
      <Callout>
        History before this board started scraping is rebuilt from Internet Archive captures of the
        same pages, read with the same probes — every older row links to the capture it came from.
        Captures are roughly monthly, so where a bank states no <em>Stand</em> a repricing is dated
        to the first capture that shows it, and may have happened a few weeks earlier. A line
        breaks where a bank left an example online long past its own date, because by then it
        was no longer a price anyone was offered.
      </Callout>
    </Card>
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
