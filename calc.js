/*
 * Pure calculation and parsing helpers.
 *
 * Deliberately free of DOM access, and usable from Node as well as the browser
 * so the same functions the page runs can be exercised in tests/.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CURRENCIES = ['COP', 'USD', 'VES', 'EUR'];
  const UNIT = { COP: 'COP', USD: 'USD', VES: 'Bs', EUR: '€' };

  /**
   * Every rate the app reads, in the order the page shows them.
   *
   * `binance` is the parallel dollar and `eur_paralelo` the parallel euro; the
   * name of the first one survives from when Binance P2P was its only source,
   * and the entry's own `source` field is what tells the page where a number
   * actually came from.
   */
  const RATE_KEYS = ['trm', 'bcv', 'binance', 'eur_bcv', 'eur_paralelo'];

  /**
   * The two coherent paths, and nothing in between.
   *
   * The euro is quoted in Venezuela only in bolívares, so a conversion that
   * touches the euro has to divide by a dollar rate, and there are two of those.
   * Each path pairs a dollar reading with the euro reading of the same market:
   * the BCV dollar with the BCV euro, the street dollar with the street euro.
   * Mixing them (an official euro over a street dollar) yields a number no
   * counter in Venezuela would give, so it is never computed.
   */
  const PATHS = ['oficial', 'paralelo'];
  const PATH_RATES = {
    oficial: { usd: 'bcv', eur: 'eur_bcv' },
    paralelo: { usd: 'binance', eur: 'eur_paralelo' },
  };

  // Local Colombian formatting, which is also what Venezuela uses.
  const amountFormat = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const rateFormat = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  function isNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  /**
   * Which separator is the decimal one, and which one groups.
   *
   * `threeDigitsIsThousands` is the whole difference between reading an amount
   * and reading a rate, and it is not a detail: "1011.500" is the Binance price
   * and "1.000" is one thousand pesos, and the same text cannot mean both.
   */
  function separatorRoles(raw, threeDigitsIsThousands) {
    const commas = (raw.match(/,/g) || []).length;
    const dots = (raw.match(/\./g) || []).length;

    if (commas && dots) {
      // Both kinds present: whichever comes last is the decimal separator.
      const decimal = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? ',' : '.';
      return { decimal, thousands: decimal === ',' ? '.' : ',' };
    }
    if (commas + dots > 1) {
      // One kind, repeated: every one of them groups thousands.
      return { decimal: null, thousands: commas ? ',' : '.' };
    }
    if (commas + dots === 1) {
      const separator = commas ? ',' : '.';
      const trailing = raw.length - raw.lastIndexOf(separator) - 1;
      if (threeDigitsIsThousands && trailing === 3) {
        return { decimal: null, thousands: separator };
      }
      return { decimal: separator, thousands: null };
    }
    return { decimal: null, thousands: null };
  }

  function toNumber(raw, roles) {
    let normalized = raw;
    if (roles.thousands) normalized = normalized.split(roles.thousands).join('');
    if (roles.decimal) {
      const at = normalized.lastIndexOf(roles.decimal);
      normalized = `${normalized.slice(0, at).split(roles.decimal).join('')}.${normalized.slice(at + 1)}`;
    }
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parseNumber(text, threeDigitsIsThousands) {
    const raw = String(text == null ? '' : text).trim().replace(/[^\d.,-]/g, '');
    if (!raw) return 0;
    return toNumber(raw, separatorRoles(raw, threeDigitsIsThousands));
  }

  /**
   * Read an amount: pesos, dollars or bolívares.
   *
   * Amounts are written in groups, so a lone separator with exactly three
   * digits behind it is a thousands group: `1.000` is one thousand, and
   * `1.000.000` is a million.
   */
  function parseAmount(text) {
    return parseNumber(text, true);
  }

  /**
   * Read a rate, which is quoted per US dollar and therefore small.
   *
   * Here a lone separator is the decimal one, whatever follows it: `1011.500`
   * is the Binance price, and reading it as 1011500 would be a thousand-fold
   * error in the number that every result is multiplied by. A rate written with
   * real grouping (`3.181,74`) still resolves, because the last separator wins.
   */
  function parseRate(text) {
    return parseNumber(text, false);
  }

  /**
   * How the app read a number, said out loud.
   *
   * `1.000` genuinely means one thousand to one person and one to another, so
   * the reading is shown whenever the characters the parser actually read are not
   * already what the app would have written. A currency symbol or stray words do
   * not trigger it, because the parser never saw them.
   *
   * When the two possible readings are a hundredfold apart both are printed. That
   * is the difference between a mistake that is merely visible and one that is
   * obvious, and it covers both directions: pasting `1011.500` from Binance, and
   * typing `1.011` out of Colombian habit.
   */
  function interpretationNote(raw, primary, mode) {
    const cleaned = String(raw == null ? '' : raw).trim().replace(/[^\d.,-]/g, '');
    if (!cleaned || !/[.,]/.test(cleaned)) return '';

    const format = mode === 'rate' ? formatRate : formatAmount;
    const formatted = format(primary);
    if (cleaned === formatted) return '';

    // The other reading is the same characters under the opposite rule.
    const other = parseNumber(cleaned, mode === 'rate');
    const farApart = other > 0 && primary > 0
      && Math.max(other / primary, primary / other) >= 100;

    return farApart
      ? `se lee como ${formatted} · la otra lectura es ${format(other)}`
      : `se lee como ${formatted}`;
  }

  function formatAmount(value) {
    return isNumber(value) ? amountFormat.format(value) : '—';
  }

  function formatRate(value) {
    return isNumber(value) ? rateFormat.format(value) : '—';
  }

  /**
   * The date a source published, taken from the string itself.
   * Deliberately not parsed as an instant: "fecha valor" is a calendar date,
   * and converting it through the device timezone would shift it by a day.
   */
  function dateOnly(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
  }

  /**
   * A rate the page can compute with: a finite positive number.
   *
   * Zero is not a rate, it is a missing rate written wrong, and dividing by it
   * turns every result into Infinity. The verifier found this reachable through
   * the new euro path and through the TRM, so both sides of the function use the
   * same guard.
   */
  function usableRate(value) {
    return isNumber(value) && value > 0;
  }

  /**
   * The bolívar value of one unit of `currency` along one coherent path.
   * Null when that path's rate is missing, so the page shows a dash instead of
   * a number built on a rate nobody published.
   */
  function pathRate(currency, rates, path) {
    const keys = PATH_RATES[path];
    if (!keys) return null;
    const value = (rates || {})[currency === 'EUR' ? keys.eur : keys.usd];
    return usableRate(value) ? value : null;
  }

  /**
   * Convert `amount` from one currency to another along one coherent path.
   *
   * Everything is expressed in bolívares and then back out, because the bolívar
   * is the only unit every rate in the file has in common: the dollar and the
   * euro are both quoted in Bs, and the peso is anchored to the dollar by the
   * TRM. COP↔USD therefore needs no path at all, and keeps its single line.
   *
   * Returns null when a rate the conversion needs is missing, so the page can
   * show a dash instead of inventing a number.
   */
  function convert(amount, from, to, rates, path) {
    if (from === to) return amount;
    const table = rates || {};

    // Colombia's own pair. The TRM anchors the peso to the dollar, and neither
    // the euro nor the bolívar enters it, so this conversion needs no path and
    // must keep working when every Venezuelan rate is missing.
    const colombiaOnly = (from === 'COP' && to === 'USD')
      || (from === 'USD' && to === 'COP');
    if (colombiaOnly) {
      if (!usableRate(table.trm)) return null;
      return from === 'COP' ? amount / table.trm : amount * table.trm;
    }

    const usdInVes = pathRate('USD', table, path);
    const eurInVes = pathRate('EUR', table, path);

    let ves;
    if (from === 'VES') {
      ves = amount;
    } else if (from === 'EUR') {
      if (eurInVes === null) return null;
      ves = amount * eurInVes;
    } else if (from === 'USD') {
      if (usdInVes === null) return null;
      ves = amount * usdInVes;
    } else {
      // COP, which only reaches the bolívar through the TRM.
      if (!usableRate(table.trm) || usdInVes === null) return null;
      ves = amount / table.trm * usdInVes;
    }

    if (to === 'VES') return ves;
    if (to === 'EUR') return eurInVes === null ? null : ves / eurInVes;
    if (to === 'USD') return usdInVes === null ? null : ves / usdInVes;
    if (!usableRate(table.trm) || usdInVes === null) return null;
    return ves / usdInVes * table.trm;
  }

  /**
   * Merge the fetched rates with whatever the user typed in.
   *
   * A manual value always wins. A rate that is missing or not a positive number
   * becomes null rather than 0: a zero rate would quietly turn every result into
   * zero or infinity, which is exactly the kind of silent lie this app must not
   * tell about money.
   */
  function effectiveRates(fileRates, manual, keys) {
    const out = {};
    for (const key of keys || RATE_KEYS) {
      const typed = (manual || {})[key];
      const fetched = (fileRates || {})[key] || {};
      out[key] = isNumber(typed) && typed > 0 ? typed
        : isNumber(fetched.value) && fetched.value > 0 ? fetched.value
          : null;
    }
    return out;
  }

  /**
   * What the page renders: one entry per target currency, and one line per
   * coherent path whenever the conversion depends on which one is in play.
   *
   * Only COP↔USD is path-independent, because the TRM is Colombia's own rate and
   * neither the euro nor the bolívar enters it. Everything else is shown twice,
   * labelled, instead of the app electing one path as the true one.
   */
  function resultRows(amount, from, rates) {
    return CURRENCIES.filter((currency) => currency !== from).map((target) => {
      const colombiaOnly = (from === 'COP' && target === 'USD')
        || (from === 'USD' && target === 'COP');
      const paths = colombiaOnly ? [null] : PATHS;
      return {
        target,
        lines: paths.map((path) => ({
          path,
          value: convert(amount, from, target, rates, path),
        })),
      };
    });
  }

  /**
   * Read Colombia's official rate from the Socrata row.
   * Returns null for anything that is not a usable number, so a malformed
   * response can never be mistaken for a rate of zero.
   */
  function readTrm(payload) {
    const row = Array.isArray(payload) ? payload[0] : null;
    const value = row ? Number.parseFloat(row.valor) : Number.NaN;
    if (!isNumber(value) || value <= 0) return null;
    return { value, asOf: row.vigenciadesde || null };
  }

  /** Read either Venezuelan rate from a DolarApi payload. */
  function readDolarApi(payload) {
    const value = payload ? Number.parseFloat(payload.promedio) : Number.NaN;
    if (!isNumber(value) || value <= 0) return null;
    return { value, asOf: payload.fechaActualizacion || null };
  }

  /**
   * The five sources a page can reach directly from the browser.
   *
   * Binance P2P is not one of them: its preflight answers without CORS headers,
   * so the browser blocks the request no matter what the page does. DolarApi
   * publishes the same parallel reference and does allow it, and the two were
   * measured within 0.15% of each other, so the live path uses DolarApi for both
   * Venezuelan dollar rates. The workflow still fetches Binance directly, where
   * there is no browser to block it.
   *
   * The two euro rates come from DolarApi as well, and there is no alternative to
   * fall back to: asked for EUR/VES, Binance P2P answers an empty book.
   */
  const LIVE_SOURCES = [
    {
      key: 'trm',
      url: 'https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC',
      source: 'datos.gov.co',
      read: readTrm,
    },
    {
      key: 'bcv',
      url: 'https://ve.dolarapi.com/v1/dolares/oficial',
      source: 've.dolarapi.com',
      read: readDolarApi,
    },
    {
      key: 'binance',
      url: 'https://ve.dolarapi.com/v1/dolares/paralelo',
      source: 've.dolarapi.com',
      read: readDolarApi,
    },
    {
      key: 'eur_bcv',
      url: 'https://ve.dolarapi.com/v1/euros/oficial',
      source: 've.dolarapi.com',
      read: readDolarApi,
    },
    {
      key: 'eur_paralelo',
      url: 'https://ve.dolarapi.com/v1/euros/paralelo',
      source: 've.dolarapi.com',
      read: readDolarApi,
    },
  ];

  /**
   * Fold a live refresh into a rates document of the same shape the workflow
   * writes, so the page has one thing to read and one thing to render.
   *
   * A source that did not answer keeps the value it already had and is marked
   * stale: a partial refresh is never presented as a complete one.
   */
  function mergeLiveReadings(previous, readings, nowIso) {
    const base = (previous && previous.rates) || {};
    const rates = {};

    for (const key of RATE_KEYS) {
      const reading = readings ? readings[key] : null;
      const kept = base[key] || {};

      if (reading && isNumber(reading.value) && reading.value > 0) {
        rates[key] = {
          value: reading.value,
          asOf: reading.asOf || null,
          source: reading.source || kept.source || null,
          stale: false,
        };
      } else {
        rates[key] = Object.assign({}, kept, { stale: true });
      }
    }

    return {
      updatedAt: nowIso,
      failed: Object.keys(rates).filter((key) => rates[key].stale),
      rates,
    };
  }

  return {
    CURRENCIES,
    RATE_KEYS,
    PATHS,
    PATH_RATES,
    LIVE_SOURCES,
    UNIT,
    isNumber,
    usableRate,
    parseAmount,
    parseRate,
    interpretationNote,
    formatAmount,
    formatRate,
    dateOnly,
    convert,
    effectiveRates,
    resultRows,
    readTrm,
    readDolarApi,
    mergeLiveReadings,
  };
});
