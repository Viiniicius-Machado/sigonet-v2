// SIGONET V2 — Novos projetos (tela prj_planejamento): projetar, orçar, aprovar e gerar a obra.
//
// Pedido do usuário (2026-10-12). Fluxo:
//   1. Informações e traçado — dados iniciais, origem (CEO da Base KML, coordenada ou clique) e
//      destino (endereço, coordenada ou clique). O SigoNet traça pelas ruas (OSRM a pé, sem mão de
//      direção), põe os postes pelo vão médio e nos cantos, marca encabeçamentos, RT, CEO/CTO e cliente
//      no padrão IOP.2.5.1.001R01 (projeto-regras.js). O projetista confere no satélite: arrasta,
//      inclui e apaga postes, troca encabeçamento/passagem e coloca elementos. A contagem exata de
//      postes vem do Google Earth: dá para importar o KMZ com os postes marcados (ícones do padrão).
//   2. Orçamento — materiais (preço do catálogo vigente) e LPU (comum ou crítico), com ajuste manual
//      de cada quantidade e a memória de cálculo. "Enviar para aprovação" congela o orçamento.
//   3. Aprovação — só Gestor/Gerente. Escolhe o prestador ou a NTT (NETTURBO), a data e aprova: o KMZ
//      vai para o Drive, o desenho em PDF (sem valores) vira anexo e nasce a obra (programa PROJETO,
//      telas-programadas.js) na conta escolhida, com materiais e LPU estimada em QUANTIDADES.
// A equipe vê o pacote na OS (SN.prj.htmlPacoteTecnico) e aponta como na Melhoria.
(() => {
  const esc = SN.esc, PR = window.PRJ;
  const TELA = 'prj_planejamento';
  const estado = {}; // por projeto: aba, modo do mapa, passos da rota (nomes de rua), seleção
  let lista = { status: '', q: '' };
  const gestor = () => SN.ehGestor();
  const projetos = () => SN.db.projetos || (SN.db.projetos = []);
  const achar = id => projetos().find(p => p.id === id);
  const editavel = p => ['RASCUNHO', 'REPROVADO'].includes(p.status);
  const hist = (p, acao, detalhe) => (p.historico = p.historico || []).push({ ts: SN.agora(), usuario: (SN.usuario() || {}).nome || '', acao, detalhe: detalhe || '' });
  const postesDe = p => PR.decodificarPostes(p.postes || '', p.params);
  const params = p => Object.assign({}, PR.PARAMS_PADRAO, p.params || {});
  const fmtM = v => SN.num(Math.round(v || 0)) + ' m';

  // ─────────── Preços (catálogo vigente) e unidades ───────────
  const CABOS_MAT = Object.values(PR.CABOS).map(c => c.mat).filter(Boolean);
  const unMat = cod => CABOS_MAT.includes(cod) || cod === PR.CORDOALHA ? 'm' : cod === PR.FITA.cod ? 'rolo 25 m' : cod === PR.FIO_ESPINAR ? 'un (100 m)' : 'un';
  const descMat = cod => (SN.material(cod) || {}).d || cod;
  const precoMat = cod => SN.precoMaterial(cod);
  const precoLpu = (cod, critico) => { const i = SN.itemLpu(cod) || {}; return critico && i.valorCritico != null ? i.valorCritico : (i.valor || 0); };
  // Orçamento atual (automático + ajustes), com valores.
  const orcar = p => {
    const q = PR.quantidades({ ...p, postes: postesDe(p) }), aj = p.ajustes || {}, crit = !!params(p).critico;
    const mat = PR.aplicarAjustes(q.mat, aj.mat), lpu = PR.aplicarAjustes(q.lpu, aj.lpu);
    const materiais = Object.keys(mat).sort().map(cod => { const unit = precoMat(cod); return { cod, desc: descMat(cod), un: unMat(cod), qtd: mat[cod], unit, total: Math.round(unit * mat[cod] * 100) / 100, auto: q.mat[cod], ajustado: aj.mat && cod in aj.mat }; });
    const itens = Object.keys(lpu).sort().map(cod => { const it = SN.itemLpu(cod) || {}, unit = precoLpu(cod, crit); return { cod, desc: it.desc || cod, medida: it.medida || '', qtd: lpu[cod], unit, total: Math.round(unit * lpu[cod] * 100) / 100, auto: q.lpu[cod], ajustado: aj.lpu && cod in aj.lpu }; });
    const totalMat = materiais.reduce((s, x) => s + x.total, 0), totalLpu = itens.reduce((s, x) => s + x.total, 0);
    return { materiais, lpu: itens, totalMat: Math.round(totalMat * 100) / 100, totalLpu: Math.round(totalLpu * 100) / 100, total: Math.round((totalMat + totalLpu) * 100) / 100, critico: crit, memoria: q.memoria, metricas: q.metricas };
  };
  // Itens da LPU fora da conta escolhida (aviso: a LPU da obra só aceita os da conta).
  const foraDaConta = (p, o) => { if (!p.conta) return []; const ok = new Set(SN.itensDaConta(p.conta).map(i => i.cod)); return o.lpu.filter(x => !ok.has(x.cod)).map(x => x.cod); };

  // ─────────── Gravação ───────────
  const salvar = SN.debounce(() => { try { SN.salvar(); } catch (e) { } }, 600);
  const mudou = (p, sem) => { p.atualizadoEm = SN.agora(); p.atualizadoPor = (SN.usuario() || {}).nome || ''; if (!sem) salvar(); };

  // ═══════════════════════════ Lista ═══════════════════════════
  SN.rota('/prj/projetos', () => pintarLista(), { tela: TELA });
  const pintarLista = () => {
    const q = SN.normal(lista.q), todos = projetos().slice().sort((a, b) => String(b.atualizadoEm || b.criadoEm).localeCompare(String(a.atualizadoEm || a.criadoEm)));
    const vis = todos.filter(p => (!lista.status || p.status === lista.status) && (!q || SN.normal([p.id, p.nome, p.cliente, p.cidade, p.pop, p.id_rota, p.criadoPor].join(' ')).includes(q)));
    const cont = st => todos.filter(p => p.status === st);
    const soma = arr => arr.reduce((s, p) => s + ((p.orcamento && p.orcamento.total) || 0), 0);
    const kpi = (rot, val, sub) => `<div class="kpi"><div class="rot">${rot}</div><div class="val">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
    SN.casca('prj_projetos', `
      <div class="cab-pagina"><div><h1>Novos projetos</h1><p>Desenhe o traçado no padrão construtivo, orce material e LPU e mande para aprovação. Aprovado, vira obra para o prestador ou a NTT — com KMZ, desenho, materiais e LPU estimada, sem valores.</p></div>
        <button class="btn prim" id="bNovoPrj">➕ Novo projeto</button></div>
      <div class="kpis-fin" style="margin-bottom:12px">
        ${kpi('Em rascunho', SN.num(cont('RASCUNHO').length + cont('REPROVADO').length), cont('REPROVADO').length ? cont('REPROVADO').length + ' reprovado(s) para ajustar' : 'em desenho / orçamento')}
        ${kpi('Aguardando aprovação', SN.num(cont('AGUARDANDO_APROVACAO').length), SN.brl(soma(cont('AGUARDANDO_APROVACAO'))))}
        ${kpi('Aprovados', SN.num(cont('APROVADO').length), SN.brl(soma(cont('APROVADO'))) + ' orçado')}
      </div>
      <div class="card card-filtros"><div class="filtros">
        <select class="inp" id="fSt"><option value="">Todos os status</option>${Object.entries(PR.STATUS).map(([k, v]) => `<option value="${k}" ${lista.status === k ? 'selected' : ''}>${v.rot}</option>`).join('')}</select>
        <input class="inp busca" id="fQ" placeholder="Buscar (projeto, cliente, cidade, obra…)" value="${esc(lista.q)}"></div></div>
      <div class="card"><div class="card-tit"><h3>Projetos (${vis.length})</h3></div>
        ${vis.length ? `<div class="tabela-wrap"><table class="tab"><thead><tr><th>Projeto</th><th>Onde</th><th>Traçado</th><th class="num">Orçamento</th><th>Status</th><th>Obra</th><th></th></tr></thead><tbody>
        ${vis.map(p => { const m = PR.metricas({ ...p, postes: postesDe(p) }), cab = PR.CABOS[params(p).cabo] || {};
          return `<tr><td><b>${esc(p.nome || '(sem nome)')}</b><div class="small muted mono">${esc(p.id)}</div>${p.cliente ? `<div class="small muted">${esc(p.cliente)}</div>` : ''}</td>
          <td>${esc(p.cidade || '')}<div class="small muted">${p.pop ? esc(p.pop) + ' · ' : ''}conta ${esc(String(p.conta || '—').slice(-4))}</div></td>
          <td class="small">${m.postes ? `${esc(cab.rot || '')}<div class="muted">${fmtM(m.tracado)} · ${m.postes} postes · cabo ${fmtM(m.cabo)}</div>` : '<span class="muted">sem traçado</span>'}</td>
          <td class="num nowrap">${p.orcamento ? SN.brl(p.orcamento.total) : `<span class="muted">${SN.brl(orcar(p).total)}</span>`}</td>
          <td>${SN.badge(PR.STATUS, p.status)}${p.status === 'REPROVADO' && p.reprovacao ? `<div class="small muted">${esc(p.reprovacao.motivo)}</div>` : ''}</td>
          <td class="small">${p.id_rota ? `<a href="#/prj/planejamento">${esc(p.id_rota)}</a><div class="muted">${esc((p.aprovacao || {}).prestador || '')}</div>` : '—'}</td>
          <td><div class="acoes" style="gap:6px"><a class="btn sm prim" href="#/prj/projeto/${esc(p.id)}">Abrir</a>${editavel(p) && p.status === 'RASCUNHO' ? ` <button class="btn sm perigo" data-exprj="${esc(p.id)}">Excluir</button>` : ''}</div></td></tr>`; }).join('')}
        </tbody></table></div>` : `<p class="muted">${todos.length ? 'Nenhum projeto neste filtro.' : 'Nenhum projeto ainda. Use "Novo projeto".'}</p>`}</div>`);
    SN.$('#fSt').onchange = e => { lista.status = e.target.value; pintarLista(); };
    SN.$('#fQ').oninput = SN.debounce(e => { lista.q = e.target.value; pintarLista(); SN.$('#fQ').focus(); }, 300);
    SN.$('#bNovoPrj').onclick = async () => {
      try {
        const id = await SN.novoId('PRJ'), u = SN.usuario() || {};
        const p = { id, nome: '', cliente: '', cidade: '', pop: '', conta: '', solicitante: '', obs: '', status: 'RASCUNHO', params: { ...PR.PARAMS_PADRAO, origemTipo: 'CEO_EXIST', destinoTipo: 'CTO_NOVA' },
          origem: null, destino: null, vias: [], postes: '', elementos: [], ruas: [], ajustes: { mat: {}, lpu: {} }, criadoEm: SN.agora(), criadoPor: u.nome || '', historico: [] };
        hist(p, 'CRIADO'); projetos().push(p); SN.log('PROJETO_CRIADO', id, ''); SN.salvar(); SN.navegar('#/prj/projeto/' + encodeURIComponent(id));
      } catch (e) { SN.toast(e.message, 'erro'); }
    };
    SN.$$('[data-exprj]').forEach(b => b.onclick = async () => {
      if (!await SN.confirmar('Excluir projeto', 'Excluir o rascunho ' + b.dataset.exprj + '?', 'Excluir', 'perigo')) return;
      SN.db.projetos = projetos().filter(p => p.id !== b.dataset.exprj); SN.log('PROJETO_EXCLUIDO', b.dataset.exprj, ''); SN.salvar(); pintarLista();
    });
  };

  // ═══════════════════════════ Projeto ═══════════════════════════
  SN.rota('/prj/projeto/:id', id => abrirProjeto(id), { tela: TELA });
  const E = id => estado[id] || (estado[id] = { aba: 'DESENHO', modo: '', sel: null });
  const abrirProjeto = id => {
    const p = achar(id);
    if (!p) { SN.toast('Projeto não encontrado.', 'erro'); return SN.navegar('#/prj/projetos'); }
    const e = E(id), abas = [['DESENHO', '1 · Informações e traçado'], ['ORCAMENTO', '2 · Orçamento'], ['APROVACAO', p.status === 'APROVADO' ? '3 · Aprovado · obra' : '3 · Aprovação']];
    SN.casca('prj_projetos', `
      <div class="cab-pagina"><div><a href="#/prj/projetos" class="small">← Projetos</a><h1 style="margin-top:4px">${esc(p.nome || 'Novo projeto')} <span class="small muted mono">${esc(p.id)}</span></h1>
        <p>${SN.badge(PR.STATUS, p.status)} ${p.cidade ? esc(p.cidade) + ' · ' : ''}${p.conta ? 'conta ' + esc(SN.contaTxt(p.conta)) : 'sem conta'}${p.criadoPor ? ' · criado por ' + esc(p.criadoPor) : ''}</p></div>
        <div class="acoes"><button class="btn" id="bKmz" title="KMZ no padrão construtivo (Google Earth)">⬇️ KMZ</button><button class="btn" id="bPdfEq" title="Desenho + materiais + LPU, sem valores">📄 PDF da equipe</button><button class="btn" id="bPdfOrc" title="Orçamento com valores (gestão)">📄 PDF do orçamento</button></div></div>
      ${p.status === 'REPROVADO' && p.reprovacao ? `<div class="aviso erro small" style="margin-bottom:10px">Reprovado por ${esc(p.reprovacao.por)} em ${SN.dt(p.reprovacao.ts)}: ${esc(p.reprovacao.motivo)}. Ajuste e envie de novo.</div>` : ''}
      ${!editavel(p) && p.status !== 'APROVADO' ? '<div class="aviso info small" style="margin-bottom:10px">Projeto enviado para aprovação: o traçado e o orçamento estão congelados. Para mudar, use "Voltar para rascunho" na aba Aprovação.</div>' : ''}
      <div class="abas">${abas.map(([k, r]) => `<button class="aba ${e.aba === k ? 'ativa' : ''}" data-abaprj="${k}">${r}</button>`).join('')}</div>
      <div id="prjCorpo"></div>`);
    SN.$$('[data-abaprj]').forEach(b => b.onclick = () => { e.aba = b.dataset.abaprj; abrirProjeto(id); });
    SN.$('#bKmz').onclick = () => baixarKmz(p).catch(err => SN.toast(err.message, 'erro'));
    SN.$('#bPdfEq').onclick = () => SN.abrirPdfDepois(() => pdfProjeto(p, false));
    SN.$('#bPdfOrc').onclick = () => SN.abrirPdfDepois(() => pdfProjeto(p, true));
    ({ DESENHO: pintarDesenho, ORCAMENTO: pintarOrcamento, APROVACAO: pintarAprovacao })[e.aba](p);
  };

  // ─────────── 1 · Informações e traçado ───────────
  const opt = (lista, sel) => lista.map(([v, r]) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(r)}</option>`).join('');
  const coordTxt = c => c ? `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}` : '';
  const lerCoord = t => { const m = String(t || '').trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)$/); return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null; };
  const pintarDesenho = p => {
    const e = E(p.id), o = params(p), ed = editavel(p), dis = ed ? '' : 'disabled';
    const contas = SN.db.contas.map(c => [c.codigo, SN.contaTxt(c.codigo)]);
    const cidades = [...new Set(projetos().map(x => x.cidade).concat(SN.db.chamados.map(c => c.cidade)).filter(Boolean))].sort();
    SN.$('#prjCorpo').innerHTML = `<div class="prj-grade">
      <div class="prj-lado">
        <div class="card"><h3>Informações iniciais</h3>
          <div class="campo"><label>Nome do projeto *</label><input class="inp" data-pf="nome" value="${esc(p.nome)}" placeholder="ex.: Rede Jd. América — atendimento Cliente X" ${dis}></div>
          <div class="campo"><label>Cliente / finalidade</label><input class="inp" data-pf="cliente" value="${esc(p.cliente)}" ${dis}></div>
          <div class="linha-form">
            <div class="campo"><label>Cidade *</label><input class="inp" data-pf="cidade" list="prjCid" value="${esc(p.cidade)}" ${dis}><datalist id="prjCid">${cidades.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
            <div class="campo"><label>POP</label><input class="inp" data-pf="pop" value="${esc(p.pop)}" ${dis}></div></div>
          <div class="campo"><label>Conta contábil *</label><select class="inp" data-pf="conta" ${dis}><option value="">Escolha…</option>${opt(contas, p.conta)}</select></div>
          <div class="campo"><label>Solicitante</label><input class="inp" data-pf="solicitante" value="${esc(p.solicitante)}" ${dis}></div>
          <div class="campo"><label>Observação para a equipe</label><textarea class="inp" data-pf="obs" ${dis}>${esc(p.obs || '')}</textarea></div>
        </div>
        <div class="card"><h3>Rede</h3>
          <div class="linha-form">
            <div class="campo"><label>Cabo</label><select class="inp" data-pp="cabo" ${dis}>${opt(Object.entries(PR.CABOS).map(([k, c]) => [k, c.rot]), o.cabo)}</select></div>
            <div class="campo"><label>Ancoragem</label><select class="inp" data-pp="ancoragem" ${dis}>${opt(Object.entries(PR.ANCORAGENS).map(([k, a]) => [k, a.rot]), o.ancoragem)}</select></div></div>
          <div class="linha-form">
            <div class="campo"><label>Vão médio (m)</label><input class="inp" type="number" min="15" max="80" data-pp="vao" data-num="1" value="${esc(o.vao)}" ${dis}></div>
            <div class="campo"><label>Encabeçar a cada (postes)</label><input class="inp" type="number" min="0" data-pp="encCada" data-num="1" value="${esc(o.encCada)}" ${dis}></div></div>
          <div class="linha-form">
            <div class="campo"><label>RT a cada (m · 0 = sem)</label><input class="inp" type="number" min="0" data-pp="rtCada" data-num="1" value="${esc(o.rtCada)}" ${dis}></div>
            <div class="campo"><label>Cabo por RT (m)</label><input class="inp" type="number" min="0" data-pp="rtMetros" data-num="1" value="${esc(o.rtMetros)}" ${dis}></div></div>
          <div class="linha-form">
            <div class="campo"><label>Sobra por emenda (m)</label><input class="inp" type="number" min="0" data-pp="pontaMetros" data-num="1" value="${esc(o.pontaMetros)}" ${dis}></div>
            <div class="campo"><label>Folga do cabo (%)</label><input class="inp" type="number" min="0" max="30" data-pp="folgaPct" data-num="1" value="${esc(o.folgaPct)}" ${dis}></div></div>
          <p class="small muted" style="margin:0">Mudou vão ou encabeçamento? Clique em "Traçar pelas ruas" de novo, ou ajuste os postes no mapa.</p>
        </div>
        <div class="card"><h3>Traçado</h3>
          <div class="campo"><label>Origem — ${esc((PR.ELEMENTOS[o.origemTipo] || {}).rot || '')}</label>
            <div class="prj-linha"><input class="inp" id="pOrig" value="${esc(p.origem ? (p.origem.txt || coordTxt(p.origem)) : '')}" placeholder="lat, lng" ${dis}>
              <button class="btn sm" data-modo="origem" ${dis} title="Clique no mapa">📍</button><button class="btn sm" id="bGeoCeo" ${dis} title="Caixa do GeoGrid mais perto do destino">🔎 GeoGrid</button><button class="btn sm" id="bBaseCeo" ${dis} title="CEO/CTO da Base KML da Preventiva">Base</button></div>
            <select class="inp" data-pp="origemTipo" style="margin-top:4px" ${dis}>${opt([['CEO_EXIST', 'Sai de CEO/CTO existente'], ['CEO_NOVA', 'Sai de CEO nova (sangria)'], ['', 'Sem emenda na origem']], o.origemTipo)}</select></div>
          <div class="campo"><label>Destino — endereço ou lat, lng</label>
            <div class="prj-linha"><input class="inp" id="pDest" value="${esc(p.destino ? (p.destino.txt || coordTxt(p.destino)) : '')}" placeholder="Rua, número, cidade — ou lat, lng" ${dis}>
              <button class="btn sm" id="bBuscaDest" ${dis}>Buscar</button><button class="btn sm" data-modo="destino" ${dis} title="Clique no mapa">📍</button></div>
            <select class="inp" data-pp="destinoTipo" style="margin-top:4px" ${dis}>${opt([['CTO_NOVA', 'Chega em CTO nova'], ['CEO_NOVA', 'Chega em CEO nova'], ['CEO_EXIST', 'Chega em CEO existente'], ['CLIENTE', 'Chega no cliente (ponto final)']], o.destinoTipo)}</select></div>
          <div class="small" style="margin-bottom:6px">Pontos de passagem: <b>${(p.vias || []).length}</b> ${ed ? `<button class="btn sm" data-modo="via">📍 Adicionar</button>${(p.vias || []).length ? ' <button class="btn sm" id="bLimpaVias">Limpar</button>' : ''}` : ''}
            <div class="muted">Use para obrigar o traçado a passar por uma rua (a rota sai pelo caminho mais curto a pé).</div></div>
          ${ed ? `<div class="acoes"><button class="btn prim" id="bTracar">✏️ Traçar pelas ruas</button>
            <label class="btn">📥 Importar KMZ do Google Earth<input type="file" id="fKmzImp" accept=".kmz,.kml" hidden></label></div>
            <p class="small muted" style="margin:6px 0 0">A contagem exata de postes vem do Google Earth: confira no satélite e ajuste, ou importe o KMZ com os postes marcados (ícones do padrão: rosca/proibido = BAP, ponto/alvo = fita).</p>` : ''}
        </div>
      </div>
      <div class="prj-mapa-col">
        <div class="card" style="padding:8px">
          <div class="prj-barra">${ed ? `<span class="small muted">Clique num poste para editar.</span>
            <button class="btn sm ${e.modo === 'poste' ? 'prim' : ''}" data-modo="poste">➕ Inserir poste</button>
            <button class="btn sm" id="bRts" title="Refaz as reservas técnicas pelo parâmetro">↻ RTs</button>` : '<span class="small muted">Somente leitura.</span>'}
            <span id="prjModo" class="small"></span></div>
          <div id="prjMapa" class="prj-mapa"></div>
          <div id="prjMetricas" style="margin-top:8px"></div>
        </div>
        <div id="prjAvisos"></div>
        <div class="card" id="prjRuas"></div>
      </div></div>`;
    ligarDesenho(p);
  };
  const ligarDesenho = p => {
    const e = E(p.id), ed = editavel(p);
    SN.$$('[data-pf]').forEach(i => { i.oninput = () => { p[i.dataset.pf] = i.value; mudou(p); }; i.onchange = () => { p[i.dataset.pf] = i.value; mudou(p); if (i.dataset.pf === 'conta' || i.dataset.pf === 'nome') abrirProjeto(p.id); else if (i.dataset.pf === 'cidade') desenharMapa(p).catch(() => { }); }; });
    SN.$$('[data-pp]').forEach(i => i.onchange = () => {
      const k = i.dataset.pp; p.params = { ...params(p), [k]: i.dataset.num ? (i.value === '' ? '' : Number(i.value)) : i.value };
      if (['encCada', 'angCanto'].includes(k) && p.postes) p.postes = PR.codificarPostes(PR.reclassificar(postesDe(p), p.params));
      if (k === 'origemTipo' || k === 'destinoTipo') trocarPonta(p, k === 'origemTipo' ? 0 : -1, i.value);
      mudou(p); pintarDesenho(p);
    });
    SN.$$('[data-modo]').forEach(b => b.onclick = () => { e.modo = e.modo === b.dataset.modo ? '' : b.dataset.modo; pintarModo(p); });
    if (SN.$('#bLimpaVias')) SN.$('#bLimpaVias').onclick = () => { p.vias = []; mudou(p); pintarDesenho(p); };
    if (SN.$('#pOrig')) SN.$('#pOrig').onchange = ev => { const c = lerCoord(ev.target.value); if (c) { p.origem = { ...c, txt: '' }; mudou(p); desenharMapa(p); } else if (ev.target.value) SN.toast('Use "lat, lng" (ex.: -22.97, -46.99) ou escolha na Base / no mapa.', 'erro'); };
    if (SN.$('#pDest')) SN.$('#pDest').onchange = ev => { const c = lerCoord(ev.target.value); if (c) { p.destino = { ...c, txt: '' }; mudou(p); desenharMapa(p); } };
    if (SN.$('#bBuscaDest')) SN.$('#bBuscaDest').onclick = () => buscarEndereco(p).catch(err => SN.toast(err.message, 'erro'));
    if (SN.$('#bGeoCeo')) SN.$('#bGeoCeo').onclick = () => ceoMaisPerto(p).catch(err => SN.toast(err.message, 'erro'));
    if (SN.$('#bBaseCeo')) SN.$('#bBaseCeo').onclick = () => escolherCeoBase(p).catch(err => SN.toast(err.message, 'erro'));
    if (SN.$('#bTracar')) SN.$('#bTracar').onclick = async ev => { const b = ev.target; b.disabled = true; try { await tracar(p); } catch (err) { SN.toast(err.message, 'erro'); } finally { b.disabled = false; } };
    if (SN.$('#fKmzImp')) SN.$('#fKmzImp').onchange = ev => { const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (f) importarKmz(p, f).catch(err => SN.toast(err.message, 'erro')); };
    if (SN.$('#bRts')) SN.$('#bRts').onclick = () => { const ps = postesDe(p); p.elementos = (p.elementos || []).filter(x => x.t !== 'RT').concat(PR.rtsAutomaticas(ps, params(p))); mudou(p); desenharMapa(p); };
    desenharMapa(p).catch(err => { SN.$('#prjMapa').innerHTML = `<div class="aviso erro">Mapa indisponível: ${esc(err.message)}</div>`; });
    pintarResumo(p);
    if (!ed) e.modo = '';
  };
  const pintarModo = p => {
    const e = E(p.id), el = SN.$('#prjModo'); if (!el) return;
    el.innerHTML = e.modo ? `<b>${{ origem: 'Clique no mapa para marcar a origem', destino: 'Clique no mapa para marcar o destino', via: 'Clique no mapa para incluir um ponto de passagem', poste: 'Clique no mapa, perto do traçado, para inserir um poste' }[e.modo]}</b> <button class="btn sm" id="bSaiModo">Cancelar</button>` : '';
    if (SN.$('#bSaiModo')) SN.$('#bSaiModo').onclick = () => { e.modo = ''; pintarModo(p); };
    SN.$$('[data-modo]').forEach(b => b.classList.toggle('prim', b.dataset.modo === e.modo));
    const m = SN.$('#prjMapa'); if (m) m.style.cursor = e.modo ? 'crosshair' : '';
  };
  // Troca o elemento da origem (poste 0) ou do destino (último poste).
  const trocarPonta = (p, qual, tipo) => {
    const ps = postesDe(p); if (!ps.length) return;
    const i = qual === 0 ? 0 : ps.length - 1, fo = (PR.CABOS[params(p).cabo] || {}).fo || 12;
    const tiposPonta = ['CEO_EXIST', 'CEO_NOVA', 'CTO_NOVA', 'CLIENTE'];
    p.elementos = (p.elementos || []).filter(x => !(x.i === i && tiposPonta.includes(x.t)));
    if (tipo) p.elementos.push({ t: tipo, i, nome: '', fus: tipo === 'CLIENTE' ? 0 : tipo === 'CTO_NOVA' ? 1 : fo });
  };

  // Métricas, ruas e avisos do padrão
  const pintarResumo = p => {
    const ps = postesDe(p), proj = { ...p, postes: ps }, m = PR.metricas(proj), av = PR.avisos(proj);
    const el = SN.$('#prjMetricas');
    if (el) el.innerHTML = m.postes ? `<div class="prj-metricas">
      <div><b>${fmtM(m.tracado)}</b><span>traçado</span></div><div><b>${fmtM(m.cabo)}</b><span>cabo previsto</span></div>
      <div><b>${m.postes}</b><span>postes</span></div><div><b>${m.enc} / ${m.pas}</b><span>encab. / passagem</span></div>
      <div><b>${m.rt}</b><span>RT</span></div><div><b>${(p.elementos || []).filter(x => ['CEO_NOVA', 'CTO_NOVA'].includes(x.t)).length}</b><span>CEO/CTO novas</span></div></div>
      <div class="prj-legenda small">${legendaHtml(p)}</div>` : '<p class="small muted" style="margin:0">Sem traçado ainda: marque origem e destino e clique em "Traçar pelas ruas", ou importe um KMZ.</p>';
    const ea = SN.$('#prjAvisos');
    if (ea) ea.innerHTML = av.length ? `<div class="aviso alerta small" style="margin:10px 0">${av.map(esc).join('<br>')}</div>` : '';
    const er = SN.$('#prjRuas');
    if (er) er.innerHTML = `<h3>Ruas do trajeto</h3>${(p.ruas || []).length ? `<div class="tabela-wrap"><table class="tab small"><thead><tr><th>Rua</th><th class="num">Postes</th><th class="num">Metros</th></tr></thead><tbody>
      ${p.ruas.map(r => `<tr><td>${esc(r.nome)}</td><td class="num">${r.postes}</td><td class="num">${SN.num(r.metros)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="small muted">Os nomes de rua saem do traçado pelas ruas.</p>'}${ps.length && editavel(p) ? '<button class="btn sm" id="bNomesRua" style="margin-top:6px">↻ Atualizar nomes de rua</button>' : ''}`;
    if (SN.$('#bNomesRua')) SN.$('#bNomesRua').onclick = ev => { ev.target.disabled = true; nomesDeRua(p).catch(err => SN.toast(err.message, 'erro')).finally(() => { if (ev.target) ev.target.disabled = false; }); };
  };
  const legendaHtml = p => {
    const o = params(p), cabo = PR.CABOS[o.cabo] || {}, k = o.ancoragem === 'FITA' ? 'FITA' : 'BAP';
    return `<span><i class="prj-traco" style="background:${cabo.cor}"></i>${esc(cabo.rot || '')}</span>
      ${o.ancoragem === 'BAP' ? '<span><i class="prj-traco" style="background:#fff;border:1px solid #999"></i>Cordoalha dielétrica</span>' : ''}${o.ancoragem === 'BAP_EXIST' ? '<span><i class="prj-traco" style="background:#FF7F1E;opacity:.7;height:7px"></i>Rede existente</span>' : ''}
      <span>${svgPoste(k, 'E')}Encabeçamento</span><span>${svgPoste(k, 'P')}Passagem</span>`;
  };

  // ─────────── Mapa (Leaflet) ───────────
  const carregarCss = href => { if (!document.querySelector(`link[href="${href}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); } };
  const carregarJs = src => new Promise((ok, falha) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => falha(new Error('sem internet?')); document.head.appendChild(s); });
  let leaflet = null;
  const carregarLeaflet = () => leaflet || (leaflet = (async () => {
    carregarCss('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
    if (!window.L) await carregarJs('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
  })().catch(e => { leaflet = null; throw e; }));
  const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const RUAS_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}';
  const OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  // Ícones (SVG) parecidos com os do Google Earth do padrão.
  const svgPoste = (k, t) => k === 'BAP'
    ? (t === 'E' ? '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="#222" stroke-width="3.6"/><circle cx="8" cy="8" r="5.5" fill="none" stroke="#fff" stroke-width="2"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="#fff" fill-opacity=".25" stroke="#222" stroke-width="3.4"/><circle cx="8" cy="8" r="5.5" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M4.3 4.3l7.4 7.4" stroke="#222" stroke-width="3.2"/><path d="M4.3 4.3l7.4 7.4" stroke="#fff" stroke-width="1.6"/></svg>')
    : (t === 'E' ? '<svg width="16" height="16" viewBox="0 0 16 16"><defs><radialGradient id="g" cx=".35" cy=".35"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#6b6b6b"/></radialGradient></defs><circle cx="8" cy="8" r="6.5" fill="url(#g)" stroke="#444" stroke-width=".8"/></svg>'
      : '<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="#fff" stroke="#111" stroke-width="1.6"/><circle cx="6" cy="6" r="2" fill="#111"/></svg>');
  const pino = (cor, letra) => `<svg width="22" height="30" viewBox="0 0 22 30"><path d="M11 29C11 29 2 17 2 11a9 9 0 0 1 18 0c0 6-9 18-9 18z" fill="${cor}" stroke="#222" stroke-width="1.2"/>${letra ? `<text x="11" y="15" font-size="10" font-weight="700" text-anchor="middle" fill="#111" font-family="Arial">${letra}</text>` : '<circle cx="11" cy="11" r="3.2" fill="#fff" fill-opacity=".8"/>'}</svg>`;
  const SVG_EL = { CEO_EXIST: pino('#F5E400'), CEO_NOVA: pino('#7B4DFF'), CTO_NOVA: pino('#FF5FB0'), TERCEIRO: pino('#F04B4B'), RT: pino('#FF6B5A', 'R'), CLIENTE: pino('#5BE36B'),
    SPLITTER: '<svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 2l8 15H2z" fill="#fff" stroke="#222" stroke-width="2"/></svg>',
    CAIXA_SUB: '<svg width="18" height="18" viewBox="0 0 18 18"><rect x="2" y="2" width="14" height="14" fill="#fff" stroke="#222" stroke-width="2.4"/></svg>',
    TRAVESSIA: '<svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 2l8 15H2z" fill="#FFD400" stroke="#222" stroke-width="1.5"/><text x="10" y="15" font-size="10" font-weight="700" text-anchor="middle">!</text></svg>',
    INFO: '<svg width="20" height="20" viewBox="0 0 20 20"><rect x="1" y="1" width="18" height="18" rx="3" fill="#fff" stroke="#999"/><text x="10" y="15" font-size="13" font-style="italic" font-weight="700" text-anchor="middle" fill="#C9B800" font-family="Georgia">i</text></svg>' };
  const icone = (svg, w, h, ancoraY) => window.L.divIcon({ className: 'prj-ico', html: svg, iconSize: [w, h], iconAnchor: [w / 2, ancoraY == null ? h / 2 : ancoraY] });
  const mapas = {}; // id do projeto → { mapa, camada }
  const desenharMapa = async p => {
    await carregarLeaflet(); const L = window.L, el = SN.$('#prjMapa'); if (!el) return;
    // Mapa de uma tela que já saiu: desmonta (o Leaflet erra ao animar sobre um elemento removido).
    Object.keys(mapas).forEach(k => { const x = mapas[k]; if (x && x.el !== el && !x.el.isConnected) { try { x.mapa.stop(); x.mapa.remove(); } catch (e) { } delete mapas[k]; } });
    let M = mapas[p.id];
    if (!M || M.el !== el) {
      if (M && M.mapa) { try { M.mapa.remove(); } catch (e) { } }
      const mapa = L.map(el, { zoomControl: true, maxZoom: 21, zoomAnimation: false }).setView([-22.9, -47.06], 12);
      const sat = L.layerGroup([L.tileLayer(SAT, { maxNativeZoom: 19, maxZoom: 21, attribution: 'Imagens © Esri' }), L.tileLayer(RUAS_SAT, { maxNativeZoom: 19, maxZoom: 21 })]);
      const ruas = L.tileLayer(OSM, { maxNativeZoom: 19, maxZoom: 21, attribution: '© OpenStreetMap' });
      sat.addTo(mapa); const ctl = L.control.layers({ 'Satélite (Google Earth)': sat, 'Ruas': ruas }, {}, { position: 'topright' }).addTo(mapa);
      M = mapas[p.id] = { mapa, el, ctl, camada: L.layerGroup().addTo(mapa), base: L.layerGroup().addTo(mapa), enquadrado: false };
      mapa.on('click', ev => cliqueMapa(p, ev.latlng));
      mapa.on('moveend', () => pintarBase(p));
      el.addEventListener('click', ev => acaoPopup(p, ev));
      el.addEventListener('change', ev => acaoPopup(p, ev));
    }
    // Rede existente da cidade do projeto (recarrega quando a cidade muda).
    if (M.redeCidade !== (p.cidade || '')) { M.redeCidade = p.cidade || ''; if (M.rede) { M.ctl.removeLayer(M.rede); M.mapa.removeLayer(M.rede); M.rede = null; } camadaRede(p, M); }
    pintarCamada(p);
    const ps = postesDe(p), pts = ps.map(x => [x.lat, x.lng]).concat([p.origem, p.destino].filter(Boolean).map(c => [c.lat, c.lng]));
    if (!M.enquadrado && pts.length) { M.mapa.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 18, animate: false }); M.enquadrado = true; }
    setTimeout(() => { if (M.el.isConnected) M.mapa.invalidateSize({ animate: false }); }, 50);
    pintarModo(p);
  };
  const pintarCamada = p => {
    const L = window.L, M = mapas[p.id]; if (!M) return;
    const o = params(p), k = o.ancoragem === 'FITA' ? 'FITA' : 'BAP', ps = postesDe(p), ed = editavel(p), cabo = PR.CABOS[o.cabo] || PR.CABOS['12'];
    M.camada.clearLayers();
    const linha = ps.map(x => [x.lat, x.lng]);
    if (linha.length > 1) {
      if (o.ancoragem === 'BAP_EXIST') L.polyline(linha, { color: '#FF7F1E', weight: 12, opacity: 0.7 }).addTo(M.camada);
      if (o.ancoragem === 'BAP') L.polyline(linha, { color: '#ffffff', weight: 6, opacity: 1 }).addTo(M.camada);
      L.polyline(linha, { color: cabo.cor, weight: 3.5, opacity: 1 }).addTo(M.camada);
    }
    ps.forEach((x, i) => {
      const mk = L.marker([x.lat, x.lng], { icon: icone(svgPoste(k, x.t), 16, 16), draggable: ed, title: 'P' + String(i + 1).padStart(2, '0') }).addTo(M.camada);
      mk.bindPopup(() => popupPoste(p, i), { minWidth: 230 });
      mk.on('dragend', ev => { const ll = ev.target.getLatLng(), atual = postesDe(p); atual[i] = { ...atual[i], lat: Math.round(ll.lat * 1e6) / 1e6, lng: Math.round(ll.lng * 1e6) / 1e6 }; gravarPostes(p, atual); });
    });
    (p.elementos || []).forEach(x => {
      const pos = PR.posicaoElemento(x, ps), svg = SVG_EL[x.t]; if (!pos || !svg) return;
      const pinoTipo = /^(CEO|CTO|TERCEIRO|RT|CLIENTE)/.test(x.t);
      const def = PR.ELEMENTOS[x.t] || {};
      L.marker(pos, { icon: icone(svg, pinoTipo ? 22 : 20, pinoTipo ? 30 : 20, pinoTipo ? 29 : null), zIndexOffset: 500 }).addTo(M.camada)
        .bindTooltip(esc(x.t === 'INFO' ? (x.txt || 'Informação') : (x.nome || def.kml || x.t)), { permanent: ['CEO_NOVA', 'CTO_NOVA', 'RT', 'CEO_EXIST', 'INFO'].includes(x.t), direction: 'right', className: 'prj-rot' })
        .on('click', () => { const mk = M.camada.getLayers().find(l => l.getLatLng && l.options.title === 'P' + String(x.i + 1).padStart(2, '0')); if (mk) mk.openPopup(); });
    });
    const ico = (letra, cor) => icone(`<svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="10" fill="${cor}" stroke="#fff" stroke-width="2.5"/><text x="13" y="17.5" font-size="12" font-weight="700" text-anchor="middle" fill="#fff" font-family="Arial">${letra}</text></svg>`, 26, 26);
    if (p.origem && !ps.length) L.marker([p.origem.lat, p.origem.lng], { icon: ico('A', '#2b6cb0') }).addTo(M.camada).bindTooltip('Origem');
    if (p.destino && !ps.length) L.marker([p.destino.lat, p.destino.lng], { icon: ico('B', '#c53030') }).addTo(M.camada).bindTooltip('Destino');
    (p.vias || []).forEach((v, i) => L.marker(v, { icon: ico(String(i + 1), '#6b7280'), draggable: ed }).addTo(M.camada).bindTooltip('Ponto de passagem ' + (i + 1))
      .on('dragend', ev => { const ll = ev.target.getLatLng(); p.vias[i] = [Math.round(ll.lat * 1e6) / 1e6, Math.round(ll.lng * 1e6) / 1e6]; mudou(p); }));
    pintarBase(p);
  };
  // Rede existente da cidade (GeoGrid, telas-rede.js): cabos nas cores do GeoGrid e caixas; clicar numa caixa a usa como origem.
  const camadaRede = async (p, M) => {
    if (!SN.rede || !p.cidade) return;
    let d; try { d = await SN.rede.daCidade(p.cidade); } catch (e) { return; }
    if (!d || mapas[p.id] !== M || M.redeCidade !== (p.cidade || '')) return;
    const L = window.L, r = L.canvas({ padding: 0.3 }), g = L.layerGroup();
    d.cabos.forEach(c => L.polyline(c.pts, { color: c.cor, weight: 2, opacity: 0.75, renderer: r, interactive: false }).addTo(g));
    d.caixas.forEach(c => L.circleMarker([c.lat, c.lng], { radius: 4, color: '#222', weight: 1, fillColor: c.cor || '#fff', fillOpacity: 1, renderer: r }).addTo(g)
      .bindTooltip(esc(c.n) + ' (GeoGrid)' + (editavel(p) ? ' — clique para usar como origem' : ''))
      .on('click', ev => { L.DomEvent.stopPropagation(ev); if (!editavel(p)) return; usarCaixaOrigem(p, c); }));
    M.rede = g; g.addTo(M.mapa); M.ctl.addOverlay(g, 'Rede existente (GeoGrid · ' + esc(d.cidade) + ')');
  };
  const usarCaixaOrigem = (p, c) => {
    p.origem = { lat: c.lat, lng: c.lng, txt: c.n + ' (GeoGrid)' }; p.params = { ...params(p), origemTipo: 'CEO_EXIST' }; mudou(p);
    SN.toast('Origem: ' + c.n + ' (GeoGrid)', 'ok'); pintarDesenho(p);
  };
  // As caixas do GeoGrid mais perto do destino (ou do centro do mapa), para escolher de onde sair.
  const ceoMaisPerto = async p => {
    const d = SN.rede && p.cidade ? await SN.rede.daCidade(p.cidade) : null;
    if (!d) return SN.toast(p.cidade ? 'Sem rede do GeoGrid importada para ' + p.cidade + ' (menu Rede GeoGrid).' : 'Informe a cidade primeiro.', 'erro');
    const M = mapas[p.id], ref = p.destino ? [p.destino.lat, p.destino.lng] : M ? [M.mapa.getCenter().lat, M.mapa.getCenter().lng] : null;
    if (!ref) return SN.toast('Marque o destino primeiro.', 'erro');
    const l = REDE.caixasMaisProximas(d, ref[0], ref[1], 8);
    await SN.modal({ titulo: 'Caixas do GeoGrid mais perto ' + (p.destino ? 'do destino' : 'do centro do mapa'), botoes: [{ rot: 'Voltar', valor: null }],
      corpo: '<p class="small muted">Distância em linha reta; o traçado pelas ruas sai maior.</p>' + l.map((x, i) => '<div class="prj-base-it" data-gg="' + i + '"><b>' + esc(x.c.n) + '</b> · ' + SN.num(Math.round(x.d)) + ' m' + (x.c.d ? '<div class="small muted">' + esc(x.c.d.slice(0, 120)) + '</div>' : '') + '</div>').join(''),
      aoAbrir: m => SN.$$('[data-gg]', m).forEach(el => el.onclick = () => { SN.$('[data-x]', m).click(); usarCaixaOrigem(p, l[+el.dataset.gg].c); }) });
  };
  // CEO/CTO da Base KML visíveis no mapa (zoom de rua): clicar marca como origem.
  let baseCache = null;
  const baseCeos = async () => baseCache || (baseCache = SN.vst.exec('VST_CS_BASE', {}).then(r => (r.cs || []).filter(x => x.tipo_ponto !== 'CS' && isFinite(x.lat) && isFinite(x.lng))).catch(e => { baseCache = null; throw e; }));
  const pintarBase = p => {
    const M = mapas[p.id]; if (!M || !M.el.isConnected || !SN.vst || !SN.vst.disponivel || !SN.vst.disponivel()) return;
    M.base.clearLayers();
    if (M.mapa.getZoom() < 16) return;
    baseCeos().then(lista => {
      const b = M.mapa.getBounds(), L = window.L;
      lista.filter(x => b.contains([x.lat, x.lng])).slice(0, 250).forEach(x => L.circleMarker([x.lat, x.lng], { radius: 5, color: '#8a7a00', fillColor: '#F5E400', fillOpacity: 0.9, weight: 1.5 })
        .addTo(M.base).bindTooltip(`${esc(x.tipo_ponto)} ${esc(x.id_cs)} (Base KML)${editavel(p) ? ' — clique para usar como origem' : ''}`)
        .on('click', ev => { window.L.DomEvent.stopPropagation(ev); if (!editavel(p)) return; p.origem = { lat: x.lat, lng: x.lng, txt: x.tipo_ponto + ' ' + x.id_cs }; mudou(p); SN.toast('Origem: ' + x.tipo_ponto + ' ' + x.id_cs, 'ok'); pintarDesenho(p); }));
    }).catch(() => { });
  };
  const popupPoste = (p, i) => {
    const ps = postesDe(p), x = ps[i], ed = editavel(p), els = (p.elementos || []).map((e, n) => ({ ...e, n })).filter(e => e.i === i);
    const d = (a, b) => a && b ? Math.round(PR.dist([a.lat, a.lng], [b.lat, b.lng])) + ' m' : '—';
    const tipos = Object.entries(PR.ELEMENTOS).map(([k, v]) => [k, v.rot + (v.vao ? ' (no vão seguinte)' : '')]);
    return `<div class="prj-pop"><b>Poste P${String(i + 1).padStart(2, '0')}</b> · ${x.t === 'E' ? 'Encabeçamento' : 'Passagem'}${x.c ? ' · <span style="color:#b45309">esquina</span>' : ''}
      <div class="small muted">vão anterior ${d(ps[i - 1], x)} · seguinte ${d(x, ps[i + 1])}</div>
      ${ed ? `<div style="margin-top:6px"><select class="inp" data-pt="${i}"><option value="">Tipo automático</option><option value="E" ${x.fixo === 'E' ? 'selected' : ''}>Encabeçamento (fixo)</option><option value="P" ${x.fixo === 'P' ? 'selected' : ''}>Passagem (fixo)</option></select></div>` : ''}
      ${els.map(e => `<div class="prj-pop-el"><b>${esc((PR.ELEMENTOS[e.t] || {}).rot || e.t)}</b>${e.t === 'INFO' ? ': ' + esc(e.txt || '') : e.nome ? ' ' + esc(e.nome) : ''}
        ${(PR.ELEMENTOS[e.t] || {}).fusao ? `<label class="small"> fusões ${ed ? `<input class="inp" type="number" min="0" style="width:64px" data-fus="${e.n}" value="${esc(e.fus || 0)}">` : esc(e.fus || 0)}</label>` : ''}
        ${ed ? `<button class="btn sm" data-tiraeld="${e.n}">×</button>` : ''}</div>`).join('')}
      ${ed ? `<div style="margin-top:6px"><select class="inp" data-novoel="${i}"><option value="">+ Elemento neste poste…</option>${opt(tipos, '')}</select></div>
        <div class="acoes" style="margin-top:6px"><button class="btn sm perigo" data-tiraposte="${i}">Remover poste</button></div>` : ''}</div>`;
  };
  // Ações dentro do popup (delegadas no contêiner do mapa).
  const acaoPopup = async (p, ev) => {
    const t = ev.target; if (!t || !t.dataset || !editavel(p)) return;
    const M = mapas[p.id];
    if (ev.type === 'change' && t.dataset.pt != null) { const ps = postesDe(p), i = +t.dataset.pt; if (t.value) ps[i].fixo = t.value; else delete ps[i].fixo; M.mapa.closePopup(); return gravarPostes(p, ps); }
    if (ev.type === 'change' && t.dataset.fus != null) { p.elementos[+t.dataset.fus].fus = Math.max(0, Number(t.value) || 0); mudou(p); pintarResumo(p); return; }
    if (ev.type === 'change' && t.dataset.novoel != null && t.value) {
      const i = +t.dataset.novoel, tipo = t.value, fo = (PR.CABOS[params(p).cabo] || {}).fo || 12; M.mapa.closePopup();
      const el = { t: tipo, i, nome: '' };
      if ((PR.ELEMENTOS[tipo] || {}).fusao) el.fus = tipo === 'CTO_NOVA' ? 1 : tipo === 'CEO_EXIST' || tipo === 'CEO_NOVA' ? fo : 0;
      if (tipo === 'INFO') { const txt = await SN.pedirTexto('Informação no poste P' + (i + 1), 'Texto (aparece no KMZ, ex.: USAR 3 SUPORTES) *'); if (!txt) return; el.txt = txt.toUpperCase(); }
      if (['CEO_NOVA', 'CTO_NOVA', 'CEO_EXIST'].includes(tipo)) { const n = await SN.pedirTexto('Nome / número (opcional)', 'Ex.: CEO 015 — deixe em branco para o padrão', false); if (n) el.nome = n.toUpperCase(); }
      p.elementos = (p.elementos || []).concat([el]); mudou(p); pintarCamada(p); pintarResumo(p); return;
    }
    if (ev.type !== 'click') return;
    if (t.dataset.tiraeld != null) { p.elementos.splice(+t.dataset.tiraeld, 1); M.mapa.closePopup(); mudou(p); pintarCamada(p); pintarResumo(p); return; }
    if (t.dataset.tiraposte != null) {
      const i = +t.dataset.tiraposte, ps = postesDe(p); if (ps.length <= 2) return SN.toast('O traçado precisa de pelo menos 2 postes.', 'erro');
      ps.splice(i, 1);
      p.elementos = (p.elementos || []).map(e => e.i > i ? { ...e, i: e.i - 1 } : e.i === i ? { ...e, i: Math.max(0, Math.min(i, ps.length - 1)) } : e);
      M.mapa.closePopup(); gravarPostes(p, ps);
    }
  };
  const gravarPostes = (p, ps) => {
    p.postes = PR.codificarPostes(PR.reclassificar(ps, params(p)));
    const e = E(p.id); if (e.passos) p.ruas = PR.ruasDosPostes(postesDe(p), e.passos);
    mudou(p); pintarCamada(p); pintarResumo(p);
  };
  const cliqueMapa = (p, ll) => {
    const e = E(p.id); if (!e.modo || !editavel(p)) return;
    const c = { lat: Math.round(ll.lat * 1e6) / 1e6, lng: Math.round(ll.lng * 1e6) / 1e6 };
    if (e.modo === 'origem') { p.origem = { ...c, txt: '' }; e.modo = ''; mudou(p); return pintarDesenho(p); }
    if (e.modo === 'destino') { p.destino = { ...c, txt: '' }; e.modo = ''; mudou(p); return pintarDesenho(p); }
    if (e.modo === 'via') { p.vias = (p.vias || []).concat([[c.lat, c.lng]]); mudou(p); return pintarDesenho(p); }
    if (e.modo === 'poste') {
      const ps = postesDe(p); if (ps.length < 2) return SN.toast('Trace primeiro: o poste entra entre dois postes do traçado.', 'erro');
      let melhor = 0, dm = Infinity; // vão mais perto do clique
      for (let i = 1; i < ps.length; i++) { const mx = (ps[i - 1].lat + ps[i].lat) / 2, my = (ps[i - 1].lng + ps[i].lng) / 2, d = PR.dist([c.lat, c.lng], [mx, my]) + 0.5 * (PR.dist([c.lat, c.lng], [ps[i - 1].lat, ps[i - 1].lng]) + PR.dist([c.lat, c.lng], [ps[i].lat, ps[i].lng])); if (d < dm) { dm = d; melhor = i; } }
      ps.splice(melhor, 0, { lat: c.lat, lng: c.lng, t: 'P' });
      p.elementos = (p.elementos || []).map(x => x.i >= melhor ? { ...x, i: x.i + 1 } : x);
      gravarPostes(p, ps);
    }
  };

  // ─────────── Traçar pelas ruas / buscar endereço / Base / importar ───────────
  const tempo = (url, ms) => fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined });
  const buscarEndereco = async p => {
    const q = SN.$('#pDest').value.trim(), c = lerCoord(q); if (!q) return SN.toast('Digite o endereço do destino.', 'erro');
    if (c) { p.destino = { ...c, txt: '' }; mudou(p); return pintarDesenho(p); }
    const r = await (await tempo('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=' + encodeURIComponent(q + (p.cidade && !SN.normal(q).includes(SN.normal(p.cidade)) ? ', ' + p.cidade : '') + ', SP'), 15000)).json();
    if (!r.length) return SN.toast('Endereço não encontrado. Tente com número e cidade, ou marque no mapa.', 'erro');
    p.destino = { lat: Number(r[0].lat), lng: Number(r[0].lon), txt: q }; mudou(p); E(p.id).modo = '';
    const M = mapas[p.id]; if (M) M.mapa.setView([p.destino.lat, p.destino.lng], 17);
    SN.toast('Destino: ' + String(r[0].display_name).split(',').slice(0, 3).join(','), 'ok'); pintarDesenho(p);
  };
  const escolherCeoBase = async p => {
    const lista = await baseCeos();
    if (!lista.length) return SN.toast('A Base KML não tem CEO/CTO cadastradas.', 'erro');
    const res = await SN.modal({ titulo: 'Origem: CEO/CTO da Base KML', largo: true,
      corpo: `<input class="inp" id="mBusca" placeholder="Número, cluster ou endereço"><div id="mLista" style="max-height:50vh;overflow:auto;margin-top:8px"></div>`,
      botoes: [{ rot: 'Voltar', valor: null }],
      aoAbrir: m => {
        const pintar = () => { const q = SN.normal(SN.$('#mBusca', m).value);
          SN.$('#mLista', m).innerHTML = lista.filter(x => !q || SN.normal([x.id_cs, x.cluster, x.endereco, x.descricao, x.tipo_ponto].join(' ')).includes(q)).slice(0, 60)
            .map(x => `<div class="prj-base-it" data-b="${esc(x.id_cs)}"><b>${esc(x.tipo_ponto)} ${esc(x.id_cs)}</b> <span class="small muted">${esc(x.cluster || '')} · ${esc(x.endereco || '')}</span></div>`).join('') || '<p class="muted small">Nada encontrado.</p>';
          SN.$$('[data-b]', m).forEach(d => d.onclick = () => { const x = lista.find(y => y.id_cs === d.dataset.b); p.origem = { lat: x.lat, lng: x.lng, txt: x.tipo_ponto + ' ' + x.id_cs }; mudou(p); SN.$('[data-x]', m).click(); pintarDesenho(p); const M = mapas[p.id]; if (M) M.mapa.setView([x.lat, x.lng], 17); });
        };
        SN.$('#mBusca', m).oninput = pintar; pintar(); SN.$('#mBusca', m).focus();
      } });
    return res;
  };
  const rotaOsrm = async pts => {
    const coords = pts.map(c => c[1] + ',' + c[0]).join(';'), q = '?overview=full&geometries=geojson&steps=true';
    const urls = ['https://routing.openstreetmap.de/routed-foot/route/v1/driving/' + coords + q, 'https://router.project-osrm.org/route/v1/foot/' + coords + q];
    let ult = null;
    for (const u of urls) {
      try { const r = await (await tempo(u, 25000)).json(); if (r.code === 'Ok' && r.routes && r.routes[0]) return r.routes[0]; ult = new Error(r.message || r.code); }
      catch (e) { ult = e; }
    }
    throw new Error('Não foi possível traçar pelas ruas (' + (ult && ult.message || 'serviço fora') + '). Tente de novo ou marque os pontos de passagem.');
  };
  const tracar = async p => {
    if (!p.origem || !p.destino) return SN.toast('Marque a origem e o destino.', 'erro');
    if (p.postes && !await SN.confirmar('Traçar de novo', 'O traçado atual (postes, elementos e ajustes no mapa) será substituído pelo novo.', 'Traçar', 'prim')) return;
    const fim = SN.cobrirCarregando('Traçando pelas ruas e posicionando os postes…');
    try {
      const rota = await rotaOsrm([[p.origem.lat, p.origem.lng]].concat(p.vias || []).concat([[p.destino.lat, p.destino.lng]]));
      const linha = rota.geometry.coordinates.map(c => [c[1], c[0]]);
      // A rota começa/termina na rua mais próxima: liga a origem e o destino exatos.
      if (PR.dist(linha[0], [p.origem.lat, p.origem.lng]) > 3) linha.unshift([p.origem.lat, p.origem.lng]);
      if (PR.dist(linha[linha.length - 1], [p.destino.lat, p.destino.lng]) > 3) linha.push([p.destino.lat, p.destino.lng]);
      const passos = []; (rota.legs || []).forEach(l => (l.steps || []).forEach(s => { if (s.geometry && s.geometry.coordinates.length > 1) passos.push({ nome: s.name || '', pts: s.geometry.coordinates.map(c => [c[1], c[0]]) }); }));
      const o = params(p), ps = PR.gerarPostes(linha, o);
      E(p.id).passos = passos;
      p.postes = PR.codificarPostes(ps); p.elementos = [];
      if (o.origemTipo) trocarPonta(p, 0, o.origemTipo);
      if (o.destinoTipo) trocarPonta(p, -1, o.destinoTipo);
      p.elementos = p.elementos.concat(PR.rtsAutomaticas(ps, o));
      p.ruas = PR.ruasDosPostes(ps, passos); p.ajustes = { mat: {}, lpu: {} };
      hist(p, 'TRAÇADO', `${ps.length} postes · ${Math.round(PR.comprimento(ps.map(x => [x.lat, x.lng])))} m`);
      mudou(p); const M = mapas[p.id]; if (M) M.enquadrado = false;
      SN.toast(`Traçado pronto: ${ps.length} postes (vão médio ${o.vao} m). Confira no satélite e ajuste os postes.`, 'ok');
      pintarDesenho(p);
    } finally { fim(); }
  };
  // Nomes de rua para traçado importado (sem os passos da rota): consulta alguns postes (1 por segundo).
  const nomesDeRua = async p => {
    const ps = postesDe(p); if (!ps.length) return;
    const passo = Math.max(1, Math.ceil(ps.length / 30)), amostra = []; for (let i = 0; i < ps.length; i += passo) amostra.push(i); if (amostra[amostra.length - 1] !== ps.length - 1) amostra.push(ps.length - 1);
    const fim = SN.cobrirCarregando(`Buscando os nomes de rua (${amostra.length} consultas)…`), nomes = {};
    try {
      for (const i of amostra) {
        try { const r = await (await tempo(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=17&lat=${ps[i].lat}&lon=${ps[i].lng}`, 12000)).json(); nomes[i] = (r.address && (r.address.road || r.address.pedestrian || r.address.footway)) || ''; }
        catch (e) { nomes[i] = ''; }
        await new Promise(ok => setTimeout(ok, 1050));
      }
      const passos = []; let atual = null;
      amostra.forEach((i, k) => { const n = nomes[i] || '(sem nome)', ini = k ? amostra[k - 1] : 0; if (!atual || atual.nome !== n) passos.push(atual = { nome: n, pts: [] }); for (let j = ini; j <= i; j++) atual.pts.push([ps[j].lat, ps[j].lng]); });
      passos.forEach(s => { if (s.pts.length === 1) s.pts.push(s.pts[0]); });
      E(p.id).passos = passos; p.ruas = PR.ruasDosPostes(ps, passos); mudou(p); pintarResumo(p);
    } finally { fim(); }
  };
  const carregarJsZip = () => window.JSZip ? Promise.resolve() : carregarJs('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  const importarKmz = async (p, file) => {
    let txt;
    if (/\.kmz$/i.test(file.name)) { await carregarJsZip(); const zip = await JSZip.loadAsync(file); const k = Object.keys(zip.files).find(n => /\.kml$/i.test(n)); if (!k) throw new Error('O KMZ não tem arquivo .kml dentro.'); txt = await zip.files[k].async('string'); }
    else txt = await file.text();
    const im = PR.importar(PR.lerKml(txt), params(p));
    if (im.postes.length < 2) throw new Error('Não achei traçado no arquivo (nem linha, nem postes).');
    if (p.postes && !await SN.confirmar('Importar KMZ', `Achei ${im.postes.length} postes e ${im.elementos.length} elemento(s) (${im.linhas} linha(s), ${im.pontos} ponto(s)). O traçado atual será substituído.`, 'Importar', 'prim')) return;
    p.postes = PR.codificarPostes(im.postes); p.elementos = im.elementos; p.ruas = []; p.ajustes = { mat: {}, lpu: {} };
    if (im.ancoragem && im.ancoragem !== (params(p).ancoragem === 'FITA' ? 'FITA' : 'BAP')) p.params = { ...params(p), ancoragem: im.ancoragem };
    p.origem = { lat: im.postes[0].lat, lng: im.postes[0].lng, txt: '' }; p.destino = { lat: im.postes[im.postes.length - 1].lat, lng: im.postes[im.postes.length - 1].lng, txt: '' };
    E(p.id).passos = null; hist(p, 'KMZ IMPORTADO', file.name + ' · ' + im.postes.length + ' postes');
    mudou(p); const M = mapas[p.id]; if (M) M.enquadrado = false;
    SN.toast(`KMZ importado: ${im.postes.length} postes, ${im.elementos.length} elemento(s). Buscando os nomes de rua…`, 'ok');
    pintarDesenho(p); nomesDeRua(p).catch(() => { });
  };
  const nomeArq = t => String(t || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 90);
  const kmzBlob = async p => { await carregarJsZip(); const z = new JSZip(); z.file('doc.kml', PR.kml({ ...p, postes: postesDe(p) })); return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz', compression: 'DEFLATE' }); };
  const baixarKmz = async p => {
    if (!postesDe(p).length) return SN.toast('Sem traçado para exportar.', 'erro');
    const b = await kmzBlob(p), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nomeArq(p.id + ' - ' + (p.nome || 'projeto')) + '.kmz';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  };

  // ─────────── 2 · Orçamento ───────────
  const pintarOrcamento = p => {
    const ed = editavel(p), o = p.status === 'RASCUNHO' || p.status === 'REPROVADO' ? orcar(p) : { ...p.orcamento, memoria: (p.orcamento || {}).memoria || [] };
    if (!o || !o.materiais) { SN.$('#prjCorpo').innerHTML = '<p class="muted">Sem orçamento.</p>'; return; }
    const m = o.metricas || PR.metricas({ ...p, postes: postesDe(p) }), fora = foraDaConta(p, o), crit = !!params(p).critico;
    const catMat = CATALOGO_MATERIAIS.concat(Object.values(SN.catalogoExtra ? SN.catalogoExtra()._idx || {} : {})).filter(x => !o.materiais.some(y => y.cod === x.c));
    const catLpu = (p.conta ? SN.itensDaConta(p.conta) : LPU_CATALOGO).filter(x => !o.lpu.some(y => y.cod === x.cod));
    const qtdIn = (tipo, x) => ed ? `<input class="inp" type="number" min="0" step="any" style="width:96px;text-align:right" data-aj="${tipo}|${esc(x.cod)}" value="${esc(x.qtd)}">` : SN.num(x.qtd, 2);
    SN.$('#prjCorpo').innerHTML = `
      <div class="kpis-fin" style="margin-bottom:12px">
        <div class="kpi"><div class="rot">Materiais</div><div class="val">${SN.brl(o.totalMat)}</div><div class="sub">${o.materiais.length} item(ns) · preço do catálogo vigente</div></div>
        <div class="kpi"><div class="rot">Mão de obra (LPU)</div><div class="val">${SN.brl(o.totalLpu)}</div><div class="sub">${o.lpu.length} serviço(s) · fator ${crit ? 'crítico' : 'comum'}</div></div>
        <div class="kpi"><div class="rot">Total da obra</div><div class="val">${SN.brl(o.total)}</div><div class="sub">${m.cabo ? SN.brl(o.total / m.cabo) + ' por metro de cabo' : ''}</div></div>
      </div>
      ${fora.length ? `<div class="aviso alerta small" style="margin-bottom:10px">${fora.join(', ')} não está(ão) na conta ${esc(SN.contaTxt(p.conta))}: a LPU da obra só aceita os itens da conta. Troque a conta ou retire o item.</div>` : ''}
      ${!p.conta ? '<div class="aviso alerta small" style="margin-bottom:10px">Escolha a conta contábil na aba 1.</div>' : ''}
      <div class="card" style="margin-bottom:12px"><div class="card-tit"><h3>Materiais</h3>${ed ? '<button class="btn sm" id="bRestaura">↺ Voltar ao cálculo automático</button>' : ''}</div>
        <div class="tabela-wrap"><table class="tab"><thead><tr><th>Código</th><th>Material</th><th>Un.</th><th class="num">Qtd</th><th class="num">Unit.</th><th class="num">Total</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>
        ${o.materiais.map(x => `<tr><td class="mono">${esc(x.cod)}</td><td>${esc(x.desc)}${x.ajustado ? ` <span class="badge alerta" title="Calculado: ${SN.num(x.auto || 0, 2)}">ajustado</span>` : ''}</td><td class="small">${esc(x.un)}</td>
          <td class="num">${qtdIn('mat', x)}</td><td class="num nowrap">${SN.brl(x.unit)}</td><td class="num nowrap">${SN.brl(x.total)}</td>${ed ? `<td><button class="btn sm perigo" data-tira="mat|${esc(x.cod)}">✕</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="7" class="muted">Sem materiais.</td></tr>'}
        <tr><td colspan="5" class="num"><b>Total de materiais</b></td><td class="num nowrap"><b>${SN.brl(o.totalMat)}</b></td>${ed ? '<td></td>' : ''}</tr></tbody></table></div>
        ${ed ? `<div class="linha-form" style="margin-top:8px"><input class="inp" id="addMat" list="lMat" placeholder="+ Incluir material (código ou descrição)"><datalist id="lMat">${catMat.map(x => `<option value="${esc(x.c)} · ${esc(x.d)}">`).join('')}</datalist></div>` : ''}</div>
      <div class="card" style="margin-bottom:12px"><div class="card-tit"><h3>LPU · mão de obra</h3>
        ${ed ? `<label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="cCrit" ${crit ? 'checked' : ''}> Condição crítica (valor crítico da tabela)</label>` : `<span class="small muted">fator ${crit ? 'crítico' : 'comum'}</span>`}</div>
        <div class="tabela-wrap"><table class="tab"><thead><tr><th>Código</th><th>Serviço e descritivo técnico</th><th class="num">Qtd</th><th class="num">Unit.</th><th class="num">Total</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>
        ${o.lpu.map(x => { const it = SN.itemLpu(x.cod) || {}; return `<tr><td class="mono">${esc(x.cod)}</td><td>${esc(x.desc)}${x.ajustado ? ` <span class="badge alerta" title="Calculado: ${SN.num(x.auto || 0, 2)}">ajustado</span>` : ''}${fora.includes(x.cod) ? ' <span class="badge erro">fora da conta</span>' : ''}${it.tec ? `<div class="lpu-tec">${esc(it.tec)}</div>` : ''}<div class="small muted">${esc(it.classe || '')} · ${esc(x.medida)}</div></td>
          <td class="num">${qtdIn('lpu', x)}</td><td class="num nowrap">${SN.brl(x.unit)}</td><td class="num nowrap">${SN.brl(x.total)}</td>${ed ? `<td><button class="btn sm perigo" data-tira="lpu|${esc(x.cod)}">✕</button></td>` : ''}</tr>`; }).join('') || '<tr><td colspan="6" class="muted">Sem serviços.</td></tr>'}
        <tr><td colspan="4" class="num"><b>Total da LPU</b></td><td class="num nowrap"><b>${SN.brl(o.totalLpu)}</b></td>${ed ? '<td></td>' : ''}</tr></tbody></table></div>
        ${ed ? `<div class="linha-form" style="margin-top:8px"><select class="inp" id="addLpu"><option value="">+ Incluir serviço da conta…</option>${catLpu.map(x => `<option value="${esc(x.cod)}">${esc(x.cod)} · ${esc(x.desc)} (${esc(x.medida)})</option>`).join('')}</select></div>` : ''}</div>
      <div class="card"><h3>Memória de cálculo</h3><ul class="small">${(o.memoria || []).map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        <p class="small muted">Composição por poste do padrão construtivo (IOP.2.5.1.001R01): encabeçamento BAP = 1 BAP + 2 olhais + 2 suportes BAP + 2 parafusos M12 + 2 alças PLP + 1 plaqueta · passagem BAP = 1 BAP + 1 suporte 3x1 + 1 alça PLP + 1 plaqueta · encabeçamento fita = ~1 m fita + 2 suportes 3x1 + 2 alças + 1 fecho + 1 plaqueta · passagem fita = ~1 m fita + 1 suporte 3x1 + 1 fecho + 1 plaqueta.</p></div>
      ${ed ? `<div class="acoes" style="margin-top:12px"><button class="btn ok" id="bEnviarAprov">📤 Enviar para aprovação</button></div><div id="prjErros"></div>` : ''}`;
    if (!ed) return;
    const aj = p.ajustes || (p.ajustes = { mat: {}, lpu: {} });
    SN.$$('[data-aj]').forEach(i => i.onchange = () => { const [t, cod] = i.dataset.aj.split('|'); (aj[t] = aj[t] || {})[cod] = Number(i.value) || 0; mudou(p); pintarOrcamento(p); });
    SN.$$('[data-tira]').forEach(b => b.onclick = () => { const [t, cod] = b.dataset.tira.split('|'); (aj[t] = aj[t] || {})[cod] = 0; mudou(p); pintarOrcamento(p); });
    SN.$('#bRestaura').onclick = () => { p.ajustes = { mat: {}, lpu: {} }; mudou(p); pintarOrcamento(p); };
    SN.$('#cCrit').onchange = ev => { p.params = { ...params(p), critico: ev.target.checked }; mudou(p); pintarOrcamento(p); };
    SN.$('#addMat').onchange = ev => { const cod = String(ev.target.value).split(' · ')[0].trim(); if (!SN.material(cod)) return SN.toast('Escolha um material da lista.', 'erro'); (aj.mat = aj.mat || {})[cod] = 1; mudou(p); pintarOrcamento(p); };
    SN.$('#addLpu').onchange = ev => { if (!ev.target.value) return; (aj.lpu = aj.lpu || {})[ev.target.value] = 1; mudou(p); pintarOrcamento(p); };
    SN.$('#bEnviarAprov').onclick = () => enviarAprovacao(p);
  };
  const enviarAprovacao = async p => {
    const v = PR.validarProjeto({ ...p, postes: postesDe(p) }), o = orcar(p), erros = v.erros.slice();
    const fora = foraDaConta(p, o); if (fora.length) erros.push('Itens fora da conta escolhida: ' + fora.join(', ') + '.');
    if (!o.total) erros.push('Orçamento zerado.');
    if (erros.length) { SN.$('#prjErros').innerHTML = `<div class="aviso alerta small" style="margin-top:8px">${erros.map(esc).join('<br>')}</div>`; return SN.toast(erros[0], 'erro'); }
    if (!await SN.confirmar('Enviar para aprovação', `Total da obra: <b>${SN.brl(o.total)}</b> (materiais ${SN.brl(o.totalMat)} + LPU ${SN.brl(o.totalLpu)}). O traçado e o orçamento ficam congelados até a decisão do Gestor/Gerente.`, 'Enviar', 'ok')) return;
    const u = SN.usuario() || {};
    p.orcamento = { materiais: o.materiais.map(({ cod, desc, un, qtd, unit, total }) => ({ cod, desc, un, qtd, unit, total })), lpu: o.lpu.map(({ cod, desc, medida, qtd, unit, total }) => ({ cod, desc, medida, qtd, unit, total })),
      totalMat: o.totalMat, totalLpu: o.totalLpu, total: o.total, critico: o.critico, memoria: o.memoria, metricas: o.metricas, ts: SN.agora(), por: u.nome || '' };
    p.status = 'AGUARDANDO_APROVACAO'; p.enviadoEm = SN.agora(); p.enviadoPor = u.nome || ''; delete p.reprovacao;
    hist(p, 'ENVIADO PARA APROVAÇÃO', SN.brl(o.total)); SN.log('PROJETO_ENVIADO', p.id, SN.brl(o.total)); mudou(p, true); SN.salvar();
    SN.toast('Projeto enviado para aprovação.', 'ok'); E(p.id).aba = 'APROVACAO'; abrirProjeto(p.id);
  };

  // ─────────── 3 · Aprovação ───────────
  const pintarAprovacao = p => {
    const o = p.orcamento, el = SN.$('#prjCorpo');
    if (['RASCUNHO', 'REPROVADO'].includes(p.status)) { el.innerHTML = `<div class="card"><p>Termine o traçado e o orçamento e use <b>Enviar para aprovação</b> na aba 2.</p>${(p.historico || []).length ? histHtml(p) : ''}</div>`; return; }
    const empresas = SN.db.empresas.filter(x => x.ativo !== false).map(x => x.nome).sort((a, b) => (a === 'NETTURBO' ? -1 : b === 'NETTURBO' ? 1 : a.localeCompare(b)));
    const resumo = `<div class="kpis-fin" style="margin-bottom:12px">
      <div class="kpi"><div class="rot">Total da obra</div><div class="val">${SN.brl(o.total)}</div><div class="sub">materiais ${SN.brl(o.totalMat)} · LPU ${SN.brl(o.totalLpu)}</div></div>
      <div class="kpi"><div class="rot">Traçado</div><div class="val">${fmtM((o.metricas || {}).tracado)}</div><div class="sub">${(o.metricas || {}).postes || 0} postes · cabo ${fmtM((o.metricas || {}).cabo)}</div></div>
      <div class="kpi"><div class="rot">Enviado</div><div class="val" style="font-size:1rem">${esc(p.enviadoPor || '')}</div><div class="sub">${SN.dt(p.enviadoEm)}</div></div></div>`;
    if (p.status === 'AGUARDANDO_APROVACAO') {
      el.innerHTML = resumo + `<div class="card">
        ${gestor() ? `<h3>Aprovar e gerar a obra</h3>
          <div class="linha-form">
            <div class="campo"><label>Quem executa *</label><select class="inp" id="aEmp"><option value="">Escolha…</option>${empresas.map(n => `<option value="${esc(n)}">${esc(n === 'NETTURBO' ? 'NETTURBO (NTT · equipe própria)' : n)}</option>`).join('')}</select></div>
            <div class="campo"><label>Técnico</label><select class="inp" id="aTec"><option value="">Qualquer técnico da empresa</option></select></div></div>
          <div class="linha-form">
            <div class="campo"><label>Data *</label><input class="inp" type="date" id="aData" value="${SN.dataIsoLocal(new Date())}"></div>
            <div class="campo"><label>Data-limite</label><input class="inp" type="date" id="aLim"></div></div>
          <label class="small" style="display:flex;gap:6px;align-items:center;margin-bottom:8px"><input type="checkbox" id="aDesp" checked> Despachar já (o chamado entra na fila da equipe)</label>
          <p class="small muted">A equipe recebe o KMZ, o desenho em PDF, os materiais e a LPU estimada — só quantidades e descrições, sem valores.</p>
          <div class="acoes"><button class="btn ok" id="bAprovar">✔ Aprovar e gerar obra</button><button class="btn perigo" id="bReprovar">✖ Reprovar</button><button class="btn" id="bVoltarRasc">↩ Voltar para rascunho</button></div>`
        : `<p>Aguardando a decisão de um <b>Gestor ou Gerente</b>.</p><div class="acoes"><button class="btn" id="bVoltarRasc">↩ Voltar para rascunho (para editar)</button></div>`}
        </div>${histHtml(p)}`;
      if (SN.$('#aEmp')) SN.$('#aEmp').onchange = ev => { SN.$('#aTec').innerHTML = '<option value="">Qualquer técnico da empresa</option>' + SN.db.tecnicos.filter(t => t.ativo !== false && t.empresa === ev.target.value).map(t => `<option>${esc(t.nome)}</option>`).join(''); };
      if (SN.$('#bAprovar')) SN.$('#bAprovar').onclick = ev => aprovar(p, ev.target).catch(err => { ev.target.disabled = false; SN.toast(err.message, 'erro'); });
      if (SN.$('#bReprovar')) SN.$('#bReprovar').onclick = async () => {
        const mot = await SN.pedirTexto('Reprovar ' + p.id, 'Motivo (o projetista vê e ajusta) *'); if (!mot) return;
        p.status = 'REPROVADO'; p.reprovacao = { por: (SN.usuario() || {}).nome || '', ts: SN.agora(), motivo: mot }; delete p.orcamento;
        hist(p, 'REPROVADO', mot); SN.log('PROJETO_REPROVADO', p.id, mot); mudou(p, true); SN.salvar(); SN.toast('Projeto reprovado.', 'ok'); abrirProjeto(p.id);
      };
      SN.$('#bVoltarRasc').onclick = async () => { if (!await SN.confirmar('Voltar para rascunho', 'O projeto sai da fila de aprovação para ser editado.', 'Voltar', 'prim')) return;
        p.status = 'RASCUNHO'; delete p.orcamento; hist(p, 'VOLTOU PARA RASCUNHO'); mudou(p, true); SN.salvar(); E(p.id).aba = 'DESENHO'; abrirProjeto(p.id); };
      return;
    }
    const a = p.aprovacao || {};
    el.innerHTML = resumo + `<div class="card"><h3>✔ Aprovado</h3>
      <p>Por <b>${esc(a.por || '')}</b> em ${SN.dt(a.ts)} · executa <b>${esc(a.prestador === 'NETTURBO' ? 'NETTURBO (NTT)' : a.prestador || '')}</b>${a.tecnico ? ' · ' + esc(a.tecnico) : ''} · data ${SN.vst.dia(a.data)}${a.data_limite ? ' até ' + SN.vst.dia(a.data_limite) : ''}.</p>
      <p>Obra: ${p.id_rota ? `<a href="#/prj/planejamento"><b>${esc(p.id_rota)}</b></a> — acompanhe em Novos projetos › Obras (despacho, apontamentos, revisão e LPU).` : '<span class="muted">não gerada</span>'}</p>
      ${a.kmz_url ? `<p class="small"><a href="${esc(a.kmz_url)}" target="_blank" rel="noopener">KMZ no Drive</a></p>` : ''}</div>${histHtml(p)}`;
  };
  const histHtml = p => `<details class="card" style="margin-top:12px"><summary><b>Histórico</b></summary><ul class="small" style="margin-top:6px">${(p.historico || []).slice().reverse().map(h => `<li>${SN.dt(h.ts)} · <b>${esc(h.usuario)}</b> · ${esc(h.acao)}${h.detalhe ? ' — ' + esc(h.detalhe) : ''}</li>`).join('')}</ul></details>`;
  // Pacote da equipe: só quantidades e descrições (o servidor recusa qualquer valor).
  const pacote = p => {
    const o = p.orcamento, m = o.metricas || PR.metricas({ ...p, postes: postesDe(p) }), pr = params(p);
    return { nome: p.nome, cabo: pr.cabo, cabo_rot: (PR.CABOS[pr.cabo] || {}).rot || '', ancoragem: pr.ancoragem, ancoragem_rot: (PR.ANCORAGENS[pr.ancoragem] || {}).rot || '',
      metros_tracado: m.tracado, metros_cabo: m.cabo, n_postes: m.postes, postes: p.postes, elementos: (p.elementos || []).map(({ t, i, nome, txt, fus }) => ({ t, i, nome: nome || '', txt: txt || '', fus: fus || 0 })),
      ruas: (p.ruas || []).map(({ nome, postes, metros }) => ({ nome, postes, metros })), materiais: o.materiais.map(({ cod, desc, qtd, un }) => ({ cod, desc, qtd, un })), lpu: o.lpu.map(({ cod, qtd }) => ({ cod, qtd })) };
  };
  const aprovar = async (p, bt) => {
    const emp = SN.$('#aEmp').value, tec = SN.$('#aTec').value, data = SN.$('#aData').value, lim = SN.$('#aLim').value, desp = SN.$('#aDesp').checked;
    if (!emp) return SN.toast('Escolha quem executa (prestador ou NTT).', 'erro');
    if (!data) return SN.toast('Informe a data.', 'erro');
    if (!SN.vst.disponivel()) return SN.toast('A obra precisa do servidor (sem conexão?).', 'erro');
    if (!await SN.confirmar('Aprovar ' + p.id, `Total: <b>${SN.brl(p.orcamento.total)}</b>. Executa <b>${esc(emp)}</b>${tec ? ' · ' + esc(tec) : ''}. A obra nasce na conta <b>${esc(SN.contaTxt(p.conta))}</b>${desp ? ' e já entra na fila da equipe' : ''}.`, 'Aprovar', 'ok')) return;
    bt.disabled = true; const passo = t => { bt.textContent = t; };
    const fim = SN.cobrirCarregando('Gerando o KMZ, o desenho e a obra…');
    try {
      passo('KMZ…');
      const kmz = await kmzBlob(p), dataUrlKmz = await new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = falha; r.readAsDataURL(kmz); });
      const up = await SN.vst.exec('VST_KMZ_UPLOAD', { nome: nomeArq(p.id + ' - ' + p.nome) + '.kmz', cidade: p.cidade, segmento: 'PROJETO', dataUrl: dataUrlKmz });
      passo('Desenho…');
      const doc = await pdfProjeto(p, false), anexos = [];
      if (doc) { try { anexos.push(await SN.guardarDataUrl(SN.pdfDataUrl(doc), nomeArq(p.id + ' - desenho e materiais') + '.pdf', 'arquivo', 'atividades-projeto')); } catch (e) { SN.toast('Desenho em PDF não subiu: ' + e.message, 'alerta'); } }
      passo('Obra…');
      const ruas = (p.ruas || []).map(r => r.nome).filter(n => n && n !== '(sem nome)');
      const rota = { segmento: 'PROJETO', cidade: p.cidade, pop: p.pop || '', endereco: ruas.length ? (ruas.length > 2 ? ruas[0] + ' → … → ' + ruas[ruas.length - 1] : ruas.join(' → ')) : (p.destino && p.destino.txt) || p.nome,
        servico: `${p.nome} — ${(PR.CABOS[params(p).cabo] || {}).rot || ''}, ${SN.num((p.orcamento.metricas || {}).cabo)} m de cabo, ${(p.orcamento.metricas || {}).postes || 0} postes (${(PR.ANCORAGENS[params(p).ancoragem] || {}).rot || ''})`,
        solicitante: p.solicitante || '', notificacao: '', metros_previstos: (p.orcamento.metricas || {}).cabo || '', local_url: up.url, prestador: emp, tecnico: tec, data_planejada: data, data_limite: lim,
        observacao: p.obs || '', anexos: anexos.filter(x => /^drive:/.test(String(x.id || ''))), conta: p.conta, id_projeto: p.id, chave_cliente: p.id, projeto: pacote(p) };
      const r = await SN.vst.exec('VST_ROTA_SALVAR', { rota });
      if (desp) { passo('Despachando…'); await SN.vst.exec('VST_ROTA_STATUS', { id_rota: r.rota.id_rota, para: 'DESPACHADA' }); }
      const u = SN.usuario() || {};
      p.status = 'APROVADO'; p.id_rota = r.rota.id_rota;
      p.aprovacao = { por: u.nome || '', ts: SN.agora(), prestador: emp, tecnico: tec, data, data_limite: lim, despachada: desp, kmz_url: up.url };
      hist(p, 'APROVADO', `${emp}${tec ? ' · ' + tec : ''} · obra ${r.rota.id_rota}`); SN.log('PROJETO_APROVADO', p.id, r.rota.id_rota + ' · ' + SN.brl(p.orcamento.total));
      mudou(p, true); await SN.salvarAgora();
      if (SN.sincronizar) SN.sincronizar().catch(() => { });
      SN.toast(`Aprovado: obra ${r.rota.id_rota}${desp ? ' despachada para ' + emp : ' planejada'}.`, 'ok'); abrirProjeto(p.id);
    } finally { fim(); bt.disabled = false; bt.textContent = '✔ Aprovar e gerar obra'; }
  };

  // ═══════════════════════════ Desenho (imagem) e PDF ═══════════════════════════
  // Imagem do traçado sobre o satélite (tiles do Esri, que liberam CORS), com os símbolos do padrão.
  const lon2x = (lng, z) => (lng + 180) / 360 * 256 * Math.pow(2, z);
  const lat2y = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * Math.pow(2, z); };
  const imagemMapa = async (proj, W, H, opts) => {
    const ps = proj.postes, els = proj.elementos || [], o = Object.assign({}, PR.PARAMS_PADRAO, proj.params || {}), k = o.ancoragem === 'FITA' ? 'FITA' : 'BAP';
    if (!ps.length) return null;
    let z = 19; const lats = ps.map(x => x.lat), lngs = ps.map(x => x.lng);
    const caixa = { n: Math.max(...lats), s: Math.min(...lats), l: Math.max(...lngs), o: Math.min(...lngs) };
    while (z > 3 && (lon2x(caixa.l, z) - lon2x(caixa.o, z) > W * 0.86 || lat2y(caixa.s, z) - lat2y(caixa.n, z) > H * 0.86)) z--;
    const cx = (lon2x(caixa.l, z) + lon2x(caixa.o, z)) / 2, cy = (lat2y(caixa.s, z) + lat2y(caixa.n, z)) / 2, x0 = cx - W / 2, y0 = cy - H / 2;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = '#e8ebe4'; g.fillRect(0, 0, W, H);
    const carregar = src => new Promise(ok => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; setTimeout(() => ok(null), 12000); });
    const tiles = [];
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + W) / 256); tx++) for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + H) / 256); ty++) tiles.push([tx, ty]);
    const desenhar = async url => { const ims = await Promise.all(tiles.map(([tx, ty]) => carregar(url.replace('{z}', z).replace('{x}', tx).replace('{y}', ty)))); ims.forEach((im, n) => { if (im) g.drawImage(im, tiles[n][0] * 256 - x0, tiles[n][1] * 256 - y0); }); return ims.filter(Boolean).length; };
    if (!(opts && opts.semFundo)) { await desenhar(SAT); await desenhar(RUAS_SAT); }
    const P_ = (lat, lng) => [lon2x(lng, z) - x0, lat2y(lat, z) - y0];
    g.save(); const ES = (opts && opts.escala) || 1;
    const pts = ps.map(x => P_(x.lat, x.lng)), linha = (cor, w, a) => { g.globalAlpha = a; g.strokeStyle = cor; g.lineWidth = w; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.globalAlpha = 1; };
    if (o.ancoragem === 'BAP_EXIST') linha('#FF7F1E', 12 * ES, 0.7);
    if (o.ancoragem === 'BAP') linha('#ffffff', 6 * ES, 1);
    linha((PR.CABOS[o.cabo] || PR.CABOS['12']).cor, 3.5 * ES, 1);
    ps.forEach((x, i) => { const [px, py] = pts[i]; g.save(); g.translate(px, py); g.scale(ES, ES); g.translate(-px, -py);
      if (k === 'BAP') { g.lineWidth = 3; g.strokeStyle = '#222'; g.beginPath(); g.arc(px, py, 5, 0, 7); g.stroke(); g.lineWidth = 1.6; g.strokeStyle = '#fff'; g.beginPath(); g.arc(px, py, 5, 0, 7); g.stroke();
        if (x.t === 'P') { g.strokeStyle = '#222'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(px - 3.5, py - 3.5); g.lineTo(px + 3.5, py + 3.5); g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.stroke(); } }
      else if (x.t === 'E') { const gr = g.createRadialGradient(px - 2, py - 2, 1, px, py, 6); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#666'); g.fillStyle = gr; g.beginPath(); g.arc(px, py, 6, 0, 7); g.fill(); }
      else { g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 1.4; g.beginPath(); g.arc(px, py, 4.5, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#111'; g.beginPath(); g.arc(px, py, 1.8, 0, 7); g.fill(); }
      if (opts && opts.numerar && (i % opts.numerar === 0 || i === ps.length - 1)) { g.font = '10px Arial'; g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText('P' + (i + 1), px + 7, py - 6); g.fillText('P' + (i + 1), px + 7, py - 6); }
      g.restore(); });
    const CORES = { CEO_EXIST: '#F5E400', CEO_NOVA: '#7B4DFF', CTO_NOVA: '#FF5FB0', TERCEIRO: '#F04B4B', RT: '#FF6B5A', CLIENTE: '#5BE36B' };
    els.forEach(e => { const pos = PR.posicaoElemento(e, ps); if (!pos) return; const [px, py] = P_(pos[0], pos[1]), def = PR.ELEMENTOS[e.t] || {}; g.save(); g.translate(px, py); g.scale(ES, ES); g.translate(-px, -py);
      if (CORES[e.t]) { g.fillStyle = CORES[e.t]; g.strokeStyle = '#222'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(px, py); g.bezierCurveTo(px - 9, py - 12, px - 8, py - 22, px, py - 22); g.bezierCurveTo(px + 8, py - 22, px + 9, py - 12, px, py); g.fill(); g.stroke();
        if (e.t === 'RT') { g.fillStyle = '#111'; g.font = 'bold 9px Arial'; g.fillText('R', px - 3, py - 12); } }
      else { g.fillStyle = e.t === 'INFO' ? '#C9B800' : '#fff'; g.strokeStyle = '#222'; g.lineWidth = 1.5; g.beginPath(); g.rect(px - 6, py - 6, 12, 12); g.fill(); g.stroke(); }
      const rot = e.t === 'INFO' ? (e.txt || 'INFO') : (e.nome || def.kml || e.t); g.font = 'bold 11px Arial'; g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText(rot, px + 9, py - 10); g.fillText(rot, px + 9, py - 10); g.restore(); });
    g.restore();
    // Norte e escala
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(W - 46, 10, 36, 44); g.fillStyle = '#111'; g.font = 'bold 14px Arial'; g.fillText('N', W - 33, 26); g.beginPath(); g.moveTo(W - 28, 30); g.lineTo(W - 22, 48); g.lineTo(W - 34, 48); g.closePath(); g.fill();
    const mpp = 156543.03 * Math.cos(((caixa.n + caixa.s) / 2) * Math.PI / 180) / Math.pow(2, z), alvo = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find(m => m / mpp > 70) || 5000, larg = alvo / mpp;
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(10, H - 30, larg + 50, 22); g.fillStyle = '#111'; g.fillRect(16, H - 16, larg, 4); g.font = '11px Arial'; g.fillText(alvo >= 1000 ? alvo / 1000 + ' km' : alvo + ' m', 22 + larg, H - 12);
    return cv.toDataURL('image/jpeg', 0.86);
  };
  // PDF: página 1 = desenho (paisagem) com legenda e carimbo; depois dados, ruas, materiais e LPU.
  // comValores = false → versão da equipe (sem nenhum valor).
  const pdfProjeto = async (p, comValores) => {
    if (!window.jspdf) { SN.toast('Biblioteca de PDF indisponível (sem internet?).', 'erro'); return null; }
    const ps = postesDe(p); if (!ps.length) { SN.toast('Sem traçado.', 'erro'); return null; }
    const o = ['RASCUNHO', 'REPROVADO'].includes(p.status) ? orcar(p) : p.orcamento, pr = params(p), m = PR.metricas({ ...p, postes: ps });
    const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const img = await imagemMapa({ ...p, postes: ps }, 1600, 1000, { numerar: Math.max(1, Math.ceil(ps.length / 40)), escala: 1.7 });
    doc.setFillColor(61, 79, 17); doc.rect(0, 0, 297, 14, 'F');
    try { doc.addImage(MARCA.LETRAS, 'PNG', 8, 2.5, 29, 9); } catch (e) { }
    doc.setTextColor(255); doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text(`${p.id} · ${p.nome || ''}`.slice(0, 110), 42, 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text('Projeto de rede · padrão IOP.2.5.1.001R01' + (comValores ? ' · ORÇAMENTO' : ' · equipe (sem valores)'), 289, 9, { align: 'right' });
    doc.setTextColor(29, 38, 20);
    if (img) doc.addImage(img, 'JPEG', 8, 18, 208, 130);
    // Carimbo / legenda
    const lx = 220; let y = 22; doc.setFontSize(9);
    const lin = (r, v) => { doc.setFont('helvetica', 'bold'); doc.text(r, lx, y); doc.setFont('helvetica', 'normal'); const t = doc.splitTextToSize(String(v || '—'), 40); doc.text(t, lx + 28, y); y += 4.6 * t.length; };
    lin('Cidade', p.cidade); lin('POP', p.pop); lin('Conta', p.conta ? p.conta.slice(-4) + ' · ' + ((SN.conta(p.conta) || {}).nome || '') : ''); lin('Cliente', p.cliente);
    lin('Cabo', (PR.CABOS[pr.cabo] || {}).rot); lin('Ancoragem', (PR.ANCORAGENS[pr.ancoragem] || {}).rot); lin('Traçado', fmtM(m.tracado)); lin('Cabo previsto', fmtM(m.cabo));
    lin('Postes', `${m.postes} (${m.enc} encab. · ${m.pas} passagem)`); lin('RT', String(m.rt)); lin('Status', (PR.STATUS[p.status] || {}).rot); lin('Data', SN.data(SN.agora()));
    y += 2; doc.setFont('helvetica', 'bold'); doc.text('Legenda', lx, y); y += 4; doc.setFont('helvetica', 'normal');
    const cor = h => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const leg = (rgb, txt, larg) => { doc.setDrawColor(...rgb); doc.setLineWidth(larg || 1.2); doc.line(lx, y - 1, lx + 10, y - 1); doc.text(txt, lx + 13, y); y += 4.4; };
    leg(cor((PR.CABOS[pr.cabo] || PR.CABOS['12']).cor), (PR.CABOS[pr.cabo] || {}).rot || 'Cabo');
    if (pr.ancoragem === 'BAP') leg([190, 190, 190], 'Cordoalha dielétrica');
    if (pr.ancoragem === 'BAP_EXIST') leg([255, 127, 30], 'Rede existente', 2.5);
    doc.setLineWidth(0.3); doc.setDrawColor(0);
    [['Encabeçamento', 'E'], ['Passagem', 'P']].forEach(([t, k]) => { doc.circle(lx + 5, y - 1.3, 1.6); if (k === 'P' && pr.ancoragem !== 'FITA') doc.line(lx + 3.9, y - 2.4, lx + 6.1, y - 0.2); doc.text(t + (pr.ancoragem === 'FITA' ? ' c/ fita' : ' c/ BAP'), lx + 13, y); y += 4.4; });
    const tiposEl = [...new Set((p.elementos || []).map(e => e.t))];
    tiposEl.forEach(t => { const c = { CEO_EXIST: [245, 228, 0], CEO_NOVA: [123, 77, 255], CTO_NOVA: [255, 95, 176], TERCEIRO: [240, 75, 75], RT: [255, 107, 90], CLIENTE: [91, 227, 107] }[t] || [255, 255, 255];
      doc.setFillColor(...c); doc.circle(lx + 5, y - 1.3, 1.7, 'FD'); doc.text((PR.ELEMENTOS[t] || {}).rot || t, lx + 13, y); y += 4.4; });
    doc.setFontSize(7); doc.setTextColor(110); doc.text('Imagens © Esri. Postes e vãos do projeto: conferir em campo antes de lançar.', 8, 152);
    // Página 2+: listas
    doc.addPage('a4', 'portrait'); doc._y = 16; doc.setTextColor(29, 38, 20);
    const sec = t => { doc._y += 4; if (doc._y > 270) { doc.addPage('a4', 'portrait'); doc._y = 16; } doc.setFillColor(242, 247, 232); doc.rect(10, doc._y - 4.5, 190, 7, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(t, 12, doc._y); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc._y += 7; };
    const linha = (cols, larg, negrito) => {
      const partes = cols.map((c, i) => doc.splitTextToSize(String(c == null ? '' : c), larg[i] - 2)), h = Math.max(...partes.map(x => x.length)) * 3.8 + 1;
      if (doc._y + h > 285) { doc.addPage('a4', 'portrait'); doc._y = 16; }
      let x = 12; doc.setFont('helvetica', negrito ? 'bold' : 'normal');
      partes.forEach((t, i) => { const dir = /^num/.test(larg.al && larg.al[i] || ''); doc.text(t, dir ? x + larg[i] - 2 : x, doc._y, dir ? { align: 'right' } : undefined); x += larg[i]; });
      doc._y += h; doc.setDrawColor(225); doc.line(12, doc._y - 3, 198, doc._y - 3);
    };
    sec(`${p.id} · ${p.nome || ''}`.slice(0, 95));
    [['Cidade / POP', [p.cidade, p.pop].filter(Boolean).join(' · ')], ['Conta', SN.contaTxt(p.conta)], ['Solicitante', p.solicitante], ['Observação', p.obs]].forEach(([r, v]) => { if (v) linha([r, v], [40, 146]); });
    if ((p.ruas || []).length) { sec('Ruas do trajeto'); linha(['Rua', 'Postes', 'Metros'], Object.assign([120, 30, 36], { al: ['', 'num', 'num'] }), true); p.ruas.forEach(r => linha([r.nome, r.postes, SN.num(r.metros)], Object.assign([120, 30, 36], { al: ['', 'num', 'num'] }))); }
    const elementos = (p.elementos || []).filter(e => e.t !== 'INFO' || e.txt);
    if (elementos.length) { sec('Elementos da rede'); elementos.forEach(e => linha([`P${String(e.i + 1).padStart(2, '0')}`, ((PR.ELEMENTOS[e.t] || {}).rot || e.t) + (e.nome ? ' ' + e.nome : '') + (e.t === 'INFO' ? ': ' + e.txt : '') + (e.fus ? ` · ${e.fus} fusão(ões)` : '')], [20, 166])); }
    const LM = comValores ? Object.assign([24, 92, 22, 22, 26], { al: ['', '', 'num', 'num', 'num'] }) : Object.assign([26, 120, 40], { al: ['', '', 'num'] });
    sec('Materiais');
    linha(comValores ? ['Código', 'Material', 'Qtd', 'Unit.', 'Total'] : ['Código', 'Material', 'Quantidade'], LM, true);
    o.materiais.forEach(x => linha(comValores ? [x.cod, x.desc, SN.num(x.qtd, 2) + ' ' + (x.un || ''), SN.brl(x.unit), SN.brl(x.total)] : [x.cod, x.desc, SN.num(x.qtd, 2) + ' ' + (x.un || '')], LM));
    if (comValores) linha(['', 'Total de materiais', '', '', SN.brl(o.totalMat)], LM, true);
    sec('LPU · serviços previstos' + (comValores ? (o.critico ? ' (fator crítico)' : ' (fator comum)') : ' (quantidade estimada)'));
    linha(comValores ? ['Código', 'Serviço', 'Qtd', 'Unit.', 'Total'] : ['Código', 'Serviço e descritivo técnico', 'Quantidade'], LM, true);
    o.lpu.forEach(x => { const it = SN.itemLpu(x.cod) || {}; linha(comValores ? [x.cod, it.desc || x.desc, SN.num(x.qtd, 2) + ' ' + (it.medida || ''), SN.brl(x.unit), SN.brl(x.total)]
      : [x.cod, (it.desc || x.desc) + (it.tec ? '\n' + it.tec : ''), SN.num(x.qtd, 2) + ' ' + (it.medida || '')], LM); });
    if (comValores) { linha(['', 'Total da LPU', '', '', SN.brl(o.totalLpu)], LM, true); sec('Total da obra: ' + SN.brl(o.total)); (o.memoria || []).forEach(t => linha(['•', t], [6, 180])); }
    else { doc._y += 3; doc.setFontSize(8); doc.setTextColor(90); doc.text(doc.splitTextToSize('Quantidades estimadas pelo projeto. Aponte no SigoNet o que foi realmente executado; a LPU é paga pelo que a revisão aprovar.', 186), 12, doc._y); }
    return doc;
  };

  // ═══════════════════════════ Pacote na OS da equipe ═══════════════════════════
  // r = obra (rota PROJETO) como o técnico recebe: só quantidades e descrições.
  SN.prj = {
    pdfProjeto: (p, comValores) => pdfProjeto(p, comValores), // também usado nos testes
    htmlPacoteTecnico: r => {
      const pj = r.projeto || {}, cab = pj.cabo_rot || '';
      return `<div class="card" style="margin-bottom:10px"><h3>📐 Projeto ${esc(r.id_projeto || '')}</h3>
        <div class="small">${esc(cab)} · ${esc(pj.ancoragem_rot || '')}<br>Traçado <b>${fmtM(pj.metros_tracado)}</b> · cabo previsto <b>${fmtM(pj.metros_cabo)}</b> · <b>${SN.num(pj.n_postes)}</b> postes</div>
        <div class="acoes" style="margin-top:8px">${r.local_url ? `<a class="btn sm prim" href="${esc(r.local_url)}" target="_blank" rel="noopener">🌍 Abrir KMZ</a>` : ''}<button class="btn sm" id="pjVerMapa">🗺️ Ver traçado</button></div>
        <div id="pjMapa" class="prj-mapa prj-mapa-tec" hidden></div>
        ${(pj.ruas || []).length ? `<details style="margin-top:8px"><summary class="small"><b>Ruas</b> (${pj.ruas.length})</summary><div class="small">${pj.ruas.map(x => `${esc(x.nome)} — ${SN.num(x.postes)} postes, ${SN.num(x.metros)} m`).join('<br>')}</div></details>` : ''}
        <details style="margin-top:8px" open><summary class="small"><b>Materiais a usar</b> (${(pj.materiais || []).length})</summary>
          <table class="tab small"><tbody>${(pj.materiais || []).map(x => `<tr><td>${esc(x.desc)}<div class="muted mono">${esc(x.cod)}</div></td><td class="num nowrap">${SN.num(x.qtd, 2)} ${esc(x.un)}</td></tr>`).join('')}</tbody></table></details>
        <details style="margin-top:8px" open><summary class="small"><b>LPU prevista</b> (quantidade estimada)</summary>
          ${(pj.lpu || []).map(x => { const it = SN.itemLpu(x.cod) || {}; return `<div class="item-lpu" style="grid-template-columns:1fr auto"><div><div class="d">${esc(it.desc || x.cod)}</div><div class="c mono">${esc(x.cod)}</div>${it.tec ? `<div class="t">${esc(it.tec)}</div>` : ''}</div><div class="nowrap small"><b>${SN.num(x.qtd, 2)}</b> ${esc(it.medida || '')}</div></div>`; }).join('')}</details>
        ${(pj.elementos || []).filter(e => e.t === 'INFO').map(e => `<div class="aviso info small" style="margin-top:6px">ℹ️ Poste P${e.i + 1}: ${esc(e.txt)}</div>`).join('')}
      </div>`;
    },
    ligarPacoteTecnico: r => {
      const b = SN.$('#pjVerMapa'); if (!b) return;
      b.onclick = async () => {
        const el = SN.$('#pjMapa'); el.hidden = !el.hidden; if (el.hidden || el._feito) return;
        try {
          await carregarLeaflet(); const L = window.L, pj = r.projeto, ps = PR.decodificarPostes(pj.postes || '', { ancoragem: pj.ancoragem }), k = pj.ancoragem === 'FITA' ? 'FITA' : 'BAP';
          const mapa = L.map(el).setView([ps[0].lat, ps[0].lng], 17); el._feito = true;
          L.layerGroup([L.tileLayer(SAT, { maxNativeZoom: 19, maxZoom: 21 }), L.tileLayer(RUAS_SAT, { maxNativeZoom: 19, maxZoom: 21 })]).addTo(mapa);
          L.polyline(ps.map(x => [x.lat, x.lng]), { color: (PR.CABOS[pj.cabo] || PR.CABOS['12']).cor, weight: 4 }).addTo(mapa);
          ps.forEach((x, i) => L.marker([x.lat, x.lng], { icon: icone(svgPoste(k, x.t), 16, 16) }).addTo(mapa).bindTooltip('P' + (i + 1) + ' · ' + (x.t === 'E' ? 'encabeçamento' : 'passagem')));
          (pj.elementos || []).forEach(e => { const pos = PR.posicaoElemento(e, ps), svg = SVG_EL[e.t]; if (pos && svg) L.marker(pos, { icon: icone(svg, 22, 30, 29) }).addTo(mapa).bindTooltip(esc(e.t === 'INFO' ? e.txt : e.nome || (PR.ELEMENTOS[e.t] || {}).kml || e.t), { permanent: true, direction: 'right', className: 'prj-rot' }); });
          mapa.fitBounds(L.latLngBounds(ps.map(x => [x.lat, x.lng])).pad(0.1));
          if (navigator.geolocation) navigator.geolocation.getCurrentPosition(g => L.circleMarker([g.coords.latitude, g.coords.longitude], { radius: 7, color: '#fff', fillColor: '#2b6cb0', fillOpacity: 1, weight: 2 }).addTo(mapa).bindTooltip('Você'), () => { }, { timeout: 8000 });
        } catch (e) { el.innerHTML = `<div class="aviso erro small">Mapa indisponível: ${esc(e.message)}</div>`; }
      };
    }
  };
})();
