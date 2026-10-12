// SIGONET V2 — Rede GeoGrid (tela "rede"): a rede da empresa (cabos e caixas de emenda) dentro do SigoNet.
//
// Pedido do usuário (2026-10-12): agregar o KMZ do GeoGrid com toda a extensão de fibra.
// O site é público: a rede fica no servidor (Drive, servidor/Rede.gs), nunca no código do site.
//   Importar — o app lê o KMZ (rede-regras.js), compacta por cidade, confere a qualidade do cadastro
//              contra a rede inteira e manda cidade a cidade; publicar troca a versão em uso.
//   Cidades  — km, cabos, caixas e problemas de cadastro por cidade.
//   Mapa     — cabos nas cores do GeoGrid e caixas, com busca por nome e os problemas marcados.
//              "Todas as cidades" (pedido de 2026-10-12): a rede inteira num mapa só; as caixas aparecem
//              no zoom de rua (só as da área visível) para o mapa continuar leve.
//   Qualidade — listas para corrigir no GeoGrid (com exportação).
// Usado também em Novos projetos (camada "Rede existente" e CEO mais perto do destino): SN.rede.
(() => {
  const esc = SN.esc, RD = window.REDE;
  let indice = null, indiceTs = 0, versaoLimpa;
  const cidades = {}, buscando = {}; // cidade → dados expandidos (cache da sessão) / carga em andamento
  const TODAS = '__todas', ZOOM_CAIXAS = 15;
  const st = { aba: 'CIDADES', cidade: '', tipoQ: 'pontasSoltas', q: '', busca: '', mostrarQ: true };
  // Cópia no aparelho (IndexedDB) do JSON de cada cidade, pela versão da rede: na 2ª vez abre na hora.
  // Só para a liderança logada; apaga ao sair e ao chegar versão nova.
  const CACHE = (() => {
    let dbp = null;
    const abrir = () => dbp || (dbp = new Promise((ok, falha) => { const r = indexedDB.open('sigonet_v2_rede', 1); r.onupgradeneeded = () => r.result.createObjectStore('cid'); r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error); }));
    const tx = async (modo, fn) => { const db = await abrir(); return new Promise((ok, falha) => { const t = db.transaction('cid', modo), r = fn(t.objectStore('cid')); t.oncomplete = () => ok(r && r.result); t.onerror = () => falha(t.error); }); };
    const seguro = f => (...a) => { try { return f(...a).catch(() => null); } catch (e) { return Promise.resolve(null); } };
    return {
      ler: seguro(k => tx('readonly', o => o.get(k))),
      gravar: seguro((k, v) => tx('readwrite', o => o.put(v, k))),
      manterSo: seguro(versao => tx('readwrite', o => { const c = o.openCursor(); c.onsuccess = () => { const x = c.result; if (!x) return; if (!versao || !String(x.key).startsWith(versao + '|')) x.delete(); x.continue(); }; }))
    };
  })();
  const fmtKm = v => SN.num(v || 0, 1) + ' km';
  const disponivel = () => SN.remoto && SN.sessao() && (SN.usuario() || {}).tipo === 'lideranca';

  // ─────────── Acesso aos dados (também para outras telas) ───────────
  SN.rede = {
    indice: async (forcar) => {
      if (!disponivel()) return null;
      if (!indice || forcar || Date.now() - indiceTs > 10 * 60e3) {
        const r = await SN.api('REDE_INDICE', {}), antes = indice && indice.versao; indice = r.indice || null; indiceTs = Date.now();
        const v = indice && indice.versao; if (antes && antes !== v) Object.keys(cidades).forEach(k => delete cidades[k]);
        if (v !== versaoLimpa) { versaoLimpa = v; CACHE.manterSo(v); }
      }
      return indice;
    },
    cidade: async nome => {
      if (cidades[nome]) return cidades[nome];
      if (buscando[nome]) return buscando[nome];
      return (buscando[nome] = (async () => {
        if (!indice) await SN.rede.indice();
        const v = indice && indice.versao, k = v ? v + '|' + nome : '';
        let txt = k ? await CACHE.ler(k) : null;
        if (!txt) { const r = await SN.api('REDE_CIDADE', { cidade: nome }); txt = r.dados; if (k) CACHE.gravar(k, txt); }
        const j = JSON.parse(txt), d = RD.expandir(j); d.q = j.q || null; d.cidade = d.cidade || nome;
        if (indice && indice.versao === v) cidades[nome] = d;
        return d;
      })().finally(() => { delete buscando[nome]; }));
    },
    // A rede inteira (todas as cidades), 8 de cada vez; passo(feitas, total) para mostrar o progresso.
    todas: async passo => {
      const ind = await SN.rede.indice(); if (!ind) return [];
      const nomes = ind.cidades.map(c => c.cidade); let i = 0, feitas = 0;
      const trab = async () => { while (i < nomes.length) { const n = nomes[i++]; try { await SN.rede.cidade(n); } catch (e) { } feitas++; if (passo) passo(feitas, nomes.length); } };
      await Promise.all(Array.from({ length: Math.min(8, nomes.length) }, trab));
      return nomes.filter(n => cidades[n]).map(n => cidades[n]);
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
      <button class="btn" id="bMapaTodo">🗺 Mapa completo</button><button class="btn" id="bExpCid">Exportar</button></div></div>
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
    SN.$('#bMapaTodo').onclick = () => { st.cidade = TODAS; st.busca = ''; st.aba = 'MAPA'; pintar(); };
  };

  // ─────────── Mapa ───────────
  let mapa = null, camadas = null, camadaCx = null;
  const noMapa = () => st.cidade === TODAS ? Object.values(cidades) : cidades[st.cidade] ? [cidades[st.cidade]] : [];
  const carregarLeaflet = async () => {
    if (!document.querySelector('link[href*="leaflet.min.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(l); }
    if (!window.L) await new Promise((ok, falha) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = ok; s.onerror = () => falha(new Error('Mapa indisponível (sem internet?).')); document.head.appendChild(s); });
  };
  const pintarMapa = async () => {
    const lista = indice.cidades.slice().sort((a, b) => a.cidade.localeCompare(b.cidade));
    if (!st.cidade) st.cidade = (indice.cidades.slice().sort((a, b) => b.km - a.km)[0] || {}).cidade || '';
    SN.$('#redeCorpo').innerHTML = `<div class="card" style="padding:8px">
      <div class="prj-barra"><select class="inp" id="rCid" style="max-width:280px"><option value="${TODAS}" ${st.cidade === TODAS ? 'selected' : ''}>Todas as cidades (mapa completo)</option>${lista.map(c => `<option ${c.cidade === st.cidade ? 'selected' : ''}>${esc(c.cidade)}</option>`).join('')}</select>
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
    camadas = L.layerGroup().addTo(mapa); camadaCx = L.layerGroup().addTo(mapa);
    mapa.on('moveend', () => { if (st.cidade === TODAS) pintarCaixas(); });
    const t0 = Date.now();
    if (st.cidade === TODAS) {
      const n = indice.cidades.length, falta = indice.cidades.filter(c => !cidades[c.cidade]).length;
      SN.$('#rInfo').textContent = falta ? `carregando a rede inteira… 0/${n}` : '';
      await SN.rede.todas((f, tot) => { const i = SN.$('#rInfo'); if (i && el === SN.$('#rMapa')) i.textContent = `carregando a rede inteira… ${f}/${tot}`; });
    } else {
      SN.$('#rInfo').textContent = 'carregando ' + st.cidade + '…';
      try { await SN.rede.cidade(st.cidade); } catch (e) { SN.$('#rInfo').textContent = e.message; return; }
    }
    if (!SN.$('#rMapa') || SN.$('#rMapa') !== el) return;
    SN.rede._ms = Date.now() - t0;
    desenhar(true); if (st.busca) buscar();
  };
  let rend = null;
  const tipCabo = c => `<b>${esc(c.n)}</b> · ${SN.num(c.m)} m${c.d ? '<br>' + esc(c.d.slice(0, 120)) : ''}`;
  const tipCaixa = c => `<b>${esc(c.n)}</b> · ${esc(RD.TIPOS_CAIXA[RD.tipoCaixa(c.cor)].rot)}${c.d ? '<br>' + esc(c.d.slice(0, 120)) : ''}<br><span class="mono">${c.lat}, ${c.lng}</span>`;
  // Caixas e marcas de qualidade de uma cidade (ou só as que estão dentro de "area").
  const caixasDe = (d, alvo, area) => {
    const L = window.L, dentro = (la, lg) => !area || area.contains([la, lg]);
    d.caixas.forEach(c => { if (dentro(c.lat, c.lng)) L.circleMarker([c.lat, c.lng], { radius: 4, color: '#222', weight: 1, fillColor: c.cor || '#ffffff', fillOpacity: 1, renderer: rend }).addTo(alvo).bindTooltip(tipCaixa(c)); });
    if (st.mostrarQ && d.q) {
      (d.q.caixasSemCabo || []).forEach(x => { if (dentro(x.lat, x.lng)) L.circleMarker([x.lat, x.lng], { radius: 9, color: '#d00', weight: 3, fill: false, renderer: rend }).addTo(alvo).bindTooltip('Caixa sem cabo a 30 m: ' + esc(x.n)); });
      (d.q.pontasSoltas || []).forEach(x => { if (dentro(x.lat, x.lng)) L.circleMarker([x.lat, x.lng], { radius: 5, color: '#f59e0b', weight: 2, fill: false, renderer: rend }).addTo(alvo).bindTooltip('Ponta sem caixa: ' + esc(x.n)); });
    }
  };
  // Mapa completo: as caixas só no zoom de rua e só as da área visível (milhares de caixas deixariam o mapa pesado).
  const pintarCaixas = () => {
    if (!camadaCx || !mapa) return; camadaCx.clearLayers();
    const z = mapa.getZoom(), dica = SN.$('#rDicaCx');
    if (dica) dica.style.display = z >= ZOOM_CAIXAS ? 'none' : '';
    if (z < ZOOM_CAIXAS) return;
    const area = mapa.getBounds().pad(0.2);
    noMapa().forEach(d => { if (d.bbox && !area.intersects(d.bbox)) return; caixasDe(d, camadaCx, area); });
  };
  const desenhar = enquadrar => {
    const L = window.L, ds = noMapa(); if (!ds.length || !camadas) return;
    camadas.clearLayers(); if (camadaCx) camadaCx.clearLayers();
    rend = L.canvas({ padding: 0.3, tolerance: 3 });
    const todas = st.cidade === TODAS, pts = [];
    ds.forEach(d => {
      d.cabos.forEach(c => { L.polyline(c.pts, { color: c.cor, weight: todas ? 2 : 2.6, opacity: 0.9, renderer: rend }).addTo(camadas).bindTooltip(tipCabo(c), { sticky: true }); pts.push(c.pts[0], c.pts[c.pts.length - 1]); });
      if (!d.bbox) { const b = L.latLngBounds(d.cabos.flatMap(c => [c.pts[0], c.pts[c.pts.length - 1]]).concat(d.caixas.map(c => [c.lat, c.lng]))); if (b.isValid()) d.bbox = b; }
      if (!todas) { caixasDe(d, camadas); d.caixas.forEach(c => pts.push([c.lat, c.lng])); }
    });
    if (enquadrar && pts.length) mapa.fitBounds(L.latLngBounds(pts).pad(0.05), { animate: false });
    const leg = st.mostrarQ ? ' · <span style="color:#d00">○</span> caixa sem cabo · <span style="color:#f59e0b">○</span> ponta sem caixa' : '';
    if (todas) {
      const t = indice.totais || {};
      SN.$('#rInfo').innerHTML = `${SN.num(ds.length)} cidades · ${SN.num(ds.reduce((s, d) => s + d.cabos.length, 0))} cabos · ${fmtKm(t.km)} · ${SN.num(ds.reduce((s, d) => s + d.caixas.length, 0))} caixas <span id="rDicaCx">(aproxime até o nível de rua para ver as caixas)</span>${leg}`;
      pintarCaixas();
    } else {
      const d = ds[0], ic = (indice.cidades.find(c => c.cidade === st.cidade) || {});
      SN.$('#rInfo').innerHTML = `${SN.num(d.cabos.length)} cabos · ${fmtKm(ic.km)} · ${SN.num(d.caixas.length)} caixas${leg}`;
    }
  };
  const buscar = () => {
    const ds = noMapa(), q = RD.norm(st.busca); if (!ds.length || !q) return;
    const achar = f => { for (const d of ds) { const x = f(d); if (x) return x; } return null; };
    const cx = achar(d => d.caixas.find(c => RD.norm(c.n) === q)) || achar(d => d.caixas.find(c => RD.norm(c.n).includes(q)));
    const cb = !cx && (achar(d => d.cabos.find(c => RD.norm(c.n).startsWith(q))) || achar(d => d.cabos.find(c => RD.norm(c.n).includes(q))));
    if (cx) { mapa.setView([cx.lat, cx.lng], 19, { animate: false }); window.L.popup().setLatLng([cx.lat, cx.lng]).setContent(`<b>${esc(cx.n)}</b>${cx.d ? '<br>' + esc(cx.d) : ''}`).openOn(mapa); }
    else if (cb) { mapa.fitBounds(window.L.latLngBounds(cb.pts).pad(0.2), { animate: false }); window.L.popup().setLatLng(cb.pts[0]).setContent(`<b>${esc(cb.n)}</b> · ${SN.num(cb.m)} m`).openOn(mapa); }
    else SN.toast('Nada com "' + st.busca + '" ' + (st.cidade === TODAS ? 'na rede.' : 'em ' + st.cidade + '.'), 'erro');
  };

  // ─────────── Qualidade do cadastro ───────────
  const TIPOS_Q = { pontasSoltas: 'Pontas de cabo sem caixa (25 m)', caixasSemCabo: 'Caixas sem cabo (30 m)', naoLancados: 'Cabos "NÃO LANÇADO"', curtos: 'Cabos com menos de 5 m',
    nomesRepetidos: 'Nomes repetidos na cidade', caixasOutraCidade: 'Caixa com o cabo na pasta de outra cidade',
    rastreioRepetido: 'Mini FOSC com número de rastreio repetido', miniFoscSemNumero: 'Mini FOSC sem os 4 dígitos de rastreio' };
  const pintarQualidade = async () => {
    const lista = indice.cidades.slice().sort((a, b) => b.km - a.km);
    if (!st.cidade || st.cidade === TODAS) st.cidade = (lista[0] || {}).cidade || '';
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
      const espera = async n => { if (mapa && noMapa().length && camadas && camadas.getLayers().length) { mapa.setView([la, lg], 19, { animate: false }); window.L.circleMarker([la, lg], { radius: 14, color: '#2563eb', weight: 3, fill: false }).addTo(camadas); } else if (n) { await new Promise(r => setTimeout(r, 500)); return espera(n - 1); } };
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
      Object.keys(cidades).forEach(k => delete cidades[k]); indice = null; CACHE.manterSo(versao);
      SN.log('REDE_IMPORTADA', versao, file.name); SN.toast(`Rede importada: ${SN.num(tot.cidades)} cidades, ${fmtKm(tot.km)}.`, 'ok');
      await SN.rede.indice(true); st.aba = 'CIDADES'; pintar();
    } finally { fim(); }
  };

  const sair0 = SN.sair; SN.sair = (...a) => { Object.keys(cidades).forEach(k => delete cidades[k]); indice = null; versaoLimpa = undefined; CACHE.manterSo(null); return sair0(...a); };

  // Menu (Gestão) e nome da tela em Cadastros e Acessos.
  SN.TELAS.rede = 'Rede GeoGrid (cabos e caixas)';
  const i = SN.MENU.findIndex(m => m.tela === 'portal');
  SN.MENU.splice(i >= 0 ? i : SN.MENU.length, 0, { tela: 'rede', rot: 'Rede GeoGrid', ico: '🧵', href: '#/rede' });
})();
