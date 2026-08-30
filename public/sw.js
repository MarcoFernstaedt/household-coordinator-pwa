const CACHE = 'household-coordinator-shell-v2';
const CORE = ['/manifest.webmanifest', '/icon.svg'];

async function installShell() {
  const cache = await caches.open(CACHE);
  const rootRequest = new Request('/', { cache: 'reload' });
  const rootResponse = await fetch(rootRequest);
  if (!rootResponse.ok) throw new Error('Application shell is unavailable.');
  const html = await rootResponse.clone().text();
  await cache.put('/', rootResponse);
  const discovered = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => path && !path.startsWith('/api/'));
  const urls = [...new Set([...CORE, ...discovered])];
  await Promise.all(
    urls.map(async (url) => {
      const request = new Request(url, { cache: 'reload' });
      const response = await fetch(request);
      if (!response.ok) throw new Error('A shell asset is unavailable.');
      await cache.put(url, response);
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(installShell());
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  event.respondWith(
    fetch(event.request)
      .then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(event.request, response.clone());
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
