import { useEffect, useState } from 'preact/hooks';

import { useEcb, useOffers } from './lib/data';
import { DEFAULT_WINDOW, type WindowId } from './lib/catalog';
import { day, formatPeriod } from './lib/format';
import { PaletteContext, useSystemPalette } from './lib/theme';
import { t } from './i18n';
import { rememberLocale } from './i18n/locale';
import { Housing } from './views/Housing';
import { Savings } from './views/Savings';
import { Consumer } from './views/Consumer';
import { Market } from './views/Market';
import type { PageProps } from './components/offerParts';

const PAGES = [
  { id: 'housing', label: t.app.pages.housing, View: Housing },
  { id: 'savings', label: t.app.pages.savings, View: Savings },
  { id: 'consumer', label: t.app.pages.consumer, View: Consumer },
  { id: 'market', label: t.app.pages.market, View: Market },
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
            ALM Desk <span>{t.app.brand}</span>
          </a>
          <nav class="nav" aria-label={t.app.nav}>
            {PAGES.map((p) => (
              <a key={p.id} href={`#/${p.id}`} aria-current={p.id === page ? 'page' : undefined}>
                {p.label}
              </a>
            ))}
          </nav>
          <p class="stamp">
            {offers?.board ? t.app.offersChecked(day(offers.board.generatedAt)) : ''}
            {offers?.board && ecb.data ? ' · ' : ''}
            {ecb.data ? t.app.ecbTo(formatPeriod(ecb.data.asOf)) : ''}
          </p>
          {/* Each language is its own HTML entry; the hash carries the page across. */}
          <a
            class="lang"
            href={`${import.meta.env.BASE_URL}${t.otherLanguage.path}#/${page}`}
            hreflang={t.otherLanguage.code}
            lang={t.otherLanguage.code}
            onClick={() => rememberLocale(t.otherLanguage.code)}
          >
            {t.otherLanguage.label}
          </a>
        </header>

        <main>
          {offers ? (
            <View offers={offers} ecb={ecb} ecbWindow={ecbWindow} onWindow={setEcbWindow} />
          ) : (
            <p class="loading">{t.common.loading}</p>
          )}
        </main>

        <footer class="foot">
          {t.app.footer(
            <a href="https://data.ecb.europa.eu/" target="_blank" rel="noreferrer">
              ECB Data Portal
            </a>,
            <a href="https://www.oenb.at/en/Statistics/User-Defined-Tables/webservice.html" target="_blank" rel="noreferrer">
              OeNB
            </a>,
            <a href="https://github.com/JustChr/FinanceDashboard" target="_blank" rel="noreferrer">
              GitHub
            </a>,
          )}
        </footer>
      </div>
    </PaletteContext.Provider>
  );
}
