// SIGONET V2 — Rota pelo ponto A e B (regras puras, sem tela).
//
// Pedido do usuário (2026-10-15): em todo lugar que pede para anexar KMZ, dar a opção de informar o ponto A e
// o ponto B (link do Google Maps ou lat/long). Como temos a rede inteira do GeoGrid, o SigoNet acha o caminho
// pelos cabos existentes (REDE.rotaPelaRede), gera o KMZ desse trecho e mostra os metros de rota, as caixas
// (CEO/CTO) que estão nele e a previsão de postes.
(function (raiz) {
  var REDE = raiz.REDE || (typeof require === 'function' ? require('./rede-regras.js') : null);
  var A = {};
  var num = function (s) { return Number(String(s).replace(',', '.')); };
  var ok = function (lat, lng) { return isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0); };
  var par = function (lat, lng) { lat = num(lat); lng = num(lng); return ok(lat, lng) ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 } : null; };
  // Grau, minuto, segundo: 22°58'12.3"S 46°59'01.2"W
  var dms = function (t) {
    var re = /(\d{1,3})\s*[°º]\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:["″]|'')?\s*([NSLOEW])/gi, m, v = [];
    while ((m = re.exec(t))) { var x = Number(m[1]) + Number(m[2]) / 60 + num(m[3]) / 3600; if (/[SOW]/i.test(m[4])) x = -x; v.push({ x: x, h: m[4].toUpperCase() }); }
    if (v.length !== 2) return null;
    var la = /[NS]/.test(v[0].h) ? v[0] : v[1], lo = la === v[0] ? v[1] : v[0];
    return par(la.x, lo.x);
  };

  // Lê um ponto: "lat, lng", link do Google Maps (o pino !3d!4d, ?q=, ?ll=, destination=, @lat,lng) ou graus/min/seg.
  // Devolve { lat, lng } ou { erro }.
  A.lerPonto = function (txt) {
    var t = String(txt || '').trim(); if (!t) return { erro: 'vazio' };
    try { t = decodeURIComponent(t); } catch (e) { }
    if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(t))
      return { erro: 'Link curto do Google Maps não traz a coordenada. Abra o link, espere o mapa carregar e copie o endereço da barra (ou clique com o botão direito no ponto e copie o "lat, long").' };
    var m = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(t);
    if (!m) m = /[?&](?:q|query|ll|destination|center|daddr|saddr)=(?:loc:)?\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/i.exec(t);
    if (!m) m = /\/(?:place|search|dir)\/[^@]*?(-?\d{1,2}\.\d+)\s*,\s*\+?(-?\d{1,3}\.\d+)/i.exec(t);
    if (!m) m = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(t);
    if (!m) m = /^\s*(-?\d{1,2}(?:[.]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.]\d+)?)\s*$/.exec(t);
    if (!m) m = /^\s*(-?\d{1,2},\d+)\s*[; ]\s*(-?\d{1,3},\d+)\s*$/.exec(t); // vírgula decimal: "-22,97 -46,99"
    var p = m ? par(m[1], m[2]) : dms(t);
    return p || { erro: 'Não reconheci a coordenada. Use "lat, long" (ex.: -22.9707, -46.9958) ou cole o link do Google Maps.' };
  };

  // Cidades da rede cuja área (bbox do índice, com folga de ~1 km) contém algum dos pontos; a cidade
  // informada no formulário vem primeiro. Devolve nomes de cidade do índice.
  A.cidadesDosPontos = function (indice, pontos, cidadeHint) {
    var f = 0.01, out = [], dica = cidadeHint && REDE ? REDE.acharCidade(indice, cidadeHint) : null;
    if (dica) out.push(dica.cidade);
    (indice && indice.cidades || []).forEach(function (c) {
      var b = c.bbox; if (!b || out.indexOf(c.cidade) >= 0) return;
      if (pontos.some(function (p) { return p.lat >= b[0] - f && p.lat <= b[2] + f && p.lng >= b[1] - f && p.lng <= b[3] + f; })) out.push(c.cidade);
    });
    return out;
  };

  // Caixas (CEO/CTO do GeoGrid) a até "tol" metros do traçado, na ordem em que aparecem no caminho.
  A.caixasNaRota = function (d, pts, tol) {
    tol = tol || 15; if (!d || !pts || pts.length < 2) return [];
    var g = 0.0003, la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
    pts.forEach(function (p) { la0 = Math.min(la0, p[0]); la1 = Math.max(la1, p[0]); lo0 = Math.min(lo0, p[1]); lo1 = Math.max(lo1, p[1]); });
    var acum = [0]; for (var i = 1; i < pts.length; i++) acum.push(acum[i - 1] + REDE.dist(pts[i - 1], pts[i]));
    var out = [], visto = {};
    (d.caixas || []).forEach(function (c) {
      if (c.lat < la0 - g || c.lat > la1 + g || c.lng < lo0 - g || c.lng > lo1 + g) return;
      var melhor = Infinity, pos = 0;
      for (var k = 1; k < pts.length; k++) { var dd = REDE.distSeg([c.lat, c.lng], pts[k - 1], pts[k]); if (dd < melhor) { melhor = dd; pos = acum[k - 1] + REDE.dist(pts[k - 1], [c.lat, c.lng]); } }
      var chave = c.n + '|' + c.lat + '|' + c.lng;
      if (melhor <= tol && !visto[chave]) { visto[chave] = 1; out.push({ n: c.n, lat: c.lat, lng: c.lng, cor: c.cor, tipo: REDE.tipoCaixa(c.cor), d: Math.round(melhor), em: Math.round(pos) }); }
    });
    return out.sort(function (a, b) { return a.em - b.em; });
  };

  // Previsão de postes: um em cada ponta e um a cada "vao" metros (vão médio do padrão construtivo: 40 m).
  A.previsaoPostes = function (metros, vao) { vao = Number(vao) || 40; return metros > 0 ? Math.ceil(metros / vao) + 1 : 0; };

  // Tudo junto: { pts, metros, cabos, ligA, ligB, caixas, porTipo, postes } ou { erro }.
  A.calcular = function (d, a, b, opts) {
    var o = opts || {};
    var r = REDE.rotaPelaRede(d, [a.lat, a.lng], [b.lat, b.lng], { maxPonta: o.maxPonta || 500 });
    if (r.erro) return r;
    var cx = A.caixasNaRota(d, r.pts, o.tolCaixa || 15), porTipo = {};
    cx.forEach(function (c) { porTipo[c.tipo] = (porTipo[c.tipo] || 0) + 1; });
    var noCabo = Math.max(0, r.metros - r.ligA - r.ligB);
    return { pts: r.pts, metros: r.metros, metrosNoCabo: noCabo, cabos: r.cabos, ligA: r.ligA, ligB: r.ligB, caixas: cx, porTipo: porTipo,
      postes: A.previsaoPostes(r.metros, o.vao), vao: Number(o.vao) || 40 };
  };

  var x = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var co = function (p) { return p[1].toFixed(6) + ',' + p[0].toFixed(6) + ',0'; };
  // KML do trecho: a linha da rota (é ela que o servidor mede), o ponto A, o ponto B e as caixas do caminho.
  A.kml = function (nome, a, b, r) {
    var tipos = REDE.TIPOS_CAIXA, desc = r.metros + ' m de rota pela rede existente (GeoGrid) · ' + r.caixas.length + ' caixa(s) no caminho · previsão de '
      + r.postes + ' poste(s) (vão médio ' + r.vao + ' m) · cabos: ' + r.cabos.join(' → ');
    var pm = function (n, est, p, d) { return '<Placemark><name>' + x(n) + '</name>' + (d ? '<description>' + x(d) + '</description>' : '') + '<styleUrl>#' + est + '</styleUrl><Point><coordinates>' + co(p) + '</coordinates></Point></Placemark>'; };
    return '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + x(nome) + '</name><description>' + x(desc) + '</description>'
      + '<Style id="rota"><LineStyle><color>ff0000ff</color><width>5</width></LineStyle></Style>'
      + '<Style id="ab"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href></Icon></IconStyle></Style>'
      + '<Style id="cx"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href></Icon></IconStyle></Style>'
      + '<Placemark><name>Rota A → B (' + r.metros + ' m)</name><description>' + x(desc) + '</description><styleUrl>#rota</styleUrl><LineString><tessellate>1</tessellate><coordinates>'
      + r.pts.map(co).join(' ') + '</coordinates></LineString></Placemark>'
      + pm('Ponto A', 'ab', [a.lat, a.lng], a.lat + ', ' + a.lng) + pm('Ponto B', 'ab', [b.lat, b.lng], b.lat + ', ' + b.lng)
      + '<Folder><name>Caixas no caminho (' + r.caixas.length + ')</name>'
      + r.caixas.map(function (c) { return pm(c.n || 'Caixa', 'cx', [c.lat, c.lng], (tipos[c.tipo] || {}).rot + ' · a ' + c.em + ' m do ponto A'); }).join('')
      + '</Folder></Document></kml>';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = A;
  else raiz.ROTA_AB = A;
})(typeof window !== 'undefined' ? window : this);
