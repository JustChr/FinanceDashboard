import type { ComponentChildren } from 'preact';

import { HISTORY_WINDOWS, type WindowId } from '../lib/catalog';
import type { OfferSource } from '../lib/offers';
import type { LenderStyle } from '../lib/quotes';
import { localized, t } from '../i18n';

export function PageHead({ title, children }: { title: string; children?: ComponentChildren }) {
  return (
    <div class="page-head">
      <h1>{title}</h1>
      {children}
    </div>
  );
}

export interface FactItem {
  label: string;
  value: string;
  detail?: ComponentChildren;
}

/** The handful of figures a page leads with. Plain type, no tiles. */
export function Facts({ items }: { items: FactItem[] }) {
  return (
    <dl class="facts">
      {items.map((item) => (
        <div class="fact" key={item.label}>
          <dt>{item.label}</dt>
          <dd class="fact-value">{item.value}</dd>
          {item.detail ? <dd class="fact-detail">{item.detail}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

export function Section({
  title,
  meta,
  controls,
  children,
}: {
  title: string;
  meta?: ComponentChildren;
  controls?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <section class="section">
      <header class="section-head">
        <div>
          <h2>{title}</h2>
          {meta ? <p class="meta">{meta}</p> : null}
        </div>
        {controls ? <div class="section-controls">{controls}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** The row of controls that scopes every chart below it on the page. */
export function Controls({ children }: { children: ComponentChildren }) {
  return <div class="controls">{children}</div>;
}

export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  disabled?: boolean;
}) {
  return (
    <div class="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          aria-pressed={o.id === value}
          disabled={disabled}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label class="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span class="switch-track" aria-hidden="true" />
      {label}
    </label>
  );
}

/**
 * Lender filter and legend in one: the swatch shows how a lender is drawn,
 * a click hides or shows it on every chart of the page, a hover emphasises it.
 */
export function LenderChips({
  lenders,
  styles,
  hidden,
  onChange,
  onHover,
}: {
  lenders: string[];
  styles: Map<string, LenderStyle>;
  hidden: Set<string>;
  onChange: (hidden: Set<string>) => void;
  onHover: (lender: string | null) => void;
}) {
  const toggle = (name: string) => {
    const next = new Set(hidden);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(next);
  };

  return (
    <div class="chips" role="group" aria-label={t.common.lenders}>
      {lenders.map((name) => {
        const style = styles.get(name);
        const off = hidden.has(name);
        return (
          <button
            key={name}
            type="button"
            class="chip"
            aria-pressed={!off}
            onClick={() => toggle(name)}
            onMouseEnter={() => !off && onHover(name)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => !off && onHover(name)}
            onBlur={() => onHover(null)}
          >
            <i class={`sw sw-${style?.symbol ?? 'circle'}`} style={`--c:${style?.color ?? 'currentColor'}`} />
            {name}
          </button>
        );
      })}
      {hidden.size > 0 ? (
        <button type="button" class="chip chip-reset" onClick={() => onChange(new Set())}>
          {t.common.showAll}
        </button>
      ) : null}
    </div>
  );
}

/** How far back the ECB statistics reach; changing it refetches. */
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
    <Segmented
      label={t.common.ecbHistory}
      options={HISTORY_WINDOWS.map((w) => ({ id: w.id, label: t.common.ecbWindows[w.id] }))}
      value={active}
      onChange={onSelect}
      disabled={loading}
    />
  );
}

/** Every chart's numbers, one click away and out of the way until then. */
export function Numbers({ head, rows }: { head: string[]; rows: ComponentChildren[][] }) {
  if (rows.length === 0) return null;
  return (
    <details class="numbers">
      <summary>{t.common.showNumbers}</summary>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Method notes: present for anyone who wants them, invisible for everyone else. */
export function About({ children }: { children: ComponentChildren }) {
  return (
    <details class="about">
      <summary>{t.common.about}</summary>
      <div class="about-body">{children}</div>
    </details>
  );
}

export function SourceList({ sources }: { sources: OfferSource[] }) {
  if (sources.length === 0) return null;
  const ok = sources.filter((s) => s.status === 'ok').length;
  return (
    <details class="about">
      <summary>{t.common.sources(ok, sources.length)}</summary>
      <ul class="sources">
        {sources.map((s) => (
          <li key={s.url}>
            <span class={`status status-${s.status}`}>{t.common.status[s.status]}</span>
            <a href={s.url} target="_blank" rel="noreferrer">
              {localized(s.provider, s.providerDe)}
            </a>
            {s.note ? <span class="source-note">{localized(s.note, s.noteDe)}</span> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Holds the space an ECB chart will take, so nothing jumps when it arrives. */
export function Pending({ error, height = 300 }: { error?: string; height?: number }) {
  return (
    <div class={`pending${error ? ' failed' : ''}`} style={{ height: `${height}px` }}>
      {error ? t.common.ecbFailed(error) : t.common.ecbLoading}
    </div>
  );
}
