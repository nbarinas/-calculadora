#!/usr/bin/env python3
"""Tests for scripts/fetch_rates.py.

    python3 tests/test_fetch_rates.py

No network and no framework beyond unittest: the fetchers are replaced with
canned Binance payloads, so the aggregation rules are pinned without depending on
what the market happens to be doing, and without touching the real rates.json.
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "fetch_rates", HERE.parent / "scripts" / "fetch_rates.py"
)
fetch_rates = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fetch_rates)


def advert(price, lowest, highest):
    return {
        "price": str(price),
        "minSingleTransAmount": str(lowest),
        "maxSingleTransAmount": str(highest),
    }


def payload(ads):
    return {"code": "000000", "data": [{"adv": ad} for ad in ads]}


def tradable(price=1011.0, count=6):
    """Enough usable ads for a median, all quoted at the same price."""
    return payload([advert(price, 1000, 500000)] * count)


def down():
    raise RuntimeError("fuente caida")


class BinanceAggregation(unittest.TestCase):
    def setUp(self):
        self.saved = fetch_rates._fetch_json
        self.addCleanup(setattr, fetch_rates, "_fetch_json", self.saved)

    def test_inverted_band_is_rejected(self):
        fetch_rates._fetch_json = lambda *a, **k: payload(
            [advert(1, 200000, 100000)] + [advert(1000, 1000, 500000)] * 6
        )
        self.assertEqual(fetch_rates._p2p_medians("SELL"), [1000.0] * 6)

    def test_razor_thin_band_is_rejected(self):
        """The band recorded in L6: not inverted, just impossible to trade."""
        fetch_rates._fetch_json = lambda *a, **k: payload(
            [advert(1011.5, 151850, 151860)] + [advert(1012, 1000, 500000)] * 6
        )
        prices = fetch_rates._p2p_medians("SELL")
        self.assertNotIn(1011.5, prices)
        self.assertEqual(len(prices), 6)

    def test_an_empty_band_is_rejected(self):
        fetch_rates._fetch_json = lambda *a, **k: payload(
            [advert(5000, 5000, 5000)] + [advert(1000, 1000, 500000)] * 6
        )
        self.assertNotIn(5000.0, fetch_rates._p2p_medians("SELL"))

    def test_too_few_usable_ads_fails_instead_of_guessing(self):
        fetch_rates._fetch_json = lambda *a, **k: payload(
            [advert(900, 1000, 500000)] + [advert(1, 200000, 100000)] * 19
        )
        with self.assertRaises(RuntimeError):
            fetch_rates._p2p_medians("SELL")

    def test_a_binance_error_code_is_a_failure(self):
        fetch_rates._fetch_json = lambda *a, **k: {"code": "100001", "data": []}
        with self.assertRaises(RuntimeError):
            fetch_rates._p2p_medians("SELL")

    def test_the_median_ignores_a_single_outlier(self):
        fetch_rates._fetch_json = lambda *a, **k: payload(
            [advert(1000, 1000, 500000)] * 19 + [advert(9999, 1000, 500000)]
        )
        entry = fetch_rates.fetch_binance()
        self.assertEqual(entry["value"], 1000.0)
        self.assertEqual(entry["samples"]["sell"], 20)
        self.assertEqual(entry["roundTripPct"], 0.0)


class PreviousFile(unittest.TestCase):
    def setUp(self):
        self.directory = Path(tempfile.mkdtemp())
        self.addCleanup(setattr, fetch_rates, "OUT", fetch_rates.OUT)
        self.addCleanup(setattr, fetch_rates, "SOURCES", fetch_rates.SOURCES)
        fetch_rates.OUT = self.directory / "rates.json"

    def write(self, text):
        fetch_rates.OUT.write_text(text, encoding="utf-8")

    def read(self):
        return json.loads(fetch_rates.OUT.read_text(encoding="utf-8"))

    def sources(self, **overrides):
        def ok(value):
            return lambda: {"value": value, "asOf": None, "source": "test"}

        fetch_rates.SOURCES = {
            "trm": overrides.get("trm", ok(3181.74)),
            "bcv": overrides.get("bcv", ok(877.9)),
            "binance": overrides.get("binance", ok(1011.0)),
        }

    def run_main(self):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return fetch_rates.main()

    def test_a_good_file_survives_one_dead_source(self):
        self.write(json.dumps({
            "rates": {"trm": {"value": 3181.74, "asOf": "2026-10-14", "source": "datos.gov.co"}}
        }))
        self.sources(trm=down)
        self.assertEqual(self.run_main(), 0)

        document = self.read()
        self.assertEqual(document["rates"]["trm"]["value"], 3181.74)
        self.assertEqual(document["rates"]["trm"]["source"], "datos.gov.co")
        self.assertTrue(document["rates"]["trm"]["stale"])
        self.assertIn("error", document["rates"]["trm"])
        self.assertEqual(document["failed"], ["trm"])
        self.assertFalse(document["rates"]["bcv"]["stale"])

    def test_every_source_down_keeps_the_file_and_exits_nonzero(self):
        self.write(json.dumps({"rates": {"trm": {"value": 3181.74, "source": "x"}}}))
        self.sources(trm=down, bcv=down, binance=down)
        self.assertEqual(self.run_main(), 1)

        document = self.read()
        self.assertEqual(document["rates"]["trm"]["value"], 3181.74)
        self.assertEqual(sorted(document["failed"]), ["bcv", "binance", "trm"])
        self.assertIsNone(document["rates"]["bcv"]["value"])

    def test_a_previous_file_of_the_wrong_shape_does_not_crash(self):
        for bad in ("[]", "null", '{"rates": []}', '{"rates": {"trm": 5}}', "no es json", ""):
            with self.subTest(bad=bad):
                self.write(bad)
                self.sources()
                self.assertEqual(self.run_main(), 0)
                self.assertEqual(self.read()["failed"], [])

    def test_a_previous_string_value_is_not_kept(self):
        self.write(json.dumps({"rates": {"trm": {"value": "3181.74"}}}))
        self.sources(trm=down)
        self.run_main()
        self.assertIsNone(self.read()["rates"]["trm"]["value"])

    def test_a_byte_order_mark_does_not_lose_the_previous_value(self):
        self.write('\ufeff' + json.dumps({"rates": {"trm": {"value": 3181.74, "source": "x"}}}))
        self.sources(trm=down)
        self.run_main()
        self.assertEqual(self.read()["rates"]["trm"]["value"], 3181.74)

    def test_a_non_finite_previous_value_is_not_kept(self):
        self.write('{"rates": {"trm": {"value": Infinity}}}')
        self.sources(trm=down)
        self.run_main()
        self.assertIsNone(self.read()["rates"]["trm"]["value"])

    def test_a_non_finite_fetched_value_fails_only_that_source(self):
        self.sources(trm=lambda: {"value": float("inf"), "source": "test"})
        self.assertEqual(self.run_main(), 0)

        document = self.read()
        self.assertEqual(document["failed"], ["trm"])
        self.assertIsNone(document["rates"]["trm"]["value"])
        self.assertFalse(document["rates"]["bcv"]["stale"])

    def test_a_zero_fetched_value_fails_only_that_source(self):
        self.sources(bcv=lambda: {"value": 0, "source": "test"})
        self.run_main()
        self.assertEqual(self.read()["failed"], ["bcv"])

    def test_no_previous_file_at_all(self):
        self.sources(trm=down)
        self.assertEqual(self.run_main(), 0)
        self.assertIsNone(self.read()["rates"]["trm"]["value"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
