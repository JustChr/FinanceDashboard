# Roadmap

Status as of 2026-09-12. The MVP is live at
<https://justchr.github.io/FinanceDashboard/>.

## Shipped

- [x] Static architecture on GitHub Pages, no backend — the ECB Data Portal is
      key-less and CORS-open, so the browser fetches every series directly
- [x] Typed SDMX client with batched queries and an RFC4180 CSV parser
- [x] **Bank pricing & margin panel** — Austrian new-business loan and deposit
      rates vs the euro area, cumulative deposit beta, commercial margin over €STR
- [x] Deploy workflow on Node 24 Active LTS
- [x] **Advertised housing-loan history** — daily quotes kept as pricing episodes
      in `public/data/housing-history.json`, backfilled from Internet Archive
      captures (`npm run backfill`), shown on the Housing loans tab against the
      ECB concluded APRC

## Open — housing-loan coverage

- [ ] Most lenders publish only a variable example; Erste is the only fixed-rate
      ladder. Fixed-rate history needs more sources.
- [ ] Arbeiterkammer Wien's *Hypothekarkredite im Vergleich* surveys named
      banks' variable and fixed rates at two credit grades (2019, 2020, 2023,
      Jan 2025 editions; archive at emedien.arbeiterkammer.at). Periodic, not a
      feed — worth hand-entering as dated anchor points for fixed rates.
- [ ] BKS's archived pages predate its current wording and yield nothing; a
      second probe for the old layout would recover 2019–2025.

## Next — Curves panel

The highest-value addition, and mostly additive: these series are already
verified working against the API and need no new plumbing in the SDMX client.

- [ ] EUR AAA spot curve, 3M–30Y — `YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_{tenor}`
- [ ] All-issuer curve alongside AAA, so the credit component is visible
- [ ] Term-structure overlay: today vs 1W / 1M / 1Y ago
- [ ] Austrian sovereign 10Y and spread vs Bund — `IRS/M.AT.L.L40.CI.0000.EUR.N.Z`

Worth doing here: plot the **funding curve against the MIR loan rates already on
the dashboard**, so the lending margin is visible per tenor rather than only at
the €STR point.

## Then — News feed

ECB RSS is **not** CORS-enabled, so unlike everything else this cannot be a
browser fetch. It needs the second data path:

- [ ] Scheduled GitHub Actions workflow fetching ECB press releases, blog and
      speeches, plus OeNB
- [ ] Normalise to JSON, commit into the repo, serve as a static file
- [ ] Tag and filter by topic (policy decision, statistics release, supervision)
- [ ] Accept the latency: ~15 minutes, given the 5-minute cron floor and routine
      delays. Do not promise real-time.

This path also buys a free historical archive — git becomes the time-series
database — and a fallback render when a source is down.

## Then — Inflation panel

- [ ] HICP Austria vs euro area, headline and core — `HICP/M.{AT|U2}.N.000000.4D0.ANR`
- [ ] **Use the `HICP` dataflow, not `ICP`.** `ICP` was discontinued in February
      2026 and is frozen at December 2025; the provider dimension changed from
      `4` to `4D0`. Anything built from an older example serves stale data.

## Backlog

- [ ] Deposit volumes alongside rates (`MIR` `DATA_TYPE_MIR=B`) — a beta is far
      more meaningful weighted by the balance it applies to
- [ ] Repricing gap / maturity ladder view
- [ ] Selectable beta anchor date, to compare hiking vs easing cycle pass-through
- [ ] Per-panel loading states, so one slow dataflow does not block the page
- [ ] Cache responses in `sessionStorage` to cut repeat load times

## Blocked on licensing, not effort

Revisit only if this moves off a public repo — see the README for detail.

- Daily Euribor — EMMI subscription required
- EUR swap rates — no free daily source
- Covered bond / Pfandbrief spreads — iBoxx is proprietary
