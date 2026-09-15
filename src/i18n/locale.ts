export type Locale = 'en' | 'de';

/**
 * Each language is its own HTML entry — `/` in English, `/de/` in German — so
 * the locale is fixed for the lifetime of the page and read once from
 * `<html lang>`. Switching language is a link, not state.
 */
export const locale: Locale = document.documentElement.lang.startsWith('de') ? 'de' : 'en';

const STORAGE_KEY = 'lang';

/** Remembers a language picked in the header, so it outlasts the redirect below. */
export function rememberLocale(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Storage blocked: the pick holds for this visit only.
  }
}

/**
 * Where to send a visitor who opened the English page but prefers German — by
 * an earlier pick in the header, else by the browser's language order — or
 * `null` to stay. Only the English page redirects: a /de/ link opens in German
 * whatever the browser says.
 */
export function preferredLocaleRedirect(): string | null {
  if (locale !== 'en') return null;
  let picked: string | null = null;
  try {
    picked = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage blocked: fall back to the browser's languages.
  }
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  const preferred =
    picked ?? languages.map((l) => l.slice(0, 2).toLowerCase()).find((l) => l === 'de' || l === 'en');
  return preferred === 'de' ? `${import.meta.env.BASE_URL}de/${location.hash}` : null;
}
