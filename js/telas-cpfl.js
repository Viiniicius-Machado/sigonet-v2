// SIGONET V2 — Acompanhamentos CPFL (tela "cpfl"): troca de poste, limpeza de cabo, reordenamento…
//
// Pedido do usuário (2026-10-12). Substitui a planilha online "TROCA DE POSTES":
//   Mapa      — agendamentos do dia / semana / mês no mapa (com a rede GeoGrid por baixo), e dali
//               despacha (cria o chamado na Esteira e abre o despacho de sempre), registra o resultado
//               (Preventiva / Improdutiva / Acompanhamento) e marca massiva (3+ clientes em risco).
//   Lista     — tudo filtrável e exportável; "sem localização" para completar no mapa.
//   Painel    — o "PAINEL MENSAL" da planilha: recebidas, com ação, % improdutiva, por equipe/tipo/cidade.
//   Importar  — (1) a planilha histórica; (2) notificações recebidas por e-mail (PDF ou Excel): arrastar,
//               o SigoNet entende tema, número, data/hora, cidade, endereço e coordenadas, mostra para
//               conferir e coloca na Esteira.
// Regras puras em cpfl-regras.js. Os registros ficam na coleção "notificacoes" (aba CPFL da planilha).
(() => {
  const esc = SN.esc, C = window.CPFL;
  const TELA = 'cpfl', CONTA = '3.1.1.2.05.0008';
  const CLASSE = { tipo: 'Manutenção', cat1: 'Manutenção - Rede Externa', cat2: 'Acompanhamento / Fiscalização', cat3: 'Acompanhamento Cia Energia' };
  const st = { aba: 'MAPA', per: 'semana', ref: '', tipo: '', status: '', q: '', soAbertas: false, rede: true, modo: '' };
  const lista = () => SN.db.notificacoes || (SN.db.notificacoes = []);
  const hoje = () => SN.dataIsoLocal(new Date());
  const dia = v => v ? String(v).split('-').reverse().join('/') : '—';
  const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return SN.dataIsoLocal(d); };
  const intervalo = () => {
    const ref = st.ref || hoje();
    if (st.per === 'dia') return [ref, somaDias(ref, 1)];
    if (st.per === 'semana') { const d = new Date(ref + 'T12:00:00'), dow = (d.getDay() + 6) % 7, ini = somaDias(ref, -dow); return [ini, somaDias(ini, 7)]; }
    if (st.per === 'mes') { const ini = ref.slice(0, 8) + '01', d = new Date(ini + 'T12:00:00'); d.setMonth(d.getMonth() + 1); return [ini, SN.dataIsoLocal(d)]; }
    return ['0000', '9999'];
  };
  const hist = (r, acao, det) => (r.historico = r.historico || []).push({ ts: SN.agora(), usuario: (SN.usuario() || {}).nome || '', acao, detalhe: det || '' });
  const chamadoDe = r => r.id_chamado ? SN.db.chamados.find(c => c.id === r.id_chamado) : null;
  const tipoRot = t => (C.TIPOS[t] || C.TIPOS.OUTRO).rot;
  const numTxt = r => r.numero && !/^s\/?n$/i.test(String(r.numero).trim()) ? String(r.numero) : 's/n';
  const cidadesConhecidas = () => [...new Set(lista().map(r => r.cidade).concat(SN.db.chamados.map(c => c.cidade)).concat((((SN.rede && SN.rede.ultimoIndice && SN.rede.ultimoIndice()) || {}).cidades || []).map(c => String(c.cidade).replace(/\s-\s[A-Z]{2}.*$/, ''))).filter(Boolean))];
  const filtrados = () => {
    const [ini, fim] = intervalo(), q = SN.normal(st.q);
    return lista().filter(r => r.data >= ini && r.data < fim && (!st.tipo || r.tipo === st.tipo) && (!st.status || r.status === st.status)
      && (!st.soAbertas || (r.status === 'PLANEJADO' && !r.resultado))
      && (!q || SN.normal([r.numero, r.cidade, r.endereco, r.equipe, r.id_chamado, tipoRot(r.tipo)].join(' ')).includes(q)))
      .sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
  };

  // ═══════════════════════════ Tela ═══════════════════════════
  SN.rota('/cpfl', () => pintar(), { tela: TELA });
  const pintar = () => {
    const abas = [['MAPA', 'Mapa'], ['LISTA', 'Lista'], ['PAINEL', 'Painel do mês'], ['IMPORTAR', 'Importar']];
    const semLocal = lista().filter(r => !(r.pontos || []).length && r.status === 'PLANEJADO' && r.data >= hoje()).length;
    SN.casca('cpfl', `
      <div class="cab-pagina"><div><h1>Acompanhamentos CPFL</h1><p>Troca de poste, limpeza de cabo, reordenamento e demais serviços da concessionária na nossa rede. Risco para ${C.MIN_CLIENTES_MASSIVA} ou mais clientes = massiva: a Manutenção acompanha.</p></div>
        <div class="acoes"><button class="btn prim" id="bNovoAg">➕ Novo agendamento</button></div></div>
      ${semLocal ? `<div class="aviso alerta small" style="margin-bottom:10px">${semLocal} agendamento(s) futuro(s) sem localização: veja na Lista (filtro "sem localização") e marque no mapa.</div>` : ''}
      <div class="abas">${abas.map(([k, r]) => `<button class="aba ${st.aba === k ? 'ativa' : ''}" data-abacp="${k}">${r}</button>`).join('')}</div>
      <div id="cpCorpo"></div>`);
    SN.$$('[data-abacp]').forEach(b => b.onclick = () => { st.aba = b.dataset.abacp; pintar(); });
    SN.$('#bNovoAg').onclick = () => editar(null);
    ({ MAPA: pintarMapa, LISTA: pintarLista, PAINEL: pintarPainel, IMPORTAR: pintarImportar })[st.aba]();
  };
  const filtrosHtml = (comPeriodo) => `<div class="card card-filtros"><div class="filtros">
    ${comPeriodo ? `<div class="chips">${[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['tudo', 'Tudo']].map(([k, r]) => `<button type="button" class="chip ${st.per === k ? 'sel' : ''}" data-per="${k}">${r}</button>`).join('')}</div>
      ${st.per !== 'tudo' ? `<button class="btn sm" data-mov="-1">◀</button><input class="inp" type="date" id="fRef" value="${esc(st.ref || hoje())}" style="max-width:160px"><button class="btn sm" data-mov="1">▶</button><button class="btn sm" id="bHoje">Hoje</button>` : ''}` : ''}
    <select class="inp" id="fTipo"><option value="">Todos os tipos</option>${Object.entries(C.TIPOS).map(([k, v]) => `<option value="${k}" ${st.tipo === k ? 'selected' : ''}>${v.rot}</option>`).join('')}</select>
    <select class="inp" id="fSt"><option value="">Todos os status</option>${Object.entries(C.STATUS).map(([k, v]) => `<option value="${k}" ${st.status === k ? 'selected' : ''}>${v.rot}</option>`).join('')}</select>
    <label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="fAb" ${st.soAbertas ? 'checked' : ''}> só a acompanhar</label>
    <input class="inp busca" id="fQ" placeholder="Buscar (notificação, cidade, rua, equipe, chamado)" value="${esc(st.q)}"></div>
    ${comPeriodo && st.per !== 'tudo' ? `<div class="small muted" style="margin-top:6px">${dia(intervalo()[0])} a ${dia(somaDias(intervalo()[1], -1))}</div>` : ''}</div>`;
  const ligarFiltros = repintar => {
    SN.$$('[data-per]').forEach(b => b.onclick = () => { st.per = b.dataset.per; repintar(); });
    SN.$$('[data-mov]').forEach(b => b.onclick = () => { const n = +b.dataset.mov, ref = st.ref || hoje();
      if (st.per === 'dia') st.ref = somaDias(ref, n); else if (st.per === 'semana') st.ref = somaDias(ref, 7 * n);
      else { const d = new Date(ref.slice(0, 8) + '01T12:00:00'); d.setMonth(d.getMonth() + n); st.ref = SN.dataIsoLocal(d); } repintar(); });
    if (SN.$('#fRef')) SN.$('#fRef').onchange = e => { st.ref = e.target.value; repintar(); };
    if (SN.$('#bHoje')) SN.$('#bHoje').onclick = () => { st.ref = ''; repintar(); };
    SN.$('#fTipo').onchange = e => { st.tipo = e.target.value; repintar(); };
    SN.$('#fSt').onchange = e => { st.status = e.target.value; repintar(); };
    SN.$('#fAb').onchange = e => { st.soAbertas = e.target.checked; repintar(); };
    SN.$('#fQ').oninput = SN.debounce(e => { st.q = e.target.value; repintar(); SN.$('#fQ').focus(); }, 300);
  };
  const badgeReg = r => `${SN.badge(C.STATUS, r.status)}${r.resultado ? ` <span class="badge ${r.resultado === 'IMPRODUTIVA' ? 'erro' : 'ok'}">${esc(C.RESULTADOS[r.resultado].rot)}</span>` : ''}${r.massiva ? ' <span class="badge erro">massiva</span>' : ''}`;
  const acoesReg = r => `<button class="btn sm ${r.id_chamado ? '' : 'prim'}" data-desp="${esc(r.id)}">${r.id_chamado ? 'Chamado ' + esc(r.id_chamado) : 'Despachar'}</button>
    <button class="btn sm" data-res="${esc(r.id)}">${r.resultado ? 'Resultado ✓' : 'Resultado'}</button><button class="btn sm" data-ed="${esc(r.id)}">Editar</button>`;
  const ligarAcoes = (raiz, repintar) => {
    raiz.querySelectorAll('[data-desp]').forEach(b => b.onclick = () => despachar(lista().find(r => r.id === b.dataset.desp)).then(repintar));
    raiz.querySelectorAll('[data-res]').forEach(b => b.onclick = () => resultado(lista().find(r => r.id === b.dataset.res)).then(repintar));
    raiz.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => editar(lista().find(r => r.id === b.dataset.ed)).then(repintar));
  };

  // ─────────── Mapa ───────────
  let mapa = null, camada = null, camRede = null, redeFeita = '';
  const carregarLeaflet = async () => {
    if (!document.querySelector('link[href*="leaflet.min.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(l); }
    if (!window.L) await new Promise((ok, falha) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = ok; s.onerror = () => falha(new Error('Mapa indisponível (sem internet?).')); document.head.appendChild(s); });
  };
  const pintarMapa = async () => {
    const l = filtrados(), comLocal = l.filter(r => (r.pontos || []).length);
    SN.$('#cpCorpo').innerHTML = `${filtrosHtml(true)}
      <div class="cp-grade">
        <div class="card" style="padding:8px;min-width:0"><div class="prj-barra"><span class="small"><b>${l.length}</b> agendamento(s) · ${comLocal.length} no mapa${l.length - comLocal.length ? ` · <span style="color:#b45309">${l.length - comLocal.length} sem localização</span>` : ''}</span>
          <label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="fRede" ${st.rede ? 'checked' : ''}> rede GeoGrid</label>
          <button class="btn sm ${st.modo === 'novo' ? 'prim' : ''}" id="bNoMapa">📍 Novo no mapa</button><span class="small" id="cpModo"></span></div>
          <div id="cpMapa" class="prj-mapa"></div>
          <div class="cp-legenda small">${Object.entries(C.TIPOS).map(([k, v]) => `<span><i style="background:${v.cor}"></i>${v.rot}</span>`).join('')}<span><i style="background:#fff;border:2px solid #444"></i>já com resultado</span><span><i style="background:#ccc"></i>cancelado</span></div></div>
        <div class="card cp-lado"><h3>Agenda</h3><div id="cpAgenda">${agendaHtml(l)}</div></div>
      </div>`;
    ligarFiltros(pintarMapa); ligarAcoes(SN.$('#cpAgenda'), pintarMapa);
    SN.$$('[data-foco]').forEach(el => el.onclick = () => { const r = lista().find(x => x.id === el.dataset.foco); if (r && (r.pontos || []).length && mapa) { mapa.setView(r.pontos[0], 18, { animate: false }); } });
    SN.$('#fRede').onchange = e => { st.rede = e.target.checked; desenharRede(l); };
    SN.$('#bNoMapa').onclick = () => { st.modo = st.modo === 'novo' ? '' : 'novo'; SN.$('#bNoMapa').classList.toggle('prim', st.modo === 'novo'); SN.$('#cpModo').innerHTML = st.modo ? '<b>Clique no mapa onde é o serviço.</b>' : ''; };
    try { await carregarLeaflet(); } catch (e) { SN.$('#cpMapa').innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; return; }
    const L = window.L, el = SN.$('#cpMapa'); if (!el) return;
    if (mapa) { try { mapa.remove(); } catch (e) { } }
    mapa = L.map(el, { preferCanvas: true, maxZoom: 21, zoomAnimation: false }).setView([-22.9, -47.06], 10); redeFeita = '';
    const ruas = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 21, attribution: '© OpenStreetMap' }).addTo(mapa);
    const sat = L.layerGroup([L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 21, attribution: 'Imagens © Esri' }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 21 })]);
    L.control.layers({ Ruas: ruas, 'Satélite': sat }, {}, { position: 'topright' }).addTo(mapa);
    camRede = L.layerGroup().addTo(mapa); camada = L.layerGroup().addTo(mapa);
    mapa.on('click', ev => { if (st.modo !== 'novo') return; st.modo = ''; const p = [Math.round(ev.latlng.lat * 1e6) / 1e6, Math.round(ev.latlng.lng * 1e6) / 1e6]; editar(null, { pontos: [p], data: st.per === 'dia' ? (st.ref || hoje()) : hoje() }).then(pintarMapa); });
    el.addEventListener('click', ev => { const b = ev.target.closest && ev.target.closest('[data-pdesp],[data-pres],[data-ped]'); if (!b) return;
      const r = lista().find(x => x.id === (b.dataset.pdesp || b.dataset.pres || b.dataset.ped)); if (!r) return; mapa.closePopup();
      (b.dataset.pdesp ? despachar(r) : b.dataset.pres ? resultado(r) : editar(r)).then(pintarMapa); });
    comLocal.forEach(r => {
      const tp = C.TIPOS[r.tipo] || C.TIPOS.OUTRO, canc = r.status === 'CANCELADO', feito = !!r.resultado;
      const estilo = { radius: r.massiva ? 11 : 8, color: canc ? '#999' : feito ? '#444' : '#fff', weight: feito ? 3 : 2, fillColor: canc ? '#ccc' : feito ? '#fff' : tp.cor, fillOpacity: 1 };
      if (r.pontos.length > 1) L.polyline(r.pontos, { color: canc ? '#999' : tp.cor, weight: 5, opacity: 0.85, dashArray: canc ? '6 6' : null }).addTo(camada);
      L.circleMarker(r.pontos[0], estilo).addTo(camada).bindTooltip(`${esc(tipoRot(r.tipo))} · ${dia(r.data)} ${esc(r.hora || '')}`).bindPopup(() => popup(r), { minWidth: 260 });
    });
    if (comLocal.length) mapa.fitBounds(L.latLngBounds(comLocal.flatMap(r => r.pontos)).pad(0.15), { maxZoom: 16, animate: false });
    desenharRede(l);
  };
  const agendaHtml = l => l.length ? l.map(r => `<div class="cp-item">
      <div class="cp-item-cab" data-foco="${esc(r.id)}"><b>${dia(r.data)} ${esc(r.hora || '')}</b> · ${esc(tipoRot(r.tipo))}${(r.pontos || []).length ? '' : ' <span class="badge alerta">sem localização</span>'}</div>
      <div class="small">${esc(r.cidade || '')}${r.endereco ? ' · ' + esc(r.endereco) : ''} · <span class="mono">${esc(numTxt(r))}</span></div>
      <div class="small" style="margin:4px 0">${badgeReg(r)}${r.equipe ? ' · ' + esc(r.equipe) : ''}</div>
      <div class="acoes" style="gap:6px">${acoesReg(r)}</div></div>`).join('') : '<p class="muted small">Nenhum agendamento no período.</p>';
  const popup = r => `<div class="prj-pop"><b>${esc(tipoRot(r.tipo))}</b> · notificação <span class="mono">${esc(numTxt(r))}</span>
    <div class="small">${dia(r.data)} ${esc(r.hora || '')} · ${esc(r.cidade || '')}${r.endereco ? '<br>' + esc(r.endereco) : ''}${r.postes ? '<br>' + esc(r.postes) + ' poste(s)' : ''}</div>
    <div style="margin:4px 0">${badgeReg(r)}</div><div class="small" id="cpRede_${esc(r.id)}">${perigoRede(r)}</div>
    <div class="acoes" style="gap:6px;margin-top:6px"><button class="btn sm prim" data-pdesp="${esc(r.id)}">${r.id_chamado ? 'Chamado ' + esc(r.id_chamado) : 'Despachar'}</button><button class="btn sm" data-pres="${esc(r.id)}">Resultado</button><button class="btn sm" data-ped="${esc(r.id)}">Editar</button></div></div>`;
  // Rede da empresa perto do serviço (GeoGrid): ajuda a decidir se precisa acompanhar e se é massiva.
  const redes = {};
  const perigoRede = r => {
    const d = redes[r.cidade]; if (!d || !(r.pontos || []).length || !window.REDE) return '';
    const p = r.pontos[0], cb = REDE.caboMaisPerto(d, p[0], p[1]), cx = REDE.caixasMaisProximas(d, p[0], p[1], 1)[0];
    const spl = d.caixas.filter(c => REDE.tipoCaixa(c.cor) === 'SPLITTER' && REDE.dist(p, [c.lat, c.lng]) <= 150).length;
    return cb.cabo && cb.d <= 50 ? `⚠️ Cabo nosso a <b>${Math.round(cb.d)} m</b> (${esc(cb.cabo.n)})${cx ? ` · caixa ${esc(cx.c.n)} a ${Math.round(cx.d)} m` : ''}${spl ? ` · ${spl} CEO c/ splitter a 150 m` : ''}` : (cb.cabo || d.cabos.length ? '✓ Sem cabo nosso a 50 m (GeoGrid)' : '');
  };
  const desenharRede = async l => {
    if (!camRede) return; camRede.clearLayers();
    if (!st.rede || !SN.rede) return;
    const cids = [...new Set(l.filter(r => (r.pontos || []).length).map(r => r.cidade).filter(Boolean))].slice(0, 6), chave = cids.join('|');
    redeFeita = chave;
    for (const c of cids) {
      let d = redes[c]; if (d === undefined) { try { d = redes[c] = await SN.rede.daCidade(c); } catch (e) { d = redes[c] = null; } }
      if (!d || redeFeita !== chave || !camRede) continue;
      const L = window.L, rnd = L.canvas({ padding: 0.3 });
      d.cabos.forEach(x => L.polyline(x.pts, { color: x.cor, weight: 2, opacity: 0.6, renderer: rnd, interactive: false }).addTo(camRede));
    }
  };

  // ─────────── Despachar (chamado na Esteira) ───────────
  const novoChamado = async (r, extra) => {
    const id = await SN.novoId('CH'), ab = SN.agora(), pt = (r.pontos || [])[0];
    const c = { id, origem: 'CPFL', protocoloNoc: '', protocoloOem: numTxt(r) === 's/n' ? '' : numTxt(r), etiqueta: '', cliente: `CPFL · ${tipoRot(r.tipo)} · ${r.cidade || ''}`,
      motivo: `Notificação ${numTxt(r)} — ${tipoRot(r.tipo)} agendada para ${dia(r.data)}${r.hora ? ' ' + r.hora : ''}${r.postes ? ' · ' + r.postes + ' poste(s)' : ''}${r.massiva ? ' · MASSIVA (' + (r.clientes || C.MIN_CLIENTES_MASSIVA) + '+ clientes em risco)' : ''}`,
      endereco: r.endereco || '', cidade: r.cidade || '', gps: pt ? `https://www.google.com/maps?q=${pt[0]},${pt[1]}` : '', porta: '', obs: r.obs || '',
      tipo: '', cat1: '', cat2: '', cat3: '', cat4: '', slaHoras: null, prazoLimite: null, conta: CONTA,
      empresa: '', tecnico: '', apoio: null, status: 'NAO_ATRIBUIDO', tempos: { abertura: ab }, rfo: {}, fotos: (r.anexos || []).slice(), historico: [], cpfl: { id: r.id, tipo: r.tipo }, ...(extra || {}) };
    const linha = MATRIZ_SLA.find(m => m.tipo === CLASSE.tipo && m.cat1 === CLASSE.cat1 && m.cat2 === CLASSE.cat2 && m.cat3 === CLASSE.cat3) || { sla: 8 };
    SN.aplicarClassificacao(c, { ...CLASSE, cat4: '', sla: linha.sla });
    // Agendado: o prazo é a hora marcada pela CPFL (sem SLA corrido).
    c.planejada = true; c.prazoLimite = new Date(r.data + 'T' + (r.hora || '23:59') + ':00').toISOString();
    SN.hist(c, 'Abertura', 'Origem CPFL — notificação ' + numTxt(r));
    SN.db.chamados.push(c); r.id_chamado = c.id; hist(r, 'CHAMADO', c.id); SN.log('CPFL_CHAMADO', c.id, r.id);
    return c;
  };
  const despachar = async r => {
    if (!r) return;
    let c = chamadoDe(r);
    if (c) { if (['NAO_ATRIBUIDO', 'ATRIBUIDO'].includes(c.status)) SN.atribuir(c); else SN.navegar('#/chamado/' + c.id); return; }
    const res = await SN.modal({ titulo: 'Despachar ' + tipoRot(r.tipo) + ' · ' + numTxt(r),
      corpo: `<p class="small">${dia(r.data)} ${esc(r.hora || '')} · ${esc(r.cidade || '')}${r.endereco ? ' · ' + esc(r.endereco) : ''}</p>
        <div class="small" style="margin-bottom:8px">${perigoRede(r) || ''}</div>
        <div class="campo"><label>Clientes em risco</label><input class="inp" type="number" min="0" id="mCli" value="${esc(r.clientes ?? '')}" placeholder="estimativa">
          <div class="small muted">${C.MIN_CLIENTES_MASSIVA} ou mais = massiva (a Manutenção acompanha).</div></div>
        <p class="small muted">Cria o chamado na Esteira (Manutenção › Acompanhamento Cia Energia, prazo na hora agendada) e abre o despacho para escolher o técnico.</p>`,
      botoes: [{ rot: 'Voltar', valor: null }, { rot: 'Criar chamado e despachar', cls: 'prim', acao: m => ({ cli: SN.$('#mCli', m).value }) }] });
    if (!res) return;
    if (res.cli !== '') { r.clientes = Number(res.cli) || 0; r.massiva = r.clientes >= C.MIN_CLIENTES_MASSIVA; }
    r.editado = true;
    try { c = await novoChamado(r); } catch (e) { return SN.toast(e.message, 'erro'); }
    SN.salvar(); SN.toast(`Chamado ${c.id} criado na Esteira.`, 'ok');
    SN.atribuir(c);
  };

  // ─────────── Resultado ───────────
  const resultado = async r => {
    if (!r) return;
    const c = chamadoDe(r);
    const res = await SN.modal({ titulo: 'Resultado · ' + tipoRot(r.tipo) + ' ' + (r.numero || ''),
      corpo: `${Object.entries(C.RESULTADOS).map(([k, v]) => `<label class="cp-res"><input type="radio" name="mRes" value="${k}" ${r.resultado === k ? 'checked' : ''}><span><b>${v.rot}</b><br><span class="small muted">${esc(v.desc)}</span></span></label>`).join('')}
        <div class="linha-form"><div class="campo"><label>Data da atuação</label><input class="inp" type="date" id="mData" value="${esc(r.data_atuacao || r.data || hoje())}"></div>
          <div class="campo"><label>Equipe</label><input class="inp" id="mEq" value="${esc(r.equipe || (c ? c.empresa : '') || '')}"></div></div>
        <div class="campo"><label>Observação</label><textarea class="inp" id="mObs">${esc(r.obs_resultado || '')}</textarea></div>
        ${c ? `<p class="small muted">Chamado ${esc(c.id)} · ${esc((SN.STATUS[c.status] || {}).rot || c.status)}</p>` : ''}`,
      botoes: [{ rot: 'Voltar', valor: null }].concat(r.resultado ? [{ rot: 'Limpar resultado', cls: 'perigo', valor: 'limpar' }] : []).concat([{ rot: 'Salvar', cls: 'prim', acao: m => {
        const v = (SN.$('input[name="mRes"]:checked', m) || {}).value; if (!v) { SN.toast('Escolha o resultado.', 'erro'); return false; }
        return { v, data: SN.$('#mData', m).value, eq: SN.$('#mEq', m).value.trim(), obs: SN.$('#mObs', m).value.trim() }; } }]) });
    if (!res) return;
    if (res === 'limpar') { r.resultado = ''; r.data_atuacao = ''; if (r.status === 'CONCLUIDO') r.status = 'PLANEJADO'; hist(r, 'RESULTADO LIMPO'); }
    else { Object.assign(r, { resultado: res.v, data_atuacao: res.data, equipe: C.equipeDe(res.eq), obs_resultado: res.obs }); if (r.status !== 'CANCELADO') r.status = 'CONCLUIDO'; hist(r, 'RESULTADO', C.RESULTADOS[res.v].rot); }
    r.editado = true; SN.log('CPFL_RESULTADO', r.id, r.resultado); SN.salvar(); SN.toast('Resultado registrado.', 'ok');
  };

  // ─────────── Novo / editar ───────────
  const editar = async (r, pre) => {
    const novo = !r, x = r || { tipo: 'TROCA_POSTE', numero: '', cidade: '', endereco: '', pontos: [], data: hoje(), hora: '', prazo: '', status: 'PLANEJADO', equipe: '', postes: '', clientes: '', obs: '', ...(pre || {}) };
    const cids = cidadesConhecidas().sort();
    const res = await SN.modal({ titulo: novo ? 'Novo agendamento CPFL' : 'Editar · ' + (x.numero || 's/n'), largo: true,
      corpo: `<div class="linha-form"><div class="campo"><label>Tipo *</label><select class="inp" id="eTipo">${Object.entries(C.TIPOS).map(([k, v]) => `<option value="${k}" ${x.tipo === k ? 'selected' : ''}>${v.rot}</option>`).join('')}</select></div>
          <div class="campo"><label>Notificação</label><input class="inp" id="eNum" value="${esc(x.numero)}" placeholder="nº da CPFL"></div></div>
        <div class="linha-form"><div class="campo"><label>Data *</label><input class="inp" type="date" id="eData" value="${esc(x.data)}"></div>
          <div class="campo"><label>Hora</label><input class="inp" type="time" id="eHora" value="${esc(x.hora)}"></div>
          <div class="campo"><label>Prazo</label><input class="inp" id="ePrazo" value="${esc(x.prazo)}" placeholder="ex.: 15 DIAS"></div></div>
        <div class="linha-form"><div class="campo"><label>Cidade *</label><input class="inp" id="eCid" list="eCids" value="${esc(x.cidade)}"><datalist id="eCids">${cids.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
          <div class="campo" style="flex:2"><label>Endereço</label><input class="inp" id="eEnd" value="${esc(x.endereco)}"></div></div>
        <div class="campo"><label>Coordenadas (lat, lng — trecho: separe com /) ou link do Google Maps</label><input class="inp" id="eCoord" value="${esc((x.pontos || []).map(p => p.join(', ')).join(' / ') || x.coord_original || '')}">
          ${x.coord_original && /^https?:/.test(x.coord_original) ? `<div class="small"><a href="${esc(x.coord_original)}" target="_blank" rel="noopener">abrir o link original</a> — copie a coordenada de lá e cole acima</div>` : ''}</div>
        <div class="linha-form"><div class="campo"><label>Status</label><select class="inp" id="eSt">${Object.entries(C.STATUS).map(([k, v]) => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${v.rot}</option>`).join('')}</select></div>
          <div class="campo"><label>Equipe</label><input class="inp" id="eEq" value="${esc(x.equipe)}"></div>
          <div class="campo"><label>Postes</label><input class="inp" type="number" min="0" id="ePos" value="${esc(x.postes)}"></div>
          <div class="campo"><label>Clientes em risco</label><input class="inp" type="number" min="0" id="eCli" value="${esc(x.clientes ?? '')}"></div></div>
        <div class="campo"><label>Observação</label><textarea class="inp" id="eObs">${esc(x.obs || '')}</textarea></div>
        ${novo ? '<label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="eCh" checked> Já criar o chamado na Esteira</label>' : ''}
        ${!novo && (x.historico || []).length ? `<details class="small" style="margin-top:6px"><summary>Histórico</summary>${x.historico.slice().reverse().map(h => `<div>${SN.dt(h.ts)} · ${esc(h.usuario)} · ${esc(h.acao)} ${esc(h.detalhe || '')}</div>`).join('')}</details>` : ''}`,
      botoes: [{ rot: 'Cancelar', valor: null }].concat(!novo && !x.id_chamado ? [{ rot: 'Excluir', cls: 'perigo', valor: 'excluir' }] : []).concat([{ rot: 'Salvar', cls: 'prim', acao: m => {
        const g = id => SN.$('#' + id, m).value.trim();
        if (!g('eData') || !g('eCid')) { SN.toast('Informe a data e a cidade.', 'erro'); return false; }
        return { tipo: g('eTipo'), numero: g('eNum'), data: g('eData'), hora: g('eHora'), prazo: g('ePrazo'), cidade: g('eCid'), endereco: g('eEnd'), coord: g('eCoord'),
          status: g('eSt'), equipe: C.equipeDe(g('eEq')), postes: g('ePos') === '' ? '' : Number(g('ePos')), clientes: g('eCli') === '' ? '' : Number(g('eCli')), obs: g('eObs'), chamado: novo && SN.$('#eCh', m).checked }; } }]) });
    if (!res) return;
    if (res === 'excluir') { if (!await SN.confirmar('Excluir agendamento', 'Excluir a notificação ' + (x.numero || 's/n') + '?', 'Excluir', 'perigo')) return;
      SN.db.notificacoes = lista().filter(y => y.id !== x.id); SN.log('CPFL_EXCLUIR', x.id, ''); SN.salvar(); return; }
    const pontos = C.pontosDe(res.coord);
    const dados = { tipo: res.tipo, numero: res.numero, data: res.data, hora: res.hora, prazo: res.prazo, cidade: res.cidade, endereco: res.endereco, pontos, status: res.status, equipe: res.equipe,
      postes: res.postes, clientes: res.clientes, massiva: res.clientes !== '' && res.clientes >= C.MIN_CLIENTES_MASSIVA, obs: res.obs };
    if (res.coord && !pontos.length) dados.coord_original = res.coord;
    if (novo) {
      const reg = { ...dados, origem: 'MANUAL', resultado: '', historico: [] }; reg.id = C.chave(reg);
      if (lista().some(y => y.id === reg.id)) return SN.toast('Já existe essa notificação nessa data.', 'erro');
      hist(reg, 'CRIADO', 'manual'); lista().push(reg);
      if (res.chamado) { try { await novoChamado(reg); } catch (e) { SN.toast(e.message, 'erro'); } }
      SN.log('CPFL_NOVO', reg.id, ''); SN.salvar(); SN.toast('Agendamento criado' + (reg.id_chamado ? ' e chamado ' + reg.id_chamado + ' na Esteira.' : '.'), 'ok');
    } else { Object.assign(x, dados, { editado: true }); hist(x, 'EDITADO'); SN.salvar(); SN.toast('Salvo.', 'ok'); }
  };

  // ─────────── Lista ───────────
  let semLocalFiltro = false;
  const pintarLista = () => {
    let l = filtrados(); if (semLocalFiltro) l = l.filter(r => !(r.pontos || []).length);
    SN.$('#cpCorpo').innerHTML = `${filtrosHtml(true)}
      <div class="card"><div class="card-tit"><h3>${l.length} notificação(ões)</h3><div class="acoes"><label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="fSemLoc" ${semLocalFiltro ? 'checked' : ''}> sem localização</label><button class="btn sm" id="bExp">Exportar</button></div></div>
      ${l.length ? `<div class="tabela-wrap"><table class="tab small"><thead><tr><th>Data</th><th>Tipo</th><th>Notificação</th><th>Cidade / endereço</th><th>Status / resultado</th><th>Equipe</th><th>Chamado</th><th></th></tr></thead><tbody>
      ${l.slice(0, 600).map(r => `<tr><td class="nowrap">${dia(r.data)} ${esc(r.hora || '')}</td><td>${esc(tipoRot(r.tipo))}</td><td class="mono">${esc(numTxt(r))}</td>
        <td>${esc(r.cidade || '')}<div class="muted">${esc(r.endereco || '')}${(r.pontos || []).length ? '' : ' <span class="badge alerta">sem localização</span>'}</div></td>
        <td>${badgeReg(r)}</td><td>${esc(r.equipe || '')}</td><td>${r.id_chamado ? `<a href="#/chamado/${esc(r.id_chamado)}">${esc(r.id_chamado)}</a>` : '—'}</td><td><div class="acoes" style="gap:6px;min-width:230px">${acoesReg(r)}</div></td></tr>`).join('')}</tbody></table></div>
      ${l.length > 600 ? '<p class="small muted">Mostrando 600: filtre ou exporte.</p>' : ''}` : '<p class="muted">Nada no filtro.</p>'}</div>`;
    ligarFiltros(pintarLista); ligarAcoes(SN.$('#cpCorpo'), pintarLista);
    SN.$('#fSemLoc').onchange = e => { semLocalFiltro = e.target.checked; pintarLista(); };
    SN.$('#bExp').onclick = () => SN.exportar('acompanhamentos-cpfl', l.map(r => ({ 'AÇÃO': tipoRot(r.tipo).toUpperCase(), 'NOTIFICAÇÃO': r.numero, CIDADE: r.cidade, ENDERECO: r.endereco, COORDENADAS: (r.pontos || []).map(p => p.join(', ')).join('/') || r.coord_original || '',
      DATA: dia(r.data), PRAZO: r.prazo, HORA: r.hora, STATUS: (C.STATUS[r.status] || {}).rot, EQUIPE: r.equipe, 'AÇÃO2': r.resultado, 'DATA DA ATUAÇÃO': dia(r.data_atuacao), POSTES: r.postes, 'CLIENTES EM RISCO': r.clientes, MASSIVA: r.massiva ? 'SIM' : '', CHAMADO: r.id_chamado || '', ORIGEM: r.origem })));
  };

  // ─────────── Painel do mês ───────────
  const pintarPainel = () => {
    const mes = (st.ref || hoje()).slice(0, 7), ini = mes + '-01', d = new Date(ini + 'T12:00:00'); d.setMonth(d.getMonth() + 1);
    const p = C.painel(lista(), ini, SN.dataIsoLocal(d)), kpi = (r, v, s) => `<div class="kpi"><div class="rot">${r}</div><div class="val">${v}</div>${s ? `<div class="sub">${s}</div>` : ''}</div>`;
    const tab = (cab, linhas) => linhas.length ? `<div class="tabela-wrap"><table class="tab small"><thead><tr>${cab.map(c => `<th class="${/^#/.test(c) ? 'num' : ''}">${c.replace(/^#/, '')}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>` : '<p class="muted small">Sem dados.</p>';
    const pend = lista().filter(r => r.data >= ini && r.data < SN.dataIsoLocal(d) && !r.resultado && r.status !== 'CANCELADO').sort((a, b) => a.data.localeCompare(b.data));
    SN.$('#cpCorpo').innerHTML = `<div class="card card-filtros"><div class="filtros"><label class="small">Mês</label><input class="inp" type="month" id="fMes" value="${mes}" style="max-width:180px"></div></div>
      <div class="kpis-fin" style="margin:12px 0">${kpi('Recebidas', SN.num(p.recebidas), SN.num(p.unicas) + ' notificações únicas')}${kpi('Com ação registrada', SN.num(p.comAcao), SN.num(p.semAcao) + ' sem ação')}
        ${kpi('% improdutiva', SN.num(p.pctImprodutiva, 1) + '%', 'sobre as atuadas')}${kpi('Despachadas pelo SigoNet', SN.num(p.despachadas), SN.num(p.massivas) + ' massiva(s)')}</div>
      <div class="grid g2"><div class="card"><h3>Ação realizada</h3>${tab(['Resultado', '#Qtd'], Object.entries(C.RESULTADOS).map(([k, v]) => `<tr><td>${v.rot}</td><td class="num">${p.resultados[k] || 0}</td></tr>`))}</div>
        <div class="card"><h3>Status</h3>${tab(['Status', '#Qtd'], Object.entries(C.STATUS).map(([k, v]) => `<tr><td>${v.rot}</td><td class="num">${p.status[k] || 0}</td></tr>`))}</div>
        <div class="card"><h3>Tipo</h3>${tab(['Tipo', '#Qtd'], Object.entries(C.TIPOS).filter(([k]) => p.tipos[k]).map(([k, v]) => `<tr><td>${v.rot}</td><td class="num">${p.tipos[k]}</td></tr>`))}</div>
        <div class="card"><h3>Por cidade</h3>${tab(['Cidade', '#Total', '#Com ação'], Object.entries(p.cidades).sort((a, b) => b[1].total - a[1].total).map(([c, o]) => `<tr><td>${esc(c)}</td><td class="num">${o.total}</td><td class="num">${o.comAcao}</td></tr>`))}</div></div>
      <div class="card" style="margin-top:12px"><h3>Atuação por equipe</h3>${tab(['Equipe', '#Total', '#Preventiva', '#Improdutiva', '#Acompanhamento', '#Sem ação'], Object.entries(p.equipes).sort((a, b) => b[1].total - a[1].total).map(([e, o]) => `<tr><td>${esc(e)}</td><td class="num">${o.total}</td><td class="num">${o.PREVENTIVA}</td><td class="num">${o.IMPRODUTIVA}</td><td class="num">${o.ACOMPANHAMENTO}</td><td class="num">${o.semAcao}</td></tr>`))}</div>
      <div class="card" style="margin-top:12px"><h3>Pendentes no mês (sem ação) · ${pend.length}</h3>${tab(['Data', 'Notificação', 'Tipo', 'Cidade', 'Status', ''], pend.slice(0, 200).map(r => `<tr><td>${dia(r.data)}</td><td class="mono">${esc(numTxt(r))}</td><td>${esc(tipoRot(r.tipo))}</td><td>${esc(r.cidade || '')}</td><td>${SN.badge(C.STATUS, r.status)}</td><td><div class="acoes" style="gap:6px;min-width:230px">${acoesReg(r)}</div></td></tr>`))}</div>`;
    SN.$('#fMes').onchange = e => { if (e.target.value) { st.ref = e.target.value + '-01'; pintarPainel(); } };
    ligarAcoes(SN.$('#cpCorpo'), pintarPainel);
  };

  // ═══════════════════════════ Importar ═══════════════════════════
  const pintarImportar = () => {
    SN.$('#cpCorpo').innerHTML = `<div class="grid g2">
      <div class="card"><h3>📩 Notificações recebidas (PDF ou Excel)</h3>
        <p class="small">Arraste aqui os arquivos que chegaram por e-mail. O SigoNet lê o tema (troca de poste, limpeza, reordenamento…), o número, a data e a hora, a cidade, o endereço e as coordenadas; você confere e ele coloca no mapa e na Esteira.</p>
        <label class="cp-solta" id="zNot"><input type="file" id="fNot" accept=".pdf,.xlsx,.xls,.csv,application/pdf" multiple hidden><span>Solte os arquivos aqui<br><span class="small muted">ou clique para escolher (PDF, XLSX, CSV)</span></span></label></div>
      <div class="card"><h3>🗂️ Base histórica (planilha)</h3>
        <p class="small">A planilha online da sala técnica ("TROCA DE POSTES", aba NOTIFICAÇÕES). Importar de novo atualiza: o que já foi editado no SigoNet é preservado.</p>
        <label class="cp-solta" id="zHist"><input type="file" id="fHist" accept=".xlsx,.xls" hidden><span>Solte a planilha aqui<br><span class="small muted">ou clique para escolher</span></span></label>
        <p class="small muted">${SN.num(lista().length)} notificação(ões) no SigoNet · ${SN.num(lista().filter(r => r.origem === 'PLANILHA').length)} da planilha.</p></div></div>`;
    const zona = (id, inp, fn) => { const z = SN.$('#' + id);
      z.ondragover = e => { e.preventDefault(); z.classList.add('sobre'); }; z.ondragleave = () => z.classList.remove('sobre');
      z.ondrop = e => { e.preventDefault(); z.classList.remove('sobre'); const fs = [...(e.dataTransfer.files || [])]; if (fs.length) fn(fs).catch(err => SN.toast(err.message || String(err), 'erro')); };
      SN.$('#' + inp).onchange = e => { const fs = [...(e.target.files || [])]; e.target.value = ''; if (fs.length) fn(fs).catch(err => SN.toast(err.message || String(err), 'erro')); }; };
    zona('zNot', 'fNot', importarNotificacoes); zona('zHist', 'fHist', fs => importarHistorico(fs[0]));
  };
  const lerPlanilhaArquivo = async file => {
    if (!window.XLSX) throw new Error('Leitor de Excel indisponível (sem internet?).');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    return wb.SheetNames.map(n => ({ nome: n, linhas: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }));
  };
  // Junta sem passar por cima do que foi mexido no SigoNet (resultado, despacho, edições).
  const mesclar = (novos, origem) => {
    let inc = 0, atu = 0;
    novos.forEach(n => {
      const a = lista().find(r => r.id === n.id);
      if (!a) { lista().push({ ...n, origem: n.origem || origem, historico: [{ ts: SN.agora(), usuario: (SN.usuario() || {}).nome || '', acao: 'IMPORTADO', detalhe: origem }] }); inc++; return; }
      let mudou = false;
      Object.keys(n).forEach(k => { if (['id', 'origem', 'historico', 'linha'].includes(k)) return;
        const vazio = a[k] == null || a[k] === '' || (Array.isArray(a[k]) && !a[k].length);
        if ((vazio || !a.editado) && JSON.stringify(a[k]) !== JSON.stringify(n[k]) && !(Array.isArray(n[k]) ? !n[k].length : n[k] === '' || n[k] == null)) { a[k] = n[k]; mudou = true; } });
      if (mudou) atu++;
    });
    return { inc, atu };
  };
  const importarHistorico = async file => {
    const fim = SN.cobrirCarregando('Lendo a planilha…');
    try {
      const abas = await lerPlanilhaArquivo(file), aba = abas.find(a => /NOTIFICA/i.test(a.nome)) || abas[0];
      const regs = C.lerPlanilha(aba.linhas); fim();
      const ja = regs.filter(r => lista().some(x => x.id === r.id)).length, semLoc = regs.filter(r => !r.pontos.length).length;
      const tipos = regs.reduce((a, r) => { a[r.tipo] = (a[r.tipo] || 0) + 1; return a; }, {});
      if (!await SN.confirmar('Importar base histórica', `<b>${SN.num(regs.length)}</b> notificações (${dia(regs.map(r => r.data).sort()[0])} a ${dia(regs.map(r => r.data).sort().pop())}): ${Object.entries(tipos).map(([k, v]) => v + ' ' + tipoRot(k).toLowerCase()).join(', ')}.<br>
        ${ja ? `${SN.num(ja)} já estão no SigoNet (atualiza só o que não foi editado aqui). ` : ''}${semLoc ? `${SN.num(semLoc)} sem coordenada (link encurtado ou vazio): ficam na lista "sem localização".` : ''}<br>Não abre chamados: é histórico.`, 'Importar', 'prim')) return;
      const r = mesclar(regs, 'PLANILHA'); SN.log('CPFL_IMPORTAR_PLANILHA', file.name, `${r.inc} novas · ${r.atu} atualizadas`); SN.salvar();
      SN.toast(`${r.inc} notificação(ões) nova(s), ${r.atu} atualizada(s).`, 'ok');
      const futuras = lista().filter(x => x.status === 'PLANEJADO' && !x.resultado && !x.id_chamado && x.data >= hoje());
      if (futuras.length && await SN.confirmar('Agendamentos futuros', `${futuras.length} agendamento(s) a partir de hoje ainda sem chamado. Criar os chamados na Esteira (não atribuídos) para controle?`, 'Criar chamados', 'prim')) {
        for (const x of futuras) await novoChamado(x); SN.salvar(); SN.toast(futuras.length + ' chamado(s) criado(s) na Esteira.', 'ok');
      }
      st.aba = 'LISTA'; st.per = 'tudo'; pintar();
    } finally { fim(); }
  };
  // PDF → texto (pdf.js do cdnjs), linhas pela posição vertical.
  let pdfjs = null;
  const carregarPdfJs = () => pdfjs || (pdfjs = new Promise((ok, falha) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; ok(window.pdfjsLib); };
    s.onerror = () => { pdfjs = null; falha(new Error('Leitor de PDF indisponível (sem internet?).')); }; document.head.appendChild(s); }));
  const textoPdf = async file => {
    const lib = await carregarPdfJs(), doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise, out = [];
    for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
      const pg = await doc.getPage(i), tc = await pg.getTextContent(), linhas = {};
      tc.items.forEach(it => { const y = Math.round(it.transform[5] / 3); (linhas[y] = linhas[y] || []).push(it); });
      Object.keys(linhas).sort((a, b) => b - a).forEach(y => out.push(linhas[y].sort((a, b) => a.transform[4] - b.transform[4]).map(it => it.str).join(' ')));
    }
    return out.join('\n');
  };
  const dataUrlDe = file => new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = falha; r.readAsDataURL(file); });
  const importarNotificacoes = async files => {
    const fim = SN.cobrirCarregando('Lendo as notificações…'), cands = [], cids = cidadesConhecidas();
    try {
      for (const f of files) {
        if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
          const txt = await textoPdf(f), r = C.extrair(txt, { cidades: cids });
          cands.push({ ...r, arquivo: f, fonte: f.name, trecho: txt.replace(/\s+/g, ' ').slice(0, 300) });
        } else {
          const abas = await lerPlanilhaArquivo(f);
          for (const a of abas) {
            const cab = (a.linhas[0] || []).map(C.norm);
            if (cab.includes('NOTIFICACAO') && cab.includes('DATA')) { C.lerPlanilha(a.linhas).forEach(r => cands.push({ ...r, arquivo: f, fonte: f.name + ' · ' + a.nome })); continue; }
            a.linhas.forEach((l, i) => { const txt = l.map(v => v instanceof Date ? v.toLocaleDateString('pt-BR') : String(v)).join(' | ');
              if (txt.replace(/[|\s]/g, '').length < 8) return; const r = C.extrair(txt, { cidades: cids });
              if (r.data && (r.numero || r.pontos.length || r.endereco)) cands.push({ ...r, arquivo: f, fonte: f.name + ' · ' + a.nome + ' linha ' + (i + 1), trecho: txt.slice(0, 200) }); });
          }
        }
      }
    } finally { fim(); }
    if (!cands.length) return SN.toast('Não achei notificação nos arquivos (data, número ou endereço).', 'erro');
    conferir(cands);
  };
  // Conferência: cada notificação lida, editável, antes de entrar no SigoNet e na Esteira.
  const conferir = async cands => {
    const linha = (c, i) => `<tr data-i="${i}"><td><input type="checkbox" data-k="ok" checked></td>
      <td><select class="inp" data-k="tipo">${Object.entries(C.TIPOS).map(([k, v]) => `<option value="${k}" ${c.tipo === k ? 'selected' : ''}>${v.rot}</option>`).join('')}</select></td>
      <td><input class="inp" data-k="numero" value="${esc(c.numero)}" style="width:110px"></td>
      <td><input class="inp" type="date" data-k="data" value="${esc(c.data)}"></td><td><input class="inp" type="time" data-k="hora" value="${esc(c.hora)}"></td>
      <td><input class="inp" data-k="cidade" value="${esc(c.cidade)}" style="width:120px"></td><td><input class="inp" data-k="endereco" value="${esc(c.endereco)}"></td>
      <td><input class="inp" data-k="coord" value="${esc((c.pontos || []).map(p => p.join(', ')).join(' / '))}" placeholder="lat, lng"></td>
      <td class="small muted" title="${esc(c.trecho || '')}">${esc(c.fonte)}</td></tr>`;
    const res = await SN.modal({ titulo: `Conferir ${cands.length} notificação(ões)`, largo: true,
      corpo: `<p class="small">Confira o que foi lido (passe o mouse no arquivo para ver o trecho). Sem coordenada, entra na lista "sem localização" para marcar no mapa.</p>
        <div class="tabela-wrap"><table class="tab small cp-conf"><thead><tr><th></th><th>Tipo</th><th>Notificação</th><th>Data</th><th>Hora</th><th>Cidade</th><th>Endereço</th><th>Coordenadas</th><th>Arquivo</th></tr></thead><tbody>${cands.map(linha).join('')}</tbody></table></div>
        <label class="small" style="display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" id="cCh" checked> Abrir os chamados na Esteira (não atribuídos, prazo na hora agendada)</label>`,
      botoes: [{ rot: 'Cancelar', valor: null }, { rot: 'Adicionar', cls: 'prim', acao: m => {
        const out = SN.$$('tbody tr', m).map(tr => { const g = k => SN.$(`[data-k="${k}"]`, tr); return { i: +tr.dataset.i, ok: g('ok').checked, tipo: g('tipo').value, numero: g('numero').value.trim(), data: g('data').value, hora: g('hora').value,
          cidade: g('cidade').value.trim(), endereco: g('endereco').value.trim(), coord: g('coord').value }; }).filter(x => x.ok);
        if (out.some(x => !x.data || !x.cidade)) { SN.toast('Cada notificação marcada precisa de data e cidade.', 'erro'); return false; }
        return { linhas: out, chamado: SN.$('#cCh', m).checked }; } }] });
    if (!res) return;
    const fim = SN.cobrirCarregando('Guardando…'), anexos = new Map();
    try {
      let inc = 0, ch = 0;
      for (const x of res.linhas) {
        const c = cands[x.i];
        if (c.arquivo && !anexos.has(c.arquivo)) { try { anexos.set(c.arquivo, await SN.guardarDataUrl(await dataUrlDe(c.arquivo), c.arquivo.name, 'arquivo', 'cpfl')); } catch (e) { anexos.set(c.arquivo, null); } }
        const ax = anexos.get(c.arquivo);
        const reg = { tipo: x.tipo, numero: x.numero, data: x.data, hora: x.hora, cidade: x.cidade, endereco: x.endereco, pontos: C.pontosDe(x.coord), prazo: c.prazo || '', status: c.status || 'PLANEJADO',
          equipe: c.equipe || '', resultado: c.resultado || '', postes: c.postes || '', origem: /\.pdf$/i.test(c.fonte) ? 'PDF' : 'EXCEL', anexos: ax ? [ax] : [] };
        reg.id = C.chave(reg);
        const antes = lista().find(r => r.id === reg.id);
        mesclar([reg], reg.origem); if (!antes) inc++;
        const r = lista().find(y => y.id === reg.id);
        if (ax && !(r.anexos || []).some(a => a.id === ax.id)) r.anexos = (r.anexos || []).concat([ax]);
        if (res.chamado && !r.id_chamado && r.status === 'PLANEJADO') { await novoChamado(r); ch++; }
      }
      SN.log('CPFL_NOTIFICACOES', '', `${res.linhas.length} lidas · ${inc} novas · ${ch} chamados`); SN.salvar();
      SN.toast(`${inc} notificação(ões) nova(s)${ch ? ` · ${ch} chamado(s) na Esteira` : ''}.`, 'ok');
      st.aba = 'MAPA'; st.per = 'tudo'; pintar();
    } finally { fim(); }
  };

  // Menu (Operação, depois da Esteira) e nome da tela em Cadastros e Acessos.
  SN.TELAS.cpfl = 'Acompanhamentos CPFL (troca de poste, limpeza…)';
  const i = SN.MENU.findIndex(m => m.tela === 'chamados');
  SN.MENU.splice(i >= 0 ? i + 1 : SN.MENU.length, 0, { tela: 'cpfl', rot: 'Acompanhamentos CPFL', ico: '⚡', href: '#/cpfl' });
})();
