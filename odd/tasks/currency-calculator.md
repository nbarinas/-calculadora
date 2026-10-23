# Currency Calculator — COP / USD / VES / EUR

Static PWA that converts between COP, USD, VES and EUR using five rates: BCV and Binance P2P (USDT/VES), the
BCV euro and the parallel euro, and the TRM.
Published free on GitHub Pages. Built for a trip from Bogota to Venezuela.

Status: in progress. Owner decisions are frozen in `## Log`.

## Specs

**S1 — Four currencies, any direction.**
The user enters an amount and a source currency (COP, USD, VES or EUR) and sees the result in the other
three.
> "con el bcv y el precio de binance con los precios de bs" / "con el precio del dolar en trm tambien porque vivo actualmente en bogota colombia" / "puedes agregar el euro tambien, en todo en boton y que cruce todo, pero todo en venezuela"

**S2 — Every rate, always shown in parallel.**
BCV (official VES), Binance P2P USDT/VES (the parallel rate that is actually used on the street), TRM (official COP),
and — since the euro request — the two Venezuelan euro readings, BCV oficial y paralelo.
No rate is hidden or pre-selected as "the real one".
> "con el bcv y el precio de binance con los precios de bs ... con el precio del dolar en trm tambien"

**S3 — Stack: static PWA, no build step, no npm dependencies.**
No bundler, no `package.json`, no `node_modules`: the page loads plain scripts and runs from the raw files.
What ships to the browser is `index.html`, `styles.css`, `calc.js`, `app.js`, `sw.js`, `manifest.webmanifest`,
`rates.json` and the two generated icons. The repository also carries the tooling S4 needs (`scripts/`,
`.github/workflows/`) and the tests (`tests/`), which never reach the browser.
> "HTML + PWA, sin build"

**S4 — Rates refresh through GitHub Actions.**
A cron workflow fetches the three sources every 30 minutes and writes `rates.json` into the repository.
The page reads its own `rates.json` from the same origin, so there is no CORS problem and no server.
> "Actions cada 30 min → rates.json (recomendado)"

**S5 — Scope: basic converter only.**
Amount + source currency → the other two, computed with all three rates in parallel.
Explicitly out of scope: BCV-vs-Binance loss comparison, and any expense/trip list.
> "Conversor básico"

**S6 — Manual fallback and offline cache.**
All three rates are editable by hand. The UI always shows when the rates were last updated.
The last known rates are cached on the device so the calculator keeps working with no internet.
> "voy a ir a viajar a venezuela y quiero sacar la cuenta facil"

**S7 — Free publication on GitHub Pages.**
Public repository, GitHub Pages, no paid service, no server, no API keys.
> "me gustaria cargar en gihutb para no pagar nada"

**S8 — Refresh on demand, from the page itself.**
A button in the page asks the three sources directly and updates what it shows, without waiting for the scheduled
workflow. Binance P2P cannot be reached from a browser: its preflight answers without CORS headers, so the live path
uses DolarApi for both Venezuelan rates, which publishes the same parallel reference. A source that does not answer
keeps the value it already had and is marked stale.
> "pero que tenemos que hacer para que si se actulice asi sea con un boton?"

**S9 — The euro, quoted in Venezuela and in bolívares.**
The euro enters as a fourth currency with two Venezuelan readings, both quoted in Bs per EUR: the official
one (`ve.dolarapi.com/v1/euros/oficial`, the BCV euro) and the street one (`ve.dolarapi.com/v1/euros/paralelo`).
There is no Venezuelan EUR/USD of its own, so crossing the euro against USD and COP necessarily passes through
the bolívar leg. Both euro rates are editable by hand like the other three, and both are refreshed by the
"Actualizar ahora" button: both endpoints answer `Access-Control-Allow-Origin: *` (measured, L13).
> "puedes agregar el euro tambien ... pero todo en venezuela"

**S10 — Coherent pairs: oficial with oficial, paralelo with paralelo.**
Every conversion that involves the euro, the dollar or the bolívar runs along one of two paths, and a path
never mixes an official rate with a parallel one:

| Path | Bs per USD | Bs per EUR |
|---|---|---|
| oficial | `bcv` | `eur_bcv` |
| paralelo | `binance` | `eur_paralelo` |

USD↔EUR along a path is the ratio of that path's two rates. COP stays anchored to USD by the TRM, which is
Colombia's, so COP↔USD is path-independent and keeps its single line. Every other conversion shows one line
per path, which is the same shape the bolívar rows already had: nothing is chosen for the user.
> "que cruce todo, pero todo en venezuela" / decision: "Parejas coherentes: oficial con oficial"

## Tasks

| ID | Task | Specs | Route | Commit |
|----|------|-------|-------|--------|
| T1 | Verify the three rate sources live and freeze their response shape | S2 | inline (bounded probe) | n/a — evidence in L6 |
| T2 | Rate fetch script, `scripts/fetch_rates.py`, stdlib only | S4, S2 | inline | `62a56b5` |
| T3 | GitHub Actions cron workflow writing `rates.json` | S4 | inline | `62a56b5` |
| T4 | Converter page: input, currency switch, three parallel results | S1, S2, S5 | inline | `2a59617` |
| T5 | PWA: manifest, service worker, offline cache | S3, S6 | inline | `4e73c01` |
| T6 | Manual rate override + last-updated indicator | S6 | inline | `2a59617` |
| T7 | Independent verification against S1-S7 | all | `gentle-ai-verify` | n/a |
| T8 | Publish: repository, Pages, push | S7 | user-owned | n/a |
| T9 | Manual check on a real phone: type a rate by hand, then reload with the network off | S6 | user-owned | n/a |
| T10 | Fix and cover the three findings of the independent verifier | S6, S4 | inline | `2a59617` |
| T11 | Close the advisories the re-verification left | S6, S4 | inline | `2a59617` |
| T12 | Native review of the candidate | all | provider-owned | n/a |
| T13 | Refresh button inside the page | S8 | inline | `63e684a` |
| T14 | Serve the shell stale-while-revalidate so a deploy reaches an installed client | S6 | inline | `050c58c` |
| T15 | Two euro fetchers in `scripts/fetch_rates.py` | S9, S4 | inline | `f3fca53` |
| T16 | `calc.js`: four currencies crossed by path, euro rates in the file and live | S1, S9, S10 | inline | `34799dd` |
| T17 | Page: euro tab, five rate rows, one labelled line per path | S1, S2, S9, S10 | inline | `34799dd` |
| T18 | Tests for the pair rule, the 4×4 matrix and both fetchers | all | inline | `34799dd`, `f3fca53` |
| T19 | Independent verification of the euro work | S1, S2, S9, S10 | `gentle-ai-verify` | n/a — verdict in L14 |
| T20 | Commit, push and the phone check with a euro amount | S7, S6 | user-owned | `34799dd`, `f3fca53`, `pending` |

## Log

**L1 — Original request (verbatim).**
> "quiero hacer una calculadora sencilla, con el bcv y el precio de binance con los precios de bs, ya que voy a ir a viajar a venezuela y quiero sacar la cuenta facil, con el precio del dolar en trm tambien porque vivo actualmente en bogota colombia y me gustaria cargar en gihutb para no pagar nada, que me propones"

**L2 — Design decisions (first round).**
- Stack: "HTML + PWA, sin build (recomendado)"
- Rates: "Actions cada 30 min → rates.json (recomendado)"
- Scope: "Conversor básico"

**L3 — Environment decisions (second round).**
- Shell: user runs `/reload` to switch pi from legacy WSL bash to Git Bash.
- Repo: user creates it on github.com/new; the parent configures the remote and pushes.
- Git identity: repository-local only; user supplies name and email in chat.

**L4 — Environment incident (resolved, root cause known).**
`bash` tool hung on every command. Root cause: `getShellConfig` in pi's `dist/utils/shell.js` resolves
Git Bash only under `%ProgramFiles%` / `%ProgramFiles(x86)%`; this machine has a per-user Git install at
`%LOCALAPPDATA%\Programs\Git`, so pi fell back to `C:\Windows\System32\bash.exe` (legacy WSL bash) and paid
the WSL2 VM cold start with no timeout. Fix: explicit `shellPath` in `~/.pi/agent/settings.json` + `/reload`.
`gh` CLI is not installed; Linux `node` is absent (Windows `node`/`npm` only reachable through interop).

**L5 — Open items (must be resolved before the write they block).**
- UI copy language — Spanish or English. Blocks T3.
- Git identity values (name + email) and the repository URL. Blocks the first commit.
- Binance P2P may rate-limit or block GitHub Actions runner IPs. Residential probe result is not proof for CI.

**L6 — Rate source verification (live probe, 2026-10-14, Bogota). Frozen contract for T2.**

| Source | Endpoint | Response shape | Notes |
|--------|----------|----------------|-------|
| TRM | `https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde DESC` | `[{"valor":"3181.74","vigenciadesde":"2026-10-14T00:00:00.000"}]` | Plain JSON, dot decimal, no API key. |
| BCV official | `https://ve.dolarapi.com/v1/dolares/oficial` | `{"promedio":877.9023,"fechaActualizacion":"2026-10-14T00:00:00-04:00"}` | This is the BCV rate, pre-aggregated. |
| BCV direct | `https://www.bcv.org.ve/` | HTML, rate inside `<div id="dolar">` | Returns HTTP 200 with `curl -k` (154393 bytes). **Fails TLS validation: the server does not send the intermediate certificate** (`SSL certificate problem: unable to get local issuer certificate`). Not a geo-block, not a DNS problem. |
| Binance P2P | `POST https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search`, body `{"asset":"USDT","fiat":"VES","merchantCheck":false,"page":1,"payTypes":[],"publisherType":null,"rows":N,"tradeType":"BUY"\|"SELL"}` | `data[].adv.price` | `"000000"` code on success. |
| DolarApi parallel | `https://ve.dolarapi.com/v1/dolares/paralelo` | `{"promedio":1010.313526,...}` | Corroborates Binance P2P. |

Measured values and the two findings that change the implementation:

1. **Buy/sell spread at top of book is 0.05%**, not the 1-3% assumed: `SELL` (USDT sold, VES received) = `1012.005`,
   `BUY` (USDT bought, VES paid) = `1011.500`. Both are recorded; neither is a guess.
2. **`data[0]` must never be used as "the Binance price".** The first `BUY` ad returned
   `minSingleTransAmount:151850` with `maxSingleTransAmount:151860` — an impossible amount band — posted to rank first.
   The fetcher aggregates over the top N ads (median) and ignores ads whose band is inverted or empty.
3. **Independent agreement:** Binance P2P `1011.500` vs DolarApi parallel `1010.3135` differ by 0.15%,
   which confirms two independent read paths for the same reality.
4. DolarApi answers with `access-control-allow-origin: *`, so a browser could call it directly and skip the workflow.
   **Deliberately not implemented:** it would re-open the already-closed S4 decision. Recorded as an available option only.

**Consequence:** all three primary sources are JSON over valid TLS. The originally proposed BCV HTML scrape is dropped
from the primary path; the scrape survives only as a `curl -k` fallback for the official rate.

**L7 — T2 verification (local run, 2026-10-14).**

`python3 scripts/fetch_rates.py` ran clean from the repository root: exit code 0, all three sources `ok`, and
`rates.json` written with `failed: []`.

```
ok   trm      3181.74  (datos.gov.co)
ok   bcv      877.9023  (ve.dolarapi.com)
ok   binance  1011.0   (p2p.binance.com)
```

Evidence that the median rule was load-bearing rather than decorative. Consecutive runs produced a live
market (`1012.005`, then `1010.775`, then `1011.0`) and the top-of-book relation **inverted**:

| Reading | SELL | BUY | Implied relation |
|---|---|---|---|
| First ad of each side | 1012.005 | 1011.500 | selling pays **more** than buying — economically wrong |
| Median of 20 ads | 1010.775 | 1012.4285 | selling pays **less** than buying — correct |

The first row is the broken top-ranked ad from L6. With medians the relation is coherent, so the misleading
`spreadPct` field was replaced by `roundTripPct = (buy - sell) / sell`, which reads `+0.1413` instead of a
negative "spread".

Still unverified: `.github/workflows/rates.yml` cannot be exercised until the repository exists (T8).
The `rates.json` shape the page consumes: `updatedAt`, `failed`, and one entry per source carrying
`value`, `asOf`, `source` and `stale`, plus `error` when stale and `sellMedian` / `buyMedian` / `samples` /
`roundTripPct` for Binance.

**L8 — Two different shells per tool, and a `python3` / `python` split (2026-10-14).**

The `bash` tool and `bash_background` do not share an environment:

| Tool | Shell | cwd | Python | Node |
|------|-------|-----|--------|------|
| `bash` (synchronous) | WSL bash, `Linux 6.6.87.2-microsoft-standard-WSL2` | `/mnt/c/...` | `python3` 3.12.3 | absent |
| `bash_background` | Git Bash, `MINGW64_NT-10.0-26200-ARM64` (MSYS) | `/c/...` | `python` only (Windows 3.11) | `node` present |

Cause: the background runner starts a fresh shell per job and therefore already honoured `shellPath`, while the
synchronous tool was still reusing the shell session created at startup with the old settings. `/reload` should
make both agree. Recorded because each consequence is a silent trap:

- `python3` does not exist in Git Bash, and `python` is not how the WSL interpreter is reached. Depending on which
  tool runs the command, one of the two names is simply wrong.
- `node` exists only on the Git Bash side, which is why `tests/run.js` runs through `bash_background`.
- The Actions workflow is unaffected: `python3` is correct on ubuntu-latest.
- `/tmp` is not shared between those worlds either. A file written to `/tmp` by one tool was already gone for the
  next call, so intermediate artefacts stay inside the project directory.

**L9 — T4 and T6 verification (2026-10-14).**

`node tests/run.js` -> **59 passed, 0 failed**, exit 0 (Node v24.21.0, run through Git Bash).

The tests were written after `calc.js`, so a green first run would prove little by itself. The parsing rules were
therefore compared against the rule they replaced:

```
1,000,000    regla vieja=1          regla nueva=1000000
1.234,56     regla vieja=1234.56    regla nueva=1234.56
1,000        regla vieja=1          regla nueva=1000
1000.5       regla vieja=10005      regla nueva=1000.5
```

The replaced rule was wrong on three of those four, reading one million as `1`. The assertions name the new values,
so they fail against the old code: the suite discriminates instead of agreeing with itself.

Then the whole page in a real browser: `python -m http.server` plus headless Edge over http with `--dump-dom`. All
four files answered 200, and `app.js` executed, fetched `rates.json` from its own origin and rendered live numbers:

```
En USD                                                      314,29
En Bs según la tasa
  BCV          referencia formal                           275.918,93
  Binance P2P  lo que te dan al vender USDT                317.750,66
Tasas actualizadas: 14/10/26, 1:00 p.m. (hace 7 min)
```

Hand-checked against the same rates, without the code: `1.000.000 / 3.181,74 = 314,2934`, then
`× 877,9023 = 275.918,9` and `× 1011 = 317.750,6`. Both figures match, so the arithmetic, the es-CO formatting,
the labelled VES leg and the single-line branch are confirmed by something other than the code that produced them.

The rendered panel confirmed three more things at no extra cost:

- `fecha valor 14/10/2026` for the BCV rate, whose timestamp carries a `-04:00` offset. Parsed as an instant in a
  Bogotá browser that would have read `13/10`. The date-only rule holds.
- Binance shows no `fecha valor`, which is right: a live P2P price has no published value date.
- The reset button stays hidden while no rate has been typed in.

The manual-override merge was untestable while it lived inside the DOM code, so it moved into `calc.js` as
`effectiveRates(fileRates, manual, keys)` and gained eight assertions: a typed value wins, it leaves the other rates
alone, and a zero or negative value is discarded in favour of the fetched one. After that refactor both checks were
repeated: 59 tests green, and the browser produced a byte-identical DOM (`dom bytes: 4194`) with the same three
figures, so the refactor moved no behaviour.

Still not verified, and not claimed as verified:

- Typing a rate by hand and the offline mode both need a real interaction, which `--dump-dom` cannot drive. That is
  T9, and it needs a person with the phone.
- `.github/workflows/rates.yml`, until the repository exists (T8).
- `grep -c` returns 1 when it finds nothing, so that background job exited 1 even though zero console errors is the
  desired outcome. The `0` it printed is the evidence, not the exit code.

**L10 — Independent verification, and the three findings it produced (2026-10-14).**

`gentle-ai-verify` ran as a read-only independent check. It returned a verdict per spec and, far more usefully,
three defects. All three are admitted. None is argued away.

**D1 — BLOCKER, S6: the rate reader inflated every Binance price a thousand-fold.**
`parseAmount('1011.500')` returned `1011500`. Every string in that finding is a price this project recorded in L6,
and the reachable path is the manual override — exactly the feature meant to rescue the user when the automatic
fetch fails. The root cause was mine: rule 3 of the amount reader ("one separator with three digits behind it is a
thousands group") is correct for amounts and catastrophic for rates, and I had built one reader for both.
Fix: the readers were split. `parseAmount` keeps the grouping rule, because amounts are written in groups.
`parseRate` treats the last separator as the decimal one, because a rate is quoted per US dollar and is therefore
small. The ambiguity is real — `1.000` means one thousand to one person and one to another — so it is not resolved
by yet another heuristic but displayed: `interpretationNote` shows `se lee como …` whenever the typed text contains
a separator and is not already what the app would have written. A silent thousand-fold misreading became something
visible while typing.

**D2 — advisory: the band filter did not reject the band it was written for.**
L6 called `151850–151860` an impossible band. It is not inverted, so the check for inversion let it through. The code
comment claimed more than the code did.
Fix: an ad is also dropped when its tradable range is narrower than 0.1% of its own minimum, and a median over
fewer than five usable ads is refused outright instead of being reported as a price.

**D3 — advisory: a `rates.json` of the wrong shape crashed the run.**
`_previous_rates` caught only `JSONDecodeError`, so a file holding `[]` or `{"rates": []}` raised
`AttributeError`/`TypeError` before anything was written.
Fix: every unexpected shape is treated as absent, and a previous value is kept only when it is a positive number.

**Spec correction.** S3 said "exactly these files" and named six. The implementation necessarily exceeds that,
because S4 needs the fetcher and the workflow, and verification needs tests. That sentence described an
implementation detail I invented rather than the user's decision, so S3 was rewritten to state the real constraint
(no build step, no npm dependencies) and to separate what ships to the browser from the repository tooling.

**Environment correction.** L8 said the synchronous `bash` tool is WSL. The verifier reported its own synchronous
`bash` as Git Bash, with `node` present and `python3` absent: the opposite of mine. So the shell depends on the
session and not only on the tool — a fresh session picks up `shellPath`, while this one still reuses the shell it
started with. Both readings stay on the record rather than one overwriting the other.

**Tests added for the three findings.** `tests/test_fetch_rates.py` (11 tests, `unittest`, no network, and it
replaces the fetchers so the real `rates.json` is never touched) pins the aggregation and previous-file rules,
including the exact L6 band. `tests/run.js` grew to cover `parseRate`, `interpretationNote`, and that every path
`sw.js` precaches exists on disk. `tests/dom-check.html` drives the real page through a same-origin iframe and types
`1011.500` into the rate field, because `--dump-dom` cannot type and that field is where the blocker lived.

**L11 — The advisories from the re-verification, closed (2026-10-14).**

The scoped re-verification closed D1 and confirmed D2 and D3, then left three advisories and one wrong comment. All
four were fixed.

1. **A false alarm in the note.** `$ 1.000.000` produced `se lee como 1.000.000`, even though that reading is the
   only sensible one. The note compared the raw text, currency symbol included, instead of the characters the parser
   actually read. A warning that cries wolf is worse than no warning, so `interpretationNote` now compares only
   `[0-9.,-]` and ignores everything else.
2. **A byte-order mark discarded a valid file.** `read_text(encoding="utf-8")` raised on a BOM, so a valid
   `rates.json` was treated as absent and a failing source lost its last good value. Now `utf-8-sig`.
3. **Infinity survived and was rewritten as invalid JSON.** `_kept_number` checked only positivity, so
   `{"value": Infinity}` was kept and written back as `Infinity`, which `JSON.parse` in a browser rejects. A new
   `_is_usable_value` requires a finite positive number and now guards both sides: a previous value and a freshly
   fetched one. A source answering with nonsense counts as a failed source instead of poisoning the file, and
   `allow_nan=False` makes emitting non-standard JSON impossible even by accident.
4. **The note was visible but not obvious in the other direction.** Typing `1.011` from Colombian habit read 1.011,
   a thousandfold error the opposite way, and the note merely said `se lee como 1,01`. Now, when the two possible
   readings are a hundredfold apart or more, both are printed: `se lee como 1.011,50 · la otra lectura es
   1.011.500,00` for the pasted Binance price, and `se lee como 1,01 · la otra lectura es 1.011,00` for the typed
   Colombian grouping. The ambiguity is not hidden; it is put in front of the person who can resolve it.
5. The comment in `tests/dom-check.html` claimed `1011.5` produces `317.907,77`; the real value is `317.907,81`. A
   wrong number in a comment is how a later reader learns to distrust the tests, so it was corrected.

Verification after these changes: **89 JS tests** and **15 Python tests**, both zero failures. The browser
interaction test now prints both readings and still computes `317.907,81` on `1011.5`, so the note change moved no
arithmetic. Console errors: `0`.

The new tests discriminate. Reproduced directly against the code they replaced:

```
banda de L6 (151850-151860): filtro viejo acepta=True   filtro nuevo acepta=False
codigo viejo con []                    -> AttributeError: 'list' object has no attribute 'get'
codigo viejo con {"rates": {"trm": 5}} -> TypeError: 'int' object is not iterable
```

Two advisories were deliberately left unfixed, with the reason recorded rather than the finding buried:

- A payload where every ad has a fixed-size band (`min == max`) fails the whole source, so a legal but very narrow
  offer is discarded. Real VES ads publish wide bands, and the alternative is letting an ad nobody can trade with
  define the price. A known trade-off, not an oversight.
- The verifier could not show RED-then-GREEN for the D1/D2/D3 tests because no baseline commit exists yet. The
  demonstration above is the substitute, and T8 will produce the commits.

**L12 — The user asked for a refresh button, and what a browser can actually reach (2026-10-14).**

> "pero que tenemos que hacer para que si se actulice asi sea con un boton?"

Before writing any code, the three endpoints were asked for their CORS headers, because the answer decides whether an
in-page button is possible at all:

| Endpoint | Reachable from a browser |
|---|---|
| TRM, `datos.gov.co` | yes — `Access-Control-Allow-Origin: *` |
| BCV, `ve.dolarapi.com/v1/dolares/oficial` | yes — `access-control-allow-origin: *` |
| parallel, `ve.dolarapi.com/v1/dolares/paralelo` | yes — `access-control-allow-origin: *` |
| Binance P2P | **no** — the OPTIONS preflight answers 200 with no `access-control-allow-*` header, so the browser blocks it |

That is why the live path asks DolarApi for both Venezuelan rates instead of Binance. It is not a downgrade: the two
were measured at `1010.3135` and `1011.500`, within 0.15%. The workflow keeps fetching Binance directly, where no browser
can block it, and each rate row shows the source that actually answered, so the page never claims a number came from a
place it did not.

Verified: 111 JS tests and 15 Python tests, both zero failures, and the button was clicked in a real headless browser,
which reached all three sources and reported `Tasas pedidas de nuevo, en vivo.` with the three source labels. Console
errors: 0. A structural check also confirmed that every id `app.js` looks up exists in `index.html`, which is the classic
way a new button silently does nothing.

Recorded for later, because it would otherwise be discovered as a surprise: the lineage `review-3da0e1ad3b41fe93` was
frozen on candidate tree `a0eef89`. These edits move the candidate content, so once they are committed that transaction
can no longer complete against the frozen revision and a fresh START would be needed. It was already blocked on the
missing reviewer model, so nothing is lost, but the fact is written down rather than remembered.

**L13 — The euro arrives, and the one decision it forces (2026-10-14).**

> "puedes agregar el euro tambien, en todo en boton y que cruce todo, pero todo en venezuela"

Read as: EUR becomes a fourth currency, in the currency buttons, converting to and from the other three,
with every euro number quoted the Venezuelan way — in bolívares.

Before designing anything, the endpoints were asked, because "in Venezuela" narrows the sources to what
Venezuela actually publishes, and a browser button can only use what answers with CORS:

| Endpoint | Answer | `Access-Control-Allow-Origin` | `promedio` (Bs per EUR) |
|---|---|---|---|
| `ve.dolarapi.com/v1/euros/oficial` | 200 | `*` | `982.75895071` (asOf 14/10/2026, date only) |
| `ve.dolarapi.com/v1/euros/paralelo` | 200 | `*` | `1125.469688` (live) |

With the two dollar rates already known (`bcv` 877.9023 and the parallel 1009.697123), the two implied
EUR/USD crosses are `1.11944` (oficial) and `1.114661` (paralelo). Two independent readings of the same
reality landing 0.4% apart is what makes the cross a measurement and not an invention. `982.75895071 /
877.9023` cannot be produced by accident, and neither cross is a number this project picked.

The decision the euro forces: **the euro is only ever quoted in bolívares**, so EUR↔USD and EUR↔COP have to
pick which dollar to divide by, and that choice is a product decision, not an implementation detail. Three
options were put to the owner with their real numbers for `10 EUR → COP`: `35.617,67` (oficial), `35.465,60`
(paralelo), or the four mixed combinations including `30.962,27` and `40.791,70`, which cross a formal
market with a street one.

Owner decision, verbatim: **"Parejas coherentes: oficial con oficial"** — the euro BCV crosses with the BCV
dollar and the street euro with the street dollar, never mixed. That is the same rule S2 already froze
(nothing is hidden, nothing is elected "the real one"), applied one level down: not only every rate is
shown, every rate is shown only next to a coherent partner. Cost accepted with it: five rate rows instead of
three, and two lines wherever the euro or the bolívar is involved.

Frozen contract for T15-T18 — `rates.json` gains two keys with the same entry shape as the rest (`value`,
`asOf`, `source`, `stale`, plus `error` when stale):

| Key | Meaning | Source |
|---|---|---|
| `eur_bcv` | Bs per EUR, official | `ve.dolarapi.com` (euros/oficial) |
| `eur_paralelo` | Bs per EUR, street | `ve.dolarapi.com` (euros/paralelo) |

and the paths that pair them: `oficial` = (`bcv`, `eur_bcv`), `paralelo` = (`binance`, `eur_paralelo`).
`convert()` changes its fifth argument from `vesSource` to `path`, because the thing being chosen is no
longer which bolívar rate but which coherent pair; the assertions that pinned the old argument are renamed
rather than deleted, and `COP↔USD` still takes `null`.

**L14 — T15-T18 built, and what each check actually showed (2026-10-14).**

**RED, then GREEN, for the fetcher.** The seven new Python tests were written first and observed failing:
`ERROR fetch_eur_bcv / fetch_eur_paralelo` (the functions did not exist), `FAIL the five rates are the ones
that get fetched`, and the pre-existing "every source down" test, which had been killing three of five
sources and therefore no longer proved its own name. After the two fetchers and the `SOURCES` entries: **22
tests, OK**.

**The new JS assertions discriminate, and that needed its own proof.** The first attempt at showing RED was
inconclusive and the reason is worth recording: run against the pre-euro `calc.js`, the suite *aborts* on
`TypeError: Cannot read properties of undefined (reading 'oficial')` before it can report a single `FALLA`,
so "0 failures" there would have been read as "the tests pass on the old code" — the exact opposite of the
truth. A probe that catches per rule was used instead, against `git show HEAD:calc.js` and against the new
file:

| Rule | calc.js de HEAD | calc.js nuevo |
|---|---|---|
| `RATE_KEYS` | `undefined` | las cinco claves |
| `100 EUR -> Bs`, pareja oficial | `null` | `90000` |
| `100 EUR -> USD`, oficial / paralela | `null` / `null` | `112.5` / `110` |
| el euro de calle no mueve la línea oficial | `null` | `112.5` |
| `1.000.000 COP -> USD` sin camino | `250` | `250` |
| destinos desde COP (líneas) | `[1,2]` | `[1,2,2]` |

Every euro rule is absent or `null` before and correct after, while the one behaviour that had to survive
(`COP→USD = 250`, no path, no bolívar rate) reads identically in both columns.

**A real bug of my own, found by the suite.** The first cut of `convert()` required the bolívar leg for
`COP↔USD` and returned `null` for the pair that needs no path at all: 8 of the 113 existing assertions went
red at once. `convert()` now returns `amount / trm` for that pair before it looks at any path, and a test
pins it (`COP a USD sigue sin necesitar ningún camino`).

**The fetcher against the live sources.** `python scripts/fetch_rates.py` ran clean and wrote both euro keys
into `rates.json`: `eur_bcv` `982.75895071` (asOf 14/10/2026, date only) and `eur_paralelo` `1125.469688`,
`failed: []`. Binance P2P was asked directly for EUR/VES and answered `{"code":"000000","data":[],"total":0}`,
which is what makes the street euro a DolarApi-only reading and is recorded in the code rather than left as
an assumption.

**The page, in a real browser.** `python -m http.server` plus headless Edge over http on
`tests/dom-check.html`, extended for the euro:

```
pestanas de moneda: ["COP","USD","VES","EUR"]
claves de las cinco tasas: ["trm","bcv","binance","eur_bcv","eur_paralelo"]
destinos desde EUR: ["En COP según la tasa","En USD según la tasa","En Bs según la tasa"]
etiquetas en Bs: ["Euro BCV","Euro paralelo"]
10 EUR a Bs: ["9.827,59","11.254,7"]
EUR a USD oficial antes: "11,19"
EUR a USD oficial despues: "11,19"      <- el euro de calle movido a mano no la toca
EUR a USD paralelo despues: "19,78"
10 EUR a Bs con el paralelo a mano: ["9.827,59","20.000"]
estado del boton: "Tasas pedidas de nuevo, en vivo."
```

`9.827,59` is `10 × 982.75895071` and `11.254,7` is `10 × 1125.469688`, hand-checked against the file, so the
two lines are the two euro readings and not one number relabelled. The manual override moving only its own
line is S10 verified through the UI, not through `convert()`. The refresh button reached all five sources
from the browser, and the five `rate-meta` lines name the source that answered each one.

**Independent verification (T19).** `gentle-ai-verify` returned **S1, S2, S9, S10: Met**, no blockers, and
three advisories. Two were closed:

1. A literal `0` passed `isNumber` in the new `pathRate`, so `{eur_bcv: 0}` produced `Infinity`; the same gap
existed in the baseline `convert`. Both sides now use one `usableRate` guard (finite and positive) with five
assertions, including the TRM one. A zero rate is a missing rate written wrong, and `Infinity` is the silent
lie about money this app must not tell.
2. `manifest.webmanifest` still named the app `COP · USD · Bs` while the page had already added the euro.

One was left as it stands: `app.js` labels the `binance` line "Binance P2P" even when the live refresh filled
it from DolarApi. That is the S8 decision recorded in L12, unchanged by this work, and the rate row shows the
real `source` next to it.

The verifier's own probe over all twelve ordered pairs — move the whole street market, the official line must
not move; move the official market, the street line must not — is kept as a permanent test rather than left
in its report, because it is the strongest form of S10: it does not check a case, it checks every pair.

**Final state of the checks.** 189 JS tests and 23 Python tests, zero failures; the browser run above on the
final candidate; `rates.json` with five keys and `failed: []`. `gentle_review` assess reported `risk: high`
(`process_boundary` in `scripts/fetch_rates.py`, which the cron executes with `contents: write`) and
`reviewDue: true`.

Not verified, and not claimed: the phone check with a euro amount (T20, needs the owner), and the workflow
itself — it still has never run, so the euro keys reaching `rates.json` every 30 minutes rests on a local run
of the same script and on the Actions job being exercised for the first time by hand.

**L15 — The euro work committed, and the two decisions this session added (2026-10-23).**

The owner asked for a review of the repository and then for the euro, not knowing the euro was already built and
sitting uncommitted. The answer was the state, not a second implementation: T15-T18 were complete and green
(189 JS + 23 Python on the tree), and what remained was T20 — commit, publish, phone.

**Slice boundary.** Three commits, cut so that no intermediate commit is broken. The obvious split (engine, then
page, then data) does not work: `app.js` reads `line.path`, which only the new `calc.js` produces, so a commit
holding `calc.js` alone would render unlabelled lines in a deployed tree. The cut therefore follows the contract
change rather than the file type:

| Commit | Holds | Authored lines |
|---|---|---|
| `34799dd` | `calc.js`, `app.js`, `index.html`, `styles.css`, `tests/run.js`, `tests/dom-check.html` | 483 |
| `f3fca53` | `scripts/fetch_rates.py`, `tests/test_fetch_rates.py`, `rates.json` | 200 |
| (this commit) | `manifest.webmanifest`, `sw.js`, `README.md`, this document, `.gitignore` | 240 |

The first slice runs past the ~400-line guideline because the engine and the page that consumes it cannot be
separated without a red commit; recorded here instead of hidden. The fetcher keeps its own commit, alone, because
`gentle_review` assess reported `risk: high` for `process_boundary` and a reviewer must be able to take it without
the rest.

**Personal documents removed from the repository.** `Carta presentacion.pdf` and `carta-tendero/` were untracked in
the repository root. This repository is public, so a single `git add .` would have published a cover letter. Owner
decision: move them out. They now live in `C:\Users\Ciencia de DAtos\Desktop\calculadora-privado\`, and `.gitignore`
names both paths so a later copy cannot be committed by accident.

**Native review deliberately not run for this candidate.** `gentle_review` assess reported `reviewDue: true` and
`risk: high`, and the owner chose "Commit y push" over the option that included a native review. That is an
explicit owner decision for this candidate, recorded rather than silently omitted: the euro work rests on
`gentle-ai-verify`'s verdict in L14, the two green suites, and the browser run — not on a provider review. A future
candidate touching `scripts/fetch_rates.py` still owes that review.
