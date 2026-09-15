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

One page per product, each built the same way: what banks advertise today, how
those offers moved, and what was actually concluded according to the ECB. One
row of controls — rate basis, lenders, tax — scopes every chart on the page, and
every chart's numbers sit behind a collapsed *Show numbers*.

**Housing loans** — every advertised quote plotted by fixation period against
the ECB concluded average for its bucket; click a fixation to follow its
history, with the latest repricings listed underneath. The ECB panel switches
between the fixation ladder, new against outstanding loans, renegotiations, the
APRC fee load and lending volume.

**Savings** — advertised rates by term (on a square-root axis, so 1–12 months
stay readable) against the ECB maturity buckets, optionally after 25% KESt, with
each term's history. The ECB panel covers products, new against outstanding
deposits, pass-through of the deposit facility rate, and volume.

**Consumer credit** — the published representative examples, and ECB rates by
fixation, against the APRC and against other household lending.

**Rates & ECB** — policy rates, €STR and Euribor, bank margins over €STR, and
Austria against the euro area for every series as small-multiple dumbbells.

Offer history lives in `public/data/{housing,deposit,consumer}-history.json`.
Housing reaches back to 2017 through archive captures; savings and consumer
credit are recorded daily from 12 September 2026.

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

The two halves of the Austrian market publish differently, and the scraper reads
both:

- **Direct banks** — Addiko, Anadi, bank99, easybank, Kommunalkredit Invest —
  state their rates in HTML, one national rate per product.
- **Branch networks** — BAWAG P.S.K., Raiffeisen — publish only a
  *Konditionenaushang*, the PDF rate sheet they are legally obliged to display.
  `scripts/scrape/pdf.mjs` extracts those without a PDF library.

That distinction is not cosmetic. The best advertised instant-access rate is
around 220 bp above the best branch-network rate for the same money, and the ECB
volume-weighted average sits near the branch end — because that is where most
Austrian retail deposits are. A board covering only direct banks would make the
market look far better priced than it is.

**Raiffeisen and the Sparkassen are not single banks.** Raiffeisen is roughly
three hundred legally independent local cooperatives, each publishing its own
Schalteraushang, so there is no such thing as "the" Raiffeisen savings rate. Two
are carried here under their real names, and the same branded product pays
materially different rates at each.

Three institutions cannot be covered, and the board says so on the page rather
than omitting them:

| Institution | Why |
| --- | --- |
| Erste Bank / Sparkasse | Rates render client-side; the published Konditionenaushang covers fees, not interest |
| UniCredit Bank Austria | Rejects any request identifying itself as automated, and blocks its own robots.txt |
| Volksbank | Eight independent regional banks; the group site carries no figures |

Bank Austria returns content only if the request sends no user agent at all.
Getting past a block by dropping identification is not something this scraper
does, so it is listed as unavailable instead.

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
regex probes matched against the document flattened to text — HTML and PDF both
reduce to the same shape, so one probe style covers both. Deliberately not CSS
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

Two things about PDF rate sheets are worth knowing before writing a probe. They
position every glyph separately, so a rate arrives as `1, 5 00 %` — probes match
digits with optional internal spaces and `parseRate` strips them. And accessible
PDFs emit their `/Lang` value into the text, so labels arrive as `de-DEBindung`
until stripped.

### Where housing loan offers come from

Austrian banks publish savings rates as firm numbers but price mortgages by
borrower, property and loan-to-value, so there is no rate card. The housing
board reads the two things banks do publish:

- **Representative examples** under §6 HIKrG — a worked example at one profile
  the bank picks, usually with a `Stand`. Comparable only loosely, since every
  bank picks a different loan.
- **Calculators**, read without running a browser. bank99, Bank Austria and
  Oberbank are asked for one fixed profile (€300,000 over 25 years) — bank99
  and Bank Austria across their fixation ladders, Oberbank's calculator being
  variable only. Bank Burgenland and Raiffeisen Bausparkasse publish rate tables
  in the calculator page itself. An offer with its own `url`, or a source with
  a `documents` flow (see `scripts/scrape/calculators.mjs`), is a calculator
  question, and the archive backfill skips both.

Requests identify themselves as `ALMDeskBot`, with named exceptions decided
explicitly: Bank Austria's and Raiffeisen Bausparkasse's calculator pages
refuse identified clients and are read with a browser user agent, and
Oberbank's eShop calculator is queried although its robots.txt disallows those
URLs. Nothing else is changed to get through: no challenge is solved, no
headless browser runs, each is asked once a day, and a refused day shows as
`failed`.

Comparison portals stay out: their terms forbid automated reading, and their
figures are broker-negotiated. Add an entry to `curated.json` only from a bank's
own published example or calculator, with its source URL.

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

The site is English at `/` and German at `/de/`: two HTML entries sharing one
bundle, so each has its own `lang`, title and description. The English page
sends browsers that prefer German to `/de/`, unless the visitor picked English
in the header, which is remembered. Every word on the
page lives in [`src/i18n/en.tsx`](src/i18n/en.tsx), and
[`src/i18n/de.tsx`](src/i18n/de.tsx) is typed against it, so a string added in
one language and forgotten in the other fails the typecheck. Numbers and dates
go through `src/lib/format.ts` (`3,45 %`, `300.000 €`, `Jän 2026`). Text the
scraper writes — offer conditions, source notes — carries a German twin
(`conditionsDe`, `noteDe`) next to the English.

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
