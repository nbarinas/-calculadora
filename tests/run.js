/*
 * Tests for calc.js. Plain Node, no dependencies, no test framework:
 *
 *     node tests/run.js
 *
 * The rates used here are round numbers on purpose. 4000, 800 and 1000 make
 * every expected value checkable by hand, so a passing test cannot be a
 * coincidence of the implementation agreeing with itself.
 */
'use strict';

const path = require('path');
const Calc = require(path.join(__dirname, '..', 'calc.js'));

const RATES = {
  trm: 4000,
  bcv: 800,
  binance: 1000,
  // The euro is quoted in bolívares, so these two carry the same unit as the
  // dollar rates. Round on purpose: the official path implies EUR/USD
  // 900/800 = 1,125 and the street path 1100/1000 = 1,1, which makes every euro
  // result below checkable by hand.
  eur_bcv: 900,
  eur_paralelo: 1100,
};

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;
    return;
  }
  failures.push(
    `${name}\n     esperado: ${JSON.stringify(expected)}\n     recibido: ${JSON.stringify(actual)}`,
  );
}

function checkClose(name, actual, expected, tolerance = 1e-9) {
  if (typeof actual === 'number' && Math.abs(actual - expected) <= tolerance) {
    passed += 1;
    return;
  }
  failures.push(
    `${name}\n     esperado: ${expected} (±${tolerance})\n     recibido: ${JSON.stringify(actual)}`,
  );
}

/* --- parseAmount: every rule in its docstring ------------------------- */

check('parseAmount: grupos de tres con punto', Calc.parseAmount('1.000.000'), 1000000);
check('parseAmount: grupos de tres con coma', Calc.parseAmount('1,000,000'), 1000000);
check('parseAmount: un punto con tres digitos es miles', Calc.parseAmount('1.000'), 1000);
check('parseAmount: una coma con tres digitos es miles', Calc.parseAmount('1,000'), 1000);
check('parseAmount: un punto con dos digitos es decimal', Calc.parseAmount('1000.50'), 1000.5);
check('parseAmount: un punto con un digito es decimal', Calc.parseAmount('1000.5'), 1000.5);
check('parseAmount: formato local completo', Calc.parseAmount('1.234,56'), 1234.56);
check('parseAmount: formato anglo completo', Calc.parseAmount('1,234.56'), 1234.56);
check('parseAmount: cero coma cinco', Calc.parseAmount('0,5'), 0.5);
check('parseAmount: signo negativo', Calc.parseAmount('-1.234,56'), -1234.56);
check('parseAmount: basura de moneda alrededor', Calc.parseAmount('$ 1.000.000 COP'), 1000000);
check('parseAmount: mas de cuatro decimales', Calc.parseAmount('1.2345'), 1.2345);
check('parseAmount: numero sin sentido se agrupa, no explota', Calc.parseAmount('1.2.3'), 123);
check('parseAmount: vacio', Calc.parseAmount(''), 0);
check('parseAmount: solo letras', Calc.parseAmount('abc'), 0);
check('parseAmount: nulo', Calc.parseAmount(null), 0);

/* --- convert: one case per direction ---------------------------------- */

checkClose('convert: 1.000.000 COP a USD', Calc.convert(1000000, 'COP', 'USD', RATES, null), 250);
checkClose('convert: 1.000.000 COP a Bs al BCV', Calc.convert(1000000, 'COP', 'VES', RATES, 'oficial'), 200000);
checkClose('convert: 1.000.000 COP a Bs en la calle', Calc.convert(1000000, 'COP', 'VES', RATES, 'paralelo'), 250000);
checkClose('convert: 250 USD a COP', Calc.convert(250, 'USD', 'COP', RATES, null), 1000000);
checkClose('convert: 250 USD a Bs al BCV', Calc.convert(250, 'USD', 'VES', RATES, 'oficial'), 200000);
checkClose('convert: 200.000 Bs del BCV a USD', Calc.convert(200000, 'VES', 'USD', RATES, 'oficial'), 250);
checkClose('convert: 200.000 Bs del BCV a COP', Calc.convert(200000, 'VES', 'COP', RATES, 'oficial'), 1000000);
checkClose('convert: ida y vuelta vuelve al mismo numero',
  Calc.convert(Calc.convert(1234.5, 'COP', 'VES', RATES, 'paralelo'), 'VES', 'COP', RATES, 'paralelo'),
  1234.5);

/* --- convert: a missing rate must be null, never zero ----------------- */

check('convert: sin TRM no inventa cero', Calc.convert(100, 'COP', 'USD', { trm: null }, null), null);
check('convert: COP a Bs necesita la TRM', Calc.convert(100, 'COP', 'VES', { trm: null, binance: 1000 }, 'paralelo'), null);
check('convert: USD a Bs necesita la tasa de Bs', Calc.convert(100, 'USD', 'VES', { trm: 4000, binance: null }, 'paralelo'), null);
check('convert: sin Bs y sin Bs de por medio no molesta la tasa de Bs',
  Calc.convert(100, 'COP', 'USD', { trm: 4000, bcv: null, binance: null }, null), 0.025);
check('convert: EUR a Bs necesita el euro de ese camino',
  Calc.convert(100, 'EUR', 'VES', { eur_bcv: null, eur_paralelo: 1100 }, 'oficial'), null);
check('convert: y el otro camino sigue respondiendo',
  Calc.convert(100, 'EUR', 'VES', { eur_bcv: null, eur_paralelo: 1100 }, 'paralelo'), 110000);
check('convert: EUR a USD sin el dolar de ese camino no inventa nada',
  Calc.convert(100, 'EUR', 'USD', { eur_bcv: 900, bcv: null }, 'oficial'), null);
check('convert: la misma moneda no necesita ninguna tasa', Calc.convert(7, 'EUR', 'EUR', {}, null), 7);

// A zero is a missing rate written wrong, and dividing by it used to produce
// Infinity. The independent verifier found it reachable through the new euro
// path and through the TRM, so the guard is tested on both.
check('convert: una TRM cero no vuelve infinito el resultado',
  Calc.convert(100, 'COP', 'USD', { trm: 0 }, null), null);
check('convert: ni una TRM negativa', Calc.convert(100, 'USD', 'COP', { trm: -4000 }, null), null);
check('convert: un euro cero no puede dar infinito',
  Calc.convert(100, 'EUR', 'USD', { eur_bcv: 0, bcv: 800 }, 'oficial'), null);
check('convert: ni un dolar cero', Calc.convert(100, 'USD', 'VES', { binance: 0 }, 'paralelo'), null);
check('convert: ni un euro cero contra bolivares',
  Calc.convert(100, 'EUR', 'VES', { eur_paralelo: 0 }, 'paralelo'), null);

/* --- the coherent pair rule: oficial with oficial, calle with calle ---- */

checkClose('pareja oficial: 100 EUR a Bs', Calc.convert(100, 'EUR', 'VES', RATES, 'oficial'), 90000);
checkClose('pareja paralela: 100 EUR a Bs', Calc.convert(100, 'EUR', 'VES', RATES, 'paralelo'), 110000);
checkClose('pareja oficial: 100 EUR a USD es 900/800', Calc.convert(100, 'EUR', 'USD', RATES, 'oficial'), 112.5);
checkClose('pareja paralela: 100 EUR a USD es 1100/1000', Calc.convert(100, 'EUR', 'USD', RATES, 'paralelo'), 110);
checkClose('ida y vuelta dentro de la misma pareja',
  Calc.convert(Calc.convert(100, 'EUR', 'USD', RATES, 'oficial'), 'USD', 'EUR', RATES, 'oficial'), 100);

// The rule is about what is never combined, so it needs a test that fails if the
// two markets get mixed. Move the street euro far away, and the official line
// must not move by a cent; move the street dollar, same thing.
const MOVED_EUR = Object.assign({}, RATES, { eur_paralelo: 3300 });
const MOVED_USD = Object.assign({}, RATES, { binance: 5000 });
checkClose('el euro de calle no toca la linea oficial',
  Calc.convert(100, 'EUR', 'USD', MOVED_EUR, 'oficial'), 112.5);
checkClose('ni el dolar de calle', Calc.convert(100, 'EUR', 'USD', MOVED_USD, 'oficial'), 112.5);
checkClose('la calle si responde a su propio euro', Calc.convert(100, 'EUR', 'USD', MOVED_EUR, 'paralelo'), 330);
check('los dos caminos dan numeros distintos para la misma entrada',
  Calc.convert(100, 'EUR', 'COP', RATES, 'oficial') !== Calc.convert(100, 'EUR', 'COP', RATES, 'paralelo'),
  true);

// The rates measured live in L13, with the two results computed outside this
// code before it was written: 10 EUR are 35.617,67 COP along the official pair
// and 35.465,60 along the street one. An outside view of the arithmetic, not a
// copy of what the code already produced.
const LIVE_RATES = {
  trm: 3181.74,
  bcv: 877.9023,
  binance: 1009.697123,
  eur_bcv: 982.75895071,
  eur_paralelo: 1125.469688,
};
checkClose('L13: 10 EUR a COP por la pareja oficial', Calc.convert(10, 'EUR', 'COP', LIVE_RATES, 'oficial'), 35617.67, 0.01);
checkClose('L13: 10 EUR a COP por la pareja paralela', Calc.convert(10, 'EUR', 'COP', LIVE_RATES, 'paralelo'), 35465.6, 0.01);
checkClose('L13: el EUR/USD implicito oficial', Calc.convert(1, 'EUR', 'USD', LIVE_RATES, 'oficial'), 1.11944, 1e-5);
checkClose('L13: el EUR/USD implicito paralelo', Calc.convert(1, 'EUR', 'USD', LIVE_RATES, 'paralelo'), 1.114661, 1e-5);

/* --- the four currencies and their units ------------------------------ */

check('CURRENCIES: las cuatro, en el orden en que se muestran', Calc.CURRENCIES, ['COP', 'USD', 'VES', 'EUR']);
check('UNIT: el euro se muestra con su simbolo', Calc.UNIT.EUR, '€');
check('RATE_KEYS: las cinco tasas, en el orden en que se muestran',
  Calc.RATE_KEYS, ['trm', 'bcv', 'binance', 'eur_bcv', 'eur_paralelo']);
check('PATH_RATES: el camino oficial es BCV con BCV', Calc.PATH_RATES.oficial, { usd: 'bcv', eur: 'eur_bcv' });
check('PATH_RATES: el paralelo es calle con calle', Calc.PATH_RATES.paralelo, { usd: 'binance', eur: 'eur_paralelo' });

/* --- resultRows: which lines the page shows ---------------------------- */

const fromCop = Calc.resultRows(1000, 'COP', RATES);
check('resultRows: desde COP apunta a USD, Bs y EUR', fromCop.map((r) => r.target), ['USD', 'VES', 'EUR']);
check('resultRows: USD es una sola linea', fromCop[0].lines.length, 1);
check('resultRows: y esa linea no elige camino', fromCop[0].lines[0].path, null);
check('resultRows: Bs tiene una linea por camino', fromCop[1].lines.map((l) => l.path), ['oficial', 'paralelo']);
check('resultRows: EUR tambien, porque el euro solo se cotiza en Bs',
  fromCop[2].lines.map((l) => l.path), ['oficial', 'paralelo']);

const fromUsd = Calc.resultRows(1000, 'USD', RATES);
check('resultRows: desde USD apunta a COP, Bs y EUR', fromUsd.map((r) => r.target), ['COP', 'VES', 'EUR']);
check('resultRows: COP es una sola linea', fromUsd[0].lines.length, 1);
check('resultRows: Bs tiene una linea por camino', fromUsd[1].lines.map((l) => l.path), ['oficial', 'paralelo']);

const fromVes = Calc.resultRows(400000, 'VES', RATES);
check('resultRows: desde Bs apunta a COP, USD y EUR', fromVes.map((r) => r.target), ['COP', 'USD', 'EUR']);
check('resultRows: las tres dependen de que camino se use',
  fromVes.map((r) => r.lines.map((l) => l.path)),
  [['oficial', 'paralelo'], ['oficial', 'paralelo'], ['oficial', 'paralelo']]);
checkClose('resultRows: 400.000 Bs al BCV son 500 USD', fromVes[1].lines[0].value, 500);
checkClose('resultRows: 400.000 Bs en la calle son 400 USD', fromVes[1].lines[1].value, 400);
checkClose('resultRows: 400.000 Bs al BCV son 2.000.000 COP', fromVes[0].lines[0].value, 2000000);
checkClose('resultRows: 400.000 Bs al BCV son 444,44 EUR', fromVes[2].lines[0].value, 400000 / 900);

const fromEur = Calc.resultRows(10, 'EUR', RATES);
check('resultRows: desde EUR apunta a COP, USD y Bs', fromEur.map((r) => r.target), ['COP', 'USD', 'VES']);
check('resultRows: y las tres muestran los dos caminos',
  fromEur.every((r) => r.lines.length === 2), true);
checkClose('resultRows: 10 EUR a Bs por la calle son 11.000', fromEur[2].lines[1].value, 11000);
checkClose('resultRows: 10 EUR a COP por la calle', fromEur[0].lines[1].value, 10 * 1100 / 1000 * 4000);
check('resultRows: sin el euro del camino oficial no se inventa un cero',
  Calc.resultRows(10, 'EUR', { trm: 4000, bcv: 800, eur_paralelo: 1100 })
    .find((r) => r.target === 'VES').lines.map((l) => l.value),
  [null, 11000]);

/* --- the pair rule over all twelve ordered pairs (S10) ------------------ */

// This matrix is the independent verifier's own probe, kept as a test because it
// is the strongest form of the rule: it does not check a case, it checks every
// pair. Move the whole street market (dollar and euro) and the official line must
// not move by a cent; move the whole official market and the street line must not
// either. COP↔USD is the only pair with a single line.
const MOVED_STREET = Object.assign({}, RATES, { binance: 9999, eur_paralelo: 8888 });
const MOVED_OFFICIAL = Object.assign({}, RATES, { bcv: 7777, eur_bcv: 6666 });
for (const from of Calc.CURRENCIES) {
  for (const to of Calc.CURRENCIES) {
    if (from === to) continue;
    const colombiaOnly = (from === 'COP' && to === 'USD') || (from === 'USD' && to === 'COP');
    const row = (rates) => Calc.resultRows(1000, from, rates).find((r) => r.target === to);
    check(`pareja ${from}->${to}: lineas`, row(RATES).lines.length, colombiaOnly ? 1 : 2);
    if (colombiaOnly) continue;
    checkClose(`pareja ${from}->${to}: la oficial no mira la calle`,
      row(MOVED_STREET).lines[0].value, row(RATES).lines[0].value);
    checkClose(`pareja ${from}->${to}: la calle no mira la oficial`,
      row(MOVED_OFFICIAL).lines[1].value, row(RATES).lines[1].value);
  }
}

/* --- formatting -------------------------------------------------------- */

check('formatAmount: millones', Calc.formatAmount(1000000), '1.000.000');
check('formatAmount: dos decimales', Calc.formatAmount(1234.56), '1.234,56');
check('formatAmount: un decimal', Calc.formatAmount(1234.5), '1.234,5');
check('formatAmount: sin dato', Calc.formatAmount(null), '—');
check('formatRate: siempre dos decimales', Calc.formatRate(1011), '1.011,00');
check('formatRate: redondea', Calc.formatRate(877.9023), '877,90');
check('formatRate: sin dato', Calc.formatRate(undefined), '—');

/* --- dateOnly: must not shift a day through the timezone -------------- */

check('dateOnly: fecha con hora local', Calc.dateOnly('2026-10-14T00:00:00.000'), '14/10/2026');
check('dateOnly: con offset -04:00 no se corre un dia', Calc.dateOnly('2026-10-14T00:00:00-04:00'), '14/10/2026');
check('dateOnly: marca de tiempo UTC', Calc.dateOnly('2026-10-14T17:59:53Z'), '14/10/2026');
check('dateOnly: vacio', Calc.dateOnly(''), '');
check('dateOnly: basura', Calc.dateOnly('ayer'), '');

/* --- effectiveRates: the manual override must win, and nothing may become 0 --- */

const FILE = { trm: { value: 4000 }, bcv: { value: 800 }, binance: { value: 1000 } };
const KEYS = ['trm', 'bcv', 'binance'];
check('effectiveRates: sin nada a mano manda el archivo',
  Calc.effectiveRates(FILE, {}, KEYS), { trm: 4000, bcv: 800, binance: 1000 });
check('effectiveRates: tu valor gana sobre el archivo',
  Calc.effectiveRates(FILE, { bcv: 900 }, KEYS).bcv, 900);
check('effectiveRates: tu valor no toca las otras tasas',
  Calc.effectiveRates(FILE, { bcv: 900 }, KEYS).trm, 4000);
check('effectiveRates: un cero a mano no se cuela',
  Calc.effectiveRates(FILE, { bcv: 0 }, KEYS).bcv, 800);
check('effectiveRates: un valor negativo a mano tampoco',
  Calc.effectiveRates(FILE, { bcv: -5 }, KEYS).bcv, 800);
check('effectiveRates: sin dato en el archivo queda nulo, no cero',
  Calc.effectiveRates({ trm: { value: null } }, {}, ['trm']), { trm: null });
check('effectiveRates: archivo nulo entero',
  Calc.effectiveRates(null, {}, ['trm']), { trm: null });
check('effectiveRates: cero en el archivo tambien es nulo',
  Calc.effectiveRates({ trm: { value: 0 } }, {}, ['trm']), { trm: null });
check('effectiveRates: sin lista de claves cubre las cinco tasas',
  Object.keys(Calc.effectiveRates({}, {}, null)), Calc.RATE_KEYS);
check('effectiveRates: y un euro a mano gana sobre el archivo',
  Calc.effectiveRates({ eur_bcv: { value: 900 } }, { eur_bcv: 1000 }, null).eur_bcv, 1000);

/* --- parseRate: the rate reader must not inflate by a thousand --------- */

// The verifier found this: every string below is a Binance price recorded in L6,
// and the amount reader turned each one into a thousand times its real value.
check('parseRate: precio de Binance con punto', Calc.parseRate('1011.500'), 1011.5);
check('parseRate: el 1012.005 de L6', Calc.parseRate('1012.005'), 1012.005);
check('parseRate: el 1010.775 de L6', Calc.parseRate('1010.775'), 1010.775);
check('parseRate: precio de Binance con coma', Calc.parseRate('1011,500'), 1011.5);
check('parseRate: TRM con punto decimal', Calc.parseRate('3181.74'), 3181.74);
check('parseRate: TRM en formato local', Calc.parseRate('3.181,74'), 3181.74);
check('parseRate: TRM en formato anglo', Calc.parseRate('3,181.74'), 3181.74);
check('parseRate: agrupacion real con dos separadores', Calc.parseRate('1.011.500'), 1011500);
check('parseRate: vacio', Calc.parseRate(''), 0);

// The two readers must differ on exactly this input, and that is the point.
check('los dos lectores difieren en 1011.500: monto', Calc.parseAmount('1011.500'), 1011500);
check('los dos lectores difieren en 1011.500: tasa', Calc.parseRate('1011.500'), 1011.5);
check('el lector de montos sigue agrupando 1.000', Calc.parseAmount('1.000'), 1000);
check('el lector de tasas no agrupa un separador solo', Calc.parseRate('1.000'), 1);

/* --- interpretationNote: a reading is shown when it could be wrong ------ */

check('interpretationNote: sin separador no dice nada', Calc.interpretationNote('1011', 1011, 'rate'), '');
check('interpretationNote: texto ya canonico no dice nada', Calc.interpretationNote('1.011,50', 1011.5, 'rate'), '');
check('interpretationNote: un simbolo de moneda no dispara un aviso falso', Calc.interpretationNote('$ 1.000.000', 1000000, 'amount'), '');
check('interpretationNote: palabras alrededor tampoco', Calc.interpretationNote('1.000.000 COP', 1000000, 'amount'), '');
check('interpretationNote: muestra las dos lecturas de una tasa', Calc.interpretationNote('1011.500', 1011.5, 'rate'), 'se lee como 1.011,50 · la otra lectura es 1.011.500,00');
check('interpretationNote: la tasa tecleada con miles avisa la alternativa', Calc.interpretationNote('1.011', 1.011, 'rate'), 'se lee como 1,01 · la otra lectura es 1.011,00');
check('interpretationNote: el monto ambiguo muestra las dos', Calc.interpretationNote('1000.500', 1000500, 'amount'), 'se lee como 1.000.500 · la otra lectura es 1.000,5');
check('interpretationNote: vacio', Calc.interpretationNote('', 0, 'amount'), '');
check('interpretationNote: nulo', Calc.interpretationNote(null, 0, 'amount'), '');

/* --- the service worker must precache files that exist ------------------ */

const fs = require('fs');
const swSource = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const precached = [...swSource.matchAll(/'\.\/([A-Za-z0-9._-]+)'/g)].map((match) => match[1]);
check('sw.js precachea archivos', precached.length > 0, true);
for (const file of precached) {
  check(`sw.js precachea ${file}, y el archivo existe`,
    fs.existsSync(path.join(__dirname, '..', file)), true);
}

// A syntax error in the service worker silently kills offline mode, and nothing
// else in the suite would notice. Parsing it is cheap and catches that.
let swSyntax = 'ok';
try {
  new Function(swSource);
} catch (error) {
  swSyntax = error.message;
}
check('sw.js no tiene errores de sintaxis', swSyntax, 'ok');

// The shell must not be cache-first only: that is what kept a deploy from ever
// reaching an installed phone until VERSION was bumped by hand.
check('sw.js refresca el shell desde la red, no solo desde el cache',
  swSource.includes('staleWhileRevalidate'), true);

/* --- live refresh: the three sources a page can reach ------------------ */

const TRM_PAYLOAD = [{ valor: '3181.74', vigenciadesde: '2026-10-14T00:00:00.000' }];

check('readTrm: lee el valor y la fecha', Calc.readTrm(TRM_PAYLOAD),
  { value: 3181.74, asOf: '2026-10-14T00:00:00.000' });
check('readTrm: lista vacia', Calc.readTrm([]), null);
check('readTrm: nulo', Calc.readTrm(null), null);
check('readTrm: valor basura', Calc.readTrm([{ valor: 'no es un numero' }]), null);
check('readTrm: cero no es una tasa', Calc.readTrm([{ valor: '0' }]), null);

check('readDolarApi: lee el promedio', Calc.readDolarApi({ promedio: 877.9023, fechaActualizacion: 'x' }),
  { value: 877.9023, asOf: 'x' });
check('readDolarApi: sin promedio', Calc.readDolarApi({}), null);
check('readDolarApi: nulo', Calc.readDolarApi(null), null);

check('liveSources: son las cinco tasas',
  Calc.LIVE_SOURCES.map((s) => s.key), ['trm', 'bcv', 'binance', 'eur_bcv', 'eur_paralelo']);
check('liveSources: y son exactamente las claves que el archivo trae',
  Calc.LIVE_SOURCES.map((s) => s.key), Calc.RATE_KEYS);
check('liveSources: Binance P2P directo no es alcanzable desde el navegador, asi que va por DolarApi',
  Calc.LIVE_SOURCES.find((s) => s.key === 'binance').url.includes('dolarapi'), true);
check('liveSources: el euro oficial sale del endpoint oficial, no del del dolar',
  Calc.LIVE_SOURCES.find((s) => s.key === 'eur_bcv').url.endsWith('/euros/oficial'), true);
check('liveSources: el euro paralelo sale del endpoint paralelo',
  Calc.LIVE_SOURCES.find((s) => s.key === 'eur_paralelo').url.endsWith('/euros/paralelo'), true);
check('liveSources: cada una sabe leer su respuesta',
  Calc.LIVE_SOURCES.every((s) => typeof s.read === 'function'), true);

const PREVIOUS = {
  updatedAt: 'viejo',
  rates: {
    trm: { value: 3000, asOf: 'a', source: 'datos.gov.co', stale: false },
    bcv: { value: 800, asOf: 'b', source: 've.dolarapi.com', stale: false },
    binance: { value: 1000, asOf: null, source: 'p2p.binance.com', stale: false },
    eur_bcv: { value: 900, asOf: 'd', source: 've.dolarapi.com', stale: false },
    eur_paralelo: { value: 1100, asOf: 'd', source: 've.dolarapi.com', stale: false },
  },
};
const MERGED = Calc.mergeLiveReadings(PREVIOUS, {
  trm: { value: 3181.74, asOf: 'c', source: 'datos.gov.co' },
  bcv: null,
  binance: { value: 1010.5, asOf: null, source: 've.dolarapi.com' },
  eur_bcv: { value: 982.75895071, asOf: 'e', source: 've.dolarapi.com' },
  eur_paralelo: null,
}, 'AHORA');

check('mergeLiveReadings: la que responde queda fresca', MERGED.rates.trm.stale, false);
check('mergeLiveReadings: y con el valor nuevo', MERGED.rates.trm.value, 3181.74);
check('mergeLiveReadings: la que no responde conserva su valor', MERGED.rates.bcv.value, 800);
check('mergeLiveReadings: y queda marcada como vieja', MERGED.rates.bcv.stale, true);
check('mergeLiveReadings: la lista de fallas lo dice', MERGED.failed, ['bcv', 'eur_paralelo']);
check('mergeLiveReadings: el euro que respondio trae su valor nuevo', MERGED.rates.eur_bcv.value, 982.75895071);
check('mergeLiveReadings: y el que no respondio conserva el suyo', MERGED.rates.eur_paralelo.value, 1100);
check('mergeLiveReadings: la marca de tiempo se renueva', MERGED.updatedAt, 'AHORA');
check('mergeLiveReadings: la fuente se actualiza a la que respondio',
  MERGED.rates.binance.source, 've.dolarapi.com');
check('mergeLiveReadings: sin previo y sin respuesta queda sin valor',
  Calc.mergeLiveReadings(null, { trm: null }, 'AHORA').rates.trm.value, undefined);
check('mergeLiveReadings: sin previo y sin respuesta queda marcada',
  Calc.mergeLiveReadings(null, { trm: null }, 'AHORA').failed,
  ['trm', 'bcv', 'binance', 'eur_bcv', 'eur_paralelo']);
check('mergeLiveReadings: un euro que no responde conserva su ultimo valor',
  Calc.mergeLiveReadings(
    { rates: { eur_paralelo: { value: 1120, source: 've.dolarapi.com' } } },
    { eur_paralelo: null },
    'AHORA',
  ).rates.eur_paralelo.value,
  1120);
check('mergeLiveReadings: y el euro que si responde queda fresco',
  Calc.mergeLiveReadings(
    null,
    { eur_bcv: { value: 982.75895071, asOf: 'x', source: 've.dolarapi.com' } },
    'AHORA',
  ).rates.eur_bcv.stale,
  false);
check('mergeLiveReadings: un valor no utilizable no se cree',
  Calc.mergeLiveReadings(null, { trm: { value: 0 } }, 'AHORA').rates.trm.stale, true);
check('mergeLiveReadings: un previo sin rates no rompe',
  Calc.mergeLiveReadings({ updatedAt: 'x' }, { bcv: { value: 900 } }, 'AHORA').rates.bcv.value, 900);

/* --- report ------------------------------------------------------------ */

console.log(`calc.js: ${passed} pasaron, ${failures.length} fallaron`);
for (const failure of failures) console.log(`  FALLA ${failure}`);

process.exit(failures.length === 0 ? 0 : 1);
