// SIGONET V2 — Rede da empresa (export do GeoGrid): regras puras.
//
// O KMZ do GeoGrid vem assim: Documento › Cidade ("Valinhos - SP") › "Cabos (n)" e "Caixas de
// emenda (n)" › (faixas "De 0 até 500"…) › Placemark. Cabo = LineString ("NTT0001 (101)":
// nome e ID do GeoGrid), caixa = Point ("CE0001"), cor do cabo no estilo, cor da caixa no ícone.
// Aqui: ler, compactar por cidade (polyline codificada, ~1 m de precisão), medir, apontar
// problemas de cadastro e achar a caixa mais perto de um ponto.
// Roda no navegador (window.REDE) e no Node (testes).
(function (raiz) {
  'use strict';
  var R = {};

  // ─────────── Geometria ───────────
  var rad = function (g) { return g * Math.PI / 180; };
  R.dist = function (a, b) {
    var dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  R.comprimento = function (pts) { var s = 0; for (var i = 1; i < pts.length; i++) s += R.dist(pts[i - 1], pts[i]); return s; };
  var xy = function (p, ref) { return [(p[1] - ref[1]) * 111320 * Math.cos(rad(ref[0])), (p[0] - ref[0]) * 110574]; };
  R.distSeg = function (p, a, b) {
    var P = xy(p, a), B = xy(b, a), L2 = B[0] * B[0] + B[1] * B[1], t = L2 ? Math.max(0, Math.min(1, (P[0] * B[0] + P[1] * B[1]) / L2)) : 0;
    return Math.sqrt((P[0] - t * B[0]) * (P[0] - t * B[0]) + (P[1] - t * B[1]) * (P[1] - t * B[1]));
  };
  R.simplificar = function (pts, tol) {
    if (pts.length < 3) return pts.slice();
    var manter = new Array(pts.length), pilha = [[0, pts.length - 1]]; manter[0] = manter[pts.length - 1] = true;
    while (pilha.length) {
      var par = pilha.pop(), maior = 0, idx = -1;
      for (var i = par[0] + 1; i < par[1]; i++) { var d = R.distSeg(pts[i], pts[par[0]], pts[par[1]]); if (d > maior) { maior = d; idx = i; } }
      if (idx > 0 && maior > tol) { manter[idx] = true; pilha.push([par[0], idx], [idx, par[1]]); }
    }
    return pts.filter(function (p, i) { return manter[i]; });
  };

  // ─────────── Polyline codificada (algoritmo do Google, 5 casas ≈ 1 m) ───────────
  R.codificar = function (pts) {
    var out = '', pl = 0, pg = 0;
    var num = function (v) { v = v < 0 ? ~(v << 1) : v << 1; var s = ''; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
    pts.forEach(function (p) { var la = Math.round(p[0] * 1e5), lg = Math.round(p[1] * 1e5); out += num(la - pl) + num(lg - pg); pl = la; pg = lg; });
    return out;
  };
  R.decodificar = function (s) {
    var pts = [], i = 0, la = 0, lg = 0;
    var num = function () { var r = 0, sh = 0, b; do { b = s.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20); return r & 1 ? ~(r >> 1) : r >> 1; };
    while (i < s.length) { la += num(); lg += num(); pts.push([la / 1e5, lg / 1e5]); }
    return pts;
  };

  // ─────────── Nomes ───────────
  R.corKml = function (c) { var h = String(c || '').trim().toLowerCase(); return /^[0-9a-f]{8}$/.test(h) ? '#' + h.slice(6, 8) + h.slice(4, 6) + h.slice(2, 4) : '#000000'; };
  R.norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); };
  // "Campinas - SP (2)" → "CAMPINAS"; serve para casar com a cidade de chamados e projetos.
  R.chaveCidade = function (s) { return R.norm(String(s || '').replace(/\(\d+\)\s*$/, '').replace(/\s-\s[A-Z]{2}\s*$/i, '')); };
  var semEntidades = function (s) { return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').trim(); };
  R.idGeogrid = function (nome) { var m = /\((\d+)\)\s*$/.exec(String(nome || '')); return m ? m[1] : ''; };
  R.naoLancado = function (nome, desc) { return /N[ÃA]O\s+LAN[ÇC]/i.test(String(nome || '') + ' ' + String(desc || '')); };

  // ─────────── Legenda do GeoGrid (explicada pelo usuário em 2026-10-12) ───────────
  // Caixa: azul-claro = CEO nova (mini FOSC, só a Manutenção instala; número de 4 dígitos, único, para rastreio);
  // preto = FOSC antiga (sem numeração de rastreio); verde = CEO com splitter. Cabo: prefixo do nome = POP.
  R.TIPOS_CAIXA = {
    MINI_FOSC: { rot: 'CEO nova (mini FOSC · rastreável)', cor: '#10a0f0' },
    FOSC: { rot: 'FOSC antiga (sem rastreio)', cor: '#000000' },
    SPLITTER: { rot: 'CEO com splitter', cor: '#008000' },
    OUTRA: { rot: 'Outra cor (sem legenda)', cor: '' }
  };
  var rgb = function (h) { var n = parseInt(String(h || '').replace('#', ''), 16); return isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : null; };
  R.tipoCaixa = function (cor) {
    var c = rgb(cor); if (!c) return 'OUTRA';
    var melhor = 'OUTRA', dm = 60;
    ['MINI_FOSC', 'FOSC', 'SPLITTER'].forEach(function (k) { var t = rgb(R.TIPOS_CAIXA[k].cor), d = Math.sqrt(Math.pow(c[0] - t[0], 2) + Math.pow(c[1] - t[1], 2) + Math.pow(c[2] - t[2], 2)); if (d < dm) { dm = d; melhor = k; } });
    return melhor;
  };
  // Número de rastreio da mini FOSC (4 dígitos no nome: "CE1234", "CEO 1234").
  R.numeroRastreio = function (nome) { var m = /(?:^|\D)(\d{4})(?!\d)/.exec(String(nome || '')); return m ? m[1] : ''; };
  // POP do cabo = letras do começo do nome ("BLV012 (14265)" → BLV). Nome sem esse padrão: "(sem POP)".
  R.popDoCabo = function (nome) { var m = /^([A-Z]{2,4})\d/.exec(R.norm(nome)); return m ? m[1] : '(sem POP)'; };

  // ─────────── Ler o KML do GeoGrid ───────────
  // corIcone(href) → '#rrggbb' (o app tira do PNG do ícone); sem ela, a caixa fica sem cor.
  R.lerGeogrid = function (txt, opts) {
    var o = opts || {}, s = String(txt || ''), estilos = {}, pilha = [], doc = '', cidades = {}, ordem = [];
    var re = /<Folder\b[^>]*>|<\/Folder>|<Style\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/Style>|<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>|<name>([\s\S]*?)<\/name>/g, m;
    var tag = function (corpo, t) { var x = new RegExp('<' + t + '>\\s*([\\s\\S]*?)\\s*</' + t + '>').exec(corpo); return x ? x[1] : ''; };
    var coords = function (c) { return String(c).trim().split(/\s+/).map(function (t) { var v = t.split(','); return [Number(v[1]), Number(v[0])]; }).filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); }); };
    while ((m = re.exec(s))) {
      var t = m[0];
      if (t.charAt(1) === 'F') { pilha.push({ nome: null }); continue; }
      if (t.charAt(1) === '/') { pilha.pop(); continue; }
      if (m[1] != null) { estilos['#' + m[1]] = { cor: tag(m[2], 'color'), href: tag(m[2], 'href') }; continue; }
      if (m[4] != null) { if (pilha.length && pilha[pilha.length - 1].nome == null) pilha[pilha.length - 1].nome = semEntidades(m[4]); else if (!pilha.length && !doc) doc = semEntidades(m[4]); continue; }
      var corpo = m[3], cidade = pilha.length ? pilha[0].nome || '(sem cidade)' : '(sem cidade)';
      var c = cidades[cidade] || (cidades[cidade] = { cidade: cidade, cabos: [], caixas: [] }); if (c.cabos.length + c.caixas.length === 0 && ordem.indexOf(cidade) < 0) ordem.push(cidade);
      var nome = semEntidades(tag(corpo, 'name')), desc = semEntidades(tag(corpo, 'description')), est = estilos[tag(corpo, 'styleUrl')] || {};
      var ls = /<LineString\b[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/.exec(corpo), pt = /<Point\b[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/.exec(corpo);
      if (ls) {
        var pts = coords(ls[1]); if (pts.length < 2) { c.semGeometria = (c.semGeometria || 0) + 1; continue; }
        var cor = tag(corpo, 'color') || est.cor;
        c.cabos.push({ n: nome, cor: R.corKml(cor), m: Math.round(R.comprimento(pts) * 10) / 10, pts: R.simplificar(pts, 1.5), d: desc });
      } else if (pt) {
        var p = coords(pt[1])[0]; if (!p) { c.semGeometria = (c.semGeometria || 0) + 1; continue; }
        var href = tag(corpo, 'href') || est.href;
        c.caixas.push({ n: nome, cor: o.corIcone ? o.corIcone(href) || '' : '', lat: Math.round(p[0] * 1e6) / 1e6, lng: Math.round(p[1] * 1e6) / 1e6, d: desc });
      } else if (/<(LineString|Point)/.test(corpo)) c.semGeometria = (c.semGeometria || 0) + 1; // sem coordenadas
    }
    return { nome: doc, cidades: ordem.map(function (k) { return cidades[k]; }) };
  };

  // Arquivo da cidade (o que vai para o Drive): cabos [nome, cor, metros, polyline, descrição], caixas [nome, cor, lat, lng, descrição].
  R.compactar = function (c) {
    return { cidade: c.cidade, cabos: c.cabos.map(function (x) { return [x.n, x.cor, x.m, R.codificar(x.pts), x.d || '']; }),
      caixas: c.caixas.map(function (x) { return [x.n, x.cor, x.lat, x.lng, x.d || '']; }) };
  };
  R.expandir = function (j) {
    var d = typeof j === 'string' ? JSON.parse(j) : j;
    return { cidade: d.cidade, cabos: d.cabos.map(function (x) { return { n: x[0], cor: x[1], m: x[2], pts: R.decodificar(x[3]), d: x[4] || '' }; }),
      caixas: d.caixas.map(function (x) { return { n: x[0], cor: x[1], lat: x[2], lng: x[3], d: x[4] || '' }; }) };
  };

  // ─────────── Índice espacial simples (células de ~110 m) ───────────
  var G = 0.001, chave = function (la, lg) { return Math.floor(la / G) + '|' + Math.floor(lg / G); };
  var indiceCabos = function (d) {
    if (d._ic) return d._ic; var ic = {};
    d.cabos.forEach(function (c, k) { for (var i = 1; i < c.pts.length; i++) { var a = c.pts[i - 1], b = c.pts[i];
      for (var x = Math.floor(Math.min(a[0], b[0]) / G) - 1; x <= Math.floor(Math.max(a[0], b[0]) / G) + 1; x++)
        for (var y = Math.floor(Math.min(a[1], b[1]) / G) - 1; y <= Math.floor(Math.max(a[1], b[1]) / G) + 1; y++) { var kk = x + '|' + y; (ic[kk] = ic[kk] || []).push([k, i]); } } });
    Object.defineProperty(d, '_ic', { value: ic, enumerable: false }); return ic;
  };
  var indiceCaixas = function (d) {
    if (d._ix) return d._ix; var ix = {};
    d.caixas.forEach(function (c, k) { var kk = chave(c.lat, c.lng); (ix[kk] = ix[kk] || []).push(k); });
    Object.defineProperty(d, '_ix', { value: ix, enumerable: false }); return ix;
  };
  // Cabo mais perto do ponto (até ~110 m): { d, cabo }.
  R.caboMaisPerto = function (d, lat, lng, exceto) {
    var ic = indiceCabos(d), l = ic[chave(lat, lng)] || [], melhor = { d: Infinity, k: -1 };
    l.forEach(function (x) { if (x[0] === exceto) return; var c = d.cabos[x[0]], dd = R.distSeg([lat, lng], c.pts[x[1] - 1], c.pts[x[1]]); if (dd < melhor.d) melhor = { d: dd, k: x[0] }; });
    return { d: melhor.d, cabo: melhor.k >= 0 ? d.cabos[melhor.k] : null };
  };
  var caixaPerto = function (d, lat, lng) {
    var ix = indiceCaixas(d), bx = Math.floor(lat / G), by = Math.floor(lng / G), best = Infinity;
    for (var x = bx - 1; x <= bx + 1; x++) for (var y = by - 1; y <= by + 1; y++) (ix[x + '|' + y] || []).forEach(function (k) { var c = d.caixas[k], dd = R.dist([lat, lng], [c.lat, c.lng]); if (dd < best) best = dd; });
    return best;
  };
  // As n caixas mais perto de um ponto (busca na cidade toda), com a distância em linha reta.
  R.caixasMaisProximas = function (d, lat, lng, n) {
    return d.caixas.map(function (c) { return { c: c, d: R.dist([lat, lng], [c.lat, c.lng]) }; }).sort(function (a, b) { return a.d - b.d; }).slice(0, n || 5);
  };

  // ─────────── Qualidade do cadastro ───────────
  // Conferido contra a REDE INTEIRA (base = todas as cidades juntas, R.juntar): um cabo de Campinas
  // pode terminar numa caixa cadastrada em Valinhos.
  // pontaSolta: fim de cabo sem caixa a 25 m e sem encostar (3 m) em outro cabo — cliente final sem
  //   caixa, caixa faltando no cadastro ou cabo desenhado até o lugar errado.
  // caixaSemCabo: caixa a mais de 30 m de qualquer cabo. naoLancado: "CABO NÃO LANÇADO".
  // caixasOutraCidade: caixa sem cabo da PRÓPRIA pasta a 30 m (o cabo dela está na pasta de outra cidade — comum
  // em cabo que cruza o limite entre cidades). Não é defeito de rede: é organização das pastas no GeoGrid.
  R.juntar = function (lista) {
    var b = { cabos: [], caixas: [] };
    lista.forEach(function (d) { d.cabos.forEach(function (c) { c.cid = d.cidade; b.cabos.push(c); }); d.caixas.forEach(function (c) { c.cid = d.cidade; b.caixas.push(c); }); });
    return b;
  };
  R.qualidade = function (d, base) {
    var B = base || d, q = { pontasSoltas: [], caixasSemCabo: [], caixasOutraCidade: [], naoLancados: [], curtos: [], nomesRepetidos: [], rastreioRepetido: [], miniFoscSemNumero: [] };
    var idx = new Map(); B.cabos.forEach(function (c, k) { idx.set(c, k); });
    d.cabos.forEach(function (c) {
      if (R.naoLancado(c.n, c.d)) q.naoLancados.push({ n: c.n, m: c.m, lat: c.pts[0][0], lng: c.pts[0][1] });
      if (c.m < 5) q.curtos.push({ n: c.n, m: c.m, lat: c.pts[0][0], lng: c.pts[0][1] });
      var k = idx.get(c);
      [c.pts[0], c.pts[c.pts.length - 1]].forEach(function (p) {
        if (caixaPerto(B, p[0], p[1]) <= 25) return;
        if (R.caboMaisPerto(B, p[0], p[1], k).d <= 3) return;
        q.pontasSoltas.push({ n: c.n, lat: p[0], lng: p[1] });
      });
    });
    d.caixas.forEach(function (c) {
      var cm = R.caboMaisPerto(B, c.lat, c.lng);
      if (cm.d > 30) q.caixasSemCabo.push({ n: c.n, lat: c.lat, lng: c.lng });
      else if (B !== d && cm.cabo.cid !== d.cidade) {
        var propria = (indiceCabos(B)[chave(c.lat, c.lng)] || []).some(function (x) { var cb = B.cabos[x[0]]; return cb.cid === d.cidade && R.distSeg([c.lat, c.lng], cb.pts[x[1] - 1], cb.pts[x[1]]) <= 30; });
        if (!propria) q.caixasOutraCidade.push({ n: c.n, lat: c.lat, lng: c.lng, cidade: cm.cabo.cid });
      }
    });
    // Mini FOSC: o número de 4 dígitos é único (rastreio). Repetido ou faltando = cadastro a corrigir.
    var nums = {};
    d.caixas.forEach(function (c) { if (R.tipoCaixa(c.cor) !== 'MINI_FOSC') return; var n = R.numeroRastreio(c.n);
      if (!n) q.miniFoscSemNumero.push({ n: c.n, lat: c.lat, lng: c.lng }); else (nums[n] = nums[n] || []).push(c); });
    Object.keys(nums).forEach(function (k) { if (nums[k].length > 1) nums[k].forEach(function (c) { q.rastreioRepetido.push({ n: c.n, lat: c.lat, lng: c.lng, vezes: nums[k].length }); }); });
    var vistos = {};
    d.cabos.concat(d.caixas).forEach(function (x) { var k = R.norm(x.n); if (!k) return; vistos[k] = (vistos[k] || 0) + 1; });
    Object.keys(vistos).forEach(function (k) { if (vistos[k] > 1) q.nomesRepetidos.push({ n: k, vezes: vistos[k] }); });
    return q;
  };
  // Linha do índice para uma cidade.
  R.resumo = function (d, q) {
    var lats = [], lngs = [];
    d.cabos.forEach(function (c) { c.pts.forEach(function (p) { lats.push(p[0]); lngs.push(p[1]); }); });
    d.caixas.forEach(function (c) { lats.push(c.lat); lngs.push(c.lng); });
    var km = d.cabos.reduce(function (s, c) { return s + c.m; }, 0) / 1000, nl = q.naoLancados.reduce(function (s, c) { return s + c.m; }, 0) / 1000;
    var mn = function (a) { return a.reduce(function (x, y) { return y < x ? y : x; }, Infinity); }, mx = function (a) { return a.reduce(function (x, y) { return y > x ? y : x; }, -Infinity); };
    return { cidade: d.cidade, chave: R.chaveCidade(d.cidade), cabos: d.cabos.length, km: Math.round(km * 10) / 10, caixas: d.caixas.length,
      naoLancados: q.naoLancados.length, naoLancadosKm: Math.round(nl * 10) / 10, pontasSoltas: q.pontasSoltas.length, caixasSemCabo: q.caixasSemCabo.length, caixasOutraCidade: q.caixasOutraCidade.length,
      curtos: q.curtos.length, nomesRepetidos: q.nomesRepetidos.length, semGeometria: d.semGeometria || 0,
      rastreioRepetido: q.rastreioRepetido.length, miniFoscSemNumero: q.miniFoscSemNumero.length,
      tiposCaixa: d.caixas.reduce(function (a, c) { var t = R.tipoCaixa(c.cor); a[t] = (a[t] || 0) + 1; return a; }, {}),
      pops: d.cabos.reduce(function (a, c) { var p = R.popDoCabo(c.n), x = a[p] = a[p] || { cabos: 0, km: 0 }; x.cabos++; x.km = Math.round((x.km + c.m / 1000) * 10) / 10; return a; }, {}),
      bbox: lats.length ? [mn(lats), mn(lngs), mx(lats), mx(lngs)] : null };
  };
  // Cidade do índice que corresponde a um nome de cidade qualquer ("Valinhos", "VALINHOS - SP"…).
  R.acharCidade = function (indice, nome) {
    var k = R.chaveCidade(nome); if (!k || !indice) return null;
    var l = (indice.cidades || []).filter(function (c) { return (c.chave || R.chaveCidade(c.cidade)) === k; });
    return l.sort(function (a, b) { return b.km - a.km; })[0] || null;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
  else raiz.REDE = R;
})(typeof window !== 'undefined' ? window : this);
