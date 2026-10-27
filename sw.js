// SIGONET V2 — service worker: deixa o app ABRIR sem sinal.
// Regra: rede primeiro (quem está online sempre recebe a versão nova do site);
// sem rede, usa a última cópia guardada no aparelho. Só arquivos do site e das
// bibliotecas (jsPDF, SheetJS, fonte). O servidor de dados (Apps Script) nunca
// passa por aqui: POST e script.google.com seguem direto.
const CACHE = 'sigonet-v2-app'; // versão do site 116f66e134
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
      // Arquivos do site: sempre confere com o servidor (no-cache = revalida; 304 se nada mudou),
      // para nunca abrir com a cópia de 10 minutos que o navegador guardou.
      const resp = await (!doSite ? fetch(req) : req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' }));
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

// Toque no aviso do sistema: traz o SigoNet para a frente e abre a conversa (mensagem nova)
// ou a OS (nova OS despachada para o técnico).
self.addEventListener('notificationclick', ev => {
  ev.notification.close();
  const d = ev.notification.data || {};
  ev.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = abertas.find(x => x.url.startsWith(self.registration.scope));
    if (c) { await c.focus(); if (d.ref) c.postMessage({ abrirConversa: d.ref }); if (d.os) c.postMessage({ abrirOs: d.os }); return; }
    const base = new URL('./', self.registration.scope).href;
    await self.clients.openWindow(d.os ? base + '#/tec/os/' + encodeURIComponent(d.os) : base + (d.ref ? '?conversa=' + encodeURIComponent(d.ref) : ''));
  })());
});
