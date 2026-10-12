// SIGONET V2 — Novos projetos: regras puras (traçado → postes → materiais e LPU → KML).
//
// Padrão construtivo: "TREINAMENTO DESENHO EM KMZ (padrão construtivo)" — IOP.2.5.1.001R01.
//   • Traço dos cabos por capacidade (drop, 04/144, 06/72, 12, 24 FO), largura 4, opacidade 100%;
//     cordoalha dielétrica branca, de aço cinza; rede existente laranja, largura 15, opacidade 70%.
//   • Ícones do Google Earth: CEO/CTO existente (alfinete amarelo), CTO nova (rosa), CEO nova (roxo),
//     CEO/CTO de terceiro (vermelho), reserva técnica (R), cliente/ponto final (verde), splitter
//     (triângulo), caixa subterrânea (quadrado), encabeçamento c/ BAP (rosca), passagem c/ BAP
//     (proibido), encabeçamento c/ fita (ponto sombreado), passagem c/ fita (alvo pequeno), informação (i).
//   • Composição por poste (página "Custo da ancoragem"):
//       encabeçamento BAP  = 1 BAP + 2 olhais reto + 2 suportes BAP + 2 parafusos M12 + 2 alças PLP + 1 plaqueta
//       passagem BAP       = 1 BAP + 1 suporte 3x1 + 1 alça PLP + 1 plaqueta
//       encabeçamento fita = ~1 m fita + 2 suportes 3x1 + 2 alças + 1 fecho + 1 plaqueta
//       passagem fita      = ~1 m fita + 1 suporte 3x1 + 1 fecho + 1 plaqueta
//   • CEO e reserva técnica só no vão (nunca em esquina, travessia ou vão com equipamento energizável);
//     CTO no poste, nunca em esquina (itens 5.6.1 e 5.7). Aqui viram AVISOS no projeto.
//
// Os postes saem do traçado: vão médio (padrão 40 m) e um poste em cada canto (mudança de direção).
// A contagem exata vem do Google Earth: o projetista ajusta no mapa (satélite) ou importa o KMZ com os
// postes marcados — o importador reconhece os ícones do padrão acima.
//
// Roda no navegador (window.PRJ) e no Node (require) para os testes.
(function (raiz) {
  'use strict';
  var P = {};

  // ─────────── Catálogos do padrão ───────────
  // cor = #RRGGBB do traço; mat = cabo no catálogo de materiais; ceo = caixa de emenda e item de LPU da montagem.
  P.CABOS = {
    DROP: { rot: 'Cabo drop 4FO (compacto / figura 8)', fo: 4, cor: '#B8CC44', mat: 'INS000908', lanc: 'SEV0014' },
    '04': { rot: 'Cabo 04FO', fo: 4, cor: '#000000', mat: 'INS000091', lanc: 'SEV0006' },
    '06': { rot: 'Cabo 06FO', fo: 6, cor: '#00E5FF', mat: 'INS000092', lanc: 'SEV0006' },
    '12': { rot: 'Cabo 12FO', fo: 12, cor: '#5566FF', mat: 'INS000093', lanc: 'SEV0006' },
    '24': { rot: 'Cabo 24FO', fo: 24, cor: '#FF69B4', mat: 'INS000089', lanc: 'SEV0006' },
    '72': { rot: 'Cabo 72FO', fo: 72, cor: '#00E5FF', mat: 'INS000090', lanc: 'SEV0006' },
    '144': { rot: 'Cabo 144FO', fo: 144, cor: '#000000', mat: '', lanc: 'SEV0006' }
  };
  P.ANCORAGENS = {
    FITA: { rot: 'Autossustentado (fita de aço)', enc: 'SEV0002', pas: 'SEV0001', lancCabo: null, cordoalha: false, espinar: false },
    BAP: { rot: 'Espinado em cordoalha nova (BAP)', enc: 'SEV0003', pas: 'SEV0004', lancCabo: 'SEV0008', cordoalha: true, espinar: true },
    BAP_EXIST: { rot: 'Espinado em rede existente (BAP)', enc: 'SEV0003', pas: 'SEV0004', lancCabo: 'SEV0008', cordoalha: false, espinar: true }
  };
  // Materiais por poste (código do catálogo → quantidade). 'FITA_M' = metros de fita (vira rolos de 25 m).
  P.KIT = {
    BAP: { E: { INS000002: 1, INS000197: 2, INS000825: 2, INS000483: 2, INS000340: 2, INS000044: 1 },
      P: { INS000002: 1, INS000821: 1, INS000340: 1, INS000044: 1 } },
    FITA: { E: { FITA_M: 1, INS000821: 2, INS000336: 2, INS000194: 1, INS000044: 1 },
      P: { FITA_M: 1, INS000821: 1, INS000194: 1, INS000044: 1 } }
  };
  P.FITA = { cod: 'INS000196', metrosRolo: 25 };
  P.CORDOALHA = 'INS000346';
  P.FIO_ESPINAR = 'INS000195';
  P.CTO = { mat: 'INS000135', lpu: 'SEV0032' };
  P.ceoPara = function (fo) {
    if (fo <= 12) return { mat: 'INS000126', lpu: 'SEV0030' };
    if (fo <= 24) return { mat: 'INS000945', lpu: 'SEV0030' };
    if (fo <= 48) return { mat: 'INS000946', lpu: 'SEV0029' };
    if (fo <= 96) return { mat: 'INS000128', lpu: 'SEV0029' };
    return { mat: 'INS000127', lpu: 'SEV0031' };
  };
  // Elementos que o projetista coloca (no poste ou no vão depois dele).
  P.ELEMENTOS = {
    CEO_EXIST: { rot: 'CEO / CTO existente', kml: 'CEO EXISTENTE', icone: 'http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png', vao: false, fusao: true },
    CEO_NOVA: { rot: 'CEO nova', kml: 'CEO NOVA', icone: 'http://maps.google.com/mapfiles/kml/pushpin/purple-pushpin.png', vao: true, fusao: true },
    CTO_NOVA: { rot: 'CTO nova', kml: 'CTO NOVA', icone: 'http://maps.google.com/mapfiles/kml/pushpin/pink-pushpin.png', vao: false, fusao: true },
    TERCEIRO: { rot: 'CEO / CTO de terceiro', kml: 'CEO/CTO TERCEIRO', icone: 'http://maps.google.com/mapfiles/kml/pushpin/red-pushpin.png', vao: false },
    RT: { rot: 'Reserva técnica', kml: 'R.T', icone: 'http://maps.google.com/mapfiles/kml/paddle/R.png', vao: true },
    CLIENTE: { rot: 'Cliente / ponto final', kml: 'CLIENTE', icone: 'http://maps.google.com/mapfiles/kml/paddle/grn-blank.png', vao: false },
    SPLITTER: { rot: 'Splitter', kml: 'SPLITTER', icone: 'http://maps.google.com/mapfiles/kml/shapes/triangle.png', vao: false },
    CAIXA_SUB: { rot: 'Caixa subterrânea', kml: 'CAIXA SUBTERRÂNEA', icone: 'http://maps.google.com/mapfiles/kml/shapes/square.png', vao: false },
    TRAVESSIA: { rot: 'Travessia em rodovia', kml: 'TRAVESSIA', icone: 'http://maps.google.com/mapfiles/kml/shapes/caution.png', vao: true },
    INFO: { rot: 'Informação', kml: 'INFO', icone: 'http://maps.google.com/mapfiles/kml/shapes/info-i.png', vao: false }
  };
  P.ICONE_POSTE = {
    BAP: { E: 'http://maps.google.com/mapfiles/kml/shapes/donut.png', P: 'http://maps.google.com/mapfiles/kml/shapes/forbidden.png' },
    FITA: { E: 'http://maps.google.com/mapfiles/kml/shapes/shaded_dot.png', P: 'http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png' }
  };
  // Deslocamento por cidade (LPU SEV0078–0082).
  P.DESLOCAMENTO = [
    ['SEV0078', ['BARUERI', 'SAO PAULO', 'GUARULHOS', 'SANTO ANDRE', 'SAO BERNARDO DO CAMPO', 'SAO CAETANO DO SUL', 'DIADEMA', 'MAUA', 'RIBEIRAO PIRES', 'RIO GRANDE DA SERRA']],
    ['SEV0079', ['PIRACICABA', 'ARARAS', 'RIO CLARO', 'LIMEIRA', 'JAGUARIUNA']],
    ['SEV0080', ['BRAGANCA PAULISTA', 'ATIBAIA', 'EXTREMA']],
    ['SEV0081', ['SANTOS', 'SAO VICENTE', 'PRAIA GRANDE', 'GUARUJA', 'CUBATAO', 'MONGAGUA', 'ITANHAEM', 'BERTIOGA', 'PERUIBE']],
    ['SEV0082', ['SOROCABA', 'SALTO', 'ITU', 'INDAIATUBA']]
  ];
  P.PARAMS_PADRAO = { cabo: '12', ancoragem: 'FITA', vao: 40, encCada: 5, angCanto: 30, rtCada: 400, rtMetros: 20, pontaMetros: 10,
    folgaPct: 3, fioEspinarRend: 100, otdr: true, sangria: false, deslocamentos: null, critico: false };

  // ─────────── Geometria ───────────
  var R_TERRA = 6371008.8, rad = function (g) { return g * Math.PI / 180; };
  P.dist = function (a, b) {
    var dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R_TERRA * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  P.comprimento = function (pts) { var s = 0; for (var i = 1; i < (pts || []).length; i++) s += P.dist(pts[i - 1], pts[i]); return s; };
  // Rumo em graus (0 = norte) de a para b.
  P.rumo = function (a, b) {
    var y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  };
  // Mudança de direção em graus (0 = segue reto, 180 = volta).
  P.giro = function (a, b, c) { var d = Math.abs(P.rumo(a, b) - P.rumo(b, c)) % 360; return d > 180 ? 360 - d : d; };
  // Projeção local em metros (para Douglas-Peucker e ponto mais próximo no segmento).
  var xy = function (p, ref) { return [rad(p[1] - ref[1]) * R_TERRA * Math.cos(rad(ref[0])), rad(p[0] - ref[0]) * R_TERRA]; };
  var distSeg = function (p, a, b) {
    var ref = a, P0 = xy(p, ref), A = [0, 0], B = xy(b, ref), dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy;
    var t = L2 ? Math.max(0, Math.min(1, ((P0[0] - A[0]) * dx + (P0[1] - A[1]) * dy) / L2)) : 0;
    var X = A[0] + t * dx, Y = A[1] + t * dy;
    return { d: Math.sqrt((P0[0] - X) * (P0[0] - X) + (P0[1] - Y) * (P0[1] - Y)), t: t };
  };
  P.simplificar = function (pts, tol) {
    if (!pts || pts.length < 3) return (pts || []).slice();
    var manter = new Array(pts.length), pilha = [[0, pts.length - 1]]; manter[0] = manter[pts.length - 1] = true;
    while (pilha.length) {
      var par = pilha.pop(), ini = par[0], fim = par[1], maior = 0, idx = -1;
      for (var i = ini + 1; i < fim; i++) { var d = distSeg(pts[i], pts[ini], pts[fim]).d; if (d > maior) { maior = d; idx = i; } }
      if (idx > 0 && maior > tol) { manter[idx] = true; pilha.push([ini, idx], [idx, fim]); }
    }
    return pts.filter(function (p, i) { return manter[i]; });
  };
  // Ponto a "m" metros do início do trecho pts.
  var pontoEm = function (pts, m) {
    var acc = 0;
    for (var i = 1; i < pts.length; i++) {
      var d = P.dist(pts[i - 1], pts[i]);
      if (acc + d >= m && d > 0) { var f = (m - acc) / d; return [pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1])]; }
      acc += d;
    }
    return pts[pts.length - 1].slice();
  };
  var arred = function (v) { return Math.round(v * 1e6) / 1e6; };

  // ─────────── Postes a partir do traçado ───────────
  // linha: [[lat,lng],…] (caminho pelas ruas). Devolve postes [{lat,lng,t:'E'|'P',c:canto}].
  // Um poste em cada canto (giro ≥ angCanto) e, entre cantos, vãos iguais de até "vao" metros.
  // Encabeçamento (E): início, fim, cantos e a cada "encCada" postes; os demais são passagem (P).
  P.gerarPostes = function (linha, opts) {
    var o = Object.assign({}, P.PARAMS_PADRAO, opts || {}), pts = P.simplificar(linha || [], 4);
    if (pts.length < 2) return [];
    var fixos = [0];
    for (var i = 1; i < pts.length - 1; i++) if (P.giro(pts[i - 1], pts[i], pts[i + 1]) >= o.angCanto) fixos.push(i);
    fixos.push(pts.length - 1);
    var vao = Math.max(10, Number(o.vao) || 40), postes = [{ lat: arred(pts[0][0]), lng: arred(pts[0][1]), t: 'E', c: false }];
    for (var k = 1; k < fixos.length; k++) {
      var trecho = pts.slice(fixos[k - 1], fixos[k] + 1), L = P.comprimento(trecho), n = Math.max(1, Math.ceil(L / vao - 0.15));
      for (var j = 1; j <= n; j++) {
        var p = j === n ? pts[fixos[k]] : pontoEm(trecho, L * j / n);
        postes.push({ lat: arred(p[0]), lng: arred(p[1]), t: 'P', c: j === n && k < fixos.length - 1 });
      }
    }
    return P.reclassificar(postes, o);
  };
  // Refaz E/P depois de mexer nos postes (cantos recalculados pela geometria dos postes).
  P.reclassificar = function (postes, opts) {
    var o = Object.assign({}, P.PARAMS_PADRAO, opts || {}), desde = 0, encCada = Math.max(0, Number(o.encCada) || 0);
    return postes.map(function (p, i, a) {
      var canto = i > 0 && i < a.length - 1 && P.giro([a[i - 1].lat, a[i - 1].lng], [p.lat, p.lng], [a[i + 1].lat, a[i + 1].lng]) >= o.angCanto;
      var fixo = p.fixo === 'E' || p.fixo === 'P' ? p.fixo : null;
      var t = fixo || (i === 0 || i === a.length - 1 || canto || (encCada && desde + 1 >= encCada) ? 'E' : 'P');
      desde = t === 'E' ? 0 : desde + 1;
      var out = { lat: p.lat, lng: p.lng, t: t, c: canto };
      if (fixo) out.fixo = fixo;
      return out;
    });
  };
  // Formato compacto para a planilha: "lat,lng,t[,fixo]" separados por ";".
  P.codificarPostes = function (postes) { return (postes || []).map(function (p) { return [arred(p.lat), arred(p.lng), p.t].concat(p.fixo ? [p.fixo] : []).join(','); }).join(';'); };
  P.decodificarPostes = function (txt, opts) {
    var ps = String(txt || '').split(';').filter(Boolean).map(function (s) { var x = s.split(','); var p = { lat: Number(x[0]), lng: Number(x[1]), t: x[2] === 'E' ? 'E' : 'P' }; if (x[3]) p.fixo = x[3]; return p; });
    return P.reclassificar(ps, opts);
  };

  // Rua de cada poste: nome do passo da rota mais perto. passos = [{nome, pts:[[lat,lng]…]}].
  P.ruasDosPostes = function (postes, passos) {
    var nomes = (postes || []).map(function (p) {
      var melhor = null, dm = Infinity;
      (passos || []).forEach(function (s) { for (var i = 1; i < (s.pts || []).length; i++) { var d = distSeg([p.lat, p.lng], s.pts[i - 1], s.pts[i]).d; if (d < dm) { dm = d; melhor = s.nome; } } });
      return melhor || '';
    });
    var out = [];
    nomes.forEach(function (n, i) {
      var nome = n || '(sem nome)', m = i ? P.dist([postes[i - 1].lat, postes[i - 1].lng], [postes[i].lat, postes[i].lng]) : 0, ult = out[out.length - 1];
      if (ult && ult.nome === nome) { ult.postes++; ult.metros += m; } else out.push({ nome: nome, postes: 1, metros: m, de: i });
    });
    out.forEach(function (r) { r.metros = Math.round(r.metros); });
    return out;
  };

  // ─────────── Elementos ───────────
  // elemento = { t: tipo, i: índice do poste, nome, fus: fusões, txt: texto da informação }.
  // CEO/RT/travessia ficam no vão depois do poste i (no último poste, no vão anterior).
  P.posicaoElemento = function (el, postes) {
    var i = Math.max(0, Math.min(postes.length - 1, el.i | 0)), def = P.ELEMENTOS[el.t] || {}, p = postes[i];
    if (!p) return null;
    if (!def.vao || postes.length < 2) return [p.lat, p.lng];
    var a = i < postes.length - 1 ? p : postes[i - 1], b = i < postes.length - 1 ? postes[i + 1] : p;
    return [arred((a.lat + b.lat) / 2), arred((a.lng + b.lng) / 2)];
  };
  // Reserva técnica a cada "rtCada" metros, no vão de um poste de passagem (nunca em canto), longe das pontas.
  P.rtsAutomaticas = function (postes, opts) {
    var o = Object.assign({}, P.PARAMS_PADRAO, opts || {}), cada = Number(o.rtCada) || 0, out = [];
    if (!cada || postes.length < 3) return out;
    var acc = [0]; for (var i = 1; i < postes.length; i++) acc.push(acc[i - 1] + P.dist([postes[i - 1].lat, postes[i - 1].lng], [postes[i].lat, postes[i].lng]));
    var total = acc[acc.length - 1];
    for (var alvo = cada; alvo < total - 60; alvo += cada) {
      var melhor = -1, dm = Infinity;
      for (var k = 1; k < postes.length - 2; k++) {
        if (postes[k].t !== 'P' || postes[k].c || postes[k + 1].c) continue; // vão sem esquina
        var meio = (acc[k] + acc[k + 1]) / 2, d = Math.abs(meio - alvo);
        if (d < dm && !out.some(function (e) { return e.i === k; })) { dm = d; melhor = k; }
      }
      if (melhor >= 0 && dm < cada / 2) out.push({ t: 'RT', i: melhor, nome: 'R.T' });
    }
    return out;
  };
  // Avisos do padrão construtivo (não bloqueiam; o projetista decide).
  P.avisos = function (proj) {
    var postes = proj.postes || [], els = proj.elementos || [], out = [];
    els.forEach(function (e) {
      var p = postes[e.i], prox = postes[e.i + 1], def = P.ELEMENTOS[e.t] || {}, rot = def.rot || e.t;
      if (!p) return out.push(rot + ': fora do traçado.');
      if ((e.t === 'CEO_NOVA' || e.t === 'RT') && (p.c || (prox && prox.c))) out.push(rot + ' no vão do poste ' + (e.i + 1) + ': é vedado projetar CEO/RT em vão de esquina (item 5.7).');
      if (e.t === 'CTO_NOVA' && p.c) out.push('CTO nova no poste ' + (e.i + 1) + ': é vedado projetar CTO em poste de esquina (item 5.6.1 e).');
      if ((e.t === 'CEO_NOVA' || e.t === 'RT') && els.some(function (x) { return x.t === 'TRAVESSIA' && x.i === e.i; })) out.push(rot + ' no vão do poste ' + (e.i + 1) + ': é vedado projetar CEO/RT em travessia (item 5.7.2 a).');
    });
    var longos = []; for (var i = 1; i < postes.length; i++) { var d = P.dist([postes[i - 1].lat, postes[i - 1].lng], [postes[i].lat, postes[i].lng]); if (d > 60) longos.push(i); }
    if (longos.length) out.push(longos.length + ' vão(s) acima de 60 m (postes ' + longos.slice(0, 6).map(function (i) { return i + '–' + (i + 1); }).join(', ') + (longos.length > 6 ? '…' : '') + '): confira no satélite se falta poste.');
    return out;
  };

  // ─────────── Quantidades (materiais e LPU) ───────────
  var soma = function (o, k, q) { if (!k || !(q > 0)) return; o[k] = Math.round(((o[k] || 0) + q) * 100) / 100; };
  var normCidade = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); };
  P.deslocamentoDaCidade = function (cidade) {
    var c = normCidade(cidade), achou = null;
    P.DESLOCAMENTO.forEach(function (d) { if (!achou && d[1].indexOf(c) >= 0) achou = d[0]; });
    return achou;
  };
  // Métricas do traçado e do cabo. Cabo = traçado × (1 + folga) + reservas técnicas + sobra nas pontas emendadas.
  P.metricas = function (proj) {
    var o = Object.assign({}, P.PARAMS_PADRAO, proj.params || {}), postes = proj.postes || [], els = proj.elementos || [];
    var tracado = P.comprimento(postes.map(function (p) { return [p.lat, p.lng]; }));
    var nRT = els.filter(function (e) { return e.t === 'RT'; }).length;
    var pontas = els.filter(function (e) { return (P.ELEMENTOS[e.t] || {}).fusao; }).length;
    var cabo = Math.ceil(tracado * (1 + (Number(o.folgaPct) || 0) / 100) + nRT * (Number(o.rtMetros) || 0) + pontas * (Number(o.pontaMetros) || 0));
    return { tracado: Math.round(tracado), cabo: postes.length > 1 ? cabo : 0, postes: postes.length, enc: postes.filter(function (p) { return p.t === 'E'; }).length,
      pas: postes.filter(function (p) { return p.t === 'P'; }).length, rt: nRT, pontas: pontas };
  };
  // Quantidades automáticas e a memória de cálculo (cada linha diz de onde veio o número).
  P.quantidades = function (proj) {
    var o = Object.assign({}, P.PARAMS_PADRAO, proj.params || {}), cabo = P.CABOS[o.cabo] || P.CABOS['12'], anc = P.ANCORAGENS[o.ancoragem] || P.ANCORAGENS.FITA;
    var kit = P.KIT[o.ancoragem === 'FITA' ? 'FITA' : 'BAP'], m = P.metricas(proj), mat = {}, lpu = {}, memo = [];
    if (m.postes < 2) return { mat: mat, lpu: lpu, memoria: ['Desenhe o traçado (pelo menos 2 postes).'], metricas: m };
    // Ancoragem por poste
    var fitaM = 0;
    ['E', 'P'].forEach(function (t) {
      var n = t === 'E' ? m.enc : m.pas; if (!n) return;
      Object.keys(kit[t]).forEach(function (k) { if (k === 'FITA_M') fitaM += kit[t][k] * n; else soma(mat, k, kit[t][k] * n); });
    });
    memo.push(m.enc + ' encabeçamento(s) e ' + m.pas + ' passagem(ns) — ' + anc.rot + ' (composição do padrão por poste).');
    if (fitaM) { soma(mat, P.FITA.cod, Math.ceil(fitaM / P.FITA.metrosRolo)); memo.push(fitaM + ' m de fita de aço = aprox. ' + Math.ceil(fitaM / P.FITA.metrosRolo) + ' rolo(s) de ' + P.FITA.metrosRolo + ' m.'); }
    soma(lpu, anc.enc, m.enc); soma(lpu, anc.pas, m.pas); soma(lpu, 'SEV0005', m.postes);
    // Cabo
    if (cabo.mat) soma(mat, cabo.mat, m.cabo);
    soma(lpu, anc.lancCabo || cabo.lanc, m.cabo);
    memo.push(cabo.rot + ': ' + m.tracado + ' m de traçado + ' + o.folgaPct + '% de folga + ' + m.rt + ' RT × ' + o.rtMetros + ' m + ' + m.pontas + ' ponta(s) × ' + o.pontaMetros + ' m = ' + m.cabo + ' m.' + (cabo.mat ? '' : ' (cabo sem código no catálogo: inclua no orçamento.)'));
    if (anc.cordoalha) { soma(mat, P.CORDOALHA, m.tracado); soma(lpu, 'SEV0009', m.tracado); memo.push('Cordoalha dielétrica nova: ' + m.tracado + ' m (traçado).'); }
    if (anc.espinar) {
      soma(lpu, 'SEV0007', m.tracado);
      var rend = Number(o.fioEspinarRend) || 0;
      if (rend > 0) { soma(mat, P.FIO_ESPINAR, Math.ceil(m.tracado / rend)); memo.push('Fio de espinar: 1 a cada ' + rend + ' m de traçado.'); }
      else memo.push('Fio de espinar: informe o rendimento (m por unidade) nos parâmetros para calcular.'); // padrão: 1 unidade rende 100 m (informado em 2026-10-12)
    }
    // Elementos
    (proj.elementos || []).forEach(function (e) {
      var fus = Math.max(0, Number(e.fus) || 0);
      if (e.t === 'CEO_NOVA') { var ceo = P.ceoPara(cabo.fo); soma(mat, ceo.mat, 1); soma(lpu, ceo.lpu, 1); soma(lpu, 'SEV0048', 2); soma(lpu, 'SEV0045', fus); soma(lpu, 'SEV0040', fus); }
      else if (e.t === 'CEO_EXIST') { soma(lpu, 'SEV0037', 1); soma(lpu, 'SEV0048', 1); soma(lpu, 'SEV0045', fus); soma(lpu, 'SEV0040', fus); if (o.sangria) soma(lpu, 'SEV0046', 1); }
      else if (e.t === 'CTO_NOVA') { soma(mat, P.CTO.mat, 1); soma(lpu, P.CTO.lpu, 1); soma(lpu, 'SEV0048', 1); soma(lpu, 'SEV0045', fus); soma(lpu, 'SEV0040', fus); }
      else if (e.t === 'SPLITTER') soma(lpu, 'SEV0047', 1);
      else if (e.t === 'TRAVESSIA') soma(lpu, 'SEV0049', 1);
    });
    var fusoes = (proj.elementos || []).reduce(function (s, e) { return s + ((P.ELEMENTOS[e.t] || {}).fusao ? Math.max(0, Number(e.fus) || 0) : 0); }, 0);
    if (fusoes) memo.push(fusoes + ' fusão(ões) nas emendas (informadas em cada CEO/CTO), com identificação.');
    if (o.otdr && fusoes) { soma(lpu, 'SEV0043', cabo.fo); memo.push('Certificação OTDR com relatório: ' + cabo.fo + ' fibra(s) do cabo novo.'); }
    // Deslocamento
    var desl = P.deslocamentoDaCidade(proj.cidade), dias = o.deslocamentos != null && o.deslocamentos !== '' ? Number(o.deslocamentos) : Math.max(1, Math.ceil(m.cabo / 1500));
    if (desl && dias > 0) { soma(lpu, desl, dias); memo.push('Deslocamento (' + proj.cidade + '): ' + dias + ' dia(s) de obra.'); }
    else if (!desl) memo.push('Sem item de deslocamento para a cidade "' + (proj.cidade || '') + '" (SEV0078–0082): inclua no orçamento se houver.');
    return { mat: mat, lpu: lpu, memoria: memo, metricas: m };
  };
  // Aplica os ajustes manuais do orçamento: ajustes = { mat: {cod: qtd}, lpu: {cod: qtd} } (0 = retirar).
  P.aplicarAjustes = function (auto, ajustes) {
    var out = {}, aj = ajustes || {};
    Object.keys(auto || {}).forEach(function (k) { out[k] = auto[k]; });
    Object.keys(aj).forEach(function (k) { var q = Number(aj[k]); if (q > 0) out[k] = q; else delete out[k]; });
    return out;
  };

  // ─────────── KML (Google Earth) no padrão ───────────
  var escXml = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  // KML usa cor aabbggrr.
  P.corKml = function (hex, opac) { var h = String(hex || '#000000').replace('#', ''), a = Math.round((opac == null ? 1 : opac) * 255).toString(16).padStart(2, '0'); return (a + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2)).toLowerCase(); };
  P.kml = function (proj) {
    var o = Object.assign({}, P.PARAMS_PADRAO, proj.params || {}), cabo = P.CABOS[o.cabo] || P.CABOS['12'], anc = P.ANCORAGENS[o.ancoragem] || P.ANCORAGENS.FITA;
    var postes = proj.postes || [], m = P.metricas(proj), kitIco = P.ICONE_POSTE[o.ancoragem === 'FITA' ? 'FITA' : 'BAP'];
    var coords = postes.map(function (p) { return p.lng + ',' + p.lat + ',0'; }).join(' ');
    var estilo = function (id, corpo) { return '<Style id="' + id + '">' + corpo + '</Style>'; };
    var icoEst = function (id, href, escala) { return estilo(id, '<IconStyle><scale>' + (escala || 1) + '</scale><Icon><href>' + href + '</href></Icon></IconStyle><LabelStyle><scale>0.8</scale></LabelStyle>'); };
    var estilos = [
      estilo('cabo', '<LineStyle><color>' + P.corKml(cabo.cor, 1) + '</color><width>4</width></LineStyle>'),
      estilo('cordoalha', '<LineStyle><color>' + P.corKml('#FFFFFF', 1) + '</color><width>4</width></LineStyle>'),
      estilo('rede_existente', '<LineStyle><color>' + P.corKml('#FF7F1E', 0.7) + '</color><width>15</width></LineStyle>'),
      icoEst('poste_E', kitIco.E, 0.8), icoEst('poste_P', kitIco.P, 0.6)
    ].concat(Object.keys(P.ELEMENTOS).map(function (k) { return icoEst('el_' + k, P.ELEMENTOS[k].icone, 1.1); }));
    var desc = [proj.nome ? 'Projeto: ' + proj.nome : '', proj.cidade ? 'Cidade: ' + proj.cidade : '', 'Cabo: ' + cabo.rot, 'Ancoragem: ' + anc.rot,
      'Traçado: ' + m.tracado + ' m · cabo previsto: ' + m.cabo + ' m', 'Postes: ' + m.postes + ' (' + m.enc + ' encabeçamentos, ' + m.pas + ' passagens)'].filter(Boolean).join('\n');
    var pm = function (nome, est, geo, d) { return '<Placemark><name>' + escXml(nome) + '</name>' + (d ? '<description>' + escXml(d) + '</description>' : '') + '<styleUrl>#' + est + '</styleUrl>' + geo + '</Placemark>'; };
    var ponto = function (lat, lng) { return '<Point><coordinates>' + lng + ',' + lat + ',0</coordinates></Point>'; };
    var linhas = [pm(cabo.rot + ' · ' + m.cabo + ' m', 'cabo', '<LineString><tessellate>1</tessellate><coordinates>' + coords + '</coordinates></LineString>', desc)];
    if (anc.cordoalha) linhas.push(pm('Cordoalha dielétrica · ' + m.tracado + ' m', 'cordoalha', '<LineString><tessellate>1</tessellate><coordinates>' + coords + '</coordinates></LineString>'));
    if (o.ancoragem === 'BAP_EXIST') linhas.unshift(pm('Rede existente', 'rede_existente', '<LineString><tessellate>1</tessellate><coordinates>' + coords + '</coordinates></LineString>'));
    var ps = postes.map(function (p, i) { return pm('P' + String(i + 1).padStart(2, '0'), 'poste_' + p.t, ponto(p.lat, p.lng), (p.t === 'E' ? 'Encabeçamento' : 'Passagem') + ' · ' + anc.rot); });
    var els = (proj.elementos || []).map(function (e) {
      var pos = P.posicaoElemento(e, postes), def = P.ELEMENTOS[e.t]; if (!pos || !def) return '';
      var nome = e.t === 'INFO' ? (e.txt || 'INFORMAÇÃO') : (e.nome || def.kml);
      return pm(nome, 'el_' + e.t, ponto(pos[0], pos[1]), [def.rot, e.fus ? e.fus + ' fusão(ões)' : '', e.txt && e.t !== 'INFO' ? e.txt : ''].filter(Boolean).join(' · '));
    });
    var pasta = function (nome, itens) { return itens.length ? '<Folder><name>' + escXml(nome) + '</name>' + itens.join('') + '</Folder>' : ''; };
    return '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + escXml((proj.id ? proj.id + ' · ' : '') + (proj.nome || 'Projeto')) + '</name>'
      + '<description>' + escXml(desc) + '</description>' + estilos.join('')
      + pasta('Cabos e cordoalha', linhas) + pasta('Elementos da rede', els.filter(Boolean)) + pasta('Postes (' + postes.length + ')', ps) + '</Document></kml>';
  };

  // ─────────── Importar KML do Google Earth ───────────
  // Lê linhas e pontos (com o ícone). Sem DOM: funciona igual no navegador e nos testes.
  P.lerKml = function (txt) {
    var s = String(txt || ''), estilos = {}, mapas = {}, out = { linhas: [], pontos: [] };
    s.replace(/<Style\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/Style>/g, function (x, id, corpo) { var h = /<href>\s*([^<]+?)\s*<\/href>/.exec(corpo); estilos['#' + id] = h ? h[1] : ''; return x; });
    s.replace(/<StyleMap\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/StyleMap>/g, function (x, id, corpo) { var n = /<key>normal<\/key>\s*<styleUrl>\s*([^<]+?)\s*<\/styleUrl>/.exec(corpo); if (n) mapas['#' + id] = n[1]; return x; });
    var num = function (c) { return String(c).trim().split(/\s+/).map(function (t) { var v = t.split(','); return [Number(v[1]), Number(v[0])]; }).filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); }); };
    s.replace(/<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/g, function (x, corpo) {
      var nome = (/<name>\s*([\s\S]*?)\s*<\/name>/.exec(corpo) || [])[1] || '';
      nome = nome.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim();
      var est = (/<styleUrl>\s*([^<]+?)\s*<\/styleUrl>/.exec(corpo) || [])[1] || '';
      var href = (/<href>\s*([^<]+?)\s*<\/href>/.exec(corpo) || [])[1] || estilos[mapas[est] || est] || estilos[est] || '';
      var ls = /<LineString\b[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/.exec(corpo), pt = /<Point\b[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/.exec(corpo);
      if (ls) out.linhas.push({ nome: nome, pts: num(ls[1]) });
      else if (pt) { var c = num(pt[1])[0]; if (c) out.pontos.push({ nome: nome, lat: c[0], lng: c[1], icone: href }); }
      return x;
    });
    return out;
  };
  // O que um ponto do KML é, pelo ícone do padrão (ou pelo nome).
  P.classificarPonto = function (pt) {
    var h = String(pt.icone || '').toLowerCase(), n = normCidade(pt.nome);
    if (/donut/.test(h)) return { poste: 'E', anc: 'BAP' };
    if (/forbidden/.test(h)) return { poste: 'P', anc: 'BAP' };
    if (/shaded_dot/.test(h)) return { poste: 'E', anc: 'FITA' };
    if (/placemark_circle|target/.test(h)) return { poste: 'P', anc: 'FITA' };
    if (/ylw-pushpin|yellow/.test(h)) return { el: 'CEO_EXIST' };
    if (/pink-pushpin/.test(h)) return { el: 'CTO_NOVA' };
    if (/purple-pushpin/.test(h)) return { el: 'CEO_NOVA' };
    if (/red-pushpin/.test(h)) return { el: 'TERCEIRO' };
    if (/paddle\/r\.png|\/r\.png/.test(h) || /^R\.?\s?T\b/.test(n)) return { el: 'RT' };
    if (/grn-blank|grn-circle|green/.test(h)) return { el: 'CLIENTE' };
    if (/triangle/.test(h)) return { el: 'SPLITTER' };
    if (/square/.test(h)) return { el: 'CAIXA_SUB' };
    if (/info/.test(h)) return { el: 'INFO' };
    if (/^CEO NOVA/.test(n)) return { el: 'CEO_NOVA' };
    if (/^CTO NOVA/.test(n)) return { el: 'CTO_NOVA' };
    if (/^(P|POSTE)\s?\d+$/.test(n)) return { poste: 'P' };
    return { poste: 'P' };
  };
  // Monta postes e elementos a partir do KML lido. Postes ordenados ao longo da linha mais longa
  // (sem linha: encadeia pelo vizinho mais próximo). Elementos vão para o poste mais perto.
  P.importar = function (lido, opts) {
    var postesPts = [], elementos = [], ancs = {};
    (lido.pontos || []).forEach(function (pt) {
      var c = P.classificarPonto(pt);
      if (c.poste) { postesPts.push({ lat: pt.lat, lng: pt.lng, fixo: c.anc ? c.poste : null }); if (c.anc) ancs[c.anc] = (ancs[c.anc] || 0) + 1; }
      else elementos.push({ t: c.el, lat: pt.lat, lng: pt.lng, nome: pt.nome, txt: c.el === 'INFO' ? pt.nome : '' });
    });
    var linha = (lido.linhas || []).slice().sort(function (a, b) { return P.comprimento(b.pts) - P.comprimento(a.pts); })[0];
    var pos = function (p) { // distância ao longo da linha
      if (!linha) return 0; var acc = 0, melhor = Infinity, m = 0;
      for (var i = 1; i < linha.pts.length; i++) { var r = distSeg([p.lat, p.lng], linha.pts[i - 1], linha.pts[i]), seg = P.dist(linha.pts[i - 1], linha.pts[i]); if (r.d < melhor) { melhor = r.d; m = acc + r.t * seg; } acc += seg; }
      return m;
    };
    var postes;
    if (postesPts.length >= 2 && linha) postes = postesPts.map(function (p) { return Object.assign({ _m: pos(p) }, p); }).sort(function (a, b) { return a._m - b._m; });
    else if (postesPts.length >= 2) { // vizinho mais próximo, começando pela ponta
      var resto = postesPts.slice(), ini = 0, maior = -1;
      resto.forEach(function (p, i) { var d = resto.reduce(function (s, q) { return s + P.dist([p.lat, p.lng], [q.lat, q.lng]); }, 0); if (d > maior) { maior = d; ini = i; } });
      postes = [resto.splice(ini, 1)[0]];
      while (resto.length) { var u = postes[postes.length - 1], k = 0, dm = Infinity; resto.forEach(function (q, i) { var d = P.dist([u.lat, u.lng], [q.lat, q.lng]); if (d < dm) { dm = d; k = i; } }); postes.push(resto.splice(k, 1)[0]); }
    } else if (linha) postes = P.gerarPostes(linha.pts, opts);
    else postes = [];
    postes = postes.map(function (p) { var o = { lat: arred(p.lat), lng: arred(p.lng), t: p.t || 'P' }; if (p.fixo) o.fixo = p.fixo; return o; });
    postes = P.reclassificar(postes, opts);
    var els = elementos.map(function (e) {
      var k = 0, dm = Infinity; postes.forEach(function (p, i) { var d = P.dist([p.lat, p.lng], [e.lat, e.lng]); if (d < dm) { dm = d; k = i; } });
      // elemento de vão: fica no vão do lado em que está
      if ((P.ELEMENTOS[e.t] || {}).vao && k > 0 && k < postes.length - 1) {
        var dAnt = P.dist([postes[k - 1].lat, postes[k - 1].lng], [e.lat, e.lng]), dProx = P.dist([postes[k + 1].lat, postes[k + 1].lng], [e.lat, e.lng]);
        if (dAnt < dProx) k = k - 1;
      }
      var out = { t: e.t, i: k, nome: e.nome || '' }; if (e.txt) out.txt = e.txt; if ((P.ELEMENTOS[e.t] || {}).fusao) out.fus = 0;
      return out;
    }).filter(function (e) { return postes.length; });
    var anc = ancs.BAP && ancs.BAP >= (ancs.FITA || 0) ? 'BAP' : ancs.FITA ? 'FITA' : null;
    return { postes: postes, elementos: els, ancoragem: anc, linhas: (lido.linhas || []).length, pontos: (lido.pontos || []).length };
  };

  // ─────────── Projeto: status e validação ───────────
  P.STATUS = {
    RASCUNHO: { rot: 'Rascunho', cls: '' }, AGUARDANDO_APROVACAO: { rot: 'Aguardando aprovação', cls: 'alerta' },
    APROVADO: { rot: 'Aprovado', cls: 'ok' }, REPROVADO: { rot: 'Reprovado', cls: 'erro' }, CANCELADO: { rot: 'Cancelado', cls: 'erro' }
  };
  P.validarProjeto = function (proj) {
    var e = [], m = P.metricas(proj);
    if (!String(proj.nome || '').trim()) e.push('Dê um nome ao projeto.');
    if (!String(proj.cidade || '').trim()) e.push('Informe a cidade.');
    if (!String(proj.conta || '').trim()) e.push('Escolha a conta contábil.');
    if (m.postes < 2) e.push('Desenhe o traçado: pelo menos 2 postes.');
    if (!(proj.elementos || []).some(function (x) { return (P.ELEMENTOS[x.t] || {}).fusao || x.t === 'CLIENTE'; })) e.push('Marque a origem e o destino (CEO, CTO ou cliente) no traçado.');
    if (P.codificarPostes(proj.postes).length > 36000) e.push('Traçado grande demais para um projeto só (' + m.postes + ' postes): divida em dois projetos.');
    return { ok: !e.length, erros: e };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = P;
  else raiz.PRJ = P;
})(typeof window !== 'undefined' ? window : this);
