/*
 * Offline shell for the calculator.
 *
 * The page has to keep working in Venezuela with a bad connection, so the app
 * shell is served from the cache and rates.json is fetched from the network
 * when possible. The last good rates also live in localStorage, which is what
 * the page falls back to when even this cache is cold.
 */
'use strict';

const VERSION = 'v3';
const SHELL_CACHE = `calc-shell-${VERSION}`;
const RATES_CACHE = `calc-rates-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './calc.js',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, RATES_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(RATES_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

/**
 * Serve the shell from the cache, so the app opens instantly and works offline,
 * and refresh that copy from the network in the background. The next load gets
 * the new version.
 *
 * Plain cache-first was the wrong choice here, and it was a real defect: the
 * shell would never update after a deploy unless the cache name changed, so
 * every fix stayed invisible on an installed phone until someone remembered to
 * bump VERSION. With this, a deploy reaches an installed client on its own.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  const fresh = fetch(request)
    .then((response) => {
      if (response.ok && response.type === 'basic') cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    url.pathname.endsWith('/rates.json')
      ? networkFirst(request)
      : staleWhileRevalidate(request),
  );
});
