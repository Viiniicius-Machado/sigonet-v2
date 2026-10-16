// SIGONET V2 — Acompanhamentos CPFL (tela "cpfl"): troca de poste, limpeza de cabo, reordenamento…
//
// Pedido do usuário (2026-10-12). Substitui a planilha online "TROCA DE POSTES":
//   Mapa      — agendamentos do dia / semana / mês no mapa (com a rede GeoGrid por baixo), e dali
//               despacha (só aí cria o chamado na Esteira, já com o técnico), registra o resultado
//               (Preventiva / Improdutiva / Acompanhamento) e marca massiva (3+ clientes em risco).
//   Lista     — tudo filtrável e exportável; "sem localização" para completar no mapa.
//   Painel    — o "PAINEL MENSAL" da planilha: recebidas, com ação, % improdutiva, por equipe/tipo/cidade.
//   Importar  — (1) a planilha histórica; (2) notificações recebidas por e-mail (PDF ou Excel): arrastar,
//               o SigoNet entende tema, número, data/hora, cidade, endereço e coordenadas, mostra para
//               conferir e guarda na agenda (Esteira só no despacho).
// Regras puras em cpfl-regras.js. Os registros ficam na coleção "notificacoes" (aba CPFL da planilha).
(() => {
  const esc = SN.esc, C = window.CPFL;
  const TELA = 'cpfl', CONTA = '3.1.1.2.05.0008';
  const CLASSE = { tipo: 'Manutenção', cat1: 'Manutenção - Rede Externa', cat2: 'Acompanhamento / Fiscalização', cat3: 'Acompanhamento Cia Energia' };
  const st = { aba: 'MAPA', per: 'semana', ref: '', tipo: '', status: '', q: '', soAbertas: false, rede: true, modo: '', fRede: '' };
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
      && (!st.fRede || (st.fRede === 'TEM' ? r.rede && r.rede.tem : st.fRede === 'SEM' ? r.rede && !r.rede.tem : !r.rede))
      && (!q || SN.normal([r.numero, r.cidade, r.endereco, r.equipe, r.id_chamado, tipoRot(r.tipo)].join(' ')).includes(q)))
      .sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
  };

  // ═══════════════════════════ Tela ═══════════════════════════
  SN.rota('/cpfl', () => pintar(), { tela: TELA });
  const pintar = () => {
    const abas = [['MAPA', 'Mapa'], ['ROTAS', 'Rotas'], ['LISTA', 'Lista'], ['PAINEL', 'Painel do mês'], ['IMPORTAR', 'Importar']];
    const semLocal = lista().filter(r => !(r.pontos || []).length && r.status === 'PLANEJADO' && r.data >= hoje()).length;
    SN.casca('cpfl', `
      <div class="cab-pagina"><div><h1>Acompanhamentos CPFL</h1><p>Troca de poste, limpeza de cabo, reordenamento e demais serviços da concessionária na nossa rede. Risco para ${C.MIN_CLIENTES_MASSIVA} ou mais clientes = massiva: a Manutenção acompanha.</p></div>
        <div class="acoes"><button class="btn prim" id="bNovoAg">➕ Novo agendamento</button></div></div>
      ${(() => { const n = lista().filter(doTecnico).length; return n ? `<div class="aviso alerta" style="margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">🧑‍🔧 <b>${n}</b> acompanhamento(s) com o resultado informado pelo técnico, aguardando a sua confirmação. <button class="btn sm prim" id="bConfTec">Confirmar</button></div>` : ''; })()}
      ${(() => { const n = lista().filter(r => r.a_conferir).length; return n ? `<div class="aviso info" style="margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">📬 <b>${n}</b> notificação(ões) recebida(s) por e-mail a conferir (com o resultado da nossa rede). <button class="btn sm prim" id="bConfEmail">Conferir</button></div>` : ''; })()}
      ${(() => { const n = naoDespachados().length; return n ? `<div class="aviso alerta" style="margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span><b>${n}</b> chamado(s) CPFL na fila da Manutenção sem técnico (abertos antes do despacho). Agora a atividade só entra na Esteira quando você despacha.</span> <button class="btn sm prim" id="bTirarEst">Tirar da Esteira</button></div>` : ''; })()}
      ${semLocal ? `<div class="aviso alerta small" style="margin-bottom:10px">${semLocal} agendamento(s) futuro(s) sem localização: veja na Lista (filtro "sem localização") e marque no mapa.</div>` : ''}
      <div class="abas">${abas.map(([k, r]) => `<button class="aba ${st.aba === k ? 'ativa' : ''}" data-abacp="${k}">${r}</button>`).join('')}</div>
      <div id="cpCorpo"></div>`);
    SN.$$('[data-abacp]').forEach(b => b.onclick = () => { st.aba = b.dataset.abacp; pintar(); });
    SN.$('#bNovoAg').onclick = () => editar(null);
    if (SN.$('#bConfEmail')) SN.$('#bConfEmail').onclick = () => conferirEmails().then(pintar);
    if (SN.$('#bConfTec')) SN.$('#bConfTec').onclick = () => confirmarTecnicos().then(pintar);
    if (SN.$('#bTirarEst')) SN.$('#bTirarEst').onclick = () => tirarDaEsteira().then(pintar);
    ({ MAPA: pintarMapa, ROTAS: pintarRotas, LISTA: pintarLista, PAINEL: pintarPainel, IMPORTAR: pintarImportar })[st.aba]();
    verificarAuto().catch(() => { });
  };
  const filtrosHtml = (comPeriodo) => `<div class="card card-filtros"><div class="filtros">
    ${comPeriodo ? `<div class="chips">${[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['tudo', 'Tudo']].map(([k, r]) => `<button type="button" class="chip ${st.per === k ? 'sel' : ''}" data-per="${k}">${r}</button>`).join('')}</div>
      ${st.per !== 'tudo' ? `<button class="btn sm" data-mov="-1">◀</button><input class="inp" type="date" id="fRef" value="${esc(st.ref || hoje())}" style="max-width:160px"><button class="btn sm" data-mov="1">▶</button><button class="btn sm" id="bHoje">Hoje</button>` : ''}` : ''}
    <select class="inp" id="fTipo"><option value="">Todos os tipos</option>${Object.entries(C.TIPOS).map(([k, v]) => `<option value="${k}" ${st.tipo === k ? 'selected' : ''}>${v.rot}</option>`).join('')}</select>
    <select class="inp" id="fSt"><option value="">Todos os status</option>${Object.entries(C.STATUS).map(([k, v]) => `<option value="${k}" ${st.status === k ? 'selected' : ''}>${v.rot}</option>`).join('')}</select>
    <select class="inp" id="fRedeF" title="Rede Net Turbo no local (GeoGrid)"><option value="">Rede: todas</option><option value="TEM" ${st.fRede === 'TEM' ? 'selected' : ''}>Com rede nossa</option><option value="SEM" ${st.fRede === 'SEM' ? 'selected' : ''}>Sem rede nossa</option><option value="NAO" ${st.fRede === 'NAO' ? 'selected' : ''}>Rede não conferida</option></select>
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
    SN.$('#fRedeF').onchange = e => { st.fRede = e.target.value; repintar(); };
    SN.$('#fQ').oninput = SN.debounce(e => { st.q = e.target.value; SN.redesenharDigitando(repintar); }, 300);
  };
  const redeTxt = r => r.rede ? (r.rede.fora ? ' <span class="badge">fora da área</span>' : r.rede.tem ? ` <span class="badge ok" title="${esc((r.rede.cabos || []).join(', '))}">rede nossa · ${SN.num(r.rede.metros)} m</span>` : ' <span class="badge">sem rede nossa</span>') : '';
  // Resultado que o técnico informou na OS e ainda não foi confirmado pela gestão.
  const doTecnico = r => { const c = chamadoDe(r); return c && c.cpfl && c.cpfl.resultado && !(c.cpfl.confirmado) ? { c, res: c.cpfl.resultado } : null; };
  const tecTxt = r => { const t = doTecnico(r); return t ? ` <span class="badge alerta" title="Informado pelo técnico na OS">técnico: ${esc(C.RESULTADOS[t.res].rot)} · confirmar</span>` : ''; };
  const badgeReg = r => `${SN.badge(C.STATUS, r.status)}${redeTxt(r)}${tecTxt(r)}${r.resultado ? ` <span class="badge ${r.resultado === 'IMPRODUTIVA' ? 'erro' : 'ok'}">${esc(C.RESULTADOS[r.resultado].rot)}</span>` : ''}${r.massiva ? ' <span class="badge erro">massiva</span>' : ''}`;
  const acoesReg = r => `<button class="btn sm ${r.id_chamado ? '' : 'prim'}" data-desp="${esc(r.id)}">${r.id_chamado ? 'Chamado ' + esc(r.id_chamado) : 'Despachar'}</button>
    <button class="btn sm" data-res="${esc(r.id)}">${r.resultado ? 'Resultado ✓' : 'Resultado'}</button><button class="btn sm" data-ed="${esc(r.id)}">Editar</button>${r.rede ? '' : `<button class="btn sm" data-verrede="${esc(r.id)}" title="Confere se o endereço tem rede Net Turbo (GeoGrid)">Verificar rede</button>`}`;
  const ligarAcoes = (raiz, repintar) => {
    raiz.querySelectorAll('[data-desp]').forEach(b => b.onclick = () => despachar(lista().find(r => r.id === b.dataset.desp)).then(repintar));
    raiz.querySelectorAll('[data-res]').forEach(b => b.onclick = () => resultado(lista().find(r => r.id === b.dataset.res)).then(repintar));
    raiz.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => editar(lista().find(r => r.id === b.dataset.ed)).then(repintar));
    raiz.querySelectorAll('[data-verrede]').forEach(b => b.onclick = async () => { const r = lista().find(x => x.id === b.dataset.verrede); if (!r) return; b.disabled = true; b.textContent = 'Conferindo…';
      try { const x = await verificarRede(r); SN.salvar(); SN.toast(x ? (x.fora ? 'Fora da nossa área.' : x.tem ? `Tem rede Net Turbo: ${SN.num(x.metros)} m de cabo.` : 'Sem rede Net Turbo neste endereço.') : 'Não deu para conferir: falta coordenada ou a rua não foi localizada.', x && x.tem ? 'ok' : ''); } catch (e) { SN.toast(e.message, 'erro'); }
      repintar(); });
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
  // Mesma notificação (mesmo número) já cadastrada em outro registro — antes de colocar na Esteira.
  const numChave = n => C.norm(n).replace(/[^A-Z0-9]/g, '');
  const mesmaNotificacao = (numero, id) => { const k = numChave(numero); if (!k || k === 'SN') return [];
    return lista().filter(x => x.id !== id && numChave(x.numero) === k).sort((a, b) => String(b.data).localeCompare(String(a.data))); };
  const dupTxt = l => l.length ? `⚠️ Mesma notificação já cadastrada: ${l.slice(0, 3).map(x => `${dia(x.data)}${x.endereco ? ' · ' + esc(x.endereco) : ''}${x.id_chamado ? ' · chamado ' + esc(x.id_chamado) : ''}`).join('; ')}${l.length > 3 ? '…' : ''}` : '';
  // Passa na nossa rede? Usa a coordenada; sem ela, localiza a rua. Guarda o resultado no registro.
  const verificarRede = async r => {
    const ind = SN.rede ? await SN.rede.indice().catch(() => null) : null;
    if (!ind || !window.REDE) return null;
    const cid = REDE.acharCidade(ind, r.cidade);
    if (!cid) { r.rede = { tem: false, fora: true, metros: 0, cabos: [], caixas: 0 }; return r.rede; }
    let trechos = (r.pontos || []).length ? [r.pontos] : null;
    if (!trechos && r.endereco) { const g = await localizarRua(r.endereco, r.cidade); if (g) trechos = g.trechos; }
    if (!trechos) return null;
    const d = await SN.rede.cidade(cid.cidade), x = C.naRede(trechos, d, REDE);
    r.rede = x && { tem: x.tem, metros: x.metros, ruaM: x.ruaM, cabos: x.cabos.slice(0, 5), caixas: x.caixas.length, ts: SN.agora() };
    if (!(r.pontos || []).length && trechos.length) r.pontos = [trechos[0][Math.floor(trechos[0].length / 2)]].map(p => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6]);
    return r.rede;
  };
  // Confere vários de uma vez. Com coordenada é tudo no aparelho (rápido); sem coordenada só se
  // comRua (localiza a rua, 1 por segundo). Salva uma vez no fim.
  let loteRodando = false;
  const verificarLote = async (regs, opts) => {
    const o = opts || {}, alvo = regs.filter(r => !r.rede && ((r.pontos || []).length || (o.comRua && r.endereco)));
    if (loteRodando || !alvo.length || !SN.rede) return null;
    const ind = await SN.rede.indice().catch(() => null); if (!ind) return null;
    loteRodando = true; const res = { tem: 0, sem: 0, fora: 0, falha: 0, total: alvo.length };
    try {
      for (let i = 0; i < alvo.length; i++) {
        if (o.passo) o.passo(i + 1, alvo.length);
        let x = null; try { x = await verificarRede(alvo[i]); } catch (e) { x = null; }
        if (!x) res.falha++; else if (x.fora) res.fora++; else if (x.tem) res.tem++; else res.sem++;
        if (i % 25 === 24) await new Promise(ok => setTimeout(ok, 0)); // deixa a tela respirar
      }
    } finally { loteRodando = false; }
    SN.salvar(); SN.log('CPFL_REDE_LOTE', '', JSON.stringify(res));
    return res;
  };
  // Ao abrir a tela: os agendamentos de hoje em diante ainda sem conferência de rede (em segundo plano).
  // Refaz quando entra uma rede nova (outra versão do KMZ) — inclusive a 1ª, para o que foi importado antes da rede.
  let autoVersao = null;
  const verificarAuto = async () => {
    if (!SN.remoto || !SN.rede) return;
    const ind = await SN.rede.indice().catch(() => null); if (!ind || autoVersao === ind.versao) return; autoVersao = ind.versao;
    const hj = hoje(), l = lista().filter(r => !r.rede && r.data >= hj && r.status !== 'CANCELADO' && (r.pontos || []).length);
    if (!l.length) return;
    const res = await verificarLote(l); if (!res) return;
    SN.toast(`Rede conferida em ${res.total} agendamento(s): ${res.tem} com rede nossa, ${res.sem} sem${res.fora ? ', ' + res.fora + ' fora da área' : ''}.`, res.tem ? 'ok' : '');
    if (location.hash === '#/cpfl' && !document.querySelector('.fundo-modal')) pintar();
  };
  const redeLinha = rd => !rd ? '⚠️ Não deu para conferir a rede (sem coordenada e rua não localizada).' : rd.fora ? 'Fora da nossa área (sem rede Net Turbo nesta cidade).'
    : rd.tem ? `✔ <b>Tem rede Net Turbo</b>: ${SN.num(rd.metros)} m de cabo${rd.caixas ? ' · ' + rd.caixas + ' caixa(s)' : ''}${rd.cabos && rd.cabos.length ? ' (' + rd.cabos.slice(0, 3).map(esc).join(', ') + ')' : ''}` : '✖ <b>Sem rede Net Turbo</b> neste endereço.';
  const contasOpts = sel => SN.db.contas.map(c => `<option value="${esc(c.codigo)}" ${c.codigo === sel ? 'selected' : ''}>${esc(SN.contaTxt(c.codigo))}</option>`).join('');
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
  // Técnicos para o despacho (mesma regra da Esteira: indisponível hoje fica bloqueado).
  const tecOpts = sel => { const porEmp = {}; SN.tecnicosDespacho().forEach(t => (porEmp[t.empresa] = porEmp[t.empresa] || []).push(t));
    return Object.keys(porEmp).sort().map(e => `<optgroup label="${esc(e)}">${porEmp[e].sort((a, b) => a.nome.localeCompare(b.nome)).map(t => { const ind = SN.indisponivel(t.nome);
      return `<option value="${esc(t.nome)}" ${ind ? 'disabled' : ''} ${t.nome === sel ? 'selected' : ''}>${esc(SN.nomeExibicao(t.nome))} · ${SN.cargaAberta(t.nome)} OS${ind ? ' · indisponível' : ''}</option>`; }).join('')}</optgroup>`).join(''); };
  const aplicarDespacho = (c, nome, apo) => {
    const t = SN.tecnico(nome), anterior = c.tecnico;
    c.tecnico = t.nome; c.empresa = t.empresa;
    c.apoio = apo ? { empresa: apo.split('|')[0], tecnico: apo.split('|').slice(1).join('|') } : null;
    if (!c.tempos.atribuicao) c.tempos.atribuicao = SN.agora();
    if (anterior && anterior !== t.nome) { ['aceite', 'deslocamento', 'chegada'].forEach(k => delete c.tempos[k]); c.status = 'ATRIBUIDO'; } else if (c.status === 'NAO_ATRIBUIDO') c.status = 'ATRIBUIDO';
    SN.hist(c, anterior && anterior !== t.nome ? 'Reatribuição' : 'Despacho', `${anterior && anterior !== t.nome ? anterior + ' → ' : ''}${t.nome} (${t.empresa})${c.apoio ? ' · apoio ' + c.apoio.tecnico : ''}`);
    SN.log(anterior ? 'REATRIBUIR' : 'DESPACHAR', c.id, t.nome);
    SN.int.ellevenStatus(c, 'Atribuída');
  };
  // Decisão do usuário (16/10/2026): a atividade só entra na Esteira quando a gestão despacha.
  // O chamado nasce aqui, já com o técnico; "Voltar" não cria nada.
  const despachar = async r => {
    if (!r) return null;
    let c = chamadoDe(r);
    if (c && !['NAO_ATRIBUIDO', 'ATRIBUIDO'].includes(c.status)) { SN.navegar('#/chamado/' + c.id); return null; }
    if (!r.rede) { const fim = SN.cobrirCarregando('Conferindo se o endereço tem rede Net Turbo…'); try { await verificarRede(r); SN.salvar(); } catch (e) { } finally { fim(); } }
    const dups = mesmaNotificacao(r.numero, r.id), dupComChamado = dups.filter(x => x.id_chamado && x.id_chamado !== r.id_chamado);
    const res = await SN.modal({ titulo: (c ? 'Despachar ' + c.id + ' · ' : 'Despachar ') + tipoRot(r.tipo) + ' · ' + numTxt(r),
      corpo: `<p class="small">${dia(r.data)} ${esc(r.hora || '')} · ${esc(r.cidade || '')}${r.endereco ? ' · ' + esc(r.endereco) : ''}</p>
        <div class="aviso ${r.rede && r.rede.tem ? 'ok' : 'info'} small" style="margin-bottom:8px">${redeLinha(r.rede)}</div>
        ${dups.length ? `<div class="aviso alerta small" style="margin-bottom:8px">${dupTxt(dups)}${dupComChamado.length ? '<br><b>Já existe chamado para essa notificação</b> — confira antes de abrir outro.' : ''}</div>` : ''}
        <div class="campo"><label>Conta contábil *</label><select class="inp" id="mConta">${contasOpts((c && c.conta) || CONTA)}</select></div>
        <div class="campo"><label>Clientes em risco</label><input class="inp" type="number" min="0" id="mCli" value="${esc(r.clientes ?? '')}" placeholder="estimativa">
          <div class="small muted">${C.MIN_CLIENTES_MASSIVA} ou mais = massiva (a Manutenção acompanha).</div></div>
        <div class="campo"><label>Técnico titular *</label><select class="inp" id="mTec"><option value="">Selecione…</option>${tecOpts(c && c.tecnico)}</select></div>
        <div class="campo"><label>Equipe de apoio (opcional)</label><select class="inp" id="mApo"><option value="">Sem apoio</option>
          ${SN.db.tecnicos.filter(t => t.ativo).sort((a, b) => a.empresa.localeCompare(b.empresa) || a.nome.localeCompare(b.nome)).map(t => `<option value="${esc(t.empresa + '|' + t.nome)}" ${c && c.apoio && c.apoio.tecnico === t.nome ? 'selected' : ''}>${esc(t.empresa)} · ${esc(t.nome)}</option>`).join('')}</select></div>
        <p class="small muted">${c ? 'Atualiza o chamado e manda para a fila do técnico.' : 'Só agora a atividade entra na Esteira: o chamado é criado (Manutenção › Acompanhamento Cia Energia, prazo na hora agendada) já com o técnico.'} No celular, o técnico informa primeiro o resultado (Preventiva / Improdutiva / Acompanhamento) e depois as demais obrigações; o resultado volta aqui para você confirmar.</p>`,
      botoes: [{ rot: 'Voltar', valor: null }, { rot: 'Despachar', cls: 'prim', acao: m => { const tec = SN.$('#mTec', m).value; if (!tec) { SN.toast('Escolha o técnico.', 'erro'); return false; }
        return { cli: SN.$('#mCli', m).value, conta: SN.$('#mConta', m).value, tec, apo: SN.$('#mApo', m).value }; } }] });
    if (!res) return null;
    if (res.cli !== '') { r.clientes = Number(res.cli) || 0; r.massiva = r.clientes >= C.MIN_CLIENTES_MASSIVA; }
    r.editado = true;
    if (!c) { try { c = await novoChamado(r, { conta: res.conta }); } catch (e) { SN.toast(e.message, 'erro'); return null; } }
    else if (res.conta && c.conta !== res.conta) { SN.hist(c, 'Conta contábil', SN.contaTxt(c.conta) + ' → ' + SN.contaTxt(res.conta)); c.conta = res.conta; }
    aplicarDespacho(c, res.tec, res.apo);
    SN.salvar(); SN.toast(`Chamado ${c.id} na Esteira, na fila de ${SN.nomeExibicao(c.tecnico)}.`, 'ok');
    return c;
  };
  // Chamados CPFL abertos antes desta regra e nunca despachados: saem da Esteira (cancelados com
  // o motivo) e o agendamento volta a "Despachar". Nada se perde: o histórico fica nos dois.
  const naoDespachados = () => lista().map(r => ({ r, c: chamadoDe(r) })).filter(x => x.c && x.c.status === 'NAO_ATRIBUIDO' && !x.c.tecnico);
  const tirarDaEsteira = async () => {
    const l = naoDespachados(); if (!l.length) return;
    if (!await SN.confirmar('Tirar da Esteira', `<b>${l.length}</b> chamado(s) CPFL estão na Esteira sem técnico (foram abertos sem despacho).<br>Eles saem da fila da Manutenção (ficam cancelados, com o motivo) e os agendamentos voltam para "Despachar" aqui.`, 'Tirar da Esteira', 'prim')) return;
    l.forEach(({ r, c }) => {
      c.status = 'CANCELADO'; c.tempos.fechamento = SN.agora(); SN.hist(c, 'Cancelado', 'Saiu da Esteira: acompanhamento CPFL ainda não despachado');
      SN.int.ellevenStatus(c, 'Cancelada');
      (r.chamados_retirados = r.chamados_retirados || []).push(c.id); delete r.id_chamado; r.editado = true; hist(r, 'SAIU DA ESTEIRA', c.id + ' (não despachado)');
    });
    SN.log('CPFL_TIRAR_ESTEIRA', '', l.map(x => x.c.id).join(', ')); SN.salvar();
    SN.toast(`${l.length} chamado(s) saíram da Esteira. Despache por aqui quando for a hora.`, 'ok');
  };

  // ─────────── Resultado ───────────
  const resultado = async r => {
    if (!r) return;
    const c = chamadoDe(r), tec = c && c.cpfl && c.cpfl.resultado;
    const res = await SN.modal({ titulo: 'Resultado · ' + tipoRot(r.tipo) + ' ' + (r.numero || ''),
      corpo: `${tec ? `<p class="small">O técnico informou na OS: <b>${esc(C.RESULTADOS[tec].rot)}</b>${c.cpfl.confirmado ? ' (já confirmado)' : ''}.</p>` : ''}${Object.entries(C.RESULTADOS).map(([k, v]) => `<label class="cp-res"><input type="radio" name="mRes" value="${k}" ${(r.resultado || tec) === k ? 'checked' : ''}><span><b>${v.rot}</b><br><span class="small muted">${esc(v.desc)}</span></span></label>`).join('')}
        <div class="linha-form"><div class="campo"><label>Data da atuação</label><input class="inp" type="date" id="mData" value="${esc(r.data_atuacao || r.data || hoje())}"></div>
          <div class="campo"><label>Equipe</label><input class="inp" id="mEq" value="${esc(r.equipe || (c ? c.empresa : '') || '')}"></div></div>
        <div class="campo"><label>Observação</label><textarea class="inp" id="mObs">${esc(r.obs_resultado || '')}</textarea></div>
        ${c ? `<p class="small muted">Chamado ${esc(c.id)} · ${esc((SN.STATUS[c.status] || {}).rot || c.status)}</p>` : ''}`,
      botoes: [{ rot: 'Voltar', valor: null }].concat(r.resultado ? [{ rot: 'Limpar resultado', cls: 'perigo', valor: 'limpar' }] : []).concat([{ rot: 'Salvar', cls: 'prim', acao: m => {
        const v = (SN.$('input[name="mRes"]:checked', m) || {}).value; if (!v) { SN.toast('Escolha o resultado.', 'erro'); return false; }
        return { v, data: SN.$('#mData', m).value, eq: SN.$('#mEq', m).value.trim(), obs: SN.$('#mObs', m).value.trim() }; } }]) });
    if (!res) return;
    if (res === 'limpar') { r.resultado = ''; r.data_atuacao = ''; if (r.status === 'CONCLUIDO') r.status = 'PLANEJADO'; hist(r, 'RESULTADO LIMPO'); }
    else { Object.assign(r, { resultado: res.v, data_atuacao: res.data, equipe: C.equipeDe(res.eq), obs_resultado: res.obs }); if (r.status !== 'CANCELADO') r.status = 'CONCLUIDO'; hist(r, 'RESULTADO', C.RESULTADOS[res.v].rot);
      if (c && c.cpfl && c.cpfl.resultado) { r.resultado_tecnico = c.cpfl.resultado; c.cpfl.confirmado = { por: (SN.usuario() || {}).nome || '', ts: SN.agora(), resultado: res.v }; } }
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
        ${novo ? '<p class="small muted">A atividade só entra na Esteira quando for despachada. Use "Salvar e despachar" para já escolher o técnico.</p>' : ''}
        ${!novo && (x.historico || []).length ? `<details class="small" style="margin-top:6px"><summary>Histórico</summary>${x.historico.slice().reverse().map(h => `<div>${SN.dt(h.ts)} · ${esc(h.usuario)} · ${esc(h.acao)} ${esc(h.detalhe || '')}</div>`).join('')}</details>` : ''}`,
      botoes: (() => { const ler = despachar => m => {
        const g = id => SN.$('#' + id, m).value.trim();
        if (!g('eData') || !g('eCid')) { SN.toast('Informe a data e a cidade.', 'erro'); return false; }
        return { tipo: g('eTipo'), numero: g('eNum'), data: g('eData'), hora: g('eHora'), prazo: g('ePrazo'), cidade: g('eCid'), endereco: g('eEnd'), coord: g('eCoord'),
          status: g('eSt'), equipe: C.equipeDe(g('eEq')), postes: g('ePos') === '' ? '' : Number(g('ePos')), clientes: g('eCli') === '' ? '' : Number(g('eCli')), obs: g('eObs'), despachar }; };
        return [{ rot: 'Cancelar', valor: null }].concat(!novo && !x.id_chamado ? [{ rot: 'Excluir', cls: 'perigo', valor: 'excluir' }] : [])
          .concat(novo ? [{ rot: 'Salvar', acao: ler(false) }, { rot: 'Salvar e despachar', cls: 'prim', acao: ler(true) }] : [{ rot: 'Salvar', cls: 'prim', acao: ler(false) }]); })() });
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
      SN.log('CPFL_NOVO', reg.id, ''); SN.salvar();
      if (res.despachar) await despachar(reg); else SN.toast('Agendamento criado. Ele entra na Esteira quando você despachar.', 'ok');
    } else {
      const mudouLocal = JSON.stringify([x.cidade, x.endereco, x.pontos]) !== JSON.stringify([dados.cidade, dados.endereco, dados.pontos]);
      Object.assign(x, dados, { editado: true }); if (mudouLocal) delete x.rede; hist(x, 'EDITADO'); SN.salvar(); SN.toast('Salvo.', 'ok');
    }
  };

  // ─────────── Lista ───────────
  let semLocalFiltro = false;
  const pintarLista = () => {
    let l = filtrados(); if (semLocalFiltro) l = l.filter(r => !(r.pontos || []).length);
    SN.$('#cpCorpo').innerHTML = `${filtrosHtml(true)}
      <div class="card"><div class="card-tit"><h3>${l.length} notificação(ões)</h3><div class="acoes"><label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="fSemLoc" ${semLocalFiltro ? 'checked' : ''}> sem localização</label><button class="btn sm" id="bRedeTodos" title="Confere a rede Net Turbo em todos os registros ainda não conferidos">Verificar rede de todos (${lista().filter(r => !r.rede && ((r.pontos || []).length || r.endereco)).length})</button><button class="btn sm" id="bExp">Exportar</button></div></div>
      ${l.length ? `<div class="tabela-wrap"><table class="tab small"><thead><tr><th>Data</th><th>Tipo</th><th>Notificação</th><th>Cidade / endereço</th><th>Status / resultado</th><th>Equipe</th><th>Chamado</th><th></th></tr></thead><tbody>
      ${l.slice(0, 600).map(r => `<tr><td class="nowrap">${dia(r.data)} ${esc(r.hora || '')}</td><td>${esc(tipoRot(r.tipo))}</td><td class="mono">${esc(numTxt(r))}</td>
        <td>${esc(r.cidade || '')}<div class="muted">${esc(r.endereco || '')}${(r.pontos || []).length ? '' : ' <span class="badge alerta">sem localização</span>'}</div></td>
        <td>${badgeReg(r)}</td><td>${esc(r.equipe || '')}</td><td>${r.id_chamado ? `<a href="#/chamado/${esc(r.id_chamado)}">${esc(r.id_chamado)}</a>` : '—'}</td><td><div class="acoes" style="gap:6px;min-width:230px">${acoesReg(r)}</div></td></tr>`).join('')}</tbody></table></div>
      ${l.length > 600 ? '<p class="small muted">Mostrando 600: filtre ou exporte.</p>' : ''}` : '<p class="muted">Nada no filtro.</p>'}</div>`;
    ligarFiltros(pintarLista); ligarAcoes(SN.$('#cpCorpo'), pintarLista);
    SN.$('#fSemLoc').onchange = e => { semLocalFiltro = e.target.checked; pintarLista(); };
    SN.$('#bRedeTodos').onclick = async () => {
      const pend = lista().filter(r => !r.rede && ((r.pontos || []).length || r.endereco)), semCoord = pend.filter(r => !(r.pontos || []).length).length;
      if (!pend.length) return SN.toast('Todos já foram conferidos.', 'ok');
      if (!await SN.confirmar('Verificar rede de todos', `${pend.length} registro(s) sem conferência de rede. ${pend.length - semCoord} com coordenada (rápido)${semCoord ? ` e ${semCoord} só com endereço (localiza a rua: ~1 s cada)` : ''}.`, 'Verificar', 'prim')) return;
      const fim = SN.cobrirCarregando('Conferindo a rede…'), passo = (i, n) => { const el = document.querySelector('.carregando-sobre p'); if (el) el.textContent = `Conferindo a rede… ${i}/${n}`; };
      let res; try { res = await verificarLote(pend, { comRua: true, passo }); } finally { fim(); }
      if (res) SN.toast(`${res.total} conferido(s): ${res.tem} com rede nossa, ${res.sem} sem, ${res.fora} fora da área${res.falha ? ', ' + res.falha + ' sem localização' : ''}.`, 'ok');
      pintarLista();
    };
    SN.$('#bExp').onclick = () => SN.exportar('acompanhamentos-cpfl', l.map(r => ({ 'AÇÃO': tipoRot(r.tipo).toUpperCase(), 'NOTIFICAÇÃO': r.numero, CIDADE: r.cidade, ENDERECO: r.endereco, COORDENADAS: (r.pontos || []).map(p => p.join(', ')).join('/') || r.coord_original || '',
      DATA: dia(r.data), PRAZO: r.prazo, HORA: r.hora, STATUS: (C.STATUS[r.status] || {}).rot, EQUIPE: r.equipe, 'AÇÃO2': r.resultado, 'DATA DA ATUAÇÃO': dia(r.data_atuacao), POSTES: r.postes, 'CLIENTES EM RISCO': r.clientes, MASSIVA: r.massiva ? 'SIM' : '', CHAMADO: r.id_chamado || '', 'REDE NET TURBO': r.rede ? (r.rede.fora ? 'FORA DA ÁREA' : r.rede.tem ? 'SIM' : 'NÃO') : '', 'CABO NOSSO (m)': r.rede && r.rede.tem ? r.rede.metros : '', ORIGEM: r.origem })));
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

  // ═══════════════════════════ Rotas ═══════════════════════════
  // Rota do dia (como a ordem das CS na Preventiva, mas respeitando a hora marcada pela CPFL) e
  // atrasados em blocos por proximidade para replanejar. Regras em cpfl-regras.js (C.montarRota…).
  const rt = { data: '', diasAtraso: 30, sel: {}, rota: null, raioKm: 3 };
  const abertoAgend = r => r.status === 'PLANEJADO' && !r.resultado && (r.pontos || []).length && !(chamadoDe(r) && ['CONCLUIDO_TECNICO', 'FECHADO', 'CANCELADO'].includes(chamadoDe(r).status));
  const atrasados = () => { const hj = hoje(), lim = somaDias(hj, -rt.diasAtraso); return lista().filter(r => abertoAgend(r) && r.data < hj && r.data >= lim); };
  const doDia = d => lista().filter(r => r.data === d && abertoAgend(r));
  const pt = r => r.pontos[0];
  const pintarRotas = () => {
    const d = rt.data || hoje(), dia0 = doDia(d), at = atrasados();
    // atrasados a até 3 km de algum serviço do dia (candidatos a encaixe)
    const perto = at.filter(a => !dia0.includes(a) && dia0.some(x => C.distM(pt(a), pt(x)) <= rt.raioKm * 1000));
    if (!rt.sel.__dia || rt.sel.__dia !== d) { rt.sel = { __dia: d }; dia0.forEach(r => { rt.sel[r.id] = true; }); rt.rota = null; }
    const semLocal = lista().filter(r => r.data === d && r.status === 'PLANEJADO' && !r.resultado && !(r.pontos || []).length);
    const linha = (r, atras) => `<label class="cp-rt-it"><input type="checkbox" data-rsel="${esc(r.id)}" ${rt.sel[r.id] ? 'checked' : ''}>
      <span><b>${r.hora ? esc(r.hora) : 'sem hora'}</b> · ${esc(tipoRot(r.tipo))} · <span class="mono">${esc(numTxt(r))}</span>${atras ? ` <span class="badge alerta">atrasado de ${dia(r.data)}</span>` : ''}${redeTxt(r)}
        <span class="small muted" style="display:block">${esc(r.cidade || '')}${r.endereco ? ' · ' + esc(r.endereco) : ''}${r.id_chamado ? ' · ' + esc(r.id_chamado) : ''}</span></span></label>`;
    const blocos = C.blocosAtrasados(at.map(r => ({ id: r.id, ponto: pt(r), tipo: r.tipo, data: r.data })), { raioKm: rt.raioKm });
    const agendaFutura = lista().filter(r => r.data >= hoje() && r.data <= somaDias(hoje(), 14) && abertoAgend(r)).map(r => ({ id: r.id, data: r.data, ponto: pt(r) }));
    SN.$('#cpCorpo').innerHTML = `<div class="cp-grade">
      <div class="card" style="min-width:0"><div class="card-tit"><h3>🧭 Rota do dia</h3>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:nowrap"><button class="btn sm" data-rmov="-1">◀</button><input class="inp" type="date" id="rtData" value="${esc(d)}" style="width:150px"><button class="btn sm" data-rmov="1">▶</button></div></div>
        <p class="small muted">Saída no 1º agendamento · ${C.TEMPO_LOCAL.TROCA_POSTE} min por troca de poste, ${C.TEMPO_LOCAL.LIMPEZA} min por limpeza/reordenamento · hora marcada pela CPFL fica fixa; atrasados e sem hora entram nos intervalos, sempre o mais perto.</p>
        <div id="rtLista">${dia0.map(r => linha(r, false)).join('') || '<p class="muted small">Nenhum agendamento aberto com localização neste dia.</p>'}
          ${perto.length ? `<h4 style="margin:10px 0 4px">Atrasados perto destes serviços (até ${rt.raioKm} km)</h4>${perto.map(r => linha(r, true)).join('')}` : ''}
          ${semLocal.length ? `<p class="small" style="color:#b45309">${semLocal.length} agendamento(s) do dia sem localização (fora da rota): marque no mapa pela Lista.</p>` : ''}</div>
        <div class="acoes" style="margin-top:8px"><button class="btn prim" id="bMontar">Montar rota</button></div>
        <div id="rtRes"></div></div>
      <div class="card cp-lado"><h3>⏰ Atrasados (${at.length})</h3>
        <div class="filtros" style="margin-bottom:6px"><label class="small">Últimos</label><select class="inp" id="rtDias" style="max-width:120px">${[15, 30, 60, 120].map(n => `<option ${n === rt.diasAtraso ? 'selected' : ''} value="${n}">${n} dias</option>`).join('')}</select></div>
        <p class="small muted">Passaram da data sem resultado. Agrupados por proximidade (cada bloco cabe num dia).</p>
        ${blocos.map((b, i) => { const enc = C.encaixeSugerido(b, agendaFutura, { raioKm: 5 }), regs = b.itens.map(x => lista().find(r => r.id === x.id)), cids = [...new Set(regs.map(r => r.cidade))];
          return `<div class="cp-item"><b>Bloco ${i + 1}</b> · ${b.itens.length} serviço(s) · ~${Math.round(b.minutos / 60 * 10) / 10} h · ${esc(cids.join(', '))}
            <div class="small muted">mais antigo ${dia(b.maisAntigo)}${enc ? ` · <span style="color:var(--ok,#15803d)">encaixe sugerido: ${dia(enc.data)} (serviço a ${SN.num(enc.dist)} m)</span>` : ''}</div>
            <div class="acoes" style="gap:6px;margin-top:4px">${enc ? `<button class="btn sm prim" data-encx="${i}" data-dia="${enc.data}">Encaixar em ${dia(enc.data)}</button>` : ''}<button class="btn sm" data-blocodia="${i}">Escolher dia…</button></div></div>`; }).join('') || '<p class="muted small">Nenhum atrasado no período. 👍</p>'}</div></div>`;
    SN.$$('[data-rmov]').forEach(b => b.onclick = () => { rt.data = somaDias(d, +b.dataset.rmov); pintarRotas(); });
    SN.$('#rtData').onchange = e => { rt.data = e.target.value; pintarRotas(); };
    SN.$('#rtDias').onchange = e => { rt.diasAtraso = +e.target.value; pintarRotas(); };
    SN.$$('[data-rsel]').forEach(c => c.onchange = () => { rt.sel[c.dataset.rsel] = c.checked; rt.rota = null; SN.$('#rtRes').innerHTML = ''; });
    SN.$('#bMontar').onclick = () => montarRotaTela(d).catch(e => SN.toast(e.message, 'erro'));
    const levarPara = async (i, dataNova) => { const b = blocos[i], regs = b.itens.map(x => lista().find(r => r.id === x.id));
      if (!await SN.confirmar('Encaixar ' + regs.length + ' atrasado(s)', `Remarcar para <b>${dia(dataNova)}</b> e abrir a rota desse dia com eles marcados?<br><span class="small muted">${regs.map(r => esc(numTxt(r)) + ' · ' + esc(r.endereco || r.cidade)).join('<br>')}</span>`, 'Encaixar', 'prim')) return;
      regs.forEach(r => { if (!r.data_original) r.data_original = r.data; hist(r, 'REAGENDADO', dia(r.data) + ' → ' + dia(dataNova)); r.data = dataNova; r.editado = true;
        const c = chamadoDe(r); if (c && ['NAO_ATRIBUIDO', 'ATRIBUIDO', 'ACEITO'].includes(c.status)) { c.prazoLimite = new Date(dataNova + 'T' + (r.hora || '23:59') + ':00').toISOString(); SN.hist(c, 'Reagendado (CPFL)', dia(dataNova)); } });
      SN.salvar(); rt.data = dataNova; rt.sel = { __dia: dataNova }; doDia(dataNova).forEach(r => { rt.sel[r.id] = true; }); pintarRotas(); SN.toast(regs.length + ' atrasado(s) encaixado(s) em ' + dia(dataNova) + '.', 'ok'); };
    SN.$$('[data-encx]').forEach(b => b.onclick = () => levarPara(+b.dataset.encx, b.dataset.dia));
    SN.$$('[data-blocodia]').forEach(b => b.onclick = async () => { const v = await SN.modal({ titulo: 'Escolher o dia', corpo: `<input class="inp" type="date" id="mDia" min="${hoje()}" value="${hoje()}">`,
      botoes: [{ rot: 'Voltar', valor: null }, { rot: 'Usar este dia', cls: 'prim', acao: m => SN.$('#mDia', m).value || false }] }); if (v) levarPara(+b.dataset.blocodia, v); });
  };
  // Tempo de deslocamento pelas ruas (OSRM table, carro); sem resposta, estimativa pela distância.
  const matrizTempos = async pts => {
    try {
      const r = await (await fetch('https://router.project-osrm.org/table/v1/driving/' + pts.map(p => p[1] + ',' + p[0]).join(';') + '?annotations=duration', { signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined })).json();
      if (r.code === 'Ok' && r.durations) return { m: r.durations.map(l => l.map(s => s == null ? null : Math.round(s / 60) + 5)), ruas: true };
    } catch (e) { }
    return { m: null, ruas: false };
  };
  const montarRotaTela = async d => {
    const regs = lista().filter(r => rt.sel[r.id] && (r.pontos || []).length);
    if (!regs.length) return SN.toast('Marque os serviços da rota.', 'erro');
    if (regs.length > 25) return SN.toast('No máximo 25 serviços numa rota.', 'erro');
    const fim = SN.cobrirCarregando('Calculando a rota pelas ruas…');
    let mt; try { mt = await matrizTempos(regs.map(pt)); } finally { fim(); }
    const itens = regs.map(r => ({ id: r.id, ponto: pt(r), tipo: r.tipo, hora: r.data === d ? r.hora : '' })); // atrasado encaixado: sem hora fixa
    const res = C.montarRota(itens, { tempo: mt.m ? (i, j) => (mt.m[i][j] == null ? C.tempoEstimado(itens[i].ponto, itens[j].ponto) : (i === j ? 0 : mt.m[i][j])) : null });
    rt.rota = { data: d, res, regs, ruas: mt.ruas };
    pintarResultadoRota();
  };
  const pintarResultadoRota = () => {
    const el = SN.$('#rtRes'); if (!el || !rt.rota) return;
    const { res, regs, ruas, data } = rt.rota, porId = Object.fromEntries(regs.map(r => [r.id, r]));
    const gmaps = 'https://www.google.com/maps/dir/' + res.seq.map(x => pt(porId[x.id]).join(',')).join('/');
    el.innerHTML = `<div class="aviso ${res.conflitos ? 'alerta' : 'ok'} small" style="margin-top:10px">${res.seq.length} parada(s) · término previsto <b>${res.termino}</b> · ${SN.num(res.km, 1)} km · ${res.deslocMin} min de deslocamento ${ruas ? '(tempo pelas ruas)' : '(estimado pela distância)'}${res.conflitos ? ` · <b>${res.conflitos} conflito(s) de horário</b>` : ''}${res.naoCouberam.length ? ` · ${res.naoCouberam.length} não couberam no dia` : ''}</div>
      <div class="tabela-wrap"><table class="tab small"><thead><tr><th>#</th><th>Chegada</th><th>Início</th><th>Serviço</th><th>Onde</th><th class="num">Desloc.</th></tr></thead><tbody>
      ${res.seq.map(x => { const r = porId[x.id]; return `<tr${x.conflito ? ' style="background:#fef2f2"' : ''}><td><b>${x.ordem}</b></td><td class="nowrap">${x.chegada}</td>
        <td class="nowrap">${x.inicio}${x.horaMarcada ? ` <span class="badge">marcado ${x.horaMarcada}</span>` : ''}${x.conflito ? ` <span class="badge erro">${x.atrasoMin} min atrasado</span>` : ''}${x.espera > 15 ? ` <span class="muted">(espera ${x.espera} min)</span>` : ''}</td>
        <td>${esc(tipoRot(r.tipo))} · <span class="mono">${esc(numTxt(r))}</span>${r.data !== data ? ' <span class="badge alerta">atrasado</span>' : ''}</td><td>${esc(r.cidade || '')}<div class="muted">${esc(r.endereco || '')}</div></td><td class="num">${x.deslocMin} min</td></tr>`; }).join('')}</tbody></table></div>
      ${res.conflitos ? `<p class="small" style="color:#b45309">Uma equipe só não cumpre todos os horários marcados. Desmarque os que estão em vermelho, despache esta rota e monte uma 2ª rota com eles para outra equipe.</p>` : ''}
      ${res.naoCouberam.length ? `<p class="small" style="color:#b45309">Não couberam no dia: ${res.naoCouberam.map(id => esc(numTxt(porId[id]))).join(', ')}</p>` : ''}
      <div id="rtMapa" class="prj-mapa" style="height:360px;min-height:0;margin-top:8px"></div>
      <div class="acoes" style="margin-top:8px"><a class="btn" href="${esc(gmaps)}" target="_blank" rel="noopener">🗺 Abrir a rota no Google Maps</a><button class="btn ok" id="bDespRota">🚀 Despachar esta rota</button></div>`;
    SN.$('#bDespRota').onclick = () => despacharRota().catch(e => SN.toast(e.message, 'erro'));
    carregarLeaflet().then(() => { const L = window.L, m = SN.$('#rtMapa'); if (!m) return;
      const mp = L.map(m, { zoomAnimation: false }); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mp);
      const pts = res.seq.map(x => pt(porId[x.id]));
      L.polyline(pts, { color: '#2563eb', weight: 4, opacity: 0.8, dashArray: '8 6' }).addTo(mp);
      // Paradas no mesmo lugar (até ~30 m) viram um alfinete só ("1·2"); senão o número de cima esconde o de baixo.
      const grupos = [];
      res.seq.forEach((x, k) => { const g = grupos.find(g => mp.distance(g.p, pts[k]) < 30); if (g) g.itens.push(x); else grupos.push({ p: pts[k], itens: [x] }); });
      grupos.forEach(g => { const rot = g.itens.map(x => x.ordem).join('·'), larg = Math.max(26, 12 + rot.length * 8);
        L.marker(g.p, { icon: L.divIcon({ className: 'prj-ico', html: `<div class="cp-num ${g.itens.some(x => x.conflito) ? 'erro' : ''}" style="width:${larg}px;border-radius:13px">${rot}</div>`, iconSize: [larg, 26], iconAnchor: [larg / 2, 13] }) }).addTo(mp)
          .bindTooltip(g.itens.map(x => `${x.ordem} · ${x.inicio} · ${esc(tipoRot(porId[x.id].tipo))} ${esc(numTxt(porId[x.id]))}`).join('<br>')); });
      mp.fitBounds(L.latLngBounds(pts).pad(0.2), { animate: false, maxZoom: 16 }); }).catch(() => { });
  };
  // Despacha a rota inteira: conta + técnico; cria/atualiza os chamados com a ordem e a hora prevista.
  const despacharRota = async () => {
    const { res, regs, data } = rt.rota, porId = Object.fromEntries(regs.map(r => [r.id, r]));
    const porEmp = {}; SN.tecnicosDespacho().forEach(t => (porEmp[t.empresa] = porEmp[t.empresa] || []).push(t));
    const ocupado = res.seq.map(x => chamadoDe(porId[x.id])).filter(c => c && !['NAO_ATRIBUIDO', 'ATRIBUIDO'].includes(c.status));
    if (ocupado.length) return SN.toast(`${ocupado.map(c => c.id).join(', ')} já está(ão) em andamento: tire da rota.`, 'erro');
    const v = await SN.modal({ titulo: `Despachar rota de ${dia(data)} · ${res.seq.length} parada(s)`,
      corpo: `<div class="campo"><label>Conta contábil *</label><select class="inp" id="mConta">${contasOpts(CONTA)}</select></div>
        <div class="campo"><label>Técnico (equipe) *</label><select class="inp" id="mTec"><option value="">Selecione…</option>${Object.keys(porEmp).sort().map(e => `<optgroup label="${esc(e)}">${porEmp[e].sort((a, b) => a.nome.localeCompare(b.nome)).map(t => `<option value="${esc(t.nome)}" ${SN.indisponivel(t.nome) ? 'disabled' : ''}>${esc(SN.nomeExibicao(t.nome))} · ${SN.cargaAberta(t.nome)} OS${SN.indisponivel(t.nome) ? ' · indisponível' : ''}</option>`).join('')}</optgroup>`).join('')}</select></div>
        <p class="small muted">Cada parada vira (ou continua) um chamado na Esteira, com a ordem e a hora prevista. No celular, o técnico vê a "Rota do dia" na sequência, com navegação, e informa o resultado em cada parada.${res.seq.some(x => porId[x.id].data !== data) ? ' Os atrasados da rota são remarcados para ' + dia(data) + '.' : ''}</p>`,
      botoes: [{ rot: 'Voltar', valor: null }, { rot: 'Despachar', cls: 'ok', acao: m => { const tec = SN.$('#mTec', m).value; if (!tec) { SN.toast('Escolha o técnico.', 'erro'); return false; } return { tec, conta: SN.$('#mConta', m).value }; } }] });
    if (!v) return;
    const t = SN.tecnico(v.tec), idRota = 'RT-' + data.replace(/-/g, '') + '-' + SN.uid().slice(-4).toUpperCase(), fim = SN.cobrirCarregando('Despachando…');
    try {
      for (const x of res.seq) {
        const r = porId[x.id];
        if (r.data !== data) { if (!r.data_original) r.data_original = r.data; hist(r, 'REAGENDADO', dia(r.data) + ' → ' + dia(data) + ' (rota)'); r.data = data; }
        let c = chamadoDe(r); if (!c) c = await novoChamado(r, { conta: v.conta }); else if (c.conta !== v.conta) { SN.hist(c, 'Conta contábil', SN.contaTxt(c.conta) + ' → ' + SN.contaTxt(v.conta)); c.conta = v.conta; }
        c.rota = { id: idRota, data, ordem: x.ordem, total: res.seq.length, prevista: x.inicio, lat: pt(r)[0], lng: pt(r)[1] };
        c.prazoLimite = new Date(data + 'T' + (x.horaMarcada || x.saida) + ':00').toISOString();
        const anterior = c.tecnico; c.tecnico = t.nome; c.empresa = t.empresa; if (!c.tempos.atribuicao) c.tempos.atribuicao = SN.agora();
        if (anterior && anterior !== t.nome) { ['aceite', 'deslocamento', 'chegada'].forEach(k => delete c.tempos[k]); c.status = 'ATRIBUIDO'; } else if (c.status === 'NAO_ATRIBUIDO') c.status = 'ATRIBUIDO';
        SN.hist(c, anterior && anterior !== t.nome ? 'Reatribuição' : 'Despacho', `${t.nome} (${t.empresa}) · rota ${idRota}, parada ${x.ordem}/${res.seq.length}, prevista ${x.inicio}`);
        SN.int.ellevenStatus(c, 'Atribuída');
        r.rota = { id: idRota, ordem: x.ordem }; r.editado = true; hist(r, 'ROTA', `${idRota} · parada ${x.ordem} · ${t.nome}`);
      }
      SN.log('CPFL_ROTA', idRota, `${res.seq.length} paradas · ${t.nome}`); SN.salvar();
      SN.toast(`Rota ${idRota} despachada para ${t.nome}: ${res.seq.length} parada(s).`, 'ok'); rt.rota = null; pintar();
    } finally { fim(); }
  };

  // ═══════════════════════════ Importar ═══════════════════════════
  const pintarImportar = () => {
    SN.$('#cpCorpo').innerHTML = `<div class="grid g2">
      <div class="card"><h3>📩 E-mail da CPFL</h3>
        <p class="small">Abra o e-mail no Outlook, selecione tudo (Ctrl+A), copie (Ctrl+C) e cole aqui (Ctrl+V) — com o assunto, se puder. O SigoNet entende o tema, o número, a data, as ruas (ou a tabela da programação semanal), localiza cada rua e confere se <b>passa na nossa rede</b> (GeoGrid). Fica na agenda com o resultado da rede; entra na Esteira quando você despachar.</p>
        <textarea class="inp" id="tEmail" rows="7" placeholder="Cole aqui o e-mail inteiro (Ctrl+V)"></textarea>
        <div class="acoes" style="margin-top:6px"><button class="btn prim" id="bLerEmail">🔎 Ler e conferir a rede</button></div>
        <label class="cp-solta" id="zNot" style="min-height:90px"><input type="file" id="fNot" accept=".pdf,.xlsx,.xls,.csv,.eml,.txt,.html,.htm,application/pdf,message/rfc822" multiple hidden><span>…ou solte aqui o e-mail salvo (.eml), o PDF ou o Excel<br><span class="small muted">no Outlook: arraste o e-mail para a área de trabalho, ou "Salvar como"</span></span></label></div>
      <div class="card"><h3>🗂️ Base histórica (planilha)</h3>
        <p class="small">A planilha online da sala técnica ("TROCA DE POSTES", aba NOTIFICAÇÕES). Importar de novo atualiza: o que já foi editado no SigoNet é preservado.</p>
        <label class="cp-solta" id="zHist"><input type="file" id="fHist" accept=".xlsx,.xls" hidden><span>Solte a planilha aqui<br><span class="small muted">ou clique para escolher</span></span></label>
        <p class="small muted">${SN.num(lista().length)} notificação(ões) no SigoNet · ${SN.num(lista().filter(r => r.origem === 'PLANILHA').length)} da planilha.</p></div></div>
      <div class="card" style="margin-top:12px" id="cxAuto"><h3>📬 Caixa automática</h3><p class="small muted">Carregando…</p></div>`;
    const zona = (id, inp, fn) => { const z = SN.$('#' + id);
      z.ondragover = e => { e.preventDefault(); z.classList.add('sobre'); }; z.ondragleave = () => z.classList.remove('sobre');
      z.ondrop = e => { e.preventDefault(); z.classList.remove('sobre'); const fs = [...(e.dataTransfer.files || [])]; if (fs.length) fn(fs).catch(err => SN.toast(err.message || String(err), 'erro')); };
      SN.$('#' + inp).onchange = e => { const fs = [...(e.target.files || [])]; e.target.value = ''; if (fs.length) fn(fs).catch(err => SN.toast(err.message || String(err), 'erro')); }; };
    zona('zNot', 'fNot', importarNotificacoes); zona('zHist', 'fHist', fs => importarHistorico(fs[0]));
    pintarCaixa();
    // Colar do Outlook: se vier HTML (tabela da programação), vira texto com as colunas separadas por tabulação.
    SN.$('#tEmail').addEventListener('paste', ev => { const h = ev.clipboardData && ev.clipboardData.getData('text/html'); if (!h) return; ev.preventDefault(); SN.$('#tEmail').value = htmlParaTexto(h); });
    SN.$('#bLerEmail').onclick = () => { const t = SN.$('#tEmail').value.trim(); if (!t) return SN.toast('Cole o e-mail primeiro.', 'erro');
      lerTextos([{ texto: t, fonte: 'e-mail colado' }]).catch(err => SN.toast(err.message || String(err), 'erro')); };
  };
  const pintarCaixa = async () => {
    const el = SN.$('#cxAuto'); if (!el) return;
    if (!SN.remoto) { el.innerHTML = '<h3>📬 Caixa automática</h3><p class="small muted">Precisa do servidor.</p>'; return; }
    // Caixa automática adiada (2026-10-12): sem a função no servidor, o quadro não aparece.
    let cfg = null; try { cfg = (await SN.api('CPFL_EMAIL_CONFIG', {})).config; } catch (e) { if (/desconhecida/i.test(e.message || '')) { el.remove(); return; } el.innerHTML = `<h3>📬 Caixa automática</h3><div class="aviso erro small">${esc(e.message)}</div>`; return; }
    if (!SN.$('#cxAuto')) return;
    const u = cfg.ultima;
    el.innerHTML = `<h3>📬 Caixa automática</h3>
      <p class="small">Encaminhe o e-mail da CPFL para o endereço abaixo. A cada 10 minutos o SigoNet lê, confere cada rua na nossa rede, guarda aqui como <b>a conferir</b> e responde para quem encaminhou dizendo o que tem e o que não tem rede nossa.</p>
      <div class="linha-form"><div class="campo" style="flex:2"><label>Endereço da caixa (conta dedicada)</label><input class="inp" id="cxEnd" value="${esc(cfg.endereco)}" placeholder="ex.: sigonet.cpfl@gmail.com"></div>
        <div class="campo" style="align-self:end"><button class="btn" id="cxSalvar">Salvar</button></div></div>
      <p class="small">${cfg.ativo ? '✔ Leitura automática ativada.' : '⚠️ Leitura automática ainda não ativada: quem é dono do Apps Script abre o editor, escolhe a função <b>ativarEmailCpfl</b>, clica em Executar e permite o acesso (uma vez só).'}
        ${u ? ` Última leitura: ${SN.dt(u.ts)} · ${SN.num(u.emails)} e-mail(s) · ${SN.num(u.notificacoes)} notificação(ões).` : ''}</p>
      <details class="small"><summary>Como montar</summary><ol style="margin:6px 0 0 18px">
        <li>Crie a conta dedicada (ex.: um Gmail só para isso) e salve o endereço aqui.</li>
        <li>Nessa conta: Configurações › Encaminhamento › encaminhar tudo para o Gmail dono do servidor do SigoNet (o Google manda um código para confirmar).</li>
        <li>Quem recebe a CPFL no Outlook encaminha o e-mail para a conta dedicada (a Microsoft da empresa pode bloquear o encaminhamento automático para fora — aí é encaminhar manualmente).</li>
        <li>A resposta automática sai do Gmail do servidor e vai para quem encaminhou.</li></ol></details>`;
    SN.$('#cxSalvar').onclick = async () => { try { await SN.api('CPFL_EMAIL_CONFIG', { endereco: SN.$('#cxEnd').value.trim() }); SN.toast('Endereço salvo.', 'ok'); pintarCaixa(); } catch (e) { SN.toast(e.message, 'erro'); } };
  };
  // Confirmação do resultado que o técnico escolheu na OS (Preventiva / Improdutiva / Acompanhamento).
  const CONCLUIDOS = ['CONCLUIDO_TECNICO', 'FECHADO'];
  const gravarConfirmacao = (r, c, res) => {
    const u = (SN.usuario() || {}).nome || '', quando = (c.tempos && (c.tempos.conclusaoTecnica || c.tempos.chegada)) || SN.agora();
    Object.assign(r, { resultado: res, resultado_tecnico: c.cpfl.resultado, confirmado: { por: u, ts: SN.agora() }, status: r.status === 'CANCELADO' ? r.status : 'CONCLUIDO',
      equipe: C.equipeDe(c.empresa || r.equipe || ''), data_atuacao: SN.dataIsoLocal(new Date(quando)), editado: true });
    c.cpfl.confirmado = { por: u, ts: SN.agora(), resultado: res };
    hist(r, res === c.cpfl.resultado ? 'RESULTADO CONFIRMADO' : 'RESULTADO CORRIGIDO', (res === c.cpfl.resultado ? '' : 'técnico: ' + C.RESULTADOS[c.cpfl.resultado].rot + ' → ') + C.RESULTADOS[res].rot);
    SN.hist(c, 'Resultado CPFL ' + (res === c.cpfl.resultado ? 'confirmado' : 'corrigido') + ' pela gestão', C.RESULTADOS[res].rot);
    SN.log('CPFL_CONFIRMAR', r.id, res);
  };
  const confirmarTecnicos = async () => {
    const l = lista().filter(doTecnico).sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
    if (!l.length) return;
    const linha = r => { const c = chamadoDe(r), concl = CONCLUIDOS.includes(c.status), res = c.cpfl.resultado;
      return `<tr data-id="${esc(r.id)}"><td class="nowrap">${dia(r.data)} ${esc(r.hora || '')}<div class="muted">${esc(tipoRot(r.tipo))} · ${esc(numTxt(r))}</div></td>
        <td>${esc(r.cidade || '')}<div class="muted">${esc(r.endereco || '')}</div></td>
        <td><a href="#/chamado/${esc(c.id)}">${esc(c.id)}</a><div>${SN.badgeStatus(c.status)}</div><div class="muted">${esc(c.empresa || '')} · ${esc(c.tecnico || '')}</div></td>
        <td><b>${esc(C.RESULTADOS[res].rot)}</b><div class="muted">${SN.dt(c.cpfl.resultadoEm)}</div>${c.rfo && (c.rfo.solucao || c.rfo.obs) ? `<div class="muted">${esc([c.rfo.solucao, c.rfo.obs].filter(Boolean).join(' · ').slice(0, 140))}</div>` : ''}</td>
        <td>${concl ? `<div class="acoes" style="gap:6px;min-width:220px"><button class="btn sm ok" data-cfok="${esc(r.id)}">✔ Confirmar ${esc(C.RESULTADOS[res].rot)}</button>
          <select class="inp" data-cfcorr="${esc(r.id)}" style="max-width:190px"><option value="">Corrigir para…</option>${Object.entries(C.RESULTADOS).filter(([k]) => k !== res).map(([k, v]) => `<option value="${k}">${v.rot}</option>`).join('')}</select></div>`
          : '<span class="small muted">o técnico ainda não concluiu o atendimento</span>'}</td></tr>`; };
    await SN.modal({ titulo: `Confirmar resultado · ${l.length} acompanhamento(s)`, largo: true, botoes: [{ rot: 'Fechar', valor: null }],
      corpo: `<p class="small">O técnico informou o resultado na OS. Confira o atendimento (abra o chamado para ver fotos e relatório) e confirme, ou corrija.</p>
        <div class="tabela-wrap"><table class="tab small"><thead><tr><th>Agendamento</th><th>Onde</th><th>Chamado</th><th>Informado pelo técnico</th><th></th></tr></thead><tbody>${l.map(linha).join('')}</tbody></table></div>`,
      aoAbrir: m => {
        const tirar = id => { const tr = m.querySelector(`tr[data-id="${CSS.escape(id)}"]`); if (tr) tr.remove(); if (!m.querySelector('tbody tr')) SN.$('[data-x]', m).click(); };
        const fazer = (id, res) => { const r = lista().find(x => x.id === id), c = r && chamadoDe(r); if (!c) return; gravarConfirmacao(r, c, res || c.cpfl.resultado); SN.salvar(); SN.toast('Resultado ' + (res && res !== c.cpfl.resultado ? 'corrigido' : 'confirmado') + '.', 'ok'); tirar(id); };
        SN.$$('[data-cfok]', m).forEach(b => b.onclick = () => fazer(b.dataset.cfok));
        SN.$$('[data-cfcorr]', m).forEach(sl => sl.onchange = () => { if (sl.value) fazer(sl.dataset.cfcorr, sl.value); });
      } });
  };
  // Recebidas por e-mail: a gestão decide (decisão do usuário: o SigoNet não abre chamado sozinho).
  const conferirEmails = async () => {
    const l = lista().filter(r => r.a_conferir).sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
    if (!l.length) return;
    const linha = r => `<tr data-id="${esc(r.id)}"><td class="nowrap">${dia(r.data)} ${esc(r.hora || '')}</td><td>${esc(tipoRot(r.tipo))}</td><td class="mono">${esc(numTxt(r))}</td>
      <td>${esc(r.cidade || '')}<div class="muted">${esc(r.endereco || '')}${r.bairro ? ' – ' + esc(r.bairro) : ''}</div></td>
      <td>${r.rede ? (r.rede.tem ? `<span style="color:var(--ok,#15803d)">✔ ${SN.num(r.rede.metros)} m de cabo nosso${r.rede.caixas ? ' · ' + r.rede.caixas + ' caixa(s)' : ''}</span><div class="muted">${(r.rede.cabos || []).slice(0, 3).map(esc).join(', ')}</div>` : '✖ sem rede nossa') : '<span style="color:#b45309">a conferir (rua não localizada)</span>'}</td>
      <td class="small muted">${esc(((r.email || {}).de) || '')}</td>
      <td><div class="acoes" style="gap:6px;min-width:220px"><button class="btn sm ${r.rede && r.rede.tem ? 'prim' : ''}" data-cxesteira="${esc(r.id)}">Acompanhar</button><button class="btn sm" data-cxnao="${esc(r.id)}">Não acompanhar</button></div></td></tr>`;
    await SN.modal({ titulo: `Recebidas por e-mail · ${l.length} a conferir`, largo: true, botoes: [{ rot: 'Fechar', valor: null }],
      corpo: `<p class="small">Conferidas na rede GeoGrid pela rua informada. "Acompanhar" guarda na agenda; a atividade entra na Esteira quando você despachar.</p>
        <div class="tabela-wrap"><table class="tab small"><thead><tr><th>Data</th><th>Tipo</th><th>Notificação</th><th>Onde</th><th>Nossa rede</th><th>Encaminhado por</th><th></th></tr></thead><tbody>${l.map(linha).join('')}</tbody></table></div>`,
      aoAbrir: m => {
        const tirar = id => { const tr = m.querySelector(`tr[data-id="${CSS.escape(id)}"]`); if (tr) tr.remove(); if (!m.querySelector('tbody tr')) SN.$('[data-x]', m).click(); };
        SN.$$('[data-cxesteira]', m).forEach(b => b.onclick = async () => { const r = lista().find(x => x.id === b.dataset.cxesteira); if (!r) return; b.disabled = true;
          r.a_conferir = false; hist(r, 'CONFERIDA', 'acompanhar'); SN.salvar(); SN.toast('Na agenda. Despache quando for a hora.', 'ok'); tirar(r.id); });
        SN.$$('[data-cxnao]', m).forEach(b => b.onclick = () => { const r = lista().find(x => x.id === b.dataset.cxnao); if (!r) return;
          r.a_conferir = false; hist(r, 'CONFERIDA', 'não acompanhar'); SN.salvar(); tirar(r.id); });
      } });
  };
  const htmlParaTexto = h => {
    const d = new DOMParser().parseFromString(h, 'text/html');
    d.querySelectorAll('script,style').forEach(x => x.remove());
    d.querySelectorAll('td,th').forEach(x => x.append('\t')); d.querySelectorAll('tr,p,div,br,li,h1,h2,h3,h4').forEach(x => x.append('\n'));
    return (d.body ? d.body.textContent : '').replace(/ /g, ' ').replace(/[ ]{2,}/g, ' ').replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n').trim();
  };
  // .eml: cabeçalho (assunto) + corpo (texto ou HTML; quoted-printable/base64; utf-8/latin1).
  const lerEml = bruto => {
    const dec2047 = v => String(v || '').replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (x, cs, enc, txt) => { try {
      const bytes = enc.toUpperCase() === 'B' ? Uint8Array.from(atob(txt), c => c.charCodeAt(0)) : Uint8Array.from(txt.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (y, hx) => String.fromCharCode(parseInt(hx, 16))), c => c.charCodeAt(0));
      return new TextDecoder(cs).decode(bytes); } catch (e) { return txt; } });
    const parte = txt => { const i = txt.search(/\r?\n\r?\n/); return { cab: i < 0 ? txt : txt.slice(0, i), corpo: i < 0 ? '' : txt.slice(i).replace(/^\r?\n\r?\n/, '') }; };
    const campo = (cab, k) => { const m = new RegExp('^' + k + ':\\s*((?:.*)(?:\\r?\\n[ \\t].*)*)', 'im').exec(cab); return m ? m[1].replace(/\r?\n[ \t]+/g, ' ').trim() : ''; };
    const decodifica = (cab, corpo) => {
      const te = campo(cab, 'Content-Transfer-Encoding').toLowerCase(), cs = (/charset="?([^";\s]+)/i.exec(campo(cab, 'Content-Type')) || [])[1] || 'utf-8';
      let bytes;
      if (te === 'base64') bytes = Uint8Array.from(atob(corpo.replace(/\s+/g, '')), c => c.charCodeAt(0));
      else if (te === 'quoted-printable') bytes = Uint8Array.from(corpo.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (y, hx) => String.fromCharCode(parseInt(hx, 16))), c => c.charCodeAt(0));
      else return corpo;
      try { return new TextDecoder(cs).decode(bytes); } catch (e) { return new TextDecoder('utf-8').decode(bytes); } };
    const achar = (cab, corpo, prof) => { // procura text/plain e text/html nas partes
      const ct = campo(cab, 'Content-Type'), bd = (/boundary="?([^";]+)"?/i.exec(ct) || [])[1], out = {};
      if (/multipart\//i.test(ct) && bd && prof < 5) {
        corpo.split('--' + bd).slice(1).forEach(pt => { if (/^--/.test(pt)) return; const x = parte(pt.replace(/^\r?\n/, '')), r = achar(x.cab, x.corpo, prof + 1); out.plain = out.plain || r.plain; out.html = out.html || r.html; });
      } else if (/text\/html/i.test(ct)) out.html = decodifica(cab, corpo); else if (!ct || /text\/plain/i.test(ct)) out.plain = decodifica(cab, corpo);
      return out; };
    const x = parte(bruto), assunto = dec2047(campo(x.cab, 'Subject')), r = achar(x.cab, x.corpo, 0);
    return 'Assunto: ' + assunto + '\n\n' + (r.html ? htmlParaTexto(r.html) : r.plain || '');
  };
  const importarNotificacoes = async files => {
    const textos = [], linhasExcel = [];
    const fim = SN.cobrirCarregando('Lendo os arquivos…');
    try {
      for (const f of files) {
        if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') textos.push({ texto: await textoPdf(f), fonte: f.name, arquivo: f });
        else if (/\.(eml)$/i.test(f.name) || f.type === 'message/rfc822') textos.push({ texto: lerEml(await f.text()), fonte: f.name, arquivo: f });
        else if (/\.(html?)$/i.test(f.name)) textos.push({ texto: htmlParaTexto(await f.text()), fonte: f.name, arquivo: f });
        else if (/\.txt$/i.test(f.name)) textos.push({ texto: await f.text(), fonte: f.name, arquivo: f });
        else {
          const abas = await lerPlanilhaArquivo(f);
          for (const a of abas) {
            const cab = (a.linhas[0] || []).map(C.norm);
            if (cab.includes('NOTIFICACAO') && cab.includes('DATA')) { C.lerPlanilha(a.linhas).forEach(r => linhasExcel.push({ ...r, arquivo: f, fonte: f.name + ' · ' + a.nome })); continue; }
            // Planilha qualquer (ex.: a programação semanal exportada): vira texto com tabulação e passa pela mesma leitura do e-mail.
            textos.push({ texto: a.linhas.map(l => l.map(v => v instanceof Date ? v.toLocaleDateString('pt-BR') : String(v)).join('\t')).join('\n'), fonte: f.name + ' · ' + a.nome, arquivo: f });
          }
        }
      }
    } finally { fim(); }
    await lerTextos(textos, linhasExcel);
  };
  // Texto(s) → notificações → localizar ruas → conferir na rede → conferência.
  const lerTextos = async (textos, extras) => {
    const cids = cidadesConhecidas(), cands = (extras || []).slice();
    textos.forEach(t => { let l = C.extrairEmail(t.texto, { cidades: cids }); if (!l.length || (l.length === 1 && !l[0].data && !l[0].endereco)) l = [C.extrair(t.texto, { cidades: cids })];
      l.forEach(r => cands.push({ ...r, arquivo: t.arquivo, fonte: t.fonte, trecho: t.texto.replace(/\s+/g, ' ').slice(0, 300) })); });
    if (!cands.length) return SN.toast('Não achei notificação (data, número ou endereço).', 'erro');
    await conferirRede(cands);
    conferir(cands);
  };
  // ─────────── Localizar a rua e conferir se passa na nossa rede ───────────
  const ruaPorExtenso = C.ruaPorExtenso;
  // Ruas já localizadas ficam guardadas neste aparelho: a mesma rua de novo não espera o serviço de
  // endereços (limite de 1 consulta por segundo). Só o trecho simplificado (~5 m) entra no cache.
  const GEO_CHAVE = 'sigonet_v2_geo_ruas', geoCache = (() => { try { return JSON.parse(localStorage.getItem(GEO_CHAVE) || '{}'); } catch (e) { return {}; } })();
  const geoGuardar = (k, v) => { geoCache[k] = v; try { const ks = Object.keys(geoCache); if (ks.length > 600) ks.slice(0, ks.length - 600).forEach(x => delete geoCache[x]); localStorage.setItem(GEO_CHAVE, JSON.stringify(geoCache)); } catch (e) { } };
  const localizarRua = async (rua, cidade) => {
    const k = SN.normal(rua + '|' + cidade); if (geoCache[k] !== undefined) return geoCache[k];
    // 1º com o tipo da via ("Rua …"); se não achar, só o nome — a notificação às vezes escreve "R." numa avenida.
    const nome = C.ruaPorExtenso(rua), semTipo = C.ruaSemTipo(rua);
    const buscar = async rr => { const r = await (await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&limit=8&countrycodes=br&street=' + encodeURIComponent(rr) + '&city=' + encodeURIComponent(cidade))).json();
      await new Promise(ok => setTimeout(ok, 1100)); return r; }; // limite do serviço: 1 consulta por segundo
    let res = null;
    try {
      let l = await buscar(nome); if (!l.length && semTipo !== nome) l = await buscar(semTipo);
      const trechos = [];
      l.filter(x => x.category === 'highway' || x.class === 'highway').forEach(x => { const g = x.geojson || {};
        if (g.type === 'LineString') trechos.push(g.coordinates.map(c => [c[1], c[0]]));
        else if (g.type === 'MultiLineString') g.coordinates.forEach(cs => trechos.push(cs.map(c => [c[1], c[0]]))); });
      if (trechos.length) res = { trechos, nome: l[0].display_name };
      else if (l[0]) res = { trechos: [[[Number(l[0].lat), Number(l[0].lon)]]], nome: l[0].display_name, aprox: true };
    } catch (e) { return null; } // falha de rede: não guarda, tenta de novo da próxima vez
    if (res && window.REDE) res.trechos = res.trechos.map(t => t.length > 2 ? REDE.simplificar(t, 5).map(p => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6]) : t);
    geoGuardar(k, res); return res;
  };
  const conferirRede = async cands => {
    const ind = SN.rede ? await SN.rede.indice().catch(() => null) : null, fim = SN.cobrirCarregando('Conferindo na nossa rede…'), passo = t => { const p = document.querySelector('.carregando-sobre p'); if (p) p.textContent = t; };
    try {
      for (let i = 0; i < cands.length; i++) {
        const c = cands[i], cid = ind && window.REDE ? REDE.acharCidade(ind, c.cidade) : null;
        if (!ind) { c.redeTxt = 'rede GeoGrid não importada — sem conferência'; c.semConferencia = true; continue; }
        if (!cid) { c.foraArea = true; c.redeTxt = 'fora da nossa área (sem rede nesta cidade)'; continue; }
        passo(`Conferindo ${i + 1}/${cands.length}: ${c.endereco || c.cidade}…`);
        let trechos = (c.pontos || []).length ? [c.pontos] : null;
        if (!trechos && c.endereco) { const g = await localizarRua(c.endereco, c.cidade); if (g) { trechos = g.trechos; c.ruaAprox = !!g.aprox; } }
        if (!trechos) { c.redeTxt = c.endereco ? 'rua não localizada — confira no mapa' : 'sem endereço'; continue; }
        const d = await SN.rede.cidade(cid.cidade), r = C.naRede(trechos, d, REDE);
        c.rede = r && { tem: r.tem, metros: r.metros, ruaM: r.ruaM, cabos: r.cabos.slice(0, 5), caixas: r.caixas.length };
        if (!(c.pontos || []).length) c.pontos = trechos.reduce((a, t) => a.length >= 40 ? a : a.concat(t.slice(0, 40 - a.length)), []).map(p => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6]);
        c.pontos = c.pontos.length > 1 && trechos.length > 1 ? [c.pontos[0]] : c.pontos; // vários trechos da rua: guarda só o 1º ponto (o mapa mostra o marcador)
        c.redeTxt = !r ? '' : r.tem ? `✔ ${SN.num(r.metros)} m de cabo nosso${r.caixas.length ? ` · ${r.caixas.length} caixa(s)` : ''}${c.ruaAprox ? ' (rua aproximada)' : ''}` : `✖ sem rede nossa${c.ruaAprox ? ' (rua aproximada)' : ` em ${SN.num(r.ruaM)} m de rua`}`;
      }
    } finally { fim(); }
  };
  // Conferência: cada notificação lida, editável, antes de entrar no SigoNet e na Esteira.
  const conferir = async cands => {
    // Mesma notificação: já cadastrada no SigoNet ou repetida neste lote.
    cands.forEach((c, i) => { const id = c.seq || c.origem_formato === 'COMUNICADO' ? C.chaveRua(c) : C.chave(c);
      c.dups = mesmaNotificacao(c.numero, null); c.jaExiste = lista().some(x => x.id === id); // inclui o mesmo registro (e-mail recebido de novo) c.dupLote = cands.slice(0, i).some(o => numChave(o.numero) && numChave(o.numero) === numChave(c.numero) && C.norm(o.endereco) === C.norm(c.endereco));
      c.temChamado = c.dups.some(x => x.id_chamado); });
    const tem = c => !!((c.rede && c.rede.tem) || c.semConferencia) && !c.temChamado && !c.dupLote;
    const linha = (c, i) => `<tr data-i="${i}" class="${c.foraArea ? 'muted' : ''}"><td><input type="checkbox" data-k="ok" ${c.foraArea ? '' : 'checked'}></td>
      <td class="small" style="min-width:170px">${c.dups && c.dups.length ? `<div style="color:#b45309;margin-bottom:4px">${dupTxt(c.dups)}</div>` : ''}${c.dupLote ? '<div style="color:#b45309;margin-bottom:4px">⚠️ Repetida neste e-mail</div>' : ''}${c.redeTxt ? `<span style="color:${tem(c) ? 'var(--ok,#15803d)' : c.foraArea ? 'inherit' : '#b45309'}">${esc(c.redeTxt)}</span>` : ''}${c.rede && c.rede.cabos.length ? `<div class="muted">${c.rede.cabos.map(esc).join(', ')}</div>` : ''}</td>
      <td><select class="inp" data-k="tipo">${Object.entries(C.TIPOS).map(([k, v]) => `<option value="${k}" ${c.tipo === k ? 'selected' : ''}>${v.rot}</option>`).join('')}</select></td>
      <td><input class="inp" data-k="numero" value="${esc(c.numero)}" style="width:110px"></td>
      <td><input class="inp" type="date" data-k="data" value="${esc(c.data)}"></td><td><input class="inp" type="time" data-k="hora" value="${esc(c.hora)}"></td>
      <td><input class="inp" data-k="cidade" value="${esc(c.cidade)}" style="width:120px"></td><td><input class="inp" data-k="endereco" value="${esc(c.endereco)}"></td>
      <td><input class="inp" data-k="coord" value="${esc((c.pontos || []).length === 1 ? c.pontos[0].join(', ') : (c.pontos || []).length ? c.pontos.length + ' pontos da rua' : '')}" placeholder="lat, lng"></td>
      <td class="small muted" title="${esc(c.trecho || '')}">${esc(c.fonte || '')}${c.postes ? ' · ' + c.postes + ' postes' : ''}${c.acao_cpfl ? ' · ' + esc(c.acao_cpfl) : ''}</td></tr>`;
    const nTem = cands.filter(tem).length, nFora = cands.filter(c => c.foraArea).length;
    const res = await SN.modal({ titulo: `Conferir ${cands.length} notificação(ões)`, largo: true,
      corpo: `<p class="small"><b>${nTem}</b> com rede nossa · <b>${cands.length - nTem - nFora}</b> sem rede nossa ou a conferir · <b>${nFora}</b> fora da nossa área (desmarcadas).
        Guardar só coloca na agenda: a atividade entra na Esteira quando você despachar.
        Passe o mouse no arquivo para ver o trecho lido. "Pontos da rua" = traçado da rua usado na conferência.</p>
        <div class="tabela-wrap"><table class="tab small cp-conf"><thead><tr><th title="Guardar no SigoNet">Guardar</th><th>Nossa rede</th><th>Tipo</th><th>Notificação</th><th>Data</th><th>Hora</th><th>Cidade</th><th>Endereço</th><th>Coordenadas</th><th>Origem</th></tr></thead><tbody>${cands.map(linha).join('')}</tbody></table></div>
        <div class="acoes" style="margin-top:8px"><button class="btn sm" id="cResumo" type="button">📋 Copiar resumo (tem / não tem rede) para responder o e-mail</button></div>`,
      aoAbrir: m => { SN.$('#cResumo', m).onclick = () => { const txt = resumoRede(cands); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => SN.toast('Resumo copiado: cole na resposta do e-mail.', 'ok'), () => SN.pedirTexto('Resumo para o e-mail', 'Copie o texto abaixo', false)); }; },
      botoes: [{ rot: 'Cancelar', valor: null }, { rot: 'Guardar', cls: 'prim', acao: m => {
        const out = SN.$$('tbody tr', m).map(tr => { const g = k => SN.$(`[data-k="${k}"]`, tr); return { i: +tr.dataset.i, ok: g('ok').checked, tipo: g('tipo').value, numero: g('numero').value.trim(), data: g('data').value, hora: g('hora').value,
          cidade: g('cidade').value.trim(), endereco: g('endereco').value.trim(), coord: g('coord').value }; }).filter(x => x.ok);
        if (out.some(x => !x.data || !x.cidade)) { SN.toast('Cada notificação marcada precisa de data e cidade.', 'erro'); return false; }
        return { linhas: out }; } }] });
    if (!res) return;
    const fim = SN.cobrirCarregando('Guardando…'), anexos = new Map();
    try {
      let inc = 0;
      for (const x of res.linhas) {
        const c = cands[x.i];
        if (c.arquivo && !anexos.has(c.arquivo)) { try { anexos.set(c.arquivo, await SN.guardarDataUrl(await dataUrlDe(c.arquivo), c.arquivo.name, 'arquivo', 'cpfl')); } catch (e) { anexos.set(c.arquivo, null); } }
        const ax = c.arquivo ? anexos.get(c.arquivo) : null;
        const lidos = /pontos da rua/.test(x.coord) ? c.pontos : C.pontosDe(x.coord);
        const reg = { tipo: x.tipo, numero: x.numero, data: x.data, hora: x.hora, cidade: x.cidade, endereco: x.endereco, bairro: c.bairro || '', pontos: lidos || [], prazo: c.prazo || '', data_fim: c.data_fim || '',
          status: c.status || 'PLANEJADO', equipe: c.equipe || '', resultado: c.resultado || '', postes: c.postes || '', acao_cpfl: c.acao_cpfl || '', obs: c.obs || '',
          rede: c.rede || null, origem: /\.pdf$/i.test(c.fonte || '') ? 'PDF' : /e-mail|\.eml/i.test(c.fonte || '') ? 'EMAIL' : 'EXCEL', anexos: ax ? [ax] : [] };
        reg.id = c.seq || c.origem_formato === 'COMUNICADO' ? C.chaveRua(reg) : C.chave(reg);
        const antes = lista().find(r => r.id === reg.id);
        mesclar([reg], reg.origem); if (!antes) inc++;
        const r = lista().find(y => y.id === reg.id);
        if (ax && !(r.anexos || []).some(a => a.id === ax.id)) r.anexos = (r.anexos || []).concat([ax]);
        if (c.rede) r.rede = c.rede;
      }
      SN.log('CPFL_NOTIFICACOES', '', `${res.linhas.length} lidas · ${inc} novas`); SN.salvar();
      SN.toast(`${inc} notificação(ões) nova(s) na agenda. Despache as que forem acompanhar.`, 'ok');
      st.aba = 'MAPA'; st.per = 'tudo'; pintar();
    } finally { fim(); }
  };
  const resumoRede = C.resumoRede;
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
  // Menu (Operação, depois da Esteira) e nome da tela em Cadastros e Acessos.
  SN.TELAS.cpfl = 'Acompanhamentos CPFL (troca de poste, limpeza…)';
  const i = SN.MENU.findIndex(m => m.tela === 'chamados');
  SN.MENU.splice(i >= 0 ? i + 1 : SN.MENU.length, 0, { tela: 'cpfl', rot: 'Acompanhamentos CPFL', ico: '⚡', href: '#/cpfl' });
})();
