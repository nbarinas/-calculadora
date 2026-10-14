# Calculator: COP · USD · Bs

One static page for a trip from Bogotá to Venezuela: convert between Colombian
pesos, US dollars and bolívares with the three rates side by side.

| Rate | What it is |
|------|------------|
| TRM | Colombia's official reference rate, from datos.gov.co |
| BCV | Venezuela's official rate |
| Binance P2P | the USDT/VES parallel rate that is actually used in the street |

The page shows all three. The BCV rate is the formal reference, and in practice
people in Venezuela deal at the parallel rate, so the calculator never picks one
for you: it labels every line with the rate it used.

## How the rates get there

No server, no database, no API keys, no paid plan.

```
GitHub Actions (every 30 min)  ->  scripts/fetch_rates.py  ->  rates.json
                                                                    |
                                            the page reads its own rates.json
```

Because the page reads `rates.json` from its own origin, there is no CORS
problem, and GitHub Pages serves the whole thing for free.

If a source is down, the fetcher keeps the previous value and marks it `stale`
instead of destroying the file, and the page falls back to the copy it cached in
`localStorage`. Every rate can also be typed in by hand.

## Local development

```sh
python3 -m http.server 8765     # then open http://localhost:8765/
```

Refresh the rates without waiting for the schedule:

```sh
python3 scripts/fetch_rates.py
```

Regenerate the PWA icons:

```sh
python3 scripts/make_icons.py
```

## Tests

```sh
node tests/run.js
```

## Notes that cost real debugging time

- **bcv.org.ve does not send its intermediate TLS certificate.** A normal request
  fails with `SSL certificate problem: unable to get local issuer certificate`.
  That is a broken certificate chain, not a geo-block, and not a DNS problem.
  `scripts/fetch_rates.py` therefore uses dolarapi.com for the official rate and
  keeps the direct BCV request only as a fallback with verification disabled.
- **The first Binance P2P ad is not the price.** A top-ranked ad was returned with
  `minSingleTransAmount` above `maxSingleTransAmount`, an amount band nobody can
  trade with. The script takes a median over the top 20 ads and ignores ads whose
  band is inverted or empty.
- **Selling USDT always returns less than buying it.** Reading a single ad of each
  side implied the opposite, which is how the median rule was found. The file
  reports `roundTripPct`, a positive number, rather than a "spread" that would be
  negative in normal market conditions.
- **`python3` and `python` are not interchangeable** when the same repository is
  used from WSL and from Git Bash on Windows. The workflow always uses `python3`,
  which is correct on the ubuntu runner.
