import { useMemo } from 'preact/hooks';

import { latest } from '../lib/sdmx';
import { spread } from '../lib/metrics';
import { bps, day, formatPeriod, pct } from '../lib/format';
import { usePalette } from '../lib/theme';
import { Chart } from '../components/Chart';
import { dumbbellChart, type DumbbellRow } from '../components/charts';
import { MarketPanel, obs, type MarketView } from '../components/MarketPanel';
import { About, Facts, Numbers, PageHead, Pending, Section } from '../components/ui';
import type { PageProps } from '../components/offerParts';

const VIEWS: MarketView[] = [
  {
    id: 'rates',
    label: 'Policy & money market',
    lines: (e, pal) => [
      { name: 'ECB deposit facility', observations: e.dfrMonthly, color: pal.series[0] ?? pal.ink, step: true },
      { name: '€STR', observations: e.estrMonthly, color: pal.series[1] ?? pal.ink },
      { name: 'Euribor 3M', observations: e.euribor3m?.observations ?? [], color: pal.series[2] ?? pal.ink },
    ],
  },
  {
    id: 'margin',
    label: 'Bank margins',
    zeroLine: true,
    lines: (e, pal) => [
      {
        name: 'Housing loans over €STR',
        observations: spread(obs(e, 'hl_total'), e.estrMonthly),
        color: pal.series[0] ?? pal.ink,
        area: true,
      },
      {
        name: '€STR over overnight deposits',
        observations: spread(e.estrMonthly, obs(e, 'dep_on')),
        color: pal.series[1] ?? pal.ink,
        area: true,
      },
    ],
  },
];

const GROUPS: { title: string; rows: { id: string; label: string }[] }[] = [
  {
    title: 'Housing loans',
    rows: [
      { id: 'hl_total', label: 'All new loans' },
      { id: 'hl_var', label: 'Variable / up to 1y' },
      { id: 'hl_1_5', label: 'Fixed 1–5y' },
      { id: 'hl_5_10', label: 'Fixed 5–10y' },
      { id: 'hl_10p', label: 'Fixed over 10y' },
      { id: 'hl_stock', label: 'Outstanding' },
    ],
  },
  {
    title: 'Savings',
    rows: [
      { id: 'dep_on', label: 'Overnight' },
      { id: 'dep_notice', label: 'At notice' },
      { id: 'dep_term_le1', label: 'Term up to 1y' },
      { id: 'dep_term_1_2', label: 'Term 1–2y' },
      { id: 'dep_term_2p', label: 'Term over 2y' },
      { id: 'dep_term_stock', label: 'Outstanding term' },
    ],
  },
  {
    title: 'Consumer credit',
    rows: [
      { id: 'cc_total', label: 'All new loans' },
      { id: 'cc_var', label: 'Variable / up to 1y' },
      { id: 'cc_1_5', label: 'Fixed 1–5y' },
      { id: 'cc_5p', label: 'Fixed over 5y' },
      { id: 'od_hh', label: 'Overdrafts' },
      { id: 'cc_stock', label: 'Outstanding' },
    ],
  },
  {
    title: 'Corporates',
    rows: [
      { id: 'nfc_cob', label: 'Cost of borrowing' },
      { id: 'nfc_on', label: 'Overnight deposits' },
      { id: 'nfc_term', label: 'Term deposits' },
    ],
  },
];

export function Market({ ecb, ecbWindow, onWindow }: PageProps) {
  const pal = usePalette();
  const data = ecb.data;

  const groups = useMemo(
    () =>
      data
        ? GROUPS.map((g) => {
            const rows: DumbbellRow[] = g.rows.map((r) => ({
              label: r.label,
              at: latest(data.at.get(r.id))?.value ?? null,
              ea: latest(data.ea.get(r.id))?.value ?? null,
            }));
            return { title: g.title, rows, option: dumbbellChart(pal, rows) };
          })
        : [],
    [data, pal],
  );

  const euribor = latest(data?.euribor3m);

  return (
    <>
      <PageHead title="Rates & ECB">
        <p class="lede">The benchmarks Austrian bank pricing moves against, and how Austria compares with the euro area.</p>
        <Facts
          items={[
            { label: 'ECB deposit facility', value: pct(data?.policy.dfr), detail: data ? `As of ${day(data.policy.asOf)}` : 'Loading…' },
            { label: 'Main refinancing rate', value: pct(data?.policy.mro), detail: 'ECB' },
            { label: '€STR', value: pct(data?.estr?.value, 3), detail: data ? day(data.estr?.period) : 'Loading…' },
            { label: 'Euribor 3M', value: pct(euribor?.value), detail: euribor ? `${formatPeriod(euribor.period)} · monthly average` : 'Loading…' },
          ]}
        />
      </PageHead>

      <MarketPanel
        title="Benchmarks and margins"
        meta="Monthly. Margins use €STR as a stand-in for the banks' own funding cost."
        views={VIEWS}
        ecb={ecb}
        window={ecbWindow}
        onWindow={onWindow}
      />

      <Section
        title="Austria against the euro area"
        meta={data ? `Latest month of each ECB series, up to ${formatPeriod(data.asOf)}. Hover a row for the gap.` : undefined}
      >
        {data ? (
          <>
            <div class="multiples">
              {groups.map((g) => (
                <div key={g.title}>
                  <h3 class="subhead">{g.title}</h3>
                  <Chart
                    option={g.option}
                    height={g.rows.length * 34 + 56}
                    ariaLabel={`${g.title}: Austrian rates against the euro area`}
                  />
                </div>
              ))}
            </div>
            <Numbers
              head={['Product', 'Series', 'Austria', 'Euro area', 'Gap']}
              rows={groups.flatMap((g) =>
                g.rows.map((r) => [
                  g.title,
                  r.label,
                  pct(r.at),
                  pct(r.ea),
                  r.at !== null && r.ea !== null ? bps(r.at - r.ea) : '–',
                ]),
              )}
            />
          </>
        ) : (
          <Pending error={ecb.error} height={420} />
        )}
      </Section>

      <div class="page-foot">
        <About>
          <p>
            Policy rates, €STR and Euribor come from the ECB Data Portal. Euribor is shown as the ECB&rsquo;s
            monthly average: daily Euribor is licensed by EMMI and is not redistributed here, so €STR is the daily
            benchmark.
          </p>
          <p>
            Lending and deposit rates are MFI interest rate statistics, published about five weeks after the
            month they describe.
          </p>
        </About>
      </div>
    </>
  );
}
