import { useMemo } from 'preact/hooks';

import { latest } from '../lib/sdmx';
import { repricings } from '../lib/offers';
import { lenderStyles, quotesFor } from '../lib/quotes';
import { day, formatPeriod, pct } from '../lib/format';
import { usePalette } from '../lib/theme';
import { MarketPanel, obs, type MarketView } from '../components/MarketPanel';
import { About, Facts, PageHead, Section, SourceList } from '../components/ui';
import { ChangeList, allLenders, sourcesFor, type PageProps } from '../components/offerParts';

const VIEWS: MarketView[] = [
  {
    id: 'fixation',
    label: 'By fixation',
    lines: (e, pal) => [
      { name: 'Variable / up to 1y', observations: obs(e, 'cc_var'), color: pal.series[0] ?? pal.ink },
      { name: 'Fixed 1–5y', observations: obs(e, 'cc_1_5'), color: pal.series[1] ?? pal.ink },
      { name: 'Fixed over 5y', observations: obs(e, 'cc_5p'), color: pal.series[2] ?? pal.ink },
    ],
  },
  {
    id: 'fees',
    label: 'Rate vs APRC',
    lines: (e, pal) => [
      { name: 'Agreed rate', observations: obs(e, 'cc_total'), color: pal.series[0] ?? pal.ink },
      { name: 'APRC incl. fees', observations: obs(e, 'cc_aprc'), color: pal.series[1] ?? pal.ink },
    ],
  },
  {
    id: 'compare',
    label: 'vs other lending',
    lines: (e, pal) => [
      { name: 'Consumer credit', observations: obs(e, 'cc_total'), color: pal.series[0] ?? pal.ink },
      { name: 'Overdrafts', observations: obs(e, 'od_hh'), color: pal.series[1] ?? pal.ink },
      { name: 'Housing loans', observations: obs(e, 'hl_total'), color: pal.series[2] ?? pal.ink },
      { name: 'Consumer credit, euro area', observations: obs(e, 'cc_total', 'ea'), color: pal.market },
    ],
  },
];

const fixationText = (years: number | null) =>
  years === null ? 'Fixed for the whole term' : years === 0 ? 'Variable rate' : `Fixed for ${years} years`;

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
      <PageHead title="Consumer credit">
        <p class="lede">
          What Austrian households concluded{total ? ` in ${formatPeriod(total.period)}` : ''}, and the few
          consumer-loan examples a bank publishes in readable form.
        </p>
        <Facts
          items={[
            { label: 'ECB concluded, agreed rate', value: pct(total?.value), detail: 'All new consumer loans' },
            { label: 'ECB concluded, APRC', value: pct(aprc?.value), detail: 'Including fees' },
            { label: 'Overdrafts', value: pct(overdraft?.value), detail: 'Revolving credit' },
            {
              label: 'Lowest advertised, effective',
              value: pct(cheapest?.effective),
              detail: cheapest ? `${cheapest.lender} · ${fixationText(cheapest.offer.fixationYears).toLowerCase()}` : 'None published',
            },
          ]}
        />
      </PageHead>

      <Section
        title="Advertised today"
        meta="Representative examples under §5 VKrG. Consumer credit is priced per borrower, so almost no bank publishes a figure that can be read."
      >
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
                    {q.offer.product}
                  </a>
                  <span class="muted"> · {fixationText(q.offer.fixationYears)}</span>
                </span>
                <span class="offer-rate">
                  <b>{pct(q.effective)}</b> effective
                  <span class="muted"> · {pct(q.nominal)} nominal</span>
                </span>
                <span class="muted">Checked {day(q.offer.observedAt)}</span>
              </li>
            );
          })}
        </ul>
        <ChangeList
          changes={changes.slice(0, 6)}
          styles={styles}
          empty={since ? `Recorded daily from ${day(since)}; no change so far.` : 'No history recorded yet.'}
        />
      </Section>

      <MarketPanel
        title="Concluded consumer credit"
        meta="ECB MFI interest rate statistics for Austrian households: new business, volume-weighted, monthly."
        views={VIEWS}
        ecb={ecb}
        window={ecbWindow}
        onWindow={onWindow}
      />

      <div class="page-foot">
        <About>
          <p>
            The APRC includes arrangement fees and other charges. On consumer credit it sits far above the agreed
            rate, because the same fixed costs are spread over a much smaller loan than a mortgage.
          </p>
          <p>
            The ECB splits consumer credit by initial rate fixation: variable or up to one year, over one and up to
            five years, and over five years.
          </p>
        </About>
        <SourceList sources={sourcesFor(board, 'consumer')} />
      </div>
    </>
  );
}
