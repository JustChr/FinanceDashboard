# ALM Desk — Austria

A finance dashboard for asset-liability management, focused on Austrian bank
loan and deposit pricing. Runs entirely on GitHub Pages with no backend.

## Why this works without a server

The ECB Data Portal API is public, key-less, and sends
`Access-Control-Allow-Origin: *`. The browser can therefore call it directly, so
the whole dashboard is a static bundle. Every series is fetched live on page
load — nothing is cached in the repository.

```
Browser ──fetch──▶ data-api.ecb.europa.eu/service/data/{dataflow}/{key}
```

## What it shows

| Panel | Question it answers |
| --- | --- |
| Deposit beta | How much of the ECB's rate moves has actually reached depositors? |
| Pass-through chart | Is the beta ratcheting up as rates fall? |
| Bank pricing table | What do Austrian banks charge and pay, versus the euro area? |
| Commercial margin | What does the bank earn over its marginal funding cost? |

The metric that matters most here is **cumulative deposit beta**. A rate level is
available anywhere; pass-through has to be computed, and it is what drives net
interest income through a cycle.

## Data sources

All series come from the [ECB Data Portal](https://data.ecb.europa.eu/):

- **MIR** — MFI interest rate statistics. Austrian and euro-area new-business
  loan and deposit rates. Monthly, roughly a five-week publication lag.
- **EST** — €STR, the euro short-term rate. Daily.
- **FM** — ECB key policy rates (daily) and Euribor (monthly).

### Two traps worth knowing

1. **The `ICP` inflation dataset was discontinued in February 2026** and is
   frozen at December 2025. The replacement is the `HICP` dataflow, whose
   provider dimension changed from `4` to `4D0`. Anything built from an older
   example silently serves stale inflation.
2. **`detail=dataonly` is not optional at this scale.** ECB CSV repeats the full
   `TITLE_COMPL` on every observation row, so seven years of the Austrian MIR
   block is 5 MB at `detail=full` versus 68 KB at `dataonly`.

## Deliberate omissions

These were left out of the MVP for licensing reasons, not technical ones:

- **Daily Euribor** — licensed by EMMI. Free access is 24-hour delayed,
  registration-gated, and non-commercial only; redistribution needs a paid
  subscription. The ECB's freely-published *monthly* Euribor is shown instead,
  with €STR as the daily benchmark.
- **EUR swap rates** — no free daily source. The ECB AAA yield curve is a
  reasonable proxy when that panel is added.
- **Covered bond spreads** — iBoxx is proprietary, with no free substitute.
- **Individual bank product rates** — would require scraping 20+ bank sites.
  The MIR aggregate is volume-weighted and analytically better anyway.

## Real-time expectations

GitHub Actions cron has a five-minute floor and is routinely delayed under load,
so genuine real-time market data is not achievable on Pages. It is also not
needed here: MIR is monthly, €STR publishes around 08:00 CET, and the yield curve
around midday. A future news panel would land in roughly 15 minutes via a
scheduled workflow, since ECB RSS is *not* CORS-enabled and cannot be fetched
from the browser.

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
Actions**.

## Next

- Curves panel: AAA and all-issuer yield curves, 3M–30Y, with 1W/1M/1Y overlay
- Austrian sovereign spread versus Bund
- ECB and OeNB news feed via a scheduled workflow
- Inflation panel on the new `HICP` dataflow
