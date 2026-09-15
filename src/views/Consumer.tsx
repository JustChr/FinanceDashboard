import { useMemo } from 'preact/hooks';

import { latest } from '../lib/sdmx';
import { repricings } from '../lib/offers';
import { lenderStyles, quotesFor } from '../lib/quotes';
import { day, fixationLong, formatPeriod, lowerFirst, pct, productName } from '../lib/format';
import { usePalette } from '../lib/theme';
import { t } from '../i18n';
import { MarketPanel, obs, type MarketView } from '../components/MarketPanel';
import { About, Facts, PageHead, Section, SourceList } from '../components/ui';
import { ChangeList, allLenders, sourcesFor, type PageProps } from '../components/offerParts';

const { buckets } = t.common;

const VIEWS: MarketView[] = [
  {
    id: 'fixation',
    label: t.common.byFixation,
    lines: (e, pal) => [
      { name: buckets.variable, observations: obs(e, 'cc_var'), color: pal.series[0] ?? pal.ink },
      { name: buckets.fixed1to5, observations: obs(e, 'cc_1_5'), color: pal.series[1] ?? pal.ink },
      { name: buckets.fixedOver5, observations: obs(e, 'cc_5p'), color: pal.series[2] ?? pal.ink },
    ],
  },
  {
    id: 'fees',
    label: t.common.rateVsAprc,
    lines: (e, pal) => [
      { name: t.common.agreedRate, observations: obs(e, 'cc_total'), color: pal.series[0] ?? pal.ink },
      { name: t.common.aprcFees, observations: obs(e, 'cc_aprc'), color: pal.series[1] ?? pal.ink },
    ],
  },
  {
    id: 'compare',
    label: t.consumer.vsOther,
    lines: (e, pal) => [
      { name: t.app.pages.consumer, observations: obs(e, 'cc_total'), color: pal.series[0] ?? pal.ink },
      { name: t.common.overdrafts, observations: obs(e, 'od_hh'), color: pal.series[1] ?? pal.ink },
      { name: t.app.pages.housing, observations: obs(e, 'hl_total'), color: pal.series[2] ?? pal.ink },
      { name: t.consumer.consumerEuroArea, observations: obs(e, 'cc_total', 'ea'), color: pal.market },
    ],
  },
];

export function Consumer({ offers, ecb, ecbWindow, onWindow }: PageProps) {
  const pal = usePalette();
  const { board, consumer: history } = offers;
  const data = ecb.data;

  const quotes = useMemo(() => quotesFor(board?.offers ?? [], 'consumer'), [board]);
  const styles = useMemo(() => lenderStyles(allLenders(quotes, history), pal), [quotes, history, pal]);
  const changes = useMemo(() => (history ? repricings(history, 'effective') : []), [history]);
  const since = Object.values(history?.series ?? {})
    .map((s) => s.episodes[0]?.firstSeen)
    .filter((d): d is string => !!d)
    .sort()[0];

  const at = (id: string) => (data ? latest(data.at.get(id)) : undefined);
  const total = at('cc_total');
  const aprc = at('cc_aprc');
  const overdraft = at('od_hh');
  const cheapest = quotes
    .filter((q) => q.effective !== null)
    .sort((a, b) => (a.effective ?? 0) - (b.effective ?? 0))[0];

  return (
    <>
      <PageHead title={t.app.pages.consumer}>
        <p class="lede">{t.consumer.lede(total ? formatPeriod(total.period) : undefined)}</p>
        <Facts
          items={[
            { label: t.consumer.ecbAgreed, value: pct(total?.value), detail: t.consumer.allNew },
            { label: t.consumer.ecbAprc, value: pct(aprc?.value), detail: t.consumer.includingFees },
            { label: t.common.overdrafts, value: pct(overdraft?.value), detail: t.consumer.revolving },
            {
              label: t.consumer.lowest,
              value: pct(cheapest?.effective),
              detail: cheapest
                ? `${cheapest.lender} · ${lowerFirst(fixationLong(cheapest.offer.fixationYears))}`
                : t.consumer.nonePublished,
            },
          ]}
        />
      </PageHead>

      <Section title={t.consumer.title} meta={t.consumer.meta}>
        <ul class="offer-list">
          {quotes.map((q) => {
            const style = styles.get(q.lender);
            return (
              <li key={q.offer.id}>
                <span class="who">
                  <i class="sw" style={`--c:${style?.color ?? 'currentColor'}`} />
                  {q.lender}
                </span>
                <span class="offer-product">
                  <a href={q.offer.sourceUrl} target="_blank" rel="noreferrer">
                    {productName(q.offer.product)}
                  </a>
                  <span class="muted"> · {fixationLong(q.offer.fixationYears)}</span>
                </span>
                <span class="offer-rate">
                  <b>{pct(q.effective)}</b> {t.common.basis.effective}
                  <span class="muted">
                    {' '}
                    · {pct(q.nominal)} {t.common.basis.nominal}
                  </span>
                </span>
                <span class="muted">{t.common.checked(day(q.offer.observedAt))}</span>
              </li>
            );
          })}
        </ul>
        <ChangeList
          changes={changes.slice(0, 6)}
          styles={styles}
          empty={since ? t.consumer.since(day(since)) : t.consumer.noHistory}
        />
      </Section>

      <MarketPanel
        title={t.consumer.panelTitle}
        meta={t.consumer.panelMeta}
        views={VIEWS}
        ecb={ecb}
        window={ecbWindow}
        onWindow={onWindow}
      />

      <div class="page-foot">
        <About>{t.consumer.about()}</About>
        <SourceList sources={sourcesFor(board, 'consumer')} />
      </div>
    </>
  );
}
