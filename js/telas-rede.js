// SIGONET V2 — Rede GeoGrid (tela "rede"): a rede da empresa (cabos e caixas de emenda) dentro do SigoNet.
//
// Pedido do usuário (2026-10-12): agregar o KMZ do GeoGrid com toda a extensão de fibra.
// O site é público: a rede fica no servidor (Drive, servidor/Rede.gs), nunca no código do site.
//   Importar — o app lê o KMZ (rede-regras.js), compacta por cidade, confere a qualidade do cadastro
//              contra a rede inteira e manda cidade a cidade; publicar troca a versão em uso.
//   Cidades  — km, cabos, caixas e problemas de cadastro por cidade.
//   Mapa     — cabos nas cores do GeoGrid e caixas, com busca por nome e os problemas marcados.
//   Qualidade — listas para corrigir no GeoGrid (com exportação).
// Usado também em Novos projetos (camada "Rede existente" e CEO mais perto do destino): SN.rede.
(() => {
  const esc = SN.esc, RD = window.REDE;
  let indice = null, indiceTs = 0;
  const cidades = {}; // cidade → dados expandidos (cache da sessão)
  const st = { aba: 'CIDADES', cidade: '', tipoQ: 'pontasSoltas', q: '', busca: '', mostrarQ: true };
  const fmtKm = v => SN.num(v || 0, 1) + ' km';
  const disponivel = () => SN.remoto && SN.sessao() && (SN.usuario() || {}).tipo === 'lideranca';

  // ─────────── Acesso aos dados (também para outras telas) ───────────
  SN.rede = {
    indice: async (forcar) => {
      if (!disponivel()) return null;
      if (!indice || forcar || Date.now() - indiceTs > 10 * 60e3) { const r = await SN.api('REDE_INDICE', {}); indice = r.indice || null; indiceTs = Date.now(); }
      return indice;
    },
    cidade: async nome => {
      if (cidades[nome]) return cidades[nome];
      const r = await SN.api('REDE_CIDADE', { cidade: nome }), j = JSON.parse(r.dados), d = RD.expandir(j);
      d.q = j.q || null; return (cidades[nome] = d);
    },
    ultimoIndice: () => indice, // o que já foi carregado nesta sessão (sem ir ao servidor)
    // Dados da cidade de um projeto/chamado ("Valinhos", "VALINHOS - SP"…), ou null.
    daCidade: async nome => { const ind = await SN.rede.indice().catch(() => null), c = ind && RD.acharCidade(ind, nome); return c ? SN.rede.cidade(c.cidade) : null; }
  };

  // ═══════════════════════════ Tela ═══════════════════════════
  SN.rota('/rede', () => abrir(), { tela: 'rede' });
  const abrir = async () => {
    if (!SN.remoto) return SN.casca('rede', '<div class="aviso info">A rede fica no servidor: esta tela precisa estar conectada a ele.</div>');
    SN.casca('rede', SN.carregando('Carregando a rede…'));
    try { await SN.rede.indice(true); } catch (e) { return SN.casca('rede', `<div class="aviso erro">${esc(e.message)}</div>`); }
    if (location.hash !== '#/rede') return;
    pintar();
  };
  const kpi = (rot, val, sub) => `<div class="kpi"><div class="rot">${rot}</div><div class="val">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  const pintar = () => {
    const ind = indice, t = (ind && ind.totais) || {};
    SN.casca('rede', `
      <div class="cab-pagina"><div><h1>Rede GeoGrid</h1><p>${ind ? `Cabos e caixas de emenda da empresa — <b>${esc(ind.arquivo || '')}</b>, importado por ${esc(ind.importadoPor || '')} em ${SN.dt(ind.importadoEm)}.` : 'Nenhuma rede importada ainda.'} Fica só no servidor (o site é público).</p></div>
        <label class="btn prim">📥 Importar KMZ do GeoGrid<input type="file" id="fRede" accept=".kmz,.kml" hidden></label></div>
      ${ind ? `<div class="kpis-fin" style="margin-bottom:12px">
        ${kpi('Cabo', fmtKm(t.km), SN.num(t.cabos) + ' cabos')}${kpi('Caixas de emenda', SN.num(t.caixas), `${SN.num((t.tiposCaixa || {}).MINI_FOSC || 0)} mini FOSC · ${SN.num((t.tiposCaixa || {}).FOSC || 0)} FOSC antigas · ${SN.num((t.tiposCaixa || {}).SPLITTER || 0)} c/ splitter`)}
        ${kpi('Não lançados', fmtKm(t.naoLancadosKm), SN.num(t.naoLancados) + ' cabo(s) "CABO NÃO LANÇADO"')}
        ${kpi('Pontas sem caixa', SN.num(t.pontasSoltas), 'fim de cabo sem caixa a 25 m')}${kpi('Caixas sem cabo', SN.num(t.caixasSemCabo), 'a mais de 30 m de qualquer cabo')}</div>
      <div class="abas">${[['CIDADES', 'Cidades'], ['MAPA', 'Mapa'], ['QUALIDADE', 'Qualidade do cadastro']].map(([k, r]) => `<button class="aba ${st.aba === k ? 'ativa' : ''}" data-abarede="${k}">${r}</button>`).join('')}</div>
      <div id="redeCorpo"></div>` : '<div class="card"><p>Exporte no GeoGrid o KMZ de <b>Cabos e Caixas de emenda</b> (todas as cidades) e importe aqui. A cada nova exportação, importe de novo: a versão anterior é substituída.</p></div>'}`);
    SN.$('#fRede').onchange = ev => { const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (f) importar(f).catch(e => SN.toast(e.message || String(e), 'erro')); };
    SN.$$('[data-abarede]').forEach(b => b.onclick = () => { st.aba = b.dataset.abarede; pintar(); });
    if (ind) ({ CIDADES: pintarCidades, MAPA: pintarMapa, QUALIDADE: pintarQualidade })[st.aba]();
  };

  // ─────────── Cidades ───────────
  const pintarCidades = () => {
    const q = SN.normal(st.q), l = indice.cidades.filter(c => !q || SN.normal(c.cidade).includes(q)).sort((a, b) => b.km - a.km);
    SN.$('#redeCorpo').innerHTML = `<div class="card card-filtros"><div class="filtros"><input class="inp busca" id="rQ" placeholder="Buscar cidade" value="${esc(st.q)}">
      <button class="btn" id="bExpCid">Exportar</button></div></div>
      <div class="card"><div class="tabela-wrap"><table class="tab"><thead><tr><th>Cidade</th><th class="num">Cabo (km)</th><th class="num">Cabos</th><th class="num">Caixas</th><th class="num" title="CEO nova (mini FOSC, rastreável)">Mini FOSC</th><th class="num" title="FOSC antiga, sem rastreio">FOSC antiga</th><th class="num">C/ splitter</th><th class="num">Não lançado</th><th class="num">Pontas sem caixa</th><th class="num">Caixas sem cabo</th><th class="num" title="Caixa cujo cabo está na pasta de outra cidade no GeoGrid">Cabo em outra pasta</th><th></th></tr></thead><tbody>
      ${l.map(c => `<tr><td><b>${esc(c.cidade)}</b></td><td class="num">${SN.num(c.km, 1)}</td><td class="num">${SN.num(c.cabos)}</td><td class="num">${SN.num(c.caixas)}</td><td class="num">${SN.num((c.tiposCaixa || {}).MINI_FOSC || 0)}</td><td class="num">${SN.num((c.tiposCaixa || {}).FOSC || 0)}</td><td class="num">${SN.num((c.tiposCaixa || {}).SPLITTER || 0)}</td>
        <td class="num">${c.naoLancados ? `${SN.num(c.naoLancados)} <span class="muted small">(${SN.num(c.naoLancadosKm, 1)} km)</span>` : '—'}</td><td class="num">${SN.num(c.pontasSoltas)}</td><td class="num">${c.caixasSemCabo ? `<b>${SN.num(c.caixasSemCabo)}</b>` : '—'}</td><td class="num muted">${SN.num(c.caixasOutraCidade || 0)}</td>
        <td><button class="btn sm" data-vercid="${esc(c.cidade)}">Mapa</button></td></tr>`).join('')}</tbody></table></div></div>
      ${(() => { const pops = {}; l.forEach(c => Object.entries(c.pops || {}).forEach(([p, x]) => { const o = pops[p] = pops[p] || { cabos: 0, km: 0, cidades: new Set() }; o.cabos += x.cabos; o.km += x.km; o.cidades.add(c.cidade); }));
        const lp = Object.entries(pops).sort((a, b) => b[1].km - a[1].km); if (!lp.length) return '';
        return `<div class="card" style="margin-top:12px"><h3>Por POP (prefixo do cabo)</h3><div class="tabela-wrap"><table class="tab small"><thead><tr><th>POP</th><th class="num">Cabo (km)</th><th class="num">Cabos</th><th>Cidades</th></tr></thead><tbody>
          ${lp.map(([p, o]) => `<tr><td class="mono"><b>${esc(p)}</b></td><td class="num">${SN.num(o.km, 1)}</td><td class="num">${SN.num(o.cabos)}</td><td>${[...o.cidades].map(esc).join(', ')}</td></tr>`).join('')}</tbody></table></div></div>`; })()}`;
    SN.$('#rQ').oninput = SN.debounce(e => { st.q = e.target.value; pintarCidades(); SN.$('#rQ').focus(); }, 250);
    SN.$('#bExpCid').onclick = () => SN.exportar('rede-geogrid-cidades', l.map(c => ({ Cidade: c.cidade, 'Cabo (km)': c.km, Cabos: c.cabos, Caixas: c.caixas, 'Não lançados': c.naoLancados, 'Não lançados (km)': c.naoLancadosKm,
      'Mini FOSC': (c.tiposCaixa || {}).MINI_FOSC || 0, 'FOSC antiga': (c.tiposCaixa || {}).FOSC || 0, 'Com splitter': (c.tiposCaixa || {}).SPLITTER || 0, 'Pontas sem caixa': c.pontasSoltas, 'Caixas sem cabo': c.caixasSemCabo, 'Cabo em outra pasta': c.caixasOutraCidade || 0, 'Nomes repetidos': c.nomesRepetidos })));
    SN.$$('[data-vercid]').forEach(b => b.onclick = () => { st.cidade = b.dataset.vercid; st.aba = 'MAPA'; pintar(); });
  };

  // ─────────── Mapa ───────────
  let mapa = null, camadas = null;
  const carregarLeaflet = async () => {
    if (!document.querySelector('link[href*="leaflet.min.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(l); }
    if (!window.L) await new Promise((ok, falha) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = ok; s.onerror = () => falha(new Error('Mapa indisponível (sem internet?).')); document.head.appendChild(s); });
  };
  const pintarMapa = async () => {
    const lista = indice.cidades.slice().sort((a, b) => a.cidade.localeCompare(b.cidade));
    if (!st.cidade) st.cidade = (indice.cidades.slice().sort((a, b) => b.km - a.km)[0] || {}).cidade || '';
    SN.$('#redeCorpo').innerHTML = `<div class="card" style="padding:8px">
      <div class="prj-barra"><select class="inp" id="rCid" style="max-width:280px">${lista.map(c => `<option ${c.cidade === st.cidade ? 'selected' : ''}>${esc(c.cidade)}</option>`).join('')}</select>
        <input class="inp" id="rBusca" style="max-width:240px" placeholder="Buscar caixa ou cabo (CE…, NTT…)" value="${esc(st.busca)}">
        <label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="rQual" ${st.mostrarQ ? 'checked' : ''}> marcar problemas de cadastro</label>
        <span class="small muted" id="rInfo"></span></div>
      <div id="rMapa" class="prj-mapa"></div></div>`;
    SN.$('#rCid').onchange = e => { st.cidade = e.target.value; st.busca = ''; pintarMapa(); };
    SN.$('#rQual').onchange = e => { st.mostrarQ = e.target.checked; desenhar(); };
    SN.$('#rBusca').onchange = e => { st.busca = e.target.value.trim(); buscar(); };
    try { await carregarLeaflet(); } catch (e) { SN.$('#rMapa').innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; return; }
    const L = window.L, el = SN.$('#rMapa');
    if (mapa) { try { mapa.remove(); } catch (e) { } }
    mapa = L.map(el, { preferCanvas: true, maxZoom: 21, zoomAnimation: false }).setView([-22.9, -47.06], 11);
    const sat = L.layerGroup([L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 21, attribution: 'Imagens © Esri' }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 21 })]);
    const ruas = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 21, attribution: '© OpenStreetMap', className: 'mapa-cinza' }).addTo(mapa);
    L.control.layers({ Ruas: ruas, 'Satélite': sat }, {}, { position: 'topright' }).addTo(mapa);
    camadas = L.layerGroup().addTo(mapa);
    SN.$('#rInfo').textContent = 'carregando ' + st.cidade + '…';
    try { await SN.rede.cidade(st.cidade); } catch (e) { SN.$('#rInfo').textContent = e.message; return; }
    if (!SN.$('#rMapa') || SN.$('#rMapa') !== el) return;
    desenhar(true); if (st.busca) buscar();
  };
  const desenhar = enquadrar => {
    const L = window.L, d = cidades[st.cidade]; if (!d || !camadas) return;
    camadas.clearLayers();
    const r = L.canvas({ padding: 0.3 });
    d.cabos.forEach(c => L.polyline(c.pts, { color: c.cor, weight: 2.6, opacity: 0.9, renderer: r }).addTo(camadas)
      .bindTooltip(`<b>${esc(c.n)}</b> · ${SN.num(c.m)} m${c.d ? '<br>' + esc(c.d.slice(0, 120)) : ''}`, { sticky: true }));
    d.caixas.forEach(c => L.circleMarker([c.lat, c.lng], { radius: 4, color: '#222', weight: 1, fillColor: c.cor || '#ffffff', fillOpacity: 1, renderer: r }).addTo(camadas)
      .bindTooltip(`<b>${esc(c.n)}</b> · ${esc(RD.TIPOS_CAIXA[RD.tipoCaixa(c.cor)].rot)}${c.d ? '<br>' + esc(c.d.slice(0, 120)) : ''}<br><span class="mono">${c.lat}, ${c.lng}</span>`));
    if (st.mostrarQ && d.q) {
      (d.q.caixasSemCabo || []).forEach(x => L.circleMarker([x.lat, x.lng], { radius: 9, color: '#d00', weight: 3, fill: false, renderer: r }).addTo(camadas).bindTooltip('Caixa sem cabo a 30 m: ' + esc(x.n)));
      (d.q.pontasSoltas || []).forEach(x => L.circleMarker([x.lat, x.lng], { radius: 5, color: '#f59e0b', weight: 2, fill: false, renderer: r }).addTo(camadas).bindTooltip('Ponta sem caixa: ' + esc(x.n)));
    }
    const pts = d.cabos.flatMap(c => [c.pts[0], c.pts[c.pts.length - 1]]).concat(d.caixas.map(c => [c.lat, c.lng]));
    if (enquadrar && pts.length) mapa.fitBounds(L.latLngBounds(pts).pad(0.05), { animate: false });
    const ic = (indice.cidades.find(c => c.cidade === st.cidade) || {});
    SN.$('#rInfo').innerHTML = `${SN.num(d.cabos.length)} cabos · ${fmtKm(ic.km)} · ${SN.num(d.caixas.length)} caixas${st.mostrarQ ? ' · <span style="color:#d00">○</span> caixa sem cabo · <span style="color:#f59e0b">○</span> ponta sem caixa' : ''}`;
  };
  const buscar = () => {
    const d = cidades[st.cidade], q = RD.norm(st.busca); if (!d || !q) return;
    const cx = d.caixas.find(c => RD.norm(c.n) === q) || d.caixas.find(c => RD.norm(c.n).includes(q));
    const cb = !cx && (d.cabos.find(c => RD.norm(c.n).startsWith(q)) || d.cabos.find(c => RD.norm(c.n).includes(q)));
    if (cx) { mapa.setView([cx.lat, cx.lng], 19, { animate: false }); window.L.popup().setLatLng([cx.lat, cx.lng]).setContent(`<b>${esc(cx.n)}</b>${cx.d ? '<br>' + esc(cx.d) : ''}`).openOn(mapa); }
    else if (cb) { mapa.fitBounds(window.L.latLngBounds(cb.pts).pad(0.2), { animate: false }); window.L.popup().setLatLng(cb.pts[0]).setContent(`<b>${esc(cb.n)}</b> · ${SN.num(cb.m)} m`).openOn(mapa); }
    else SN.toast('Nada com "' + st.busca + '" em ' + st.cidade + '.', 'erro');
  };

  // ─────────── Qualidade do cadastro ───────────
  const TIPOS_Q = { pontasSoltas: 'Pontas de cabo sem caixa (25 m)', caixasSemCabo: 'Caixas sem cabo (30 m)', naoLancados: 'Cabos "NÃO LANÇADO"', curtos: 'Cabos com menos de 5 m',
    nomesRepetidos: 'Nomes repetidos na cidade', caixasOutraCidade: 'Caixa com o cabo na pasta de outra cidade',
    rastreioRepetido: 'Mini FOSC com número de rastreio repetido', miniFoscSemNumero: 'Mini FOSC sem os 4 dígitos de rastreio' };
  const pintarQualidade = async () => {
    const lista = indice.cidades.slice().sort((a, b) => b.km - a.km);
    if (!st.cidade) st.cidade = (lista[0] || {}).cidade || '';
    SN.$('#redeCorpo').innerHTML = `<div class="card card-filtros"><div class="filtros">
      <select class="inp" id="qCid">${lista.map(c => `<option ${c.cidade === st.cidade ? 'selected' : ''}>${esc(c.cidade)}</option>`).join('')}</select>
      <select class="inp" id="qTipo">${Object.entries(TIPOS_Q).map(([k, r]) => `<option value="${k}" ${st.tipoQ === k ? 'selected' : ''}>${r}</option>`).join('')}</select>
      <button class="btn" id="bExpQ">Exportar</button></div>
      <p class="small muted" style="margin:6px 0 0">Para corrigir no GeoGrid. "Ponta sem caixa" pode ser um cliente final (sem caixa), uma caixa que falta no cadastro ou o cabo desenhado até o lugar errado. "Cabo em outra pasta" não é defeito da rede: é a organização das pastas por cidade no GeoGrid.</p></div>
      <div class="card" id="qLista">${SN.carregando('Carregando…')}</div>`;
    SN.$('#qCid').onchange = e => { st.cidade = e.target.value; pintarQualidade(); };
    SN.$('#qTipo').onchange = e => { st.tipoQ = e.target.value; pintarQualidade(); };
    let d; try { d = await SN.rede.cidade(st.cidade); } catch (e) { SN.$('#qLista').innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; return; }
    if (!SN.$('#qLista')) return;
    const itens = ((d.q || {})[st.tipoQ] || []);
    SN.$('#qLista').innerHTML = `<div class="card-tit"><h3>${esc(TIPOS_Q[st.tipoQ])} · ${esc(st.cidade)} (${SN.num(itens.length)})</h3></div>
      ${itens.length ? `<div class="tabela-wrap"><table class="tab small"><thead><tr><th>Nome</th><th>Detalhe</th><th>Coordenada</th><th></th></tr></thead><tbody>
      ${itens.slice(0, 500).map(x => `<tr><td class="mono">${esc(x.n)}</td><td>${x.m != null ? SN.num(x.m, 1) + ' m' : x.vezes ? x.vezes + ' vezes' : x.cidade ? 'cabo em ' + esc(x.cidade) : ''}</td>
        <td class="mono">${x.lat != null ? x.lat + ', ' + x.lng : ''}</td><td>${x.lat != null ? `<button class="btn sm" data-verq="${x.lat},${x.lng}">Ver no mapa</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
      ${itens.length > 500 ? `<p class="small muted">Mostrando 500 de ${SN.num(itens.length)} — exporte para ver todos.</p>` : ''}` : '<p class="muted">Nada encontrado. 👍</p>'}`;
    SN.$('#bExpQ').onclick = () => SN.exportar(`rede-qualidade-${st.tipoQ}-${st.cidade}`, itens.map(x => ({ Cidade: st.cidade, Problema: TIPOS_Q[st.tipoQ], Nome: x.n, Metros: x.m, Vezes: x.vezes, 'Cidade do cabo': x.cidade, Latitude: x.lat, Longitude: x.lng })));
    SN.$$('[data-verq]').forEach(b => b.onclick = async () => { const [la, lg] = b.dataset.verq.split(',').map(Number); st.aba = 'MAPA'; pintar(); await new Promise(r => setTimeout(r, 900));
      const espera = async n => { if (mapa && cidades[st.cidade] && camadas && camadas.getLayers().length) { mapa.setView([la, lg], 19, { animate: false }); window.L.circleMarker([la, lg], { radius: 14, color: '#2563eb', weight: 3, fill: false }).addTo(camadas); } else if (n) { await new Promise(r => setTimeout(r, 500)); return espera(n - 1); } };
      espera(20); });
  };

  // ─────────── Importar ───────────
  const carregarJsZip = () => window.JSZip ? Promise.resolve() : new Promise((ok, falha) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = ok; s.onerror = () => falha(new Error('Compactador indisponível (sem internet?).')); document.head.appendChild(s); });
  // Cor do ícone da caixa: a cor mais frequente do PNG, sem os pixels transparentes e sem cinza/branco
  // (o contorno e a base dos ícones do GeoGrid são cinza; o corpo é a cor da caixa).
  const corDoPng = blob => new Promise(ok => {
    const im = new Image(), url = URL.createObjectURL(blob);
    im.onload = () => { try { const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
      const px = g.getImageData(0, 0, im.width, im.height).data, h = {};
      for (let i = 0; i < px.length; i += 4) { const r = px[i], gg = px[i + 1], b = px[i + 2]; if (px[i + 3] < 200) continue; const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
        if (mx - mn < 25 && mx > 70) continue; const k = [r, gg, b].map(v => (v >> 4) << 4).join(','); h[k] = (h[k] || 0) + 1; }
      const top = Object.entries(h).sort((a, b) => b[1] - a[1])[0]; ok(top ? '#' + top[0].split(',').map(v => (+v).toString(16).padStart(2, '0')).join('') : '#000000'); } catch (e) { ok(''); } finally { URL.revokeObjectURL(url); } };
    im.onerror = () => { URL.revokeObjectURL(url); ok(''); }; im.src = url; });
  const importar = async file => {
    if (!(SN.temTela('rede'))) return SN.toast('Seu acesso não inclui importar a rede.', 'erro');
    const fim = SN.cobrirCarregando('Lendo o KMZ do GeoGrid…'), passo = t => { const p = document.querySelector('.carregando-sobre p'); if (p) p.textContent = t; };
    try {
      let txt, cores = {};
      if (/\.kmz$/i.test(file.name)) {
        await carregarJsZip(); const zip = await JSZip.loadAsync(file);
        const k = Object.keys(zip.files).find(n => /\.kml$/i.test(n)); if (!k) throw new Error('O KMZ não tem arquivo .kml dentro.');
        txt = await zip.files[k].async('string');
        for (const n of Object.keys(zip.files).filter(n => /\.png$/i.test(n))) cores[n] = await corDoPng(await zip.files[n].async('blob'));
      } else txt = await file.text();
      passo('Separando por cidade…'); await new Promise(r => setTimeout(r, 30));
      const r = RD.lerGeogrid(txt, { corIcone: h => cores[h] || cores[String(h || '').replace(/^\.?\//, '')] || '' });
      if (!r.cidades.length) throw new Error('Não achei cidades/cabos no arquivo. É o export do GeoGrid?');
      passo('Conferindo a qualidade do cadastro…'); await new Promise(r => setTimeout(r, 30));
      const todas = r.cidades.map(c => RD.expandir(RD.compactar(c))), base = RD.juntar(todas);
      const linhas = todas.map((d, i) => { const q = RD.qualidade(d, base); d.semGeometria = r.cidades[i].semGeometria || 0; return { d, q, resumo: RD.resumo(d, q), j: RD.compactar(r.cidades[i]) }; });
      const tot = linhas.reduce((a, x) => { ['cabos', 'caixas', 'km', 'naoLancados', 'naoLancadosKm', 'pontasSoltas', 'caixasSemCabo', 'caixasOutraCidade', 'semGeometria'].forEach(k => { a[k] = Math.round(((a[k] || 0) + (x.resumo[k] || 0)) * 10) / 10; }); return a; }, {});
      tot.tiposCaixa = linhas.reduce((a, x) => { Object.entries(x.resumo.tiposCaixa || {}).forEach(([k, v]) => { a[k] = (a[k] || 0) + v; }); return a; }, {});
      tot.rastreioRepetido = linhas.reduce((a, x) => a + (x.resumo.rastreioRepetido || 0), 0);
      tot.cidades = linhas.length; tot.km = Math.round(todas.reduce((s, d) => s + d.cabos.reduce((a, c) => a + c.m, 0), 0) / 100) / 10; // soma dos metros (não dos km arredondados por cidade)
      const ok = await SN.confirmar('Importar rede do GeoGrid', `<b>${esc(r.nome || file.name)}</b><br>${SN.num(tot.cidades)} cidades · ${fmtKm(tot.km)} de cabo · ${SN.num(tot.cabos)} cabos · ${SN.num(tot.caixas)} caixas.<br>
        Cadastro: ${SN.num(tot.caixasSemCabo)} caixa(s) sem cabo, ${SN.num(tot.pontasSoltas)} ponta(s) de cabo sem caixa, ${SN.num(tot.naoLancados)} cabo(s) não lançado(s)${tot.semGeometria ? `, ${tot.semGeometria} sem coordenadas` : ''}.<br>
        ${indice ? 'A versão atual será substituída (a anterior vai para a lixeira do Drive).' : ''}`, 'Importar', 'prim');
      if (!ok) return;
      const versao = 'v' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '_' + SN.uid().slice(-4), cidadesInd = [];
      for (let i = 0; i < linhas.length; i++) {
        const x = linhas[i]; passo(`Enviando ${i + 1}/${linhas.length}: ${x.d.cidade}…`);
        const q = {}; Object.keys(x.q).forEach(k => { q[k] = x.q[k].slice(0, 5000); });
        const res = await SN.api('REDE_SALVAR_CIDADE', { versao, cidade: x.d.cidade, dados: JSON.stringify({ ...x.j, q }) });
        cidadesInd.push({ ...x.resumo, id: res.id });
      }
      passo('Publicando…');
      const ind = { versao, arquivo: file.name, nome: r.nome, totais: tot, cidades: cidadesInd };
      await SN.api('REDE_PUBLICAR', { indice: ind });
      Object.keys(cidades).forEach(k => delete cidades[k]); indice = null;
      SN.log('REDE_IMPORTADA', versao, file.name); SN.toast(`Rede importada: ${SN.num(tot.cidades)} cidades, ${fmtKm(tot.km)}.`, 'ok');
      await SN.rede.indice(true); st.aba = 'CIDADES'; pintar();
    } finally { fim(); }
  };

  // Menu (Gestão) e nome da tela em Cadastros e Acessos.
  SN.TELAS.rede = 'Rede GeoGrid (cabos e caixas)';
  const i = SN.MENU.findIndex(m => m.tela === 'portal');
  SN.MENU.splice(i >= 0 ? i : SN.MENU.length, 0, { tela: 'rede', rot: 'Rede GeoGrid', ico: '🧵', href: '#/rede' });
})();
