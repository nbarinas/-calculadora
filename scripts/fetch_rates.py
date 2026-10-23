#!/usr/bin/env python3
"""Fetch the five exchange rates used by the calculator into rates.json.

Sources
    TRM      https://www.datos.gov.co/resource/32sa-8pi3.json    Colombia, official
    BCV      https://ve.dolarapi.com/v1/dolares/oficial          Venezuela, official
             fallback: https://www.bcv.org.ve/  (server omits its intermediate
             certificate, so that one request runs with an unverified context)
    Binance  https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search
             Venezuela, parallel: the rate actually used on the street
    Euro BCV https://ve.dolarapi.com/v1/euros/oficial             Bs per EUR, official
    Euro par https://ve.dolarapi.com/v1/euros/paralelo            Bs per EUR, street

Design rules
    * A failing source never destroys the file. The previous value is kept and
      flagged `stale`, so the calculator keeps working when a source is down.
    * The Binance price is a median over the sampled ads, never data[0]. The
      top-ranked ad is regularly a broken ad, for example with an inverted
      amount band, that only ranks first because of how it was posted.
    * The euro is quoted in Venezuela in bolívares, so its two readings come from
      DolarApi like the two dollar ones. Binance P2P cannot supply the street
      euro: asked for EUR/VES it answers `data: []`, `total: 0`, because that
      order book does not exist there.
    * Standard library only, so the GitHub Actions runner needs no install step.

Exit code is 0 unless every source failed, which keeps a partial failure visible
as a warning instead of turning the scheduled run red.
"""

from __future__ import annotations

import json
import math
import re
import ssl
import statistics
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "rates.json"

TIMEOUT = 25
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

TRM_URL = "https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC"
BCV_API_URL = "https://ve.dolarapi.com/v1/dolares/oficial"
BCV_SITE_URL = "https://www.bcv.org.ve/"
P2P_URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search"
EUR_BCV_API_URL = "https://ve.dolarapi.com/v1/euros/oficial"
EUR_PARALLEL_API_URL = "https://ve.dolarapi.com/v1/euros/paralelo"

# How many ads the median is taken over, and how far to look for the BCV figure.
BINANCE_SAMPLE = 20
BCV_LOOKAHEAD = 400

# A median over fewer ads than this is not a market, it is one stranger's advert,
# so the source is reported as failed instead of as a price.
MIN_BINANCE_SAMPLES = 5

# An ad whose tradable range is narrower than this fraction of its own minimum
# cannot be transacted at any meaningful size. That is what an ad posted only to
# rank first looks like: its amount band is decorative, not an offer. The band
# recorded in L6 (151850 to 151860) is not inverted, it is razor thin, and the
# earlier check for inversion did not catch it.
MIN_BAND_RATIO = 0.001


def _fetch(url, *, data=None, headers=None, insecure=False, timeout=TIMEOUT):
    """Return the response body as text. `insecure` skips TLS verification."""
    request = urllib.request.Request(
        url, data=data, headers={"User-Agent": USER_AGENT, **(headers or {})}
    )
    context = None
    if insecure:
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
        return response.read().decode("utf-8", "replace")


def _fetch_json(url, **kwargs):
    return json.loads(_fetch(url, **kwargs))


def fetch_trm():
    """Colombia's official rate. One row per business day, dot decimal."""
    rows = _fetch_json(TRM_URL)
    if not rows:
        raise RuntimeError("datos.gov.co devolvio una lista vacia")
    row = rows[0]
    return {
        "value": float(row["valor"]),
        "asOf": row.get("vigenciadesde"),
        "source": "datos.gov.co",
    }


def _fetch_dolarapi(url):
    """One DolarApi payload as a rate entry, in bolívares per unit.

    Shared by the four Venezuelan rates. The euro and the dollar arrive in the
    same shape and are therefore read by the same code; only the URL differs, and
    a euro read from the dollar endpoint would be a silent lie about money.
    """
    document = _fetch_json(url)
    return {
        "value": float(document["promedio"]),
        "asOf": document.get("fechaActualizacion"),
        "source": "ve.dolarapi.com",
    }


def fetch_bcv():
    """Venezuela's official rate, pre-aggregated, with the BCV site as fallback."""
    try:
        return _fetch_dolarapi(BCV_API_URL)
    except Exception as api_error:
        html = _fetch(BCV_SITE_URL, insecure=True)
        match = re.search(
            r'id="dolar".{0,%d}?([0-9]{2,3}(?:[.,][0-9]+)+)' % BCV_LOOKAHEAD, html, re.S
        )
        if not match:
            raise RuntimeError(
                f"dolarapi fallo ({api_error}) y el BCV no expuso la tasa"
            ) from api_error
        return {
            "value": float(match.group(1).replace(",", ".")),
            "asOf": None,
            "source": "bcv.org.ve",
            "note": f"dolarapi fallo, scrapeo del BCV: {api_error}",
        }


def fetch_eur_bcv():
    """The official euro, in bolívares: the BCV's own euro reference.

    Quoted per euro and not per dollar, which is why it is its own source and not
    a factor applied to the dollar rate.
    """
    return _fetch_dolarapi(EUR_BCV_API_URL)


def fetch_eur_paralelo():
    """The street euro, in bolívares.

    No order book corroborates this one: Binance P2P has no EUR/VES market, so
    the parallel euro is a single aggregation and is labelled as such on the
    page rather than presented as an average of venues.
    """
    return _fetch_dolarapi(EUR_PARALLEL_API_URL)


def _p2p_medians(trade_type, rows=BINANCE_SAMPLE):
    """Median USDT/VES price over the sampled ads of one P2P side.

    `SELL` is the side where we sell USDT, so it is what we receive in VES.
    `BUY` is what we would pay to obtain USDT.
    """
    body = json.dumps(
        {
            "asset": "USDT",
            "fiat": "VES",
            "merchantCheck": False,
            "page": 1,
            "payTypes": [],
            "publisherType": None,
            "rows": rows,
            "tradeType": trade_type,
        }
    ).encode()
    document = _fetch_json(
        P2P_URL,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    if document.get("code") != "000000":
        raise RuntimeError(f"binance respondio code={document.get('code')}")

    prices = []
    for item in document.get("data") or []:
        adv = item.get("adv") or {}
        try:
            price = float(adv["price"])
            lowest = float(adv["minSingleTransAmount"])
            highest = float(adv["maxSingleTransAmount"])
        except (KeyError, TypeError, ValueError):
            continue
        # An inverted or empty amount band cannot be traded with, so the ad is
        # not evidence of a price anyone can actually get.
        if price <= 0 or lowest <= 0 or highest <= 0 or lowest > highest:
            continue
        # Nor is a band too narrow to transact at any real size.
        if highest - lowest < lowest * MIN_BAND_RATIO:
            continue
        prices.append(price)

    if len(prices) < MIN_BINANCE_SAMPLES:
        raise RuntimeError(
            f"binance devolvio solo {len(prices)} avisos utilizables en {trade_type}"
        )
    return prices


def fetch_binance():
    """The parallel rate: the median of what USDT actually trades for."""
    sell = _p2p_medians("SELL")
    buy = _p2p_medians("BUY")
    return {
        "value": round(statistics.median(sell), 6),
        "asOf": None,
        "source": "p2p.binance.com",
        "sellMedian": round(statistics.median(sell), 6),
        "buyMedian": round(statistics.median(buy), 6),
        "samples": {"sell": len(sell), "buy": len(buy)},
        # Positive and small: what a buy-then-sell round trip costs. Selling
        # always returns less per USDT than buying, so a negative value here
        # would be ordinary market microstructure, not a signal.
        "roundTripPct": round(
            (statistics.median(buy) - statistics.median(sell))
            / statistics.median(sell)
            * 100,
            4,
        ),
    }


SOURCES = {
    "trm": fetch_trm,
    "bcv": fetch_bcv,
    "binance": fetch_binance,
    "eur_bcv": fetch_eur_bcv,
    "eur_paralelo": fetch_eur_paralelo,
}


def _previous_rates():
    """The rates already in rates.json, or an empty mapping.

    Anything unexpected in that file is treated as absent rather than allowed to
    crash the run: a hand-edited or half-written file must not take the scheduled
    workflow down, and it must not be trusted as evidence either.
    """
    if not OUT.exists():
        return {}
    try:
        # utf-8-sig, because a byte-order mark would otherwise make a perfectly
        # valid file unparseable and cost us the last good values.
        document = json.loads(OUT.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, OSError, UnicodeDecodeError):
        return {}
    if not isinstance(document, dict):
        return {}
    rates = document.get("rates")
    if not isinstance(rates, dict):
        return {}
    return {key: value for key, value in rates.items() if isinstance(value, dict)}


def _is_usable_value(value):
    """A rate the page can compute with: a finite positive number.

    Booleans are not numbers here, and neither is infinity or NaN: writing those
    back out would produce JSON a browser refuses to parse, and reading them would
    turn every result into zero or infinity.
    """
    return (
        not isinstance(value, bool)
        and isinstance(value, (int, float))
        and math.isfinite(value)
        and value > 0
    )


def _kept_number(entry):
    """A previous value worth keeping, or None."""
    value = entry.get("value")
    return value if _is_usable_value(value) else None


def main():
    previous = _previous_rates()
    rates = {}
    failed = []

    for name, fetcher in SOURCES.items():
        try:
            entry = fetcher()
            # A source that answers with nonsense counts as a failed source, so it
            # keeps the previous value instead of poisoning the file.
            if not _is_usable_value(entry.get("value")):
                raise RuntimeError(f"valor no utilizable: {entry.get('value')!r}")
            entry["stale"] = False
            print(f"ok   {name:8} {entry['value']}  ({entry['source']})")
        except Exception as error:
            failed.append(name)
            kept = previous.get(name) or {}
            entry = {
                "value": _kept_number(kept),
                "asOf": kept.get("asOf"),
                "source": kept.get("source"),
                "stale": True,
                "error": f"{type(error).__name__}: {error}",
            }
            have = "ultimo valor conservado" if entry["value"] is not None else "sin valor previo"
            print(f"FALLA {name:8} {entry['error']}  -> {have}", file=sys.stderr)
        rates[name] = entry

    document = {
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "failed": failed,
        "rates": rates,
    }
    OUT.write_text(
        # allow_nan=False so a non-finite value can never reach the page as
        # invalid JSON. It raises here instead, loudly, which is better.
        json.dumps(document, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    print(f"escrito {OUT}  (fallaron: {', '.join(failed) if failed else 'ninguna'})")

    return 1 if len(failed) == len(SOURCES) else 0


if __name__ == "__main__":
    sys.exit(main())
