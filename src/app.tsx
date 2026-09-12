import { useState } from 'preact/hooks';

import { useDashboard, type DashboardData } from './lib/data';
import { DEFAULT_WINDOW, type WindowId } from './lib/catalog';
import { latest } from './lib/sdmx';
import { formatPeriod, pct } from './lib/format';
import { Tabs, WindowPicker, type TabDef } from './components/ui';
import { Overview } from './views/Overview';
import { Housing } from './views/Housing';
import { Savings } from './views/Savings';
import { Consumer } from './views/Consumer';
import { Offers } from './views/Offers';

type ViewId = 'overview' | 'housing' | 'savings' | 'consumer' | 'offers';

const TABS: TabDef<ViewId>[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'housing', label: 'Housing loans' },
  { id: 'savings', label: 'Savings & deposits' },
  { id: 'consumer', label: 'Consumer credit' },
  { id: 'offers', label: 'Bank offers' },
];

export function App() {
  const [view, setView] = useState<ViewId>('overview');
  const [window, setWindow] = useState<WindowId>(DEFAULT_WINDOW);
  const { data, loading, error } = useDashboard(window);

  return (
    <div class="app">
      <header class="masthead">
        <div>
          <h1>
            ALM Desk <span class="flag">Austria</span>
          </h1>
          <p>
            Housing loans, savings and term deposits — rate fixation, history and pass-through from
            ECB statistics, alongside what Austrian banks are advertising today.
          </p>
        </div>
        <WindowPicker active={window} loading={loading} onSelect={setWindow} />
      </header>

      {data ? <PolicyStrip data={data} /> : null}

      <Tabs tabs={TABS} active={view} onSelect={setView} />

      {/* The previous window stays on screen while a new one loads, so changing
          the history range does not blank the page. */}
      {error && !data ? (
        <div class="status error">Could not reach the ECB Data Portal. {error}</div>
      ) : null}
      {!data && loading ? <div class="status">Loading ECB Data Portal…</div> : null}

      {data ? (
        <div class={loading ? 'refreshing' : ''}>
          <View id={view} data={data} />
        </div>
      ) : null}

      {data ? <Foot data={data} /> : null}
    </div>
  );
}

function View({ id, data }: { id: ViewId; data: DashboardData }) {
  switch (id) {
    case 'housing':
      return <Housing data={data} />;
    case 'savings':
      return <Savings data={data} />;
    case 'consumer':
      return <Consumer data={data} />;
    case 'offers':
      return <Offers data={data} />;
    default:
      return <Overview data={data} />;
  }
}

/* ------------------------------------------------------------------ */

function PolicyStrip({ data }: { data: DashboardData }) {
  const estr = latest(data.estr);
  const euribor = latest(data.euribor3m);

  return (
    <div class="policy-strip">
      <Chip
        label="Deposit facility"
        value={pct(data.policy.dfr)}
        note={formatPeriod(data.policy.asOf)}
      />
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
      <div class="chip-note">{props.note}</div>
    </div>
  );
}

function Foot({ data }: { data: DashboardData }) {
  return (
    <footer class="foot">
      <p>
        Rate statistics: <a href="https://data.ecb.europa.eu/" target="_blank" rel="noreferrer">ECB
        Data Portal</a> (MIR, EST, FM dataflows), fetched live in the browser. MFI interest rate
        statistics are monthly and published with roughly a five-week lag; latest observation{' '}
        {formatPeriod(data.asOf)}. New business is what was concluded that month, volume-weighted
        across all reporting Austrian banks.
      </p>
      <p>
        Advertised rates are read once a day from each bank&rsquo;s own published condition page and
        committed to this repository; each figure on the Bank offers tab links to the page it came
        from and shows when it was last checked. They are indicative, not an offer, and are shown
        before 25% Austrian capital gains tax.
      </p>
      <p>
        Euribor is shown at monthly frequency as published by the ECB. Daily Euribor is licensed by
        EMMI and is not redistributed here.
      </p>
    </footer>
  );
}
