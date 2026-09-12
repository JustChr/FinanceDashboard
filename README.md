# ALM Desk — Austria

A dashboard for Austrian retail bank pricing: housing loans, savings and term
deposits, and consumer credit — by interest rate fixation, over time, and
against what banks are advertising today. Runs on GitHub Pages with no backend.

## The three layers

The whole dashboard is organised around one distinction, because most published
"interest rate" figures quietly mix these up:

| Layer | What it measures | Freshness |
| --- | --- | --- |
| **Benchmark** | What money costs the bank — ECB policy rates, €STR | Daily |
| **Concluded** | What was actually agreed, every euro volume-weighted — ECB MIR | Monthly, ~5 week lag |
| **Advertised** | What a bank is offering right now, often to new money only | Daily scrape |

A headline rate quoted without saying which of the three it is tells you very
little. The distance between them is most of the analysis here.

## What it shows

**Housing loans** — the rate fixation ladder (variable/≤1Y, 1–5Y, 5–10Y, >10Y)
today and back through the cycle; front book against back book, with how long
the stock would take to catch up; whether renegotiating beats a new contract;
monthly lending volumes; and the fee load the APRC adds over the headline rate.

**Savings & deposits** — term deposits by agreed maturity, what instant access
costs a saver, new business against the outstanding book, and cumulative deposit
beta by product.

**Consumer credit** — fixation bands, overdrafts, and the fee load, which is an
order of magnitude larger here than on a mortgage.

**Bank offers** — advertised savings, term deposit and consumer loan rates from
each provider's own condition page, with the best offer set against the ECB
average for the same kind of money.

## Data sources

### ECB Data Portal (live, in the browser)

The API is public, key-less and sends `Access-Control-Allow-Origin: *`, so the
browser calls it directly and the whole site stays static.

```
Browser ──fetch──▶ data-api.ecb.europa.eu/service/data/{dataflow}/{key}
```

- **MIR** — MFI interest rate statistics, back to January 2003.
- **EST** — €STR, daily. **FM** — ECB key rates and monthly Euribor.

Three MIR dimensions carry the analysis, and all three are easy to misread:

- `MATURITY_NOT_IRATE` is the **initial rate fixation period** on new business
  but the **original maturity** on outstanding amounts. Labelling an outstanding
  breakdown as a fixation period is wrong, and the codes look identical.
- `DATA_TYPE_MIR` selects the agreed rate (`R`), the APRC including fees (`C`),
  or new-business volume (`B`). Volumes exist **only at the un-split total**, so
  there is no volume mix per fixation band from this source.
- `IR_BUS_COV` separates new business (`N`), new business excluding
  renegotiations (`P`), renegotiated loans only (`R`) and the outstanding stock
  (`O`). `N` versus `O` is the front-book/back-book split.

### Bank condition pages (scraped daily, committed)

No public API anywhere publishes Austrian bank product rates, and bank sites
send no CORS headers, so the browser cannot read them. Instead
[`.github/workflows/offers.yml`](.github/workflows/offers.yml) runs
`scripts/scrape` once a day, writes `public/data/offers.json` and commits it;
the page loads that file same-origin.

Currently covered: Addiko Bank, Anadi Bank, bank99, easybank and Kommunalkredit
Invest on the deposit side, and bank99 on consumer credit.

## Two traps worth knowing

1. **The `ICP` inflation dataset was discontinued in February 2026** and is
   frozen at December 2025. The replacement is the `HICP` dataflow, whose
   provider dimension changed from `4` to `4D0`.
2. **`detail=dataonly` is not optional at this scale.** ECB CSV repeats the full
   `TITLE_COMPL` on every observation row, and the API serves no content
   encoding — the full catalogue since 2003 is several megabytes at
   `detail=full`. This is also why the default history window is ten years and
   "Since 2003" is opt-in.

## Working on the scraper

```bash
npm run scrape                                   # rebuild public/data/offers.json
npm run inspect -- https://www.addiko.at/festgeld/   # see what text a page exposes
```

Adapters live in [`scripts/scrape/sources.mjs`](scripts/scrape/sources.mjs) as
regex probes matched against the page flattened to text — deliberately not CSS
selectors, which break on every redesign, while the words next to a rate do not.
Three rules keep the board honest:

- A rate is published only if a probe matched **and** the value is plausible for
  its category. A broken probe yields nothing rather than something wrong, and
  the source shows as `partial` or `failed` on the page.
- Anything unscrapeable falls back to a hand-checked entry in
  `scripts/scrape/curated.json`, carrying the date a human last confirmed it.
  Entries older than a fortnight grey out as stale.
- Every figure keeps the URL it came from, linked from the board.

If a page prints almost no text under `npm run inspect`, it is client-rendered
and no probe will reach it.

### Why there are no housing loan offers

Austrian banks publish savings rates as firm numbers but price mortgages through
credit-scored calculators — the rate depends on the borrower, the property and
the loan-to-value, so no comparable figure is published to scrape. Rather than
fill the gap with a broker's proprietary index or a representative example whose
assumptions differ by bank, the mortgage board is empty by design and the
housing analysis rests on the ECB series, which is actual concluded business
broken down by fixation period. Add an entry to `curated.json` only from a
bank's own published example under HIKrG, with its source URL.

## Deliberate omissions

- **Daily Euribor** — licensed by EMMI; free access is delayed, registration-
  gated and non-commercial. The ECB's freely-published *monthly* Euribor is
  shown instead, with €STR as the daily benchmark.
- **EUR swap rates** — no free daily source. The ECB AAA yield curve is a
  reasonable proxy when that panel is added.
- **Comparison-portal indices** — the Infina Kredit Index and similar are
  proprietary, and redistributing them is not something a public dashboard
  should do. Bank-sourced pages only.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production bundle
npm run preview    # serve the built bundle
```

Deployment is automatic: pushing to `main` triggers
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds and
publishes to Pages. Enable it once under **Settings → Pages → Source → GitHub
Actions**. The offer-refresh workflow needs no setup beyond default
`contents: write` permissions.

## Next

- Curves panel: AAA and all-issuer yield curves, 3M–30Y
- Austrian sovereign spread versus Bund
- Inflation panel on the new `HICP` dataflow, for real rather than nominal rates
- More offer providers, especially any bank that publishes a static mortgage
  rate card
