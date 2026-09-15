import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';

/**
 * Colour tokens for the page and every chart.
 *
 * The categorical slots are a validated eight-hue order (adjacent-pair colour
 * vision deficiency ΔE ≥ 8 in both modes). The order is the safety mechanism:
 * do not reorder, and never generate a ninth hue — a ninth lender reuses a hue
 * with a different marker shape instead (see `lenderStyles`).
 *
 * Dark mode is its own set of steps for the dark surface, not an inversion.
 */
export interface Palette {
  mode: 'light' | 'dark';
  surface: string;
  ink: string;
  ink2: string;
  muted: string;
  grid: string;
  axis: string;
  /** ECB concluded averages and other reference marks. */
  market: string;
  /** Wash behind a selected column. */
  select: string;
  series: readonly string[];
  tooltipBg: string;
  tooltipBorder: string;
}

const LIGHT: Palette = {
  mode: 'light',
  surface: '#fcfcfb',
  ink: '#0b0b0b',
  ink2: '#52514e',
  muted: '#898781',
  grid: '#e9e8e2',
  axis: '#c3c2b7',
  market: '#77756f',
  select: 'rgba(11, 11, 11, 0.05)',
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  tooltipBg: '#ffffff',
  tooltipBorder: 'rgba(11, 11, 11, 0.12)',
};

const DARK: Palette = {
  mode: 'dark',
  surface: '#1a1a19',
  ink: '#ffffff',
  ink2: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  axis: '#45443f',
  market: '#a3a198',
  select: 'rgba(255, 255, 255, 0.06)',
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  tooltipBg: '#232322',
  tooltipBorder: 'rgba(255, 255, 255, 0.14)',
};

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Follows the operating system's colour scheme, live. */
export function useSystemPalette(): Palette {
  const [dark, setDark] = useState(() => darkQuery().matches);

  useEffect(() => {
    const query = darkQuery();
    const onChange = () => setDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return dark ? DARK : LIGHT;
}

export const PaletteContext = createContext<Palette>(LIGHT);

export const usePalette = (): Palette => useContext(PaletteContext);
