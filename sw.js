// SIGONET V2 — service worker: deixa o app ABRIR sem sinal.
// Regra: rede primeiro (quem está online sempre recebe a versão nova do site);
// sem rede, usa a última cópia guardada no aparelho. Só arquivos do site e das
// bibliotecas (jsPDF, SheetJS, fonte). O servidor de dados (Apps Script) nunca
// passa por aqui: POST e script.google.com seguem direto.
const CACHE = 'sigonet-v2-app';
const BIBLIOTECAS = /^https:\/\/(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', ev => ev.waitUntil(self.clients.claim()));

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const doSite = url.origin === self.location.origin;
  if (!doSite && !BIBLIOTECAS.test(req.url)) return; // Apps Script, Nominatim, Drive…: direto
  if (doSite && url.pathname.endsWith('/exec')) return; // servidor de teste local
  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const resp = await fetch(req);
      if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone()).catch(() => { });
      return resp;
    } catch (e) {
      const guardado = await cache.match(req, { ignoreSearch: doSite });
      if (guardado) return guardado;
      if (req.mode === 'navigate') { const inicio = await cache.match(new URL('./', self.location).href) || await cache.match(new URL('index.html', self.location).href); if (inicio) return inicio; }
      throw e;
    }
  })());
});
