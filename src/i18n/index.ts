import { locale } from './locale';
import { en, type Messages } from './en';
import { de } from './de';

export { locale, type Locale } from './locale';
export type { Basis, Messages } from './en';

export const t: Messages = locale === 'de' ? de : en;

/**
 * Text the scraper writes in both languages, such as an offer's conditions.
 * A board written before German was added carries English only, so it falls back.
 */
export function localized<T extends string | null>(english: T, german?: string | null): T | string {
  return locale === 'de' && german ? german : english;
}
