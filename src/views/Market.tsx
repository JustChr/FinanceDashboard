import { useMemo } from 'preact/hooks';

import { latest } from '../lib/sdmx';
import { spread } from '../lib/metrics';
import { bps, day, formatPeriod, pct } from '../lib/format';
import { usePalette } from '../lib/theme';
import { t } from '../i18n';
import { Chart } from '../components/Chart';
import { dumbbellChart, type DumbbellRow } from '../components/charts';
import { MarketPanel, obs, type MarketView } from '../components/MarketPanel';
import { About, Facts, Numbers, PageHead, Pending, Section } from '../components/ui';
import type { PageProps } from '../components/offerParts';

const { buckets, deposits } = t.common;

const VIEWS: MarketView[] = [
  {
    id: 'rates',
    label: t.market.policyMoney,
    lines: (e, pal) => [
      { name: t.common.depositFacility, observations: e.dfrMonthly, color: pal.series[0] ?? pal.ink, step: true },
      { name: '€STR', observations: e.estrMonthly, color: pal.series[1] ?? pal.ink },
      { name: 'Euribor 3M', observations: e.euribor3m?.observations ?? [], color: pal.series[2] ?? pal.ink },
    ],
  },
  {
    id: 'margin',
    label: t.market.margins,
    zeroLine: true,
    lines: (e, pal) => [
      {
        name: t.market.housingOverEstr,
        observations: spread(obs(e, 'hl_total'), e.estrMonthly),
        color: pal.series[0] ?? pal.ink,
        area: true,
      },
      {
        name: t.market.estrOverOvernight,
        observations: spread(e.estrMonthly, obs(e, 'dep_on')),
        color: pal.series[1] ?? pal.ink,
        area: true,
      },
    ],
  },
];

const GROUPS: { title: string; rows: { id: string; label: string }[] }[] = [
  {
    title: t.app.pages.housing,
    rows: [
      { id: 'hl_total', label: t.market.allNewLoans },
      { id: 'hl_var', label: buckets.variable },
      { id: 'hl_1_5', label: buckets.fixed1to5 },
      { id: 'hl_5_10', label: buckets.fixed5to10 },
      { id: 'hl_10p', label: buckets.fixedOver10 },
      { id: 'hl_stock', label: t.market.outstanding },
    ],
  },
  {
    title: t.app.pages.savings,
    rows: [
      { id: 'dep_on', label: deposits.overnight },
      { id: 'dep_notice', label: deposits.notice },
      { id: 'dep_term_le1', label: deposits.termTo1 },
      { id: 'dep_term_1_2', label: deposits.term1to2 },
      { id: 'dep_term_2p', label: deposits.termOver2 },
      { id: 'dep_term_stock', label: t.market.outstandingTerm },
    ],
  },
  {
    title: t.app.pages.consumer,
    rows: [
      { id: 'cc_total', label: t.market.allNewLoans },
      { id: 'cc_var', label: buckets.variable },
      { id: 'cc_1_5', label: buckets.fixed1to5 },
      { id: 'cc_5p', label: buckets.fixedOver5 },
      { id: 'od_hh', label: t.common.overdrafts },
      { id: 'cc_stock', label: t.market.outstanding },
    ],
  },
  {
    title: t.market.corporates,
    rows: [
      { id: 'nfc_cob', label: t.market.costOfBorrowing },
      { id: 'nfc_on', label: t.market.overnightDeposits },
      { id: 'nfc_term', label: t.market.termDeposits },
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
      <PageHead title={t.app.pages.market}>
        <p class="lede">{t.market.lede}</p>
        <Facts
          items={[
            {
              label: t.common.depositFacility,
              value: pct(data?.policy.dfr),
              detail: data ? t.market.asOf(day(data.policy.asOf)) : t.common.loading,
            },
            { label: t.market.mro, value: pct(data?.policy.mro), detail: t.market.ecb },
            { label: '€STR', value: pct(data?.estr?.value, 3), detail: data ? day(data.estr?.period) : t.common.loading },
            {
              label: 'Euribor 3M',
              value: pct(euribor?.value),
              detail: euribor ? t.market.monthlyAverage(formatPeriod(euribor.period)) : t.common.loading,
            },
          ]}
        />
      </PageHead>

      <MarketPanel
        title={t.market.panelTitle}
        meta={t.market.panelMeta}
        views={VIEWS}
        ecb={ecb}
        window={ecbWindow}
        onWindow={onWindow}
      />

      <Section
        title={t.market.compareTitle}
        meta={data ? t.market.compareMeta(formatPeriod(data.asOf)) : undefined}
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
                    ariaLabel={t.market.compareAria(g.title)}
                  />
                </div>
              ))}
            </div>
            <Numbers
              head={t.market.compareHead}
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
        <About>{t.market.about()}</About>
      </div>
    </>
  );
}
