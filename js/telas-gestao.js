// SIGONET V2 — Gestões vinculadas ao chamado (ciclo administrativo próprio):
// Gestão de LPU (líder), Service Desk (contabilização e pagamento),
// Gestão de Materiais e Cadastro de Fibra.

SN.PAG_STATUS = {
  AGUARDANDO_NF: { rot: 'Aguardando NF do prestador', cls: 'alerta' },
  NF_ANEXADA:    { rot: 'NF anexada · aguardando pagamento', cls: 'info' },
  PAGO:          { rot: 'Pago', cls: 'ok' }
};
SN.opcoesEmpresas = sel => SN.db.empresas.map(e => `<option ${e.nome === sel ? 'selected' : ''}>${SN.esc(e.nome)}</option>`).join('');
SN.opcoesContas = sel => SN.db.contas.map(c => `<option value="${c.codigo}" ${c.codigo === sel ? 'selected' : ''}>${SN.esc(SN.contaTxt(c.codigo))}</option>`).join('');
SN.chipsStatus = (mapa, atual, contar) => `<div class="abas">${[['', 'Todos'], ...Object.entries(mapa).map(([k, v]) => [k, v.rot])].map(([k, r]) =>
  `<button class="aba ${k === atual ? 'ativa' : ''}" data-st="${k}">${r}<span class="n">${contar(k)}</span></button>`).join('')}</div>`;
SN.valorLpuTxt = l => l.vinculo === 'PRESTADOR' ? SN.brl(SN.valorLpu(l)) : l.vinculo === 'CLT' ? SN.hhTxt(SN.hhDaLpu(l)) : 'Produção';
SN.cicloDe = l => { const c = SN.db.chamados.find(x => x.id === l.chamadoId); return SN.mesChave((c && c.tempos.conclusaoTecnica) || l.enviadoEm || l.criadoEm); };
SN.previsaoPagamento = ciclo => { const [a, m] = ciclo.split('-').map(Number); return new Date(a, m, CICLO_LPU.diaPagamento).toISOString(); };

// ═══════════════════════════ Gestão de LPU ═══════════════════════════
SN.fLpu = { st: 'AGUARDANDO_LIDER', conta: '', emp: '', q: '', aba: 'fila' };
SN.abasLpu = aba => `<div class="abas"><button class="aba ${aba === 'fila' ? 'ativa' : ''}" data-abalpu="fila">Fila de aprovação</button><button class="aba ${aba === 'base' ? 'ativa' : ''}" data-abalpu="base" title="Histórico completo, soma por serviço e acumulado do ano">🗂️ Base de LPU</button></div>`;
SN.ligarAbasLpu = () => SN.$$('[data-abalpu]').forEach(b => b.onclick = () => { SN.fLpu.aba = b.dataset.abalpu; SN.telaLpu(); });
SN.telaLpu = abrirId => {
  const f = SN.fLpu;
  if (f.aba === 'base') return SN.telaLpuBase(abrirId);
  const base = SN.db.lpus.filter(l => (!f.conta || l.cab.conta === f.conta) && (!f.emp || l.cab.empresa === f.emp)
    && (!f.q || SN.normal([l.id, l.chamadoId, l.cab.cliente, l.cab.tecnico, l.cab.etiqueta].join(' ')).includes(SN.normal(f.q))));
  const lista = base.filter(l => !f.st || l.status === f.st).sort((a, b) => (b.enviadoEm || '').localeCompare(a.enviadoEm || ''));
  // Obras concluídas cuja LPU ainda não foi apontada (por empresa) — não prende o chamado, só mostra a pendência.
  const pend = {};
  SN.db.chamados.filter(c => ['CONCLUIDO_TECNICO', 'FECHADO'].includes(c.status)).forEach(c => {
    const add = (emp, papel) => { if (!emp || SN.db.lpus.some(l => l.chamadoId === c.id && l.papel === papel)) return;
      if (f.conta && c.conta !== f.conta) return; (pend[emp] = pend[emp] || []).push(c.id); };
    add(c.empresa, 'titular'); if (c.apoio) add(c.apoio.empresa, 'apoio');
  });
  SN.casca('lpu', `
    <div class="cab-pagina"><div><h1>Gestão de LPU</h1><p>O líder visualiza, confere, edita (com log), aprova ou reprova e envia ao Service Desk. Não depende do fechamento do chamado.</p></div>
      <div class="acoes"><button class="btn" id="bExpLpu">Exportar</button></div></div>
    ${SN.abasLpu('fila')}
    ${SN.chipsStatus(SN.LPU_STATUS, f.st, k => base.filter(l => !k || l.status === k).length)}
    <div class="card card-filtros"><div class="filtros">
      <select class="inp" id="fConta"><option value="">Todas as contas</option>${SN.opcoesContas(f.conta)}</select>
      <select class="inp" id="fEmp"><option value="">Todos os prestadores</option>${SN.opcoesEmpresas(f.emp)}</select>
      <input class="inp busca" id="fQ" placeholder="Buscar etiqueta, chamado, cliente, técnico…" value="${SN.esc(f.q)}"></div></div>
    <div class="card"><div class="tabela-wrap"><table class="tab"><thead><tr><th>LPU</th><th>Chamado</th><th>Etiqueta</th><th>Cliente</th><th>Empresa · técnico</th><th>Conta</th><th>Vínculo</th><th class="num">Valor / h·h</th><th>Status</th><th>Enviado</th></tr></thead><tbody>
      ${lista.map(l => `<tr class="clic" data-id="${l.id}"><td class="mono">${l.id}${l.papel === 'apoio' ? ' <span class="badge">APOIO</span>' : ''}</td><td class="mono">${l.chamadoId}</td><td class="mono nowrap">${SN.esc(l.cab.etiqueta || '—')}</td>
        <td>${SN.esc(l.cab.cliente)}</td><td>${SN.esc(l.cab.empresa)} · ${SN.esc(l.cab.tecnico)}</td><td class="small">${SN.esc(SN.contaTxt(l.cab.conta))}</td>
        <td>${l.vinculo}${(() => { const n = (l.itens || []).reduce((s, it) => s + (it.fotos || []).length, 0); return n ? ` <span class="badge" title="Fotos do técnico">📷 ${n}</span>` : ''; })()}</td><td class="num">${SN.valorLpuTxt(l)}</td><td>${SN.badgeLpu(l.status)}</td><td class="nowrap">${SN.dt(l.enviadoEm)}</td></tr>`).join('')
        || '<tr><td colspan="10" class="muted center">Nenhuma LPU neste filtro.</td></tr>'}</tbody></table></div></div>
    <div class="card"><div class="card-tit"><h3>Aguardando preenchimento do técnico</h3><span class="muted small">chamados já concluídos sem LPU apontada</span></div>
      ${Object.keys(pend).length ? `<div class="barras">${Object.entries(pend).sort((a, b) => b[1].length - a[1].length).map(([e, ids]) =>
        `<div class="barra" title="${ids.join(', ')}"><span class="nm">${SN.esc(e)}</span><div class="trilho"><div class="fill" style="width:${ids.length / Math.max(...Object.values(pend).map(x => x.length)) * 100}%"></div></div><span class="v">${ids.length} obra(s)</span></div>`).join('')}</div>`
        : '<p class="muted">Nenhuma pendência.</p>'}</div>`);
  SN.ligarAbasLpu();
  SN.$$('[data-st]').forEach(b => b.onclick = () => { f.st = b.dataset.st; SN.telaLpu(); });
  SN.$('#fConta').onchange = e => { f.conta = e.target.value; SN.telaLpu(); };
  SN.$('#fEmp').onchange = e => { f.emp = e.target.value; SN.telaLpu(); };
  SN.$('#fQ').oninput = SN.debounce(e => { f.q = e.target.value; SN.telaLpu(); SN.$('#fQ').focus(); SN.$('#fQ').setSelectionRange(99, 99); }, 350);
  SN.$$('tr[data-id]').forEach(tr => tr.onclick = () => SN.detalheLpu(tr.dataset.id));
  SN.$('#bExpLpu').onclick = () => SN.exportar('lpu', lista.flatMap(l => (l.itens.length ? l.itens : [{}]).map(it => {
    const cat = SN.itemLpu(it.cod) || {};
    return { LPU: l.id, Chamado: l.chamadoId, Etiqueta: l.cab.etiqueta || '', Cliente: l.cab.cliente, Empresa: l.cab.empresa, CNPJ: l.cab.cnpj, Tecnico: l.cab.tecnico, Papel: l.papel,
      Conta: l.cab.conta, Vinculo: l.vinculo, Codigo: it.cod || '', Servico: cat.desc || '', Qtd: it.qtd || '', Fator: it.fator || '',
      Fotos: (it.fotos || []).length || '', Valor: l.vinculo === 'PRESTADOR' && it.cod ? SN.valorItem(it) : '', HoraHomem: l.vinculo === 'CLT' ? +SN.hhDaLpu(l).horas.toFixed(2) : '', Status: SN.LPU_STATUS[l.status].rot, Enviado: SN.dt(l.enviadoEm) };
  })));
  if (abrirId) SN.detalheLpu(abrirId);
};
SN.rota('/lpu', () => SN.telaLpu(), { tela: 'lpu' });
SN.rota('/lpu/:id', id => SN.telaLpu(id), { tela: 'lpu' });

// ── Base de LPU: todo o histórico com busca por período, soma por serviço e acumulado do ano ──
// Só leitura (a aprovação continua na Fila); clicar na linha abre o mesmo detalhe da LPU.
SN.fLpuB = { st: '', conta: '', emp: '', q: '', base: 'enviado', vis: 'registros' };
SN.DATAS_LPU = [['enviado', 'Data de envio pelo técnico'], ['aprovado', 'Data de aprovação do líder'], ['contabilizado', 'Data de contabilização (Service Desk)']];
SN.dataLpu = (l, base) => base === 'aprovado' ? (l.aprovadoEm || (l.assinaturaLider && l.assinaturaLider.ts) || '')
  : base === 'contabilizado' ? (l.contabilizadoEm || (l.assinaturaSD && l.assinaturaSD.ts) || '') : (l.enviadoEm || l.criadoEm || '');
SN.hhLpu = l => l.vinculo === 'CLT' ? (SN.hhDaLpu(l).horas || 0) : 0;
SN.telaLpuBase = abrirId => {
  const f = SN.fLpuB, P = SN.periodo, anual = f.vis === 'ano', de = () => SN.telaLpu();
  if (SN.buscarPeriodo('lpu', '/lpu', de, anual ? 'ano' : null)) return;
  const iv = SN.intervaloMat(anual ? 'ano' : P.per, P.ref), ano = P.ref.slice(0, 4), q = SN.normal(f.q);
  const texto = l => SN.normal([l.id, l.chamadoId, l.cab.cliente, l.cab.etiqueta, l.cab.tecnico, l.cab.empresa, l.cab.conta, SN.contaTxt(l.cab.conta),
    l.assinaturaLider && l.assinaturaLider.nome, l.assinaturaSD && l.assinaturaSD.nome, ...(l.itens || []).map(i => i.cod + ' ' + ((SN.itemLpu(i.cod) || {}).desc || ''))].join(' '));
  const base = SN.db.lpus.filter(l => SN.noIntervalo(SN.dataLpu(l, f.base), iv) && (!f.conta || l.cab.conta === f.conta) && (!f.emp || l.cab.empresa === f.emp) && (!q || texto(l).includes(q)));
  const lista = base.filter(l => !f.st || l.status === f.st).sort((a, b) => SN.dataLpu(b, f.base).localeCompare(SN.dataLpu(a, f.base)));
  const valor = lista.reduce((s, l) => s + SN.valorLpu(l), 0), hh = lista.reduce((s, l) => s + SN.hhLpu(l), 0);
  // Soma por serviço
  const porCod = {};
  lista.forEach(l => (l.itens || []).forEach(it => { const cat = SN.itemLpu(it.cod) || {}; const x = porCod[it.cod] = porCod[it.cod] || { cod: it.cod, desc: cat.desc || '', classe: cat.classe || '', medida: cat.medida || '', qtd: 0, valor: 0, lpus: new Set() };
    x.qtd += Number(it.qtd) || 0; if (l.vinculo === 'PRESTADOR') x.valor += SN.valorItem(it); x.lpus.add(l.id); }));
  const servicos = Object.values(porCod).sort((a, b) => b.valor - a.valor || b.qtd - a.qtd);
  // Acumulado do ano
  const porMes = chave => { const g = {}; lista.forEach(l => { const d0 = SN.dataLpu(l, f.base); if (!d0) return; const i = SN.mesDoAno(d0);
    [].concat(chave(l)).forEach(([k, sub, v]) => { if (!v) return; const x = g[k] = g[k] || { rot: k, sub, mes: Array(12).fill(0) }; x.mes[i] += v; }); }); return Object.values(g)
    .sort((a, b) => b.mes.reduce((s, v) => s + v, 0) - a.mes.reduce((s, v) => s + v, 0)); };
  const anoValor = anual ? porMes(l => [[l.cab.empresa || '—', '', SN.valorLpu(l)]]) : [];
  const anoHh = anual ? porMes(l => [[l.cab.empresa || '—', '', SN.hhLpu(l)]]) : [];
  const anoConta = anual ? porMes(l => [[SN.contaTxt(l.cab.conta) || '—', '', SN.valorLpu(l)]]) : [];
  const anoSt = anual ? porMes(l => [[SN.LPU_STATUS[l.status] ? SN.LPU_STATUS[l.status].rot : l.status, '', 1]]) : [];
  const anoSrv = anual ? porMes(l => (l.itens || []).map(it => [it.cod, (SN.itemLpu(it.cod) || {}).desc || '', Number(it.qtd) || 0])) : [];
  SN.casca('lpu', `
    <div class="cab-pagina"><div><h1>Gestão de LPU</h1><p>Base de LPU: todo o histórico de cobrança com busca por período, soma por serviço e acumulado do ano. A aprovação continua na Fila.</p></div>
      <div class="acoes"><button class="btn" id="bExpLpuB">Exportar Excel</button></div></div>
    ${SN.abasLpu('base')}
    <div class="card card-filtros">${SN.htmlPeriodo()}
      ${anual ? `<p class="small" style="margin:8px 0 0">📅 <b>Acumulado de ${ano}</b>: a visão anual usa o ano inteiro da data de referência (troque o ano com ◀ ▶ em "Ano").</p>` : ''}
      <div class="filtros">
        <select class="inp" id="fBaseL" title="Qual data conta para o período">${SN.DATAS_LPU.map(([k, r]) => `<option value="${k}" ${f.base === k ? 'selected' : ''}>${r}</option>`).join('')}</select>
        <select class="inp" id="fContaL"><option value="">Todas as contas</option>${SN.opcoesContas(f.conta)}</select>
        <select class="inp" id="fEmpL"><option value="">Todos os prestadores</option>${SN.opcoesEmpresas(f.emp)}</select>
        <input class="inp busca" id="fQL" placeholder="Buscar: etiqueta, LPU, chamado, cliente, técnico, quem aprovou, código do serviço…" value="${SN.esc(f.q)}">
      </div></div>
    <div class="kpis-c">
      <div class="kpi destaque"><div class="rot">LPUs</div><div class="val">${lista.length}</div><div class="sub">${anual ? 'no ano de ' + ano : 'no período e filtros'}</div></div>
      <div class="kpi"><div class="rot">Valor (prestadores)</div><div class="val" style="font-size:1.3rem">${SN.brl(valor)}</div><div class="sub">soma dos itens da LPU</div></div>
      <div class="kpi"><div class="rot">Hora-homem (CLT)</div><div class="val">${SN.num(hh, 1)}</div><div class="sub">h·h calculada pelos tempos</div></div>
      <div class="kpi"><div class="rot">Aprovadas pelo líder</div><div class="val">${lista.filter(l => l.assinaturaLider).length}</div><div class="sub">${lista.filter(l => l.status === 'AGUARDANDO_LIDER').length} aguardando · ${lista.filter(l => ['CONTABILIZADA', 'EM_PAGAMENTO', 'PAGA'].includes(l.status)).length} contabilizadas</div></div></div>
    <div class="barra-vis">${SN.chipsStatus(SN.LPU_STATUS, f.st, k => base.filter(l => !k || l.status === k).length)}
      <div class="seg" role="group" aria-label="Visão"><button type="button" class="${f.vis === 'registros' ? 'sel' : ''}" data-visl="registros">Registros</button><button type="button" class="${f.vis === 'servico' ? 'sel' : ''}" data-visl="servico">Por serviço</button><button type="button" class="${anual ? 'sel' : ''}" data-visl="ano">📅 Acumulado do ano</button></div></div>
    ${anual ? SN.tabelaAno(`Valor por prestador · ${ano} (R$)`, 'Empresa', anoValor, v => SN.brl(v), 'Nenhum valor no ano.')
      + (anoHh.length ? SN.tabelaAno(`Hora-homem CLT · ${ano} (h·h)`, 'Empresa', anoHh, v => SN.num(v, 1), '') : '')
      + SN.tabelaAno(`Valor por conta contábil · ${ano} (R$)`, 'Conta', anoConta, v => SN.brl(v), 'Nenhum valor no ano.')
      + SN.tabelaAno(`LPUs por status · ${ano}`, 'Status', anoSt, v => SN.num(v, 0), 'Nenhuma LPU no ano.')
      + SN.tabelaAno(`Quantidade por serviço · ${ano} (qtd)`, 'Serviço', anoSrv, v => SN.num(v, 0), 'Nenhum serviço no ano.')
    : f.vis === 'servico' ? `<div class="card"><div class="tabela-wrap"><table class="tab"><thead><tr><th>Código</th><th>Serviço</th><th>Classe</th><th>Medida</th><th class="num">Quantidade</th><th class="num">Valor</th><th class="num">LPUs</th></tr></thead><tbody>
      ${servicos.map(x => `<tr><td class="mono">${SN.esc(x.cod)}</td><td>${SN.esc(x.desc)}</td><td>${SN.esc(x.classe)}</td><td>${SN.esc(x.medida)}</td><td class="num">${SN.num(x.qtd, 2)}</td><td class="num">${SN.brl(x.valor)}</td><td class="num">${x.lpus.size}</td></tr>`).join('')
        || '<tr><td colspan="7" class="muted center">Nenhum serviço no período.</td></tr>'}</tbody></table></div></div>`
    : `<div class="card"><div class="tabela-wrap"><table class="tab small"><thead><tr><th>Data</th><th>LPU</th><th>Chamado</th><th>Etiqueta</th><th>Cliente</th><th>Empresa · técnico</th><th>Conta</th><th>Vínculo</th><th class="num">Valor / h·h</th><th>Status</th><th>Líder aprovou</th><th>Service Desk</th></tr></thead><tbody>
      ${lista.map(l => `<tr class="clic" data-idl="${l.id}"><td class="nowrap">${SN.dt(SN.dataLpu(l, f.base))}</td><td class="mono">${l.id}${l.papel === 'apoio' ? ' <span class="badge">APOIO</span>' : ''}</td><td class="mono">${l.chamadoId}</td>
        <td class="mono nowrap">${SN.esc(l.cab.etiqueta || '—')}</td><td>${SN.esc(l.cab.cliente)}</td><td>${SN.esc(l.cab.empresa)}<div class="muted">${SN.esc(l.cab.tecnico)}</div></td>
        <td>${SN.esc(SN.contaTxt(l.cab.conta))}</td><td>${l.vinculo}</td><td class="num">${SN.valorLpuTxt(l)}</td><td>${SN.badgeLpu(l.status)}</td>
        <td>${l.assinaturaLider ? SN.esc(SN.nomeExibicao(l.assinaturaLider.nome)) + '<div class="muted">' + SN.dt(l.assinaturaLider.ts) + '</div>' : '<span class="muted">—</span>'}</td>
        <td>${l.assinaturaSD ? SN.esc(SN.nomeExibicao(l.assinaturaSD.nome)) + '<div class="muted">' + SN.dt(l.assinaturaSD.ts) + '</div>' : '<span class="muted">—</span>'}</td></tr>`).join('')
        || '<tr><td colspan="12" class="muted center">Nenhuma LPU neste período.</td></tr>'}</tbody></table></div></div>`}`);
  SN.ligarAbasLpu(); SN.ligarPeriodo(de);
  SN.$$('[data-st]').forEach(b => b.onclick = () => { f.st = b.dataset.st; de(); });
  SN.$$('[data-visl]').forEach(b => b.onclick = () => { f.vis = b.dataset.visl; de(); });
  SN.$('#fBaseL').onchange = e => { f.base = e.target.value; de(); };
  SN.$('#fContaL').onchange = e => { f.conta = e.target.value; de(); };
  SN.$('#fEmpL').onchange = e => { f.emp = e.target.value; de(); };
  SN.$('#fQL').oninput = SN.debounce(e => { f.q = e.target.value; const pos = e.target.selectionStart; de(); const el = SN.$('#fQL'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }, 350);
  SN.$$('tr[data-idl]').forEach(tr => tr.onclick = () => SN.detalheLpu(tr.dataset.idl));
  const nome = 'lpu_' + (anual ? 'acumulado_' + ano : P.per === 'tudo' ? 'tudo' : P.per + '_' + P.ref);
  SN.$('#bExpLpuB').onclick = () => anual ? SN.exportar(nome, SN.linhasAnoExcel('Grupo', anoValor.map(x => ({ ...x, rot: 'Valor R$ · ' + x.rot }))
      .concat(anoConta.map(x => ({ ...x, rot: 'Conta R$ · ' + x.rot })), anoHh.map(x => ({ ...x, rot: 'h·h · ' + x.rot })), anoSrv.map(x => ({ ...x, rot: 'Qtd · ' + x.rot })))))
    : f.vis === 'servico' ? SN.exportar(nome + '_por_servico', servicos.map(x => ({ Codigo: x.cod, Servico: x.desc, Classe: x.classe, Medida: x.medida, Quantidade: x.qtd, Valor: x.valor, LPUs: x.lpus.size })))
    : SN.exportar(nome, lista.flatMap(l => (l.itens.length ? l.itens : [{}]).map(it => { const cat = SN.itemLpu(it.cod) || {};
      return { Data: SN.dt(SN.dataLpu(l, f.base)), LPU: l.id, Chamado: l.chamadoId, Etiqueta: l.cab.etiqueta || '', Cliente: l.cab.cliente, Empresa: l.cab.empresa, CNPJ: l.cab.cnpj, Tecnico: l.cab.tecnico,
        Papel: l.papel, Conta: l.cab.conta, Vinculo: l.vinculo, Codigo: it.cod || '', Servico: cat.desc || '', Qtd: it.qtd || '', Fator: it.fator || '',
        Valor: l.vinculo === 'PRESTADOR' && it.cod ? SN.valorItem(it) : '', HoraHomem: l.vinculo === 'CLT' ? +SN.hhLpu(l).toFixed(2) : '', Status: SN.LPU_STATUS[l.status].rot,
        EnviadoEm: SN.dt(l.enviadoEm), AprovadoPor: l.assinaturaLider ? l.assinaturaLider.nome : '', AprovadoEm: SN.dt(l.aprovadoEm || (l.assinaturaLider && l.assinaturaLider.ts)),
        ServiceDesk: l.assinaturaSD ? l.assinaturaSD.nome : '', ContabilizadoEm: SN.dt(l.contabilizadoEm || (l.assinaturaSD && l.assinaturaSD.ts)) }; })));
  if (abrirId) SN.detalheLpu(abrirId);
};

SN.detalheLpu = id => {
  const l = SN.db.lpus.find(x => x.id === id); if (!l) return;
  const podeEditar = l.status === 'AGUARDANDO_LIDER' && SN.podeAprovar();
  let itens = JSON.parse(JSON.stringify(l.itens || [])), assin = null;
  const hh = l.vinculo === 'CLT' ? SN.hhDaLpu(l) : null; // automática — nem o líder edita
  const catConta = SN.itensDaConta(l.cab.conta);
  // LPU de Preventiva: mostra o que foi aprovado na revisão para comparar com o lançado.
  const chPrev = (SN.db.chamados.find(x => x.id === l.chamadoId) || {}).preventiva;
  const corpo = () => `
    ${SN.htmlCabecalho(l.cab)}
    ${chPrev && chPrev.lpu_sugerida ? `<div class="aviso info small">🧭 Preventiva ${SN.esc(chPrev.id_rota)} — aprovado na revisão: <b>${SN.vst.resumoAprovado(chPrev, true)}</b>.</div>` : ''}
    ${l.motivoReprovacao ? `<div class="aviso erro small">Última reprovação: ${SN.esc(l.motivoReprovacao)}</div>` : ''}
    ${hh ? SN.htmlHoraHomem(hh) : ''}
    <h4>Serviços</h4>
    <div class="tabela-wrap"><table class="tab"><thead><tr><th>Código</th><th>Serviço</th><th>Fator</th><th class="num">Qtd</th>
      ${l.vinculo === 'PRESTADOR' ? '<th class="num">Unit.</th><th class="num">Total</th>' : ''}${podeEditar ? '<th></th>' : ''}</tr></thead><tbody>
      ${itens.map((it, i) => { const c = SN.itemLpu(it.cod) || {}; const unit = it.fator === 'critico' && c.valorCritico != null ? c.valorCritico : c.valor;
        return `<tr><td class="mono">${it.cod}</td><td>${SN.esc(c.desc || '')}<div class="small muted">${c.classe || ''} · ${c.medida || ''}</div></td>
          <td>${podeEditar && l.vinculo === 'PRESTADOR' ? `<select class="inp" data-fi="${i}"><option value="comum">Comum</option><option value="critico" ${it.fator === 'critico' ? 'selected' : ''}>Crítico</option></select>` : (it.fator === 'critico' ? 'Crítico' : 'Comum')}</td>
          <td class="num">${podeEditar ? `<input class="inp" type="number" step="any" min="0" data-qi="${i}" value="${it.qtd}" style="width:90px">` : SN.num(it.qtd, 2)}</td>
          ${l.vinculo === 'PRESTADOR' ? `<td class="num">${SN.brl(unit)}</td><td class="num">${SN.brl(SN.valorItem(it))}</td>` : ''}
          ${podeEditar ? `<td><button class="btn sm perigo" data-rm="${i}">✕</button></td>` : ''}</tr>
          ${(it.fotos || []).length ? `<tr class="lpu-fotos-linha"><td></td><td colspan="6"><div class="small muted">📷 ${it.fotos.length} foto(s) do técnico para este serviço</div><div class="fotos mini" data-fotos-it="${i}"></div></td></tr>` : ''}`; }).join('') || '<tr><td colspan="7" class="muted">Sem itens.</td></tr>'}
    </tbody></table></div>
    ${podeEditar ? `<div class="linha-form" style="margin-top:8px"><select class="inp" id="dAdd"><option value="">+ Incluir serviço da conta…</option>
      ${catConta.map(c => `<option value="${c.cod}">${c.cod} · ${SN.esc(c.desc)}</option>`).join('')}</select></div>` : ''}
    ${l.vinculo === 'PRESTADOR' ? `<div class="faixa" style="margin-top:10px;display:flex;justify-content:space-between"><b>Total da LPU</b><b>${SN.brl(itens.reduce((s, it) => s + SN.valorItem(it), 0))}</b></div>` : ''}
    ${l.obs ? `<p class="small"><b>Obs. do técnico:</b> ${SN.esc(l.obs)}</p>` : ''}
    <h4 style="margin-top:12px">Assinaturas</h4>
    <table class="tab small"><tbody>
      <tr><td class="muted">${l.vinculo === 'CLT' ? 'Técnico' : 'Prestador'}</td><td>${SN.esc(SN.txtAssinatura(l.assinaturaTecnico))}</td></tr>
      <tr><td class="muted">Líder aprovador</td><td id="dAssLid">${SN.esc(SN.txtAssinatura(l.assinaturaLider))}</td></tr>
      <tr><td class="muted">Service Desk</td><td>${SN.esc(SN.txtAssinatura(l.assinaturaSD))}</td></tr>
      ${l.assinaturaPagamento ? `<tr><td class="muted">Pagamento</td><td>${SN.esc(SN.txtAssinatura(l.assinaturaPagamento))}</td></tr>` : ''}</tbody></table>
    <h4 style="margin-top:12px">Histórico (auditoria)</h4>
    <div class="tabela-wrap" style="max-height:200px"><table class="tab small"><tbody>${(l.historico || []).slice().reverse().map(h =>
      `<tr><td class="nowrap">${SN.dt(h.ts)}</td><td>${SN.esc(h.usuario)}</td><td>${SN.esc(h.acao)}</td><td>${SN.esc(h.detalhe)}</td></tr>`).join('')}</tbody></table></div>`;
  const ligar = f => {
    SN.$$('[data-fotos-it]', f).forEach(el => SN.pintarFotos(el, itens[+el.dataset.fotosIt].fotos || []));
    if (!podeEditar) return;
    SN.$$('[data-qi]', f).forEach(x => x.onchange = () => { itens[+x.dataset.qi].qtd = parseFloat(x.value) || 0; re(f); });
    SN.$$('[data-fi]', f).forEach(x => x.onchange = () => { itens[+x.dataset.fi].fator = x.value; re(f); });
    SN.$$('[data-rm]', f).forEach(x => x.onclick = () => { itens.splice(+x.dataset.rm, 1); re(f); });
    const add = SN.$('#dAdd', f); if (add) add.onchange = () => { if (add.value && !itens.some(i => i.cod === add.value)) itens.push({ cod: add.value, qtd: 1, fator: 'comum' }); re(f); };
  };
  const re = f => { SN.$('.modal-corpo', f).innerHTML = corpo(); ligar(f); if (assin) SN.$('#dAssLid', f).textContent = SN.txtAssinatura(assin); };
  const gravarEdicao = motivo => {
    const d = SN.diff({ itens: l.itens }, { itens });
    if (d) { l.itens = itens; SN.hist(l, 'Edição pelo líder' + (motivo ? ' (' + motivo + ')' : ''), d); SN.log('EDITAR_LPU', l.id, d); }
    return d;
  };
  const botoes = [{ rot: 'Fechar' }, { rot: 'PDF', acao: () => { SN.pdfLpu(l); return false; } }];
  if (podeEditar) botoes.push(
    { rot: 'Salvar edição', acao: () => { const d = gravarEdicao(); SN.salvar(); SN.toast(d ? 'Edição registrada no log.' : 'Nada mudou.'); SN.telaLpu(); } },
    { rot: 'Reprovar', cls: 'perigo', acao: async () => {
      const mot = await SN.pedirTexto('Reprovar LPU', 'Motivo (o técnico verá e corrigirá)'); if (!mot) return false;
      l.status = 'REPROVADA'; l.motivoReprovacao = mot; SN.hist(l, 'Reprovada pelo líder', mot); SN.log('REPROVAR_LPU', l.id, mot); SN.salvar(); SN.telaLpu(); } },
    { rot: '✍ Assinar', acao: f => { assin = SN.assinar('Líder aprovador'); SN.$('#dAssLid', f).textContent = SN.txtAssinatura(assin); SN.salvar(); return false; } },
    { rot: 'Aprovar e enviar ao Service Desk', cls: 'prim', acao: () => {
      if (!assin) { SN.toast('Clique em Assinar antes de aprovar.', 'erro'); return false; }
      gravarEdicao(); l.assinaturaLider = assin; l.status = 'NO_SERVICE_DESK'; l.aprovadoEm = SN.agora();
      SN.hist(l, 'Aprovada pelo líder', SN.valorLpuTxt(l)); SN.log('APROVAR_LPU', l.id, SN.valorLpuTxt(l)); SN.salvar(); SN.toast('LPU aprovada e enviada ao Service Desk.', 'ok'); SN.telaLpu(); } });
  SN.modal({ titulo: `${l.id} · ${SN.LPU_STATUS[l.status].rot}`, largo: true, corpo: corpo(), botoes, aoAbrir: ligar });
};

SN.pdfLpu = l => SN.abrirPdfDepois(() => SN.montarPdfLpu(l));
SN.montarPdfLpu = async l => {
  const doc = SN.novoPdf('LPU ' + l.id + ' · chamado ' + l.chamadoId); if (!doc) return null;
  doc.secao('Identificação');
  doc.linha('Cliente', l.cab.cliente); doc.linha('Etiqueta', l.cab.etiqueta); doc.linha('Prestadora', `${l.cab.empresa} · CNPJ ${l.cab.cnpj || '—'}`);
  doc.linha('Técnico', l.cab.tecnico); doc.linha('Conta contábil', SN.contaTxt(l.cab.conta)); doc.linha('Status', SN.LPU_STATUS[l.status].rot);
  if (l.vinculo === 'CLT') { const hh = SN.hhDaLpu(l);
    doc.linha('Hora-homem', hh.pendente ? 'calculada na conclusão técnica' : `${SN.num(hh.horas, 1)} h·h — deslocamento ${SN.dur(hh.deslocMin)} + em campo ${SN.dur(hh.campoMin)} × ${hh.pessoas} pessoa(s) (automática)`); }
  doc.secao('Serviços');
  l.itens.forEach(it => { const c = SN.itemLpu(it.cod) || {}; doc.linha(it.cod, `${c.desc} — ${SN.num(it.qtd, 2)} ${c.medida}${it.fator === 'critico' ? ' (crítico)' : ''}${l.vinculo === 'PRESTADOR' ? ' — ' + SN.brl(SN.valorItem(it)) : ''}`); });
  if (l.vinculo === 'PRESTADOR') doc.linha('TOTAL', SN.brl(SN.valorLpu(l)));
  doc.secao('Assinaturas');
  doc.linha(l.vinculo === 'CLT' ? 'Técnico' : 'Prestador', SN.txtAssinatura(l.assinaturaTecnico));
  doc.linha('Líder aprovador', SN.txtAssinatura(l.assinaturaLider)); doc.linha('Service Desk', SN.txtAssinatura(l.assinaturaSD));
  if (l.assinaturaPagamento) doc.linha('Pagamento', SN.txtAssinatura(l.assinaturaPagamento));
  // Fotos de cada serviço, na ordem das linhas e na ordem em que foram tiradas.
  for (const it of l.itens) if ((it.fotos || []).length) await SN.pdfFotos(doc, it.fotos, 'Fotos · ' + it.cod + ' · ' + ((SN.itemLpu(it.cod) || {}).desc || '').slice(0, 60));
  return doc;
};

// ═══════════════════════════ Service Desk ═══════════════════════════
SN.abaSD = 'contabil';
SN.rota('/servicedesk', () => {
  const aba = SN.abaSD;
  const noSD = SN.db.lpus.filter(l => l.status === 'NO_SERVICE_DESK');
  const contab = SN.db.lpus.filter(l => l.status === 'CONTABILIZADA' && l.vinculo === 'PRESTADOR');
  const grupos = {};
  contab.forEach(l => { const k = l.cab.empresa + '|' + SN.cicloDe(l); (grupos[k] = grupos[k] || []).push(l); });
  const pags = SN.db.pagamentos.slice().sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  let html = '';
  if (aba === 'contabil') html = `<div class="card"><div class="card-tit"><h3>Contabilização · LPUs aprovadas pelo líder</h3></div>
    <div class="tabela-wrap"><table class="tab"><thead><tr><th>LPU</th><th>Chamado</th><th>Etiqueta</th><th>Empresa</th><th>Conta</th><th>Vínculo</th><th class="num">Valor / h·h</th><th>Aprovado por</th></tr></thead><tbody>
    ${noSD.map(l => `<tr class="clic" data-sd="${l.id}"><td class="mono">${l.id}</td><td class="mono">${l.chamadoId}</td><td class="mono nowrap">${SN.esc(l.cab.etiqueta || '—')}</td><td>${SN.esc(l.cab.empresa)}</td><td class="small">${SN.esc(SN.contaTxt(l.cab.conta))}</td>
      <td>${l.vinculo}</td><td class="num">${SN.valorLpuTxt(l)}</td><td class="small">${SN.esc(SN.txtAssinatura(l.assinaturaLider))}</td></tr>`).join('') || '<tr><td colspan="8" class="muted center">Nada aguardando contabilização.</td></tr>'}
    </tbody></table></div></div>`;
  if (aba === 'pagamento') html = `
    <div class="card"><div class="card-tit"><h3>Gerar tratativa de pagamento</h3><span class="muted small">LPUs contabilizadas de prestadores, por ciclo (01 ao fim do mês)</span></div>
      <div class="tabela-wrap"><table class="tab"><thead><tr><th>Prestador</th><th>CNPJ</th><th>Ciclo</th><th class="num">LPUs</th><th class="num">Total</th><th>Pagamento previsto</th><th></th></tr></thead><tbody>
      ${Object.entries(grupos).map(([k, ls]) => { const [emp, ciclo] = k.split('|'); return `<tr><td>${SN.esc(emp)}</td><td>${SN.esc(SN.empresa(emp).cnpj)}</td><td>${SN.mesNome(ciclo)}</td>
        <td class="num">${ls.length}</td><td class="num">${SN.brl(ls.reduce((s, l) => s + SN.valorLpu(l), 0))}</td><td>${SN.data(SN.previsaoPagamento(ciclo))}</td>
        <td><button class="btn sm prim" data-lote="${SN.esc(k)}">Gerar lote</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="muted center">Nada para gerar.</td></tr>'}
      </tbody></table></div></div>
    <div class="card"><div class="card-tit"><h3>Lotes de pagamento</h3></div>
      <div class="tabela-wrap"><table class="tab"><thead><tr><th>Lote</th><th>Prestador</th><th>Ciclo</th><th class="num">Total</th><th>Status</th><th>NF</th><th>Previsto</th><th></th></tr></thead><tbody>
      ${pags.map(p => `<tr><td class="mono">${p.id}</td><td>${SN.esc(p.empresa)}</td><td>${SN.mesNome(p.ciclo)}</td><td class="num">${SN.brl(p.total)}</td><td>${SN.badge(SN.PAG_STATUS, p.status)}</td>
        <td>${p.nf ? `<button class="btn sm" data-vernf="${p.nf.id}">Ver NF</button>` : p.status === 'AGUARDANDO_NF' ? `<label class="btn sm">Anexar<input type="file" hidden data-nf="${p.id}" accept="application/pdf,image/*"></label>` : '—'}</td>
        <td>${SN.data(SN.previsaoPagamento(p.ciclo))}</td>
        <td class="nowrap">${p.status === 'NF_ANEXADA' ? `<button class="btn sm perigo" data-repnf="${p.id}">Reprovar NF</button> <button class="btn sm ok" data-pagar="${p.id}">Confirmar pagamento</button>` : ''}
          ${p.status === 'PAGO' ? `<span class="small muted">${SN.esc(SN.txtAssinatura(p.assinaturaPagamento))}</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted center">Nenhum lote.</td></tr>'}
      </tbody></table></div></div>`;
  if (aba === 'produtividade') {
    const mes = SN.agora().slice(0, 7);
    const clt = {}; SN.db.lpus.filter(l => l.vinculo === 'CLT' && SN.cicloDe(l) === mes).forEach(l => {
      const k = l.cab.tecnico; clt[k] = clt[k] || { hh: 0, n: 0, serv: 0 }; clt[k].hh += SN.hhDaLpu(l).horas; clt[k].n++; clt[k].serv += l.itens.length; });
    const fixo = SN.db.chamados.filter(c => SN.empresa(c.empresa).vinculo === 'CONTRATO_FIXO' && (c.tempos.conclusaoTecnica || '').startsWith(mes));
    html = `<div class="grid g2"><div class="card"><h3>Hora-homem CLT · ${SN.mesNome(mes)}</h3>
      <div class="tabela-wrap"><table class="tab"><thead><tr><th>Técnico</th><th class="num">LPUs</th><th class="num">Serviços</th><th class="num">h·h</th></tr></thead><tbody>
      ${Object.entries(clt).sort((a, b) => b[1].hh - a[1].hh).map(([t, v]) => `<tr><td>${SN.esc(t)}</td><td class="num">${v.n}</td><td class="num">${v.serv}</td><td class="num">${SN.num(v.hh, 1)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sem registros no mês.</td></tr>'}
      </tbody></table></div></div>
      <div class="card"><h3>Contratos fixos</h3>${CONTRATOS_FIXOS.map(k => {
        const feitos = fixo.filter(c => c.empresa === k.empresa).length;
        return `<div style="margin-bottom:14px"><b>${k.empresa}</b> · ${SN.esc(SN.contaTxt(k.conta))}<div class="small muted">${k.ciclo}${k.valorMensal ? ' · fixo ' + SN.brl(k.valorMensal) : ''}${k.observacao ? ' · ' + k.observacao : ''}</div>
          ${k.metaAtividades ? `<div class="gauge ${feitos < k.metaAtividades ? 'alerta' : ''}"><div style="width:${Math.min(100, feitos / k.metaAtividades * 100)}%"></div></div><div class="small">${feitos} de ${k.metaAtividades} atividades no mês</div>` : ''}
          ${k.variaveis.length ? `<ul class="small" style="margin:6px 0 0;padding-left:18px">${k.variaveis.map(v => `<li>${SN.esc(v.desc)} — ${SN.brl(v.valor)}</li>`).join('')}</ul>` : ''}</div>`; }).join('')}</div></div>`;
  }
  SN.casca('servicedesk', `
    <div class="cab-pagina"><div><h1>Service Desk · administrativo</h1><p>Contabilização, conta contábil, tratativa financeira e pagamento — ciclo independente do chamado.</p></div></div>
    ${SN.htmlFilaValidacao('OEM', SN.temTela('chamados'))}
    <div class="abas">${[['contabil', 'Contabilização', noSD.length], ['pagamento', 'Tratativa de pagamento', pags.filter(p => p.status !== 'PAGO').length], ['produtividade', 'CLT e contratos fixos', '']].map(([k, r, n]) =>
      `<button class="aba ${k === aba ? 'ativa' : ''}" data-aba="${k}">${r}${n !== '' ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>${html}`);
  SN.ligarValidacao();
  SN.$$('[data-aba]').forEach(b => b.onclick = () => { SN.abaSD = b.dataset.aba; SN.render(); });
  SN.$$('[data-sd]').forEach(tr => tr.onclick = () => SN.contabilizar(tr.dataset.sd));
  SN.$$('[data-lote]').forEach(b => b.onclick = async () => {
    const ls = grupos[b.dataset.lote]; const [emp, ciclo] = b.dataset.lote.split('|');
    const total = ls.reduce((s, l) => s + SN.valorLpu(l), 0);
    if (!await SN.confirmar('Gerar lote de pagamento', `${emp} · ${SN.mesNome(ciclo)} · ${ls.length} LPU(s) · <b>${SN.brl(total)}</b>. O prestador será avisado para anexar a NF.`, 'Gerar lote')) return;
    let pid; try { pid = await SN.novoId('PAG'); } catch (e) { return SN.toast(e.message, 'erro'); }
    const p = { id: pid, empresa: emp, ciclo, lpuIds: ls.map(l => l.id), total, status: 'AGUARDANDO_NF', criadoEm: SN.agora(), historico: [] };
    ls.forEach(l => { l.status = 'EM_PAGAMENTO'; l.pagamentoId = p.id; SN.hist(l, 'Incluída no lote', p.id); });
    SN.hist(p, 'Lote gerado', SN.brl(total)); SN.db.pagamentos.push(p); SN.log('GERAR_LOTE', p.id, `${emp} ${SN.brl(total)}`); SN.salvar(); SN.render();
  });
  SN.$$('[data-vernf]').forEach(b => b.onclick = () => SN.abrirAnexo(b.dataset.vernf));
  SN.$$('[data-nf]').forEach(inp => inp.onchange = async () => {
    const p = SN.db.pagamentos.find(x => x.id === inp.dataset.nf); try { p.nf = await SN.guardarArquivo(inp.files[0], 'NF ' + p.empresa); } catch (e) { return SN.toast('Falha ao enviar a NF: ' + (e.message || e), 'erro'); } p.status = 'NF_ANEXADA'; p.motivoNf = '';
    SN.hist(p, 'NF anexada pelo Service Desk', p.nf.nome); SN.log('ANEXAR_NF', p.id, p.nf.nome); SN.salvar(); SN.render();
  });
  SN.$$('[data-repnf]').forEach(b => b.onclick = async () => {
    const p = SN.db.pagamentos.find(x => x.id === b.dataset.repnf);
    const mot = await SN.pedirTexto('Reprovar NF', 'Motivo (NF errada, ilegível, valor divergente…)'); if (!mot) return;
    p.nf = null; p.status = 'AGUARDANDO_NF'; p.motivoNf = mot; SN.hist(p, 'NF reprovada', mot); SN.log('REPROVAR_NF', p.id, mot); SN.salvar(); SN.render();
  });
  SN.$$('[data-pagar]').forEach(b => b.onclick = async () => {
    const p = SN.db.pagamentos.find(x => x.id === b.dataset.pagar);
    if (!await SN.confirmar('Confirmar pagamento', `Confirmar o pagamento de <b>${SN.brl(p.total)}</b> para ${SN.esc(p.empresa)}? Sua assinatura será registrada.`, 'Assinar e confirmar', 'ok')) return;
    const a = SN.assinar('Pagamento'); p.status = 'PAGO'; p.assinaturaPagamento = a; p.pagoEm = SN.agora();
    p.lpuIds.forEach(id => { const l = SN.db.lpus.find(x => x.id === id); if (l) { l.status = 'PAGA'; l.assinaturaPagamento = a; SN.hist(l, 'Paga', p.id); } });
    SN.hist(p, 'Pagamento confirmado', SN.txtAssinatura(a)); SN.log('CONFIRMAR_PAGAMENTO', p.id, SN.brl(p.total)); SN.salvar(); SN.render();
  });
}, { tela: 'servicedesk' });

SN.contabilizar = id => {
  const l = SN.db.lpus.find(x => x.id === id); let assin = null;
  SN.modal({ titulo: 'Contabilizar ' + l.id, largo: true, corpo: `${SN.htmlCabecalho(l.cab)}
    <div class="linha-form"><div class="campo"><label>Conta contábil</label><select class="inp" id="sdConta">${SN.opcoesContas(l.cab.conta)}</select></div>
      <div class="campo"><label>${l.vinculo === 'PRESTADOR' ? 'Valor' : 'Hora-homem'}</label><input class="inp" readonly value="${SN.valorLpuTxt(l)}"></div></div>
    <table class="tab small"><tbody>${l.itens.map(it => { const c = SN.itemLpu(it.cod) || {}; return `<tr><td class="mono">${it.cod}</td><td>${SN.esc(c.desc)}</td><td class="num">${SN.num(it.qtd, 2)}</td>
      ${l.vinculo === 'PRESTADOR' ? `<td class="num">${SN.brl(SN.valorItem(it))}</td>` : ''}</tr>`; }).join('')}</tbody></table>
    <p class="small" style="margin-top:10px">Aprovado por: ${SN.esc(SN.txtAssinatura(l.assinaturaLider))}</p>
    <p class="small">Service Desk: <span id="sdAss">—</span></p>`,
    botoes: [{ rot: 'Fechar' }, { rot: 'PDF', acao: () => { SN.pdfLpu(l); return false; } },
      { rot: 'Devolver ao líder', cls: 'perigo', acao: async () => { const m = await SN.pedirTexto('Devolver ao líder', 'Motivo'); if (!m) return false;
        l.status = 'AGUARDANDO_LIDER'; l.assinaturaLider = null; SN.hist(l, 'Devolvida pelo Service Desk', m); SN.log('DEVOLVER_LPU_LIDER', l.id, m); SN.salvar(); SN.render(); } },
      { rot: '✍ Assinar', acao: f => { assin = SN.assinar('Service Desk'); SN.$('#sdAss', f).textContent = SN.txtAssinatura(assin); SN.salvar(); return false; } },
      { rot: 'Contabilizar', cls: 'prim', acao: f => {
        if (!assin) { SN.toast('Assine antes de contabilizar.', 'erro'); return false; }
        const nova = SN.$('#sdConta', f).value;
        if (nova !== l.cab.conta) { SN.hist(l, 'Conta contábil ajustada', `${l.cab.conta} → ${nova}`); l.cab.conta = nova; }
        l.status = 'CONTABILIZADA'; l.assinaturaSD = assin; l.contabilizadoEm = SN.agora();
        SN.hist(l, 'Contabilizada', SN.valorLpuTxt(l)); SN.log('CONTABILIZAR_LPU', l.id, SN.valorLpuTxt(l)); SN.salvar(); SN.toast('LPU contabilizada.', 'ok'); SN.render(); } }]
  });
};

// ═══════════════════════════ Gestão / Controle de Materiais ═══════════════════════════
// Tudo o que entrou de material no SigoNet, com busca (como o Controle de Material do V1):
// período dia/semana/mês/ano, data do apontamento ou da baixa, segmento, status, busca
// geral e filtro por coluna, e a visão somada por material. A baixa oficial é no Elleven;
// aqui aparece a baixa INFORMADA (quem informou, titular do estoque e referência).
SN.fMat = { st: '', q: '', emp: '', base: 'registro', seg: '', vis: 'registros' };
SN.MAT_PERIODOS = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano'], ['tudo', 'Tudo']];
SN.dataIsoLocal = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
// Intervalo [ini, fim) do período em datas locais; null = sem limite.
SN.intervaloMat = (per, ref) => {
  const [a, m, d] = ref.split('-').map(Number);
  if (per === 'dia') return [new Date(a, m - 1, d), new Date(a, m - 1, d + 1)];
  if (per === 'semana') { const x = new Date(a, m - 1, d), seg = (x.getDay() + 6) % 7; return [new Date(a, m - 1, d - seg), new Date(a, m - 1, d - seg + 7)]; } // segunda a domingo
  if (per === 'mes') return [new Date(a, m - 1, 1), new Date(a, m, 1)];
  if (per === 'ano') return [new Date(a, 0, 1), new Date(a + 1, 0, 1)];
  return null;
};
SN.rotuloPeriodoMat = (per, ref) => {
  const iv = SN.intervaloMat(per, ref); if (!iv) return 'Todo o período carregado';
  const [ini, fim] = iv, ult = new Date(fim - 864e5);
  if (per === 'dia') return ini.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  if (per === 'semana') return `Semana de ${ini.toLocaleDateString('pt-BR')} a ${ult.toLocaleDateString('pt-BR')}`;
  if (per === 'mes') return SN.mesNome(ref.slice(0, 7));
  return 'Ano de ' + ini.getFullYear();
};
SN.moverPeriodoMat = (per, ref, passo) => {
  const [a, m, d] = ref.split('-').map(Number);
  const x = per === 'dia' ? new Date(a, m - 1, d + passo) : per === 'semana' ? new Date(a, m - 1, d + 7 * passo)
    : per === 'mes' ? new Date(a, m - 1 + passo, 1) : new Date(a + passo, 0, 1);
  return SN.dataIsoLocal(x);
};
// Meses (AAAA-MM) que o período cobre: os que estiverem fora da janela carregada são buscados no servidor.
SN.mesesDoPeriodo = (per, ref) => {
  const iv = SN.intervaloMat(per, ref); if (!iv) return [];
  const out = []; for (let x = new Date(iv[0].getFullYear(), iv[0].getMonth(), 1); x < iv[1]; x = new Date(x.getFullYear(), x.getMonth() + 1, 1))
    out.push(x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'));
  return out;
};
// Período compartilhado pela Base e pelo Controle de Materiais (trocar de aba mantém o período).
SN.periodo = { per: 'mes', ref: '' };
// P: outro objeto de período quando a tela não deve mexer no compartilhado (ex.: rotas da Preventiva).
SN.htmlPeriodo = (P = SN.periodo) => { if (!P.ref) P.ref = SN.dataIsoLocal(new Date());
  return `<div class="filtros">
    <div class="seg" role="group" aria-label="Período">${SN.MAT_PERIODOS.map(([k, r]) => `<button type="button" class="${P.per === k ? 'sel' : ''}" data-per="${k}">${r}</button>`).join('')}</div>
    ${P.per !== 'tudo' ? `<div class="nav-data"><button class="btn" id="pAnt" title="Período anterior">◀</button><input class="inp" type="date" id="pRef" value="${P.ref}"><button class="btn" id="pProx" title="Próximo período">▶</button><button class="btn" id="pHoje">Hoje</button></div>` : ''}
    <span class="rotulo-periodo">${SN.esc(SN.rotuloPeriodoMat(P.per, P.ref))}</span></div>
    ${P === SN.periodo && P.per === 'tudo' && SN.remoto && SN.db.janela ? `<p class="small muted" style="margin-top:6px">"Tudo" mostra o que está carregado (desde ${SN.mesNome(SN.db.janela.desde)}). Para meses mais antigos, escolha Mês ou Ano.</p>` : ''}`; };
SN.ligarPeriodo = (redesenhar, P = SN.periodo) => {
  SN.$$('[data-per]').forEach(b => b.onclick = () => { P.per = b.dataset.per; redesenhar(); });
  if (!SN.$('#pRef')) return;
  SN.$('#pRef').onchange = e => { if (e.target.value) { P.ref = e.target.value; redesenhar(); } };
  SN.$('#pAnt').onclick = () => { P.ref = SN.moverPeriodoMat(P.per, P.ref, -1); redesenhar(); };
  SN.$('#pProx').onclick = () => { P.ref = SN.moverPeriodoMat(P.per, P.ref, 1); redesenhar(); };
  SN.$('#pHoje').onclick = () => { P.ref = SN.dataIsoLocal(new Date()); redesenhar(); };
};
// Período mais antigo que a carga inicial: busca os meses no servidor e desenha de novo.
// Devolve true enquanto busca (a tela desenha só o aviso).
// perForcado = 'ano': visões de acumulado anual precisam do ano inteiro da data de referência.
SN.buscarPeriodo = (ativo, prefixoHash, redesenhar, perForcado) => { const P = SN.periodo; if (!P.ref) P.ref = SN.dataIsoLocal(new Date());
  const faltam = SN.mesesDoPeriodo(perForcado || P.per, P.ref).filter(m => SN.foraDaJanela(m) && !(SN.db.periodos || {})[m]);
  if (!faltam.length) return false;
  SN.casca(ativo, SN.carregando(`Buscando ${faltam.length} mês(es) no servidor…`));
  const aqui = () => SN.rotaAtual && SN.rotaAtual.hash.startsWith(prefixoHash);
  Promise.all(faltam.map(SN.garantirMes)).then(() => { if (aqui()) redesenhar(); },
    e => { SN.toast('Não foi possível buscar o período no servidor (' + e.message + ').', 'erro'); P.per = 'mes'; P.ref = SN.dataIsoLocal(new Date()); if (aqui()) redesenhar(); });
  return true;
};
// Acumulado do ano: uma linha por grupo, 12 colunas (jan–dez) e total. Cada linha: { rot, sub, mes: [12 números] }.
SN.MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
SN.mesDoAno = iso => new Date(iso).getMonth();
SN.tabelaAno = (titulo, rotulo, linhas, fmt, vazio) => {
  const tot = Array(12).fill(0); linhas.forEach(l => l.mes.forEach((v, i) => { tot[i] += v; }));
  const soma = a => a.reduce((s, v) => s + v, 0), mesAtual = new Date().getFullYear() === +(SN.periodo.ref || '').slice(0, 4) ? new Date().getMonth() : -1;
  const cel = (v, i) => `<td class="num" ${i === mesAtual ? 'style="background:var(--bg-2)"' : ''}>${v ? fmt(v) : '<span class="muted">·</span>'}</td>`;
  return `<div class="card" style="margin-bottom:12px"><div class="card-tit"><h3>${titulo}</h3></div><div class="tabela-wrap"><table class="tab small"><thead><tr><th>${rotulo}</th>${SN.MESES_CURTOS.map((m, i) => `<th class="num" ${i === mesAtual ? 'style="background:var(--bg-2)"' : ''}>${m}</th>`).join('')}<th class="num">Total do ano</th></tr></thead><tbody>
    ${linhas.map(l => `<tr><td>${SN.esc(l.rot)}${l.sub ? `<div class="muted">${SN.esc(l.sub)}</div>` : ''}</td>${l.mes.map(cel).join('')}<td class="num"><b>${fmt(soma(l.mes))}</b></td></tr>`).join('') || `<tr><td colspan="14" class="muted center">${vazio}</td></tr>`}
    </tbody>${linhas.length > 1 && titulo.indexOf('(qtd)') < 0 ? `<tfoot><tr><td><b>Total</b></td>${tot.map((v, i) => `<td class="num"><b>${v ? fmt(v) : ''}</b></td>`).join('')}<td class="num"><b>${fmt(soma(tot))}</b></td></tr></tfoot>` : ''}</table></div></div>`;
};
// Excel do acumulado: uma linha por grupo com as 12 colunas.
SN.linhasAnoExcel = (rotulo, linhas) => linhas.map(l => { const o = { [rotulo]: l.rot }; if (l.sub) o.Detalhe = l.sub; SN.MESES_CURTOS.forEach((m, i) => { o[m] = l.mes[i]; }); o.TotalAno = l.mes.reduce((s, v) => s + v, 0); return o; });
SN.noIntervalo = (iso, iv) => { if (!iso) return false; if (!iv) return true; const t = new Date(iso); return t >= iv[0] && t < iv[1]; };
SN.dataMat =(m, base) => base === 'baixa' ? ((m.baixa && m.baixa.em) || m.baixadoEm || '') : (m.registradoEm || '');
SN.segmentoMat = m => { const c = SN.db.chamados.find(x => x.id === m.chamadoId); return (c && c.tipo) || 'Sem classificação'; };
SN.baixaPorMat = m => (m.baixa && m.baixa.operador) || m.baixadoPor || '';
SN.custoMat = m => m.itens.reduce((s, i) => s + SN.precoMaterial(i.cod, m.registradoEm) * i.qtd, 0); // preço do dia do apontamento
SN.COLS_MAT = [ // [chave, título, valor] — tudo o que a busca geral procura
  ['data', 'Data', (m, f) => SN.dt(SN.dataMat(m, f.base))], ['id', 'Registro', m => m.id], ['chamado', 'Chamado', m => m.chamadoId], ['etiqueta', 'Etiqueta', m => (m.cab || {}).etiqueta || ''],
  ['cliente', 'Cliente', m => m.cliente || ''], ['tecnico', 'Técnico', m => (m.cab || {}).tecnico || ''], ['empresa', 'Empresa', m => (m.cab || {}).empresa || ''],
  ['itens', 'Itens', m => m.itens.map(i => `${i.cod} ${i.desc} ${(i.seriais || []).join(' ')}`).join(' ')],
  ['baixaPor', 'Baixa informada por', m => SN.baixaPorMat(m)], ['titular', 'Titular do estoque', m => (m.baixa || {}).titular || ''],
  ['ref', 'Ref. Elleven', m => (m.baixa || {}).documento || '']
];

// opc.base = true: desenhada como a aba "Rastreio de material" da tela Base.
SN.redesenharMat = () => SN.telaMateriais();
SN.telaMateriais = (abrirId, opc) => {
  opc = opc || {};
  const f = SN.fMat, d = SN.db, P = SN.periodo;
  const de = () => SN.telaMateriais(null, opc);
  SN.redesenharMat = de; // depois de conferir/informar baixa, volta para a mesma tela (Base ou Controle)
  const anual = f.vis === 'ano'; // acumulado do ano: o ano inteiro da data de referência
  if (SN.buscarPeriodo(opc.base ? 'base' : 'materiais', opc.base ? '/base' : '/materiais', () => SN.telaMateriais(abrirId, opc), anual ? 'ano' : null)) return;
  const iv = SN.intervaloMat(anual ? 'ano' : P.per, P.ref), ano = P.ref.slice(0, 4);
  const noPeriodo = m => SN.noIntervalo(SN.dataMat(m, f.base), iv); // sem a data escolhida (ex.: sem baixa) fica fora
  const q = SN.normal(f.q);
  const periodo = d.materiais.filter(m => noPeriodo(m) && (!f.emp || (m.cab || {}).empresa === f.emp));
  const busca = periodo.filter(m => (!q || SN.normal(SN.COLS_MAT.map(([, , val]) => val(m, f)).join(' ') + ' ' + (m.obs || '')).includes(q)));
  const doSeg = busca.filter(m => !f.seg || SN.segmentoMat(m) === f.seg);
  const lista = doSeg.filter(m => !f.st || m.status === f.st).sort((a, b) => SN.dataMat(b, f.base).localeCompare(SN.dataMat(a, f.base)));
  const segmentos = [...new Set(busca.map(SN.segmentoMat))].sort();
  const baixadas = lista.filter(m => ['BAIXADO_SAP', 'ALOCADO_CLIENTE'].includes(m.status));
  const qtdItens = lista.reduce((s, m) => s + m.itens.reduce((t, i) => t + (Number(i.qtd) || 0), 0), 0);
  // Visão por material: soma de cada código no que está filtrado.
  const porCod = {};
  lista.forEach(m => m.itens.forEach(i => { const x = porCod[i.cod] = porCod[i.cod] || { cod: i.cod, desc: i.desc, tipo: i.tipo, qtd: 0, qtdBaixada: 0, regs: new Set(), seriais: 0, custo: 0 };
    x.custo += SN.precoMaterial(i.cod, m.registradoEm) * (Number(i.qtd) || 0);
    x.qtd += Number(i.qtd) || 0; if (['BAIXADO_SAP', 'ALOCADO_CLIENTE'].includes(m.status)) x.qtdBaixada += Number(i.qtd) || 0; x.regs.add(m.id); x.seriais += (i.seriais || []).filter(Boolean).length; }));
  const consolidado = Object.values(porCod).sort((a, b) => b.qtd - a.qtd);
  // Acumulado do ano (mês a mês): custo por empresa, quantidade por material e registros por status.
  const porMes = (chave, valor) => { const g = {}; lista.forEach(m => { const d0 = SN.dataMat(m, f.base); if (!d0) return; const i = SN.mesDoAno(d0);
    [].concat(chave(m)).forEach(([k, sub, v]) => { const x = g[k] = g[k] || { rot: k, sub, mes: Array(12).fill(0) }; x.mes[i] += v; }); }); return Object.values(g); };
  const anoEmp = anual ? porMes(m => [[(m.cab || {}).empresa || '—', '', SN.custoMat(m)]]).sort((a, b) => b.mes.reduce((s, v) => s + v, 0) - a.mes.reduce((s, v) => s + v, 0)) : [];
  const anoMat = anual ? porMes(m => m.itens.map(i => [i.cod, i.desc, Number(i.qtd) || 0])).sort((a, b) => b.mes.reduce((s, v) => s + v, 0) - a.mes.reduce((s, v) => s + v, 0)) : [];
  const anoSt = anual ? porMes(m => [[SN.MAT_STATUS[m.status] ? SN.MAT_STATUS[m.status].rot : m.status, '', 1]]) : [];

  SN.casca(opc.base ? 'base' : 'materiais', `
    ${opc.base ? SN.cabBase('materiais', `<button class="btn" id="bExpMat">Exportar Excel</button>`) : `
    <div class="cab-pagina"><div><h1>Controle de Materiais</h1><p>Tudo o que foi apontado no SigoNet, com busca por período. O estoque oficial é o Elleven: a baixa é feita lá e aqui fica registrado quem a informou, de qual estoque e com qual referência.</p></div>
      <div class="acoes"><button class="btn" id="bExpMat">Exportar Excel</button></div></div>`}
    <div class="card card-filtros">
      ${SN.htmlPeriodo()}
      ${anual ? `<p class="small" style="margin:8px 0 0">📅 <b>Acumulado de ${ano}</b>: a visão anual usa o ano inteiro da data de referência (troque o ano com ◀ ▶ em "Ano").</p>` : ''}
      <div class="filtros">
        <select class="inp" id="fBase" title="Qual data conta para o período"><option value="registro" ${f.base === 'registro' ? 'selected' : ''}>Data do apontamento</option><option value="baixa" ${f.base === 'baixa' ? 'selected' : ''}>Data da baixa informada</option></select>
        <select class="inp" id="fEmp"><option value="">Todas as empresas</option>${SN.opcoesEmpresas(f.emp)}</select>
        <select class="inp" id="fSegM"><option value="">Todos os segmentos (${busca.length})</option>${[...new Set([...segmentos, f.seg].filter(Boolean))].map(s => `<option value="${SN.esc(s)}" ${f.seg === s ? 'selected' : ''}>${SN.esc(s)} (${busca.filter(m => SN.segmentoMat(m) === s).length})</option>`).join('')}</select>
        <input class="inp busca" id="fQ" placeholder="Buscar: etiqueta, registro, chamado, cliente, técnico, código, serial, titular, referência…" value="${SN.esc(f.q)}">
        ${f.q || f.seg || f.emp ? '<button class="btn sm" id="bLimpar">Limpar</button>' : ''}
      </div>
    </div>
    <div class="kpis-c">
      <div class="kpi destaque"><div class="rot">Registros</div><div class="val">${lista.length}</div><div class="sub">${anual ? 'no ano de ' + ano : 'no período e filtros'}</div></div>
      <div class="kpi"><div class="rot">Aguardando baixa</div><div class="val">${lista.filter(m => ['REGISTRADO', 'CONFERIDO', 'DIVERGENTE'].includes(m.status)).length}</div><div class="sub">registrado, divergente ou conferido</div></div>
      <div class="kpi"><div class="rot">Baixas informadas</div><div class="val">${baixadas.length}</div><div class="sub">${(n => n ? SN.num(100 * baixadas.length / n, 0) + '% dos registros com material' : '—')(lista.filter(m => m.status !== 'SEM_MATERIAL').length)}</div></div>
      <div class="kpi"><div class="rot">Itens · custo</div><div class="val">${SN.num(qtdItens, 0)}</div><div class="sub">${SN.brl(lista.reduce((s, m) => s + SN.custoMat(m), 0))}</div></div>
    </div>
    <div class="barra-vis">${SN.chipsStatus(SN.MAT_STATUS, f.st, k => doSeg.filter(m => !k || m.status === k).length)}
      <div class="seg" role="group" aria-label="Visão"><button type="button" class="${f.vis === 'registros' ? 'sel' : ''}" data-vis="registros">Registros</button><button type="button" class="${f.vis === 'material' ? 'sel' : ''}" data-vis="material">Por material</button><button type="button" class="${anual ? 'sel' : ''}" data-vis="ano">📅 Acumulado do ano</button></div></div>
    ${anual ? SN.tabelaAno(`Custo de material por empresa · ${ano} (R$)`, 'Empresa', anoEmp, v => SN.brl(v), 'Nenhum material no ano.')
      + SN.tabelaAno(`Registros por status · ${ano}`, 'Status', anoSt, v => SN.num(v, 0), 'Nenhum registro no ano.')
      + SN.tabelaAno(`Quantidade por material · ${ano} (qtd)`, 'Material', anoMat, v => SN.num(v, 0), 'Nenhum material no ano.')
    : f.vis === 'material' ? `<div class="card"><div class="tabela-wrap"><table class="tab"><thead><tr><th>Código</th><th>Descrição</th><th>Tipo</th><th class="num">Qtd apontada</th><th class="num">Qtd com baixa informada</th><th class="num">Registros</th><th class="num">Seriais</th><th class="num">Custo</th></tr></thead><tbody>
      ${consolidado.map(x => `<tr><td class="mono">${SN.esc(x.cod)}</td><td>${SN.esc(x.desc)}</td><td>${SN.esc(x.tipo)}</td><td class="num">${SN.num(x.qtd, 2)}</td><td class="num">${SN.num(x.qtdBaixada, 2)}</td>
        <td class="num">${x.regs.size}</td><td class="num">${x.seriais || ''}</td><td class="num">${SN.brl(x.custo)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted center">Nenhum material no período.</td></tr>'}
    </tbody></table></div></div>` : `
    <div class="card"><div class="tabela-wrap"><table class="tab"><thead><tr><th>Data</th><th>Registro</th><th>Chamado</th><th>Etiqueta</th><th>Cliente</th><th>Técnico</th><th>Empresa</th><th>Itens</th><th class="num">Custo</th><th>Status</th><th>Baixa informada por</th><th>Titular do estoque</th><th>Ref. Elleven</th></tr></thead><tbody>
      ${lista.map(m => `<tr class="clic" data-id="${m.id}"><td class="nowrap">${SN.dt(SN.dataMat(m, f.base))}</td><td class="mono nowrap">${m.id}</td><td class="mono nowrap">${m.chamadoId}</td><td class="mono nowrap">${SN.esc((m.cab || {}).etiqueta || '—')}</td><td>${SN.esc(m.cliente)}</td>
        <td>${SN.esc((m.cab || {}).tecnico)}</td><td>${SN.esc((m.cab || {}).empresa)}</td>
        <td class="small" style="min-width:240px">${m.semMaterial && !m.itens.length ? '<span class="muted">Nenhum material utilizado</span>' : ''}${m.itens.slice(0, 3).map(i => `${SN.esc(i.desc)} (${SN.num(i.qtd, 0)})`).join('<br>')}${m.itens.length > 3 ? `<br>+${m.itens.length - 3}` : ''}</td>
        <td class="num">${SN.brl(SN.custoMat(m))}</td><td>${SN.badge(SN.MAT_STATUS, m.status)}</td>
        <td>${SN.esc(SN.baixaPorMat(m))}${m.docSap && !m.baixa ? ' <span class="badge alerta" title="Registro anterior, feito em modo simulado">simulado</span>' : ''}</td>
        <td>${SN.esc((m.baixa || {}).titular || '')}</td><td class="mono">${SN.esc((m.baixa || {}).documento || '')}</td></tr>`).join('') || '<tr><td colspan="13" class="muted center">Nenhum registro neste período.</td></tr>'}
    </tbody></table></div></div>`}`);

  SN.ligarPeriodo(de);
  SN.$('#fBase').onchange = e => { f.base = e.target.value; de(); };
  SN.$('#fSegM').onchange = e => { f.seg = e.target.value; de(); };
  SN.$$('[data-st]').forEach(b => b.onclick = () => { f.st = b.dataset.st; de(); });
  SN.$$('[data-vis]').forEach(b => b.onclick = () => { f.vis = b.dataset.vis; de(); });
  SN.$('#fEmp').onchange = e => { f.emp = e.target.value; de(); };
  if (SN.$('#bLimpar')) SN.$('#bLimpar').onclick = () => { f.q = ''; f.seg = ''; f.emp = ''; de(); };
  // Busca enquanto digita, sem perder o foco do campo.
  const redesenhar = sel => SN.debounce(e => { const pos = e.target.selectionStart; de(); const el = SN.$(sel); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }, 350);
  SN.$('#fQ').oninput = (fn => e => { f.q = e.target.value; fn(e); })(redesenhar('#fQ'));
  SN.$$('tr[data-id]').forEach(tr => tr.onclick = () => SN.detalheMaterial(tr.dataset.id));
  const nomeArq = 'materiais_' + (P.per === 'tudo' ? 'tudo' : P.per + '_' + P.ref);
  SN.$('#bExpMat').onclick = () => anual ? SN.exportar('materiais_acumulado_' + ano, SN.linhasAnoExcel('Material', anoMat).concat(SN.linhasAnoExcel('Empresa (custo R$)', anoEmp)))
    : f.vis === 'material'
    ? SN.exportar(nomeArq + '_por_material', consolidado.map(x => ({ Codigo: x.cod, Descricao: x.desc, Tipo: x.tipo, QtdApontada: x.qtd, QtdBaixaInformada: x.qtdBaixada,
      Registros: x.regs.size, Seriais: x.seriais, Custo: x.custo })))
    : SN.exportar(nomeArq, lista.flatMap(m => m.itens.map(i => ({ Registro: m.id, Chamado: m.chamadoId, Segmento: SN.segmentoMat(m), Cliente: m.cliente,
      Etiqueta: (m.cab || {}).etiqueta, Tecnico: (m.cab || {}).tecnico, Empresa: (m.cab || {}).empresa, Apontado: SN.dt(m.registradoEm), Tipo: i.tipo, Codigo: i.cod, Descricao: i.desc, Quantidade: i.qtd,
      Seriais: (i.seriais || []).join(', '), CustoUnit: SN.precoMaterial(i.cod, m.registradoEm) || '', Status: SN.MAT_STATUS[m.status].rot,
      BaixaInformadaEm: SN.dt((m.baixa && m.baixa.em) || m.baixadoEm), BaixaInformadaPor: SN.baixaPorMat(m), TitularEstoque: (m.baixa || {}).titular || '',
      EstoqueElleven: (m.baixa || {}).estoque || '', RefElleven: (m.baixa || {}).documento || '', DocSimulado: m.docSap && !m.baixa ? m.docSap : '' }))));
  if (abrirId) SN.detalheMaterial(abrirId);
};
SN.rota('/materiais', () => SN.telaMateriais(), { tela: 'materiais' });
SN.rota('/materiais/:id', id => SN.telaMateriais(id), { tela: 'materiais' });

SN.detalheMaterial = id => {
  const m = SN.db.materiais.find(x => x.id === id); if (!m) return;
  const acao = (novo, rot, extra, detalhe) => { m.status = novo; Object.assign(m, extra || {}); SN.hist(m, rot, detalhe != null ? detalhe : (extra ? JSON.stringify(extra) : '')); SN.log('MATERIAL_' + novo, m.id, detalhe || ''); SN.salvar(); SN.redesenharMat(); };
  const botoes = [{ rot: 'Fechar' }];
  if (m.status === 'SEM_MATERIAL') botoes.push( // técnico disse que não usou nada: a gestão só contesta se não conferir
    { rot: 'Apontar divergência', cls: 'perigo', acao: async () => { const mot = await SN.pedirTexto('Divergência', 'O que não confere? (o técnico verá e poderá apontar os materiais)'); if (!mot) return false; acao('DIVERGENTE', 'Divergência', { motivo: mot }); } });
  if (['REGISTRADO', 'DIVERGENTE'].includes(m.status)) botoes.push(
    { rot: 'Apontar divergência', cls: 'perigo', acao: async () => { const mot = await SN.pedirTexto('Divergência', 'O que não confere? (o técnico verá)'); if (!mot) return false; acao('DIVERGENTE', 'Divergência', { motivo: mot }); } },
    { rot: 'Conferido', cls: 'prim', acao: () => acao('CONFERIDO', 'Conferido', { conferidoPor: SN.usuario().nome, conferidoEm: SN.agora() }) });
  if (m.status === 'CONFERIDO') botoes.push({ rot: 'Informar baixa feita no Elleven', cls: 'prim', acao: async () => { await SN.informarBaixa(m); } });
  if (m.status === 'BAIXADO_SAP') botoes.push({ rot: 'Marcar como alocado ao cliente', cls: 'prim', acao: async () => {
    if (!await SN.confirmar('Alocado ao cliente', 'Confirma que o material já está alocado ao cliente? O SigoNet só registra a informação; não altera nada no Elleven.', 'Confirmar')) return false;
    acao('ALOCADO_CLIENTE', 'Alocado ao cliente (informado)', { alocadoEm: SN.agora(), alocadoPor: SN.usuario().nome }, ''); } });
  const b = m.baixa;
  const blocoBaixa = b ? `<div class="aviso info small"><b>Baixa informada (feita no ${SN.esc(b.sistema)})</b><br>
      Estoque debitado: <b>${SN.esc(b.estoque || 'não informado')}</b> · Titular do estoque: <b>${SN.esc(b.titular)}</b><br>
      Referência no ${SN.esc(b.sistema)}: <span class="mono">${SN.esc(b.documento)}</span><br>
      Informado por: <b>${SN.esc(b.operador)}</b>${b.operadorCargo ? ' (' + SN.esc(b.operadorCargo) + ')' : ''} em ${SN.dt(b.em)}</div>`
    : m.docSap ? `<div class="aviso alerta small"><b>Registro anterior, feito em modo simulado:</b> o documento ${SN.esc(m.docSap)} foi gerado pelo próprio SigoNet e <b>não</b> é confirmação do sistema de estoque. Confira a baixa no Elleven. (${SN.esc(m.baixadoPor || '')} · ${SN.dt(m.baixadoEm)})</div>`
    : ['BAIXADO_SAP', 'ALOCADO_CLIENTE'].includes(m.status) ? `<div class="aviso alerta small">Status de baixa sem referência do Elleven registrada. Confira no Elleven.</div>` : '';
  SN.modal({ titulo: `${m.id} · ${SN.MAT_STATUS[m.status].rot}`, largo: true, botoes, corpo: `${SN.htmlCabecalho(m.cab)}
    ${m.motivo ? `<div class="aviso erro small">Divergência: ${SN.esc(m.motivo)}</div>` : ''}
    <div class="tabela-wrap"><table class="tab"><thead><tr><th>Tipo</th><th>Código</th><th>Descrição</th><th class="num">Qtd</th><th>Seriais</th><th class="num">Custo</th></tr></thead><tbody>
    ${m.itens.map(i => `<tr><td>${i.tipo}</td><td class="mono">${i.cod}</td><td>${SN.esc(i.desc)}</td><td class="num">${SN.num(i.qtd, 2)}</td><td class="small">${SN.esc((i.seriais || []).join(', '))}</td>
      <td class="num">${SN.brl(SN.precoMaterial(i.cod, m.registradoEm) * i.qtd)}</td></tr>`).join('') || `<tr><td colspan="6" class="muted center">${m.semMaterial ? 'O técnico informou que nenhum material foi utilizado.' : 'Nenhum item.'}</td></tr>`}</tbody></table></div>
    ${m.obs ? `<p class="small"><b>Obs.:</b> ${SN.esc(m.obs)}</p>` : ''}
    ${blocoBaixa}
    <h4>Histórico</h4><table class="tab small"><tbody>${m.historico.slice().reverse().map(h => `<tr><td class="nowrap">${SN.dt(h.ts)}</td><td>${SN.esc(h.usuario)}</td><td>${SN.esc(h.acao)}</td><td>${SN.esc(h.detalhe || '')}</td></tr>`).join('')}</tbody></table>` });
};

// Informar a baixa que JÁ foi feita no Elleven (o SigoNet não movimenta estoque).
// Separa o que não pode se confundir:
//  - titular do estoque: quem responde pelo estoque debitado (pode nem ter login);
//  - estoque: a identificação dele no Elleven;
//  - operador: quem está logado e informa. Vem da sessão, nunca de campo digitado.
// O titular não vira autor do registro e a titularidade não muda.
SN._informandoBaixa = false;
SN.informarBaixa = async m => {
  if (SN._informandoBaixa) return; // duplo clique
  const u = SN.usuario();
  if (!u || !SN.temTela('materiais')) return SN.toast('Seu acesso não permite informar baixa de materiais.', 'erro');
  SN._informandoBaixa = true;
  try {
    const nomes = [...new Set([...SN.db.tecnicos.filter(t => t.ativo !== false).map(t => t.nome), ...SN.db.lideranca.filter(l => l.ativo !== false).map(l => l.nome)])].sort();
    const dados = await SN.modal({ titulo: `Informar baixa · ${m.id}`, corpo: `
      <div class="aviso alerta small" style="margin-bottom:10px">Faça a baixa <b>primeiro no Elleven</b>. Este registro <b>não</b> movimenta estoque: só guarda a referência da baixa feita lá e quem a informou.</div>
      <div class="campo"><label>Titular do estoque debitado *</label><input class="inp" id="bxTit" list="bxNomes" maxlength="120" placeholder="nome do responsável pelo estoque">
        <datalist id="bxNomes">${nomes.map(n => `<option value="${SN.esc(n)}">`).join('')}</datalist>
        <p class="small muted">Quem responde pelo estoque no Elleven. Não precisa ter login no SigoNet. Técnico do chamado: ${SN.esc(m.cab.tecnico || '—')}.</p></div>
      <div class="campo"><label>Identificação do estoque no Elleven</label><input class="inp" id="bxEst" maxlength="120" placeholder="como aparece no Elleven (opcional)"></div>
      <div class="campo"><label>Referência da baixa no Elleven (nº do documento/movimento) *</label><input class="inp" id="bxDoc" maxlength="60"></div>
      <div class="campo"><label>Informado por</label><input class="inp" value="${SN.esc(u.nome)} · ${SN.esc(u.cargo || '')}" disabled></div>`,
      botoes: [{ rot: 'Cancelar', valor: null }, { rot: 'Registrar informação', cls: 'prim', acao: f => {
        const titular = SN.$('#bxTit', f).value.trim(), estoque = SN.$('#bxEst', f).value.trim(), documento = SN.$('#bxDoc', f).value.trim();
        if (!titular) { SN.toast('Informe o titular do estoque.', 'erro'); return false; }
        if (!documento) { SN.toast('Informe a referência da baixa feita no Elleven.', 'erro'); return false; }
        return { titular, estoque, documento };
      } }] });
    if (!dados) return;
    const atual = SN.db.materiais.find(x => x.id === m.id);
    if (!atual || atual.status !== 'CONFERIDO') return SN.toast('O registro mudou enquanto você preenchia. Abra de novo e confira.', 'erro');
    const antes = JSON.parse(JSON.stringify(atual)), em = SN.agora();
    atual.baixa = { externa: true, sistema: 'Elleven', ...dados, operador: u.nome, operadorCargo: u.cargo || '', em };
    atual.status = 'BAIXADO_SAP'; atual.docSap = dados.documento; atual.baixadoPor = u.nome; atual.baixadoEm = em;
    SN.hist(atual, 'Baixa informada (feita no Elleven)', `ref. ${dados.documento} · estoque ${dados.estoque || '—'} · titular ${dados.titular}`);
    SN.log('MATERIAL_BAIXA_INFORMADA', atual.id, `ref. ${dados.documento} · titular ${dados.titular}`);
    SN.salvar();
    if (SN.remoto) { // só mostra sucesso depois que o servidor aceitar
      await SN.salvarAgora();
      const erro = SN.erroEnvio('materiais', atual.id);
      if (erro) {
        const i = SN.db.materiais.indexOf(atual); if (i >= 0) SN.db.materiais[i] = antes;
        SN.redesenharMat(); return SN.toast('Não registrado: ' + erro, 'erro');
      }
      if (SN.pendenteEnvio('materiais', atual.id)) { SN.redesenharMat(); return SN.toast('Informação guardada neste aparelho, ainda NÃO confirmada pelo servidor. Ela sobe quando a conexão voltar.', 'erro'); }
    }
    SN.redesenharMat(); SN.toast('Baixa informada: ref. ' + dados.documento + ' (feita no Elleven).', 'ok');
  } finally { SN._informandoBaixa = false; }
};

// ═══════════════════════════ Cadastro de Fibra ═══════════════════════════
SN.telaFibra = abrirId => {
  const u = SN.usuario();
  const oem = u.cargo === 'OEM';
  const grupos = [
    ['AGUARDANDO_VALIDACAO', 'Aguardando validação do líder', 'Encarregados e gestores conferem antes da sala técnica.'],
    ['PENDENTE_CADASTRO', 'Pendentes de cadastro no GEOGRID', 'Sala técnica replica no GEOGRID e registra quem cadastrou.'],
    ['CORRECAO', 'Com o técnico para correção', ''],
    ['CADASTRADO', 'Cadastrados', ''], ['INCORRETO', 'Incorretos (arquivados)', '']
  ];
  SN.casca('fibra', `
    <div class="cab-pagina"><div><h1>Cadastro de Fibra · evidência técnica</h1><p>Fotografia formal do que foi executado em campo. Fila própria de validação — não interfere no MTTR, SLA ou fechamento do chamado.</p></div></div>
    ${SN.htmlFilaValidacao('OEM', SN.temTela('chamados'))}
    ${grupos.map(([st, tit, sub]) => { const l = SN.db.fibras.filter(x => x.status === st).sort((a, b) => (b.enviadoEm || '').localeCompare(a.enviadoEm || ''));
      if (st === 'AGUARDANDO_VALIDACAO' && oem) return `<div class="card"><h3>${tit} <span class="badge">${l.length}</span></h3><p class="muted small">Etapa do líder — a sala técnica atua a partir da etapa seguinte.</p></div>`;
      return `<div class="card"><div class="card-tit"><h3>${tit} <span class="badge">${l.length}</span></h3><span class="muted small">${sub}</span></div>
      ${l.length ? `<div class="tabela-wrap"><table class="tab"><thead><tr><th>Registro</th><th>Chamado</th><th>Cliente</th><th>Técnico</th><th>CEOs</th><th>Enviado</th></tr></thead><tbody>
        ${l.map(x => `<tr class="clic" data-id="${x.id}"><td class="mono">${x.id}</td><td class="mono">${x.chamadoId}</td><td>${SN.esc(x.cliente)}</td><td>${SN.esc(x.cab.tecnico)}</td>
          <td>${x.ceos.map(e => SN.esc(e.numero)).join(', ')}</td><td class="nowrap">${SN.dt(x.enviadoEm)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Vazio.</p>'}</div>`; }).join('')}`);
  SN.ligarValidacao();
  SN.$$('tr[data-id]').forEach(tr => tr.onclick = () => SN.detalheFibra(tr.dataset.id));
  if (abrirId) SN.detalheFibra(abrirId);
};
SN.rota('/fibra', () => SN.telaFibra(), { tela: 'fibra' });
SN.rota('/fibra/:id', id => SN.telaFibra(id), { tela: 'fibra' });

SN.detalheFibra = id => {
  const r = SN.db.fibras.find(x => x.id === id); if (!r) return;
  const u = SN.usuario();
  const mudar = (st, rot, det, extra) => { r.status = st; Object.assign(r, extra || {}); SN.hist(r, rot, det || ''); SN.log('FIBRA_' + st, r.id, det || ''); SN.salvar(); SN.telaFibra(); };
  const botoes = [{ rot: 'Fechar' }];
  if (r.pdf) botoes.push({ rot: 'Ver PDF', acao: () => { SN.abrirAnexo(r.pdf.id); return false; } });
  if (r.status === 'AGUARDANDO_VALIDACAO' && SN.podeAprovar()) botoes.push(
    { rot: 'Incorreto', cls: 'perigo', acao: async () => { const m = await SN.pedirTexto('Marcar como incorreto', 'Motivo'); if (!m) return false; mudar('INCORRETO', 'Incorreto', m, { motivo: m }); } },
    { rot: 'Solicitar correção', acao: async () => { const m = await SN.pedirTexto('Solicitar correção ao técnico', 'O que corrigir?'); if (!m) return false; mudar('CORRECAO', 'Correção solicitada', m, { motivo: m }); } },
    { rot: 'Correto · liberar p/ GEOGRID', cls: 'prim', acao: () => mudar('PENDENTE_CADASTRO', 'Validado pelo líder', '', { validadoPor: u.nome, validadoEm: SN.agora() }) });
  if (r.status === 'PENDENTE_CADASTRO' && (u.cargo === 'OEM' || SN.ehGestor())) botoes.push(
    { rot: 'Recusar (volta ao líder)', cls: 'perigo', acao: async () => { const m = await SN.pedirTexto('Recusar cadastro', 'Motivo (dado confuso/incompleto…)'); if (!m) return false; mudar('AGUARDANDO_VALIDACAO', 'Recusado pela sala técnica', m, { motivo: m }); } },
    { rot: 'Cadastrado no GEOGRID', cls: 'prim', acao: () => mudar('CADASTRADO', 'Cadastrado no GEOGRID', u.nome, { cadastradoPor: u.nome, cadastradoEm: SN.agora() }) });
  SN.modal({ titulo: `${r.id} · ${SN.FIB_STATUS[r.status].rot}`, largo: true, botoes, corpo: `${SN.htmlCabecalho(r.cab)}
    ${r.motivo ? `<div class="aviso alerta small">Último motivo: ${SN.esc(r.motivo)}</div>` : ''}
    ${r.ceos.map((e, i) => `<div class="card" style="margin-top:10px"><h3>CEO ${i + 1} · Nº ${SN.esc(e.numero)} <span class="badge">${e.tipoCaixa}</span></h3>
      <p class="small">${e.modelo ? SN.esc((SN.material(e.modelo) || {}).d || e.modelo) + ' · ' : ''}A: ${SN.esc(e.nomA || '—')} ${e.caboA} · B: ${SN.esc(e.nomB || '—')} ${e.caboB}${e.splitter ? ' · splitter ' + e.splitter : ''}</p>
      ${e.local || (e.gps && e.gps.lat) ? `<p class="small">📍 ${SN.esc(e.local || '')} ${SN.gpsTxt(e.gps)}</p>` : ''}
      ${SN.svgFibra(e)}${e.obs ? `<p class="small">${SN.esc(e.obs)}</p>` : ''}</div>`).join('')}
    <h4 style="margin-top:10px">Histórico</h4><table class="tab small"><tbody>${r.historico.slice().reverse().map(h => `<tr><td class="nowrap">${SN.dt(h.ts)}</td><td>${SN.esc(h.usuario)}</td><td>${SN.esc(h.acao)}</td><td>${SN.esc(h.detalhe)}</td></tr>`).join('')}</tbody></table>` });
};
