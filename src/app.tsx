import { useEffect, useState } from 'preact/hooks';

import { useEcb, useOffers } from './lib/data';
import { DEFAULT_WINDOW, type WindowId } from './lib/catalog';
import { day, formatPeriod } from './lib/format';
import { PaletteContext, useSystemPalette } from './lib/theme';
import { Housing } from './views/Housing';
import { Savings } from './views/Savings';
import { Consumer } from './views/Consumer';
import { Market } from './views/Market';
import type { PageProps } from './components/offerParts';

const PAGES = [
  { id: 'housing', label: 'Housing loans', View: Housing },
  { id: 'savings', label: 'Savings', View: Savings },
  { id: 'consumer', label: 'Consumer credit', View: Consumer },
  { id: 'market', label: 'Rates & ECB', View: Market },
] as const satisfies readonly { id: string; label: string; View: (props: PageProps) => unknown }[];

type PageId = (typeof PAGES)[number]['id'];

/** Pages live in the hash, so a view can be linked and the back button works. */
function readRoute(): PageId {
  const id = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return PAGES.find((p) => p.id === id)?.id ?? 'housing';
}

export function App() {
  const palette = useSystemPalette();
  const [page, setPage] = useState<PageId>(readRoute);
  const [ecbWindow, setEcbWindow] = useState<WindowId>(DEFAULT_WINDOW);
  const ecb = useEcb(ecbWindow);
  const offers = useOffers();

  useEffect(() => {
    const onChange = () => {
      setPage(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const current = PAGES.find((p) => p.id === page) ?? PAGES[0];
  const View = current.View;

  return (
    <PaletteContext.Provider value={palette}>
      <div class="app">
        <header class="top">
          <a class="brand" href="#/housing">
            ALM Desk <span>Austria</span>
          </a>
          <nav class="nav" aria-label="Products">
            {PAGES.map((p) => (
              <a key={p.id} href={`#/${p.id}`} aria-current={p.id === page ? 'page' : undefined}>
                {p.label}
              </a>
            ))}
          </nav>
          <p class="stamp">
            {offers?.board ? `Offers checked ${day(offers.board.generatedAt)}` : ''}
            {offers?.board && ecb.data ? ' · ' : ''}
            {ecb.data ? `ECB statistics to ${formatPeriod(ecb.data.asOf)}` : ''}
          </p>
        </header>

        <main>
          {offers ? (
            <View offers={offers} ecb={ecb} ecbWindow={ecbWindow} onWindow={setEcbWindow} />
          ) : (
            <p class="loading">Loading…</p>
          )}
        </main>

        <footer class="foot">
          Rate statistics from the{' '}
          <a href="https://data.ecb.europa.eu/" target="_blank" rel="noreferrer">
            ECB Data Portal
          </a>
          , fetched live. Offers are read once a day from each bank&rsquo;s own pages and calculators; they are
          indicative, not an offer. Source code on{' '}
          <a href="https://github.com/JustChr/FinanceDashboard" target="_blank" rel="noreferrer">
            GitHub
          </a>
          .
        </footer>
      </div>
    </PaletteContext.Provider>
  );
}
