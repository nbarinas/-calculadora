/*
 * Wires the pure helpers in calc.js to the page.
 *
 * The rates come from rates.json, which a scheduled GitHub Actions workflow
 * refreshes, so the page only ever reads its own origin. The last good copy
 * lives in localStorage: that is what keeps the calculator working with no
 * internet, which is the whole point of it being a PWA for a trip.
 */
'use strict';

(function () {
  const {
    UNIT, LIVE_SOURCES, isNumber, parseAmount, parseRate, interpretationNote,
    formatAmount, formatRate, dateOnly, effectiveRates, resultRows, mergeLiveReadings,
  } = window.Calc;

  const SOURCE_LABEL = {
    oficial: 'BCV',
    paralelo: 'Binance P2P',
  };
  const SOURCE_HINT = {
    oficial: 'referencia formal',
    paralelo: 'lo que te dan al vender USDT',
  };
  // When the euro is on either side of the conversion, the label names the euro
  // reading instead: that is the rate which moves, and the dollar leg is the one
  // paired with it, never the other market's.
  const EURO_LABEL = {
    oficial: 'Euro BCV',
    paralelo: 'Euro paralelo',
  };
  const RATE_ROWS = [
    { key: 'trm', label: 'TRM', hint: 'Colombia, oficial' },
    { key: 'bcv', label: 'BCV', hint: 'Venezuela, oficial' },
    { key: 'binance', label: 'Binance P2P', hint: 'USDT/VES, paralelo' },
    { key: 'eur_bcv', label: 'Euro BCV', hint: 'EUR/VES, oficial' },
    { key: 'eur_paralelo', label: 'Euro paralelo', hint: 'EUR/VES, paralelo' },
  ];
  const RATE_LABEL = Object.fromEntries(RATE_ROWS.map((row) => [row.key, row.label]));

  const CACHE_KEY = 'calc.rates.cache';
  const MANUAL_KEY = 'calc.rates.manual';
  const PREF_KEY = 'calc.prefs';
  const REFRESH_AFTER_MS = 15 * 60 * 1000;
  const LIVE_TIMEOUT_MS = 8000;

  const state = {
    amount: 1000000,
    from: 'COP',
    rates: null,
    manual: {},
    offline: false,
    lastLoad: 0,
  };

  const timeFormat = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  /* --- storage --------------------------------------------------------- */

  function readStore(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Private mode or a full quota. The page still works for this visit.
    }
  }

  /* --- rates ----------------------------------------------------------- */

  /** Manual values win over the fetched ones, per rate. */
  function currentRates() {
    return effectiveRates(
      (state.rates && state.rates.rates) || {},
      state.manual,
      RATE_ROWS.map((row) => row.key),
    );
  }

  async function loadRates() {
    try {
      const response = await fetch('rates.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload || typeof payload !== 'object' || !payload.rates) {
        throw new Error('rates.json sin la clave rates');
      }
      state.rates = payload;
      state.offline = false;
      writeStore(CACHE_KEY, payload);
    } catch (error) {
      const cached = readStore(CACHE_KEY, null);
      state.rates = cached;
      state.offline = true;
    }
    state.lastLoad = Date.now();
    renderAll();
  }

  /* --- small DOM helpers ----------------------------------------------- */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function ageText(iso) {
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) return 'un rato';
    const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (minutes < 1) return 'menos de un minuto';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `${hours} h` : `${Math.round(hours / 24)} días`;
  }

  /* --- rendering ------------------------------------------------------- */

  function renderUpdated() {
    const node = document.getElementById('updated');
    const stamp = state.rates && state.rates.updatedAt;
    const millis = Date.parse(stamp || '');
    // An unreadable timestamp must not throw inside Intl formatting.
    const readable = Number.isFinite(millis);
    const when = readable ? timeFormat.format(new Date(millis)) : '';
    node.classList.toggle('is-stale', state.offline || !readable);

    if (state.offline && readable) {
      node.textContent = `Sin conexión · últimas tasas guardadas: ${when} (hace ${ageText(stamp)})`;
    } else if (state.offline) {
      node.textContent = 'Sin conexión y todavía no hay tasas guardadas';
    } else if (!readable) {
      node.textContent = 'Todavía no pude leer las tasas';
    } else {
      node.textContent = `Tasas actualizadas: ${when} (hace ${ageText(stamp)})`;
    }
  }

  function lineLabel(target, path) {
    const euro = state.from === 'EUR' || target === 'EUR';
    return euro ? EURO_LABEL[path] : SOURCE_LABEL[path];
  }

  /**
   * What produced this line, said in one short phrase.
   *
   * A conversion that touches the euro but not the bolívar is the only one that
   * divides two rates, so it is the only one that has to say so: `euro BCV ÷
   * dólar BCV` is the whole explanation of the number, and it is also the reason
   * the two lines differ.
   */
  function lineHint(target, path) {
    const euro = state.from === 'EUR' || target === 'EUR';
    const ves = state.from === 'VES' || target === 'VES';
    if (euro && ves) {
      return path === 'oficial' ? 'referencia formal' : 'lo que te dan al vender EUR';
    }
    if (euro) {
      return path === 'oficial' ? 'euro BCV ÷ dólar BCV' : 'euro paralelo ÷ dólar paralelo';
    }
    return SOURCE_HINT[path];
  }

  function renderResults() {
    const container = document.getElementById('results');
    const rates = currentRates();
    const rows = resultRows(state.amount, state.from, rates);
    container.replaceChildren();

    for (const row of rows) {
      const block = el('div', 'result');
      const head = el('div', 'result-head');
      const single = row.lines.length === 1;

      head.append(el('span', 'result-target',
        single ? `En ${UNIT[row.target]}` : `En ${UNIT[row.target]} según la tasa`));

      if (single) {
        head.append(el('span', 'result-value', formatAmount(row.lines[0].value)));
        block.append(head);
      } else {
        // The conversion depends on which coherent pair is in play, so every
        // line is labelled instead of picking one for the user.
        block.append(head);
        for (const line of row.lines) {
          const lineEl = el('div', 'line');
          const left = el('span', 'line-source', lineLabel(row.target, line.path));
          left.append(el('span', 'line-hint', lineHint(row.target, line.path)));
          lineEl.append(left, el('span', 'line-value', formatAmount(line.value)));
          block.append(lineEl);
        }
      }

      container.append(block);
    }
  }

  function syncRateTags() {
    const fromFile = (state.rates && state.rates.rates) || {};
    for (const row of RATE_ROWS) {
      const tag = document.querySelector(`[data-tag="${row.key}"]`);
      if (!tag) continue;
      const entry = fromFile[row.key] || {};

      if (isNumber(state.manual[row.key])) {
        tag.hidden = false;
        tag.textContent = 'tu valor';
        tag.className = 'tag';
      } else if (entry.stale) {
        tag.hidden = false;
        tag.textContent = 'sin actualizar';
        tag.className = 'tag stale';
      } else if (!isNumber(entry.value)) {
        tag.hidden = false;
        tag.textContent = 'sin dato';
        tag.className = 'tag stale';
      } else {
        tag.hidden = true;
        tag.textContent = '';
      }
    }
    document.getElementById('reset-rates').hidden = Object.keys(state.manual).length === 0;
  }

  function renderRates() {
    const container = document.getElementById('rates');
    const fromFile = (state.rates && state.rates.rates) || {};
    container.replaceChildren();

    for (const row of RATE_ROWS) {
      const entry = fromFile[row.key] || {};
      const manual = state.manual[row.key];
      const rowEl = el('div', 'rate-row');

      const name = el('div', 'rate-name', row.label);
      const tag = el('span', 'tag');
      tag.dataset.tag = row.key;
      name.append(tag);
      rowEl.append(name);

      const input = el('input', 'rate-input');
      input.type = 'text';
      input.setAttribute('inputmode', 'decimal');
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.dataset.key = row.key;
      input.setAttribute('aria-label', `Tasa ${row.label}`);
      input.value = formatRate(isNumber(manual) ? manual : entry.value);
      input.classList.toggle('is-manual', isNumber(manual));
      rowEl.append(input);

      const bits = [row.hint];
      if (entry.source) bits.push(entry.source);
      const when = dateOnly(entry.asOf);
      if (when) bits.push(`fecha valor ${when}`);
      const meta = el('div', 'rate-meta', bits.join(' · '));
      const readAs = el('span', 'read-as');
      readAs.dataset.readAs = row.key;
      meta.append(readAs);
      rowEl.append(meta);

      container.append(rowEl);
    }

    syncRateTags();
  }

  function renderAll() {
    renderUpdated();
    renderResults();
    renderRates();
  }

  /* --- live refresh ---------------------------------------------------- */

  function setRefreshStatus(text) {
    const node = document.getElementById('refresh-status');
    if (node) node.textContent = text;
  }

  /**
   * Ask the five sources directly, because waiting half an hour for the
   * scheduled workflow is sometimes not good enough. Four of the five can be
   * reached from a page and the fifth cannot; see LIVE_SOURCES in calc.js.
   *
   * A source that does not answer keeps the value it already had and is marked
   * stale, so a partial refresh is never presented as a complete one.
   */
  async function refreshLive() {
    const button = document.getElementById('refresh');
    button.disabled = true;
    setRefreshStatus('Consultando las cinco fuentes…');

    const readings = {};
    await Promise.all(LIVE_SOURCES.map(async (source) => {
      try {
        const response = await fetch(source.url, {
          signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const reading = source.read(await response.json());
        readings[source.key] = reading
          ? Object.assign({}, reading, { source: source.source })
          : null;
      } catch (error) {
        readings[source.key] = null;
      }
    }));

    state.rates = mergeLiveReadings(state.rates, readings, new Date().toISOString());
    state.offline = state.rates.failed.length === LIVE_SOURCES.length;
    state.lastLoad = Date.now();
    writeStore(CACHE_KEY, state.rates);
    renderAll();

    setRefreshStatus(state.rates.failed.length
      ? `No respondió: ${state.rates.failed.map((key) => RATE_LABEL[key] || key).join(', ')}. Se sigue con lo que había.`
      : 'Tasas pedidas de nuevo, en vivo.');
    button.disabled = false;
  }

  /* --- events ---------------------------------------------------------- */

  function onAmountInput(event) {
    state.amount = parseAmount(event.target.value);
    updateAmountNote(event.target.value);
    renderResults();
  }

  function onAmountBlur(event) {
    event.target.value = formatAmount(state.amount);
    updateAmountNote(event.target.value);
  }

  function updateAmountNote(raw) {
    const note = document.getElementById('amount-note');
    if (!note) return;
    note.textContent = interpretationNote(raw, state.amount, 'amount');
  }

  function updateRateNote(key, raw, value) {
    const note = document.querySelector(`[data-read-as="${key}"]`);
    if (!note) return;
    const text = isNumber(value) ? interpretationNote(raw, value, 'rate') : '';
    note.textContent = text ? ` · ${text}` : '';
  }

  function onRateInput(event) {
    const input = event.target;
    const key = input.dataset.key;
    // parseRate, not parseAmount: a rate is small, so "1011.500" is the Binance
    // price and not a million. Reading it as an amount would be a thousand-fold
    // error in the number every result gets multiplied by.
    const value = parseRate(input.value);

    // An empty or nonsense rate means "no override", never a zero rate.
    if (value > 0) state.manual[key] = value;
    else delete state.manual[key];

    writeStore(MANUAL_KEY, state.manual);
    input.classList.toggle('is-manual', isNumber(state.manual[key]));
    updateRateNote(key, input.value, state.manual[key]);
    syncRateTags();
    renderResults();
  }

  function onRateBlur(event) {
    const key = event.target.dataset.key;
    const value = state.manual[key];
    if (!isNumber(value)) return;
    event.target.value = formatRate(value);
    updateRateNote(key, event.target.value, value);
  }

  function onResetRates() {
    state.manual = {};
    writeStore(MANUAL_KEY, state.manual);
    renderRates();
    renderResults();
  }

  function onCurrencyClick(event) {
    const button = event.target.closest('button[data-currency]');
    if (!button) return;
    state.from = button.dataset.currency;
    for (const tab of document.querySelectorAll('#currency button')) {
      tab.setAttribute('aria-selected', String(tab === button));
    }
    writeStore(PREF_KEY, { from: state.from });
    renderResults();
  }

  /* --- start ----------------------------------------------------------- */

  function restore() {
    const savedAmount = readStore('calc.amount', null);
    if (isNumber(savedAmount)) state.amount = savedAmount;

    const prefs = readStore(PREF_KEY, null);
    if (prefs && window.Calc.CURRENCIES.includes(prefs.from)) state.from = prefs.from;

    state.manual = readStore(MANUAL_KEY, {}) || {};

    const amount = document.getElementById('amount');
    amount.value = formatAmount(state.amount);
    amount.addEventListener('input', onAmountInput);
    amount.addEventListener('blur', onAmountBlur);
    updateAmountNote(amount.value);

    document.getElementById('currency').addEventListener('click', onCurrencyClick);
    document.getElementById('rates').addEventListener('input', onRateInput);
    document.getElementById('rates').addEventListener('focusout', onRateBlur);
    document.getElementById('refresh').addEventListener('click', refreshLive);
    document.getElementById('reset-rates').addEventListener('click', onResetRates);

    for (const tab of document.querySelectorAll('#currency button')) {
      tab.setAttribute('aria-selected', String(tab.dataset.currency === state.from));
    }

    // Keep the amount around, so reopening the app shows what you last typed.
    window.addEventListener('pagehide', () => writeStore('calc.amount', state.amount));
  }

  function refreshWhenStale() {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - state.lastLoad > REFRESH_AFTER_MS) loadRates();
  }

  restore();
  renderAll();
  loadRates();

  window.addEventListener('online', loadRates);
  document.addEventListener('visibilitychange', refreshWhenStale);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        // No service worker means no offline shell, but the page still works.
      });
    });
  }
})();
