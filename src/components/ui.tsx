import type { ComponentChildren } from 'preact';

import { HISTORY_WINDOWS, type WindowId } from '../lib/catalog';

export function Card({
  title,
  sub,
  span = 12,
  children,
}: {
  title: string;
  sub?: ComponentChildren;
  /** Twelve-column grid width. */
  span?: 4 | 5 | 6 | 7 | 8 | 12;
  children: ComponentChildren;
}) {
  return (
    <section class={`card span-${span}`}>
      <h2>{title}</h2>
      {sub ? <p class="sub">{sub}</p> : null}
      {children}
    </section>
  );
}

/** A single figure with its label and a supporting line underneath. */
export function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: ComponentChildren;
  tone?: 'positive' | 'negative';
}) {
  return (
    <div class="stat">
      <div class="stat-label">{label}</div>
      <div class={`stat-value num${tone ? ` ${tone}` : ''}`}>{value}</div>
      {note ? <div class="stat-note">{note}</div> : null}
    </div>
  );
}

export function StatRow({ children }: { children: ComponentChildren }) {
  return <div class="stat-row">{children}</div>;
}

export function Callout({ children }: { children: ComponentChildren }) {
  return <div class="callout">{children}</div>;
}

export interface TabDef<T extends string> {
  id: T;
  label: string;
}

export function Tabs<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: TabDef<T>[];
  active: T;
  onSelect: (id: T) => void;
}) {
  return (
    <nav class="tabs" role="tablist" aria-label="Dashboard sections">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          class={`tab${tab.id === active ? ' active' : ''}`}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

/** How far back every chart on the page reaches. */
export function WindowPicker({
  active,
  loading,
  onSelect,
}: {
  active: WindowId;
  loading: boolean;
  onSelect: (id: WindowId) => void;
}) {
  return (
    <div class="window-picker" role="group" aria-label="History window">
      <span class="window-label">History</span>
      {HISTORY_WINDOWS.map((w) => (
        <button
          key={w.id}
          type="button"
          aria-pressed={w.id === active}
          class={`window-btn${w.id === active ? ' active' : ''}`}
          disabled={loading}
          onClick={() => onSelect(w.id)}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}

/** Coloured change cell, read from the bank's margin perspective. */
export function changeTone(
  change: number | undefined,
  side: 'asset' | 'liability',
): string {
  if (change === undefined || Math.abs(change) < 0.005) return '';
  const good = side === 'asset' ? change > 0 : change < 0;
  return good ? 'up' : 'down';
}
