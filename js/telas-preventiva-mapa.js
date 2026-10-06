// SIGONET V2 — Preventiva · Mapa de atuação (mapa de calor para reunião).
//
// Onde o time de preventiva está atuando e concluindo:
//   • subterrânea: o GPS de campo de cada CS vistoriada (v.lat/v.lng);
//   • aérea: o GPS das fotos de cada apontamento (fotos da galeria não têm GPS e ficam fora).
// "Concluída" = aprovada na Revisão; "em andamento" = enviada e ainda não aprovada.
// O histórico importado da planilha não tem coordenadas e não aparece no mapa.
// Mapa: Leaflet + OpenStreetMap (sem chave), calor pelo plugin leaflet.heat, ambos do cdnjs.
(() => {
  const esc = SN.esc;
  let P = { per: 'mes', ref: '' }, filtro = { seg: '', sit: '', prest: '' }, ver = { calor: true, pontos: false }, mapa = null;
  const num = v => v !== '' && v != null && isFinite(Number(v));
  const carregarCss = href => { if (document.querySelector(`link[href="${href}"]`)) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); };
  const carregarJs = src => new Promise((ok, falha) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => falha(new Error('Não foi possível carregar o mapa (sem internet?).')); document.head.appendChild(s); });
  const carregarLeaflet = async () => {
    carregarCss('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
    if (!window.L) await carregarJs('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
    if (!L.heatLayer) await carregarJs('https://cdnjs.cloudflare.com/ajax/libs/leaflet.heat/0.2.0/leaflet-heat.js');
  };

  // Pontos de atuação (um por CS vistoriada / por foto de apontamento aéreo).
  const pontosDe = d => {
    const rotaPor = {}; d.rotas.forEach(r => { rotaPor[r.id_rota] = r; });
    const out = [];
    (d.vistorias || []).forEach(v => {
      const r = rotaPor[v.id_rota]; if (!r || !num(v.lat) || !num(v.lng) || !v.status_revisao || v.status_revisao === 'RASCUNHO') return;
      out.push({ lat: +v.lat, lng: +v.lng, seg: 'SUBTERRANEA', concl: v.status_revisao === 'APROVADA', quando: v.fim || v.enviado_em, id: v.id_vistoria,
        rota: r.id_rota, prestador: r.prestador || '', tecnico: v.tecnico || r.tecnico || '', cidade: r.cidade || '', local: r.cluster || r.cidade || '', item: v.cs_nova ? 'CS fora do cadastro' : v.id_cs });
    });
    (d.producao || []).forEach(a => {
      const r = rotaPor[a.id_rota]; if (!r || a.importado_planilha || !a.status_revisao || a.status_revisao === 'RASCUNHO') return;
      (a.fotos || []).filter(f => f.tipo_foto !== 'ficha_pdf' && num(f.lat) && num(f.lng)).forEach(f => out.push({ lat: +f.lat, lng: +f.lng, seg: 'AEREA', concl: a.status_revisao === 'APROVADA',
        quando: a.data, id: a.id_apontamento, rota: r.id_rota, prestador: r.prestador || '', tecnico: a.tecnico || r.tecnico || '', cidade: r.cidade || '', local: r.cidade + (r.motivo ? ' · ' + r.motivo : ''), item: (L_ROT[f.tipo_foto] || 'Foto') }));
    });
    return out;
  };
  const L_ROT = { aerea_metros: 'Rota percorrida', aerea_postes: 'Poste', aerea_cordoalha: 'Cordoalha', aerea_plaquetas: 'Plaqueta', aerea_caixas: 'Caixa/CEO', aerea_sobra: 'Sobra técnica', producao: 'Produção' };

  SN.rota('/vst/mapa', async () => {
    if (!SN.vst.disponivel()) return SN.casca('vst_mapa', SN.vst.semServidorHtml);
    SN.casca('vst_mapa', SN.carregando('Carregando o mapa de atuação…'));
    let d; try { [d] = await Promise.all([SN.vst.carregar(), carregarLeaflet()]); } catch (e) { return SN.casca('vst_mapa', `<div class="aviso erro">${esc(e.message)}</div>`); }
    if (location.hash !== '#/vst/mapa') return;
    pintar(d);
  }, { tela: 'vst_dashboard' });

  const pintar = d => {
    if (!P.ref) P.ref = SN.dataIsoLocal(new Date());
    const iv = SN.intervaloMat(P.per, P.ref);
    const todos = pontosDe(d);
    const vis = todos.filter(p => SN.noIntervalo(p.quando, iv) && (!filtro.seg || p.seg === filtro.seg) && (!filtro.sit || (filtro.sit === 'concl') === p.concl) && (!filtro.prest || p.prestador === filtro.prest));
    const prests = [...new Set(todos.map(p => p.prestador).filter(Boolean))].sort();
    const unico = (l, k) => new Set(l.map(p => p[k])).size;
    const sub = vis.filter(p => p.seg === 'SUBTERRANEA'), aer = vis.filter(p => p.seg === 'AEREA');
    const apAprov = {}; aer.filter(p => p.concl).forEach(p => { apAprov[p.id] = true; });
    const metrosAer = (d.producao || []).filter(a => apAprov[a.id_apontamento]).reduce((s, a) => s + (Number(a.metros) || 0), 0);
    const ranking = {}; vis.forEach(p => { const x = ranking[p.local || p.cidade] = ranking[p.local || p.cidade] || { n: 0, c: 0, seg: p.seg, cidade: p.cidade }; x.n++; if (p.concl) x.c++; });
    const rank = Object.entries(ranking).sort((a, b) => b[1].n - a[1].n).slice(0, 12);
    const rotPer = { dia: 'do dia', semana: 'da semana', mes: 'do mês', ano: 'do ano', tudo: 'de todo o período' }[P.per] || '';
    SN.casca('vst_mapa', `
      <div class="cab-pagina"><div><h1>Preventiva · Mapa de atuação</h1><p>Onde o time de preventiva está atuando e concluindo: GPS de cada CS vistoriada (subterrânea) e das fotos dos apontamentos (aérea).</p></div>
        <div class="acoes"><button class="btn prim" id="mTela">Tela cheia (reunião)</button></div></div>
      <div class="acoes" style="margin-bottom:10px;flex-wrap:wrap">${SN.htmlPeriodo(P)}
        <select class="inp" id="mSeg" style="max-width:170px"><option value="">Aérea e subterrânea</option><option value="SUBTERRANEA" ${filtro.seg === 'SUBTERRANEA' ? 'selected' : ''}>Só subterrânea</option><option value="AEREA" ${filtro.seg === 'AEREA' ? 'selected' : ''}>Só aérea</option></select>
        <select class="inp" id="mSit" style="max-width:190px"><option value="">Concluídas e em andamento</option><option value="concl" ${filtro.sit === 'concl' ? 'selected' : ''}>Só concluídas (aprovadas)</option><option value="and" ${filtro.sit === 'and' ? 'selected' : ''}>Só em andamento</option></select>
        <select class="inp" id="mPrest" style="max-width:200px"><option value="">Todos os prestadores</option>${prests.map(p => `<option ${filtro.prest === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
        <label class="small" style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="mCalor" ${ver.calor ? 'checked' : ''}> calor</label>
        <label class="small" style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="mPontos" ${ver.pontos ? 'checked' : ''}> pontos</label></div>
      <div class="grid g4" style="margin-bottom:10px">
        <div class="kpi destaque"><div class="rot">Locais atendidos</div><div class="val">${SN.num(vis.length)}</div><div class="sub">${SN.num(vis.filter(p => p.concl).length)} concluídos · ${SN.num(vis.filter(p => !p.concl).length)} em andamento</div></div>
        <div class="kpi"><div class="rot">CS vistoriadas (subterrânea)</div><div class="val">${SN.num(unico(sub, 'id'))}</div><div class="sub">${SN.num(unico(sub.filter(p => p.concl), 'id'))} aprovadas</div></div>
        <div class="kpi"><div class="rot">Metros aéreos aprovados</div><div class="val">${SN.num(metrosAer)} m</div><div class="sub">${SN.num(unico(aer, 'id'))} apontamento(s)</div></div>
        <div class="kpi"><div class="rot">Rotas · cidades · prestadores</div><div class="val">${unico(vis, 'rota')} · ${unico(vis, 'cidade')} · ${unico(vis, 'prestador')}</div></div></div>
      <div class="grid" style="grid-template-columns:minmax(0,3fr) minmax(220px,1fr);gap:12px;align-items:start">
        <div id="mCaixa" style="position:relative;background:#fff;border-radius:8px;overflow:hidden">
          <style>.mapa-cinza{filter:grayscale(1) brightness(1.06) contrast(.92)}</style><div id="mMapa" style="height:620px;width:100%"></div>
          <div id="mTitulo" style="position:absolute;top:10px;left:56px;z-index:500;background:rgba(255,255,255,.92);padding:8px 12px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.2);font-size:.85rem">
            <b>Preventiva · atuação ${rotPer}</b><br>${SN.num(vis.filter(p => p.concl).length)} concluídos · ${SN.num(vis.filter(p => !p.concl).length)} em andamento${filtro.prest ? ' · ' + esc(filtro.prest) : ''}
            ${ver.pontos ? '<br><span style="color:#2e7d32">●</span> concluído &nbsp;<span style="color:#e08a00">●</span> em andamento' : ''}</div>
          ${vis.length ? '' : '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:400;pointer-events:none"><div class="aviso info">Nenhuma atividade com GPS neste filtro.</div></div>'}</div>
        <div class="card"><h3>Onde mais atuamos</h3>${rank.length ? `<table class="tab small"><thead><tr><th>Local</th><th class="num">Pontos</th><th class="num">Concl.</th></tr></thead><tbody>
          ${rank.map(([k, x]) => `<tr class="clic" data-foco="${esc(k)}"><td>${esc(k)}<div class="muted">${x.seg === 'AEREA' ? 'aérea' : 'subterrânea'}</div></td><td class="num">${SN.num(x.n)}</td><td class="num">${x.n ? Math.round(100 * x.c / x.n) : 0}%</td></tr>`).join('')}</tbody></table>
          <p class="small muted">Toque num local para aproximar o mapa.</p>` : '<p class="muted small">—</p>'}
          <p class="small muted">Histórico importado da planilha não tem GPS e não aparece aqui. Fotos anexadas da galeria também não.</p></div></div>`);
    SN.ligarPeriodo(() => pintar(d), P);
    const muda = (k, el, alvo) => SN.$(el).onchange = e => { alvo[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; pintar(d); };
    muda('seg', '#mSeg', filtro); muda('sit', '#mSit', filtro); muda('prest', '#mPrest', filtro); muda('calor', '#mCalor', ver); muda('pontos', '#mPontos', ver);
    // Mapa
    if (mapa) { try { mapa.remove(); } catch (e) { } mapa = null; }
    mapa = L.map('mMapa', { preferCanvas: true }).setView([-22.9, -47.06], 9);
    // OpenStreetMap em tons de cinza (filtro só nas imagens do mapa): o calor colorido fica em destaque na reunião.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap', className: 'mapa-cinza' }).addTo(mapa);
    if (ver.calor && vis.length) L.heatLayer(vis.map(p => [p.lat, p.lng, p.concl ? 1 : 0.6]), { radius: 22, blur: 18, maxZoom: 15, minOpacity: 0.35 }).addTo(mapa);
    if (ver.pontos) vis.forEach(p => L.circleMarker([p.lat, p.lng], { radius: 5, weight: 1, color: '#fff', fillColor: p.concl ? '#2e7d32' : '#e08a00', fillOpacity: 0.9 })
      .bindPopup(`<b>${esc(p.item)}</b><br>${esc(p.rota)} · ${p.seg === 'AEREA' ? 'aérea' : 'subterrânea'}<br>${esc(p.local)}<br>${esc(p.prestador)}${p.tecnico ? ' · ' + esc(p.tecnico) : ''}<br>${p.quando ? SN.dt(p.quando) : ''} · ${p.concl ? 'concluído' : 'em andamento'}`).addTo(mapa));
    if (vis.length) mapa.fitBounds(L.latLngBounds(vis.map(p => [p.lat, p.lng])).pad(0.15), { maxZoom: 16 });
    SN.$$('[data-foco]').forEach(tr => tr.onclick = () => { const ps = vis.filter(p => (p.local || p.cidade) === tr.dataset.foco); if (ps.length) mapa.fitBounds(L.latLngBounds(ps.map(p => [p.lat, p.lng])).pad(0.3), { maxZoom: 17 }); });
    // Tela cheia: só o mapa com o título, para projetar na reunião.
    SN.$('#mTela').onclick = () => { const c = SN.$('#mCaixa'); (c.requestFullscreen || c.webkitRequestFullscreen || (() => { })).call(c); };
    document.onfullscreenchange = () => { const cheio = !!document.fullscreenElement, m = SN.$('#mMapa'); if (!m) return; m.style.height = cheio ? '100vh' : '620px'; setTimeout(() => mapa && mapa.invalidateSize(), 150); };
  };
  SN.vst.MENU.push({ id: 'vst_mapa', tela: 'vst_dashboard', rot: 'Mapa de atuação', ico: '🗺️', href: '#/vst/mapa' });
  if (SN.vst.registrarMenu) SN.vst.registrarMenu();
})();
