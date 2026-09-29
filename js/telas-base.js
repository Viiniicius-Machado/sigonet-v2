// SIGONET V2 — Base OEM: visão global (todo o histórico OEM) de tudo o que aconteceu com cada cliente.
// Junta o que já está gravado em cada chamado e nas gestões ligadas a ele:
//   atendimento (quem abriu, despachou, atendeu, concluiu e fechou; MTTD/MTTA/MTTR/SLA),
//   rechamado (IRR: mesma etiqueta em até 30 dias) e quantas vezes o cliente entrou
//   na semana/mês, LPU de cobrança (valor, quem aprovou e contabilizou), materiais
//   (baixa informada, titular do estoque) e cadastro de fibra (quem validou/cadastrou).
// Só leitura: as ações continuam nas telas de cada gestão.
// Abas: Clientes · Atendimentos · Rastreio de material (o Controle de Materiais).
SN.fBase = { q: '', seg: '', emp: '', ord: 'chamados', soReinc: false };
SN.chaveCliente = nome => SN.normal(nome).replace(/\s+/g, ' ').trim();
// Último registro do histórico cuja ação combina com a expressão (quem fez e quando).
SN.quemFez = (c, re) => { const h = (c.historico || []).filter(x => re.test(x.acao || '')); return h.length ? h[h.length - 1] : null; };
SN.ehBaixaInf = m => ['BAIXADO_SAP', 'ALOCADO_CLIENTE'].includes(m.status);
SN.resumoAtendimento = c => {
  const mod = SN.modulosDo(c.id), p = (re) => { const h = SN.quemFez(c, re); return h ? h.usuario : ''; };
  return { c, m: SN.metricas(c), reinc: SN.reincidencia(c), ...mod,
    abertoPor: p(/^Abertura/), despachoPor: p(/^(Despacho|Reatribui)/), concluiuPor: p(/^Conclus[aã]o t[eé]cnica/), fechadoPor: p(/^Fechamento/),
    valorLpu: mod.lpus.reduce((s, l) => s + SN.valorLpu(l), 0), custoMat: mod.materiais.reduce((s, m) => s + SN.custoMat(m), 0) };
};
// Texto de busca do atendimento inteiro (chamado + LPU + materiais + fibra).
SN.textoBusca = r => { const c = r.c; return SN.normal([c.id, c.cliente, c.etiqueta, c.protocoloNoc, c.protocoloOem, c.tecnico, c.empresa, c.apoio && c.apoio.tecnico,
  c.cidade, c.endereco, c.tipo, c.cat1, c.cat2, c.cat3, c.motivo, c.rfo && c.rfo.causa, c.rfo && c.rfo.solucao, r.abertoPor, r.despachoPor, r.fechadoPor,
  ...r.lpus.flatMap(l => [l.id, l.assinaturaLider && l.assinaturaLider.nome, l.assinaturaSD && l.assinaturaSD.nome, ...(l.itens || []).map(i => i.cod)]),
  ...r.materiais.flatMap(m => [m.id, m.baixa && m.baixa.titular, m.baixa && m.baixa.documento, SN.baixaPorMat(m), ...m.itens.flatMap(i => [i.cod, i.desc, ...(i.seriais || [])])]),
  ...r.fibras.flatMap(x => [x.id, x.validadoPor, x.cadastradoPor, ...(x.ceos || []).map(e => e.numero)])].filter(Boolean).join(' ')); };
SN.pct = (a, b) => b ? SN.num(100 * a / b, 0) + '%' : '—';
SN.medias = rs => { const con = rs.filter(r => r.c.tempos && r.c.tempos.conclusaoTecnica), sla = rs.filter(r => r.m.sla != null);
  return { mttd: SN.media(rs.map(r => r.m.mttd)), mtta: SN.media(rs.map(r => r.m.mtta)), mttr: SN.media(con.map(r => r.m.mttr)),
    slaDentro: sla.filter(r => r.m.sla).length, slaBase: sla.length }; };

// Atendimentos do período + filtros (compartilhado pelas abas e pela ficha do cliente).
SN.atendimentosBase = (chaveCli) => {
  const f = SN.fBase, P = SN.periodo, iv = SN.intervaloMat(P.per, P.ref), q = SN.normal(f.q);
  return SN.db.chamados.filter(c => SN.noIntervalo((c.tempos || {}).abertura, iv) && (!chaveCli || SN.chaveCliente(c.cliente) === chaveCli)
      && (!f.emp || c.empresa === f.emp || (c.apoio && c.apoio.empresa === f.emp)) && (!f.seg || (c.tipo || 'Sem classificação') === f.seg))
    .map(SN.resumoAtendimento)
    .filter(r => (!q || SN.textoBusca(r).includes(q)) && (!f.soReinc || r.reinc))
    .sort((a, b) => (b.c.tempos.abertura || '').localeCompare(a.c.tempos.abertura || ''));
};
// Quantas vezes o cliente entrou na semana e no mês da data de referência (independe do período escolhido).
SN.entradasCliente = chave => { const ref = SN.periodo.ref || SN.dataIsoLocal(new Date()), sem = SN.intervaloMat('semana', ref), mes = SN.intervaloMat('mes', ref);
  const doCli = SN.db.chamados.filter(c => SN.chaveCliente(c.cliente) === chave && c.status !== 'CANCELADO');
  return { semana: doCli.filter(c => SN.noIntervalo(c.tempos.abertura, sem)).length, mes: doCli.filter(c => SN.noIntervalo(c.tempos.abertura, mes)).length, total: doCli.length }; };

// Cabeçalho e abas da Base.
SN.cabBase = (aba, acoes) => `
  <div class="cab-pagina"><div><h1>Base OEM</h1><p>Todo o histórico OEM, cliente a cliente: atendimento, tempos, rechamados, LPU de cobrança, aprovações, materiais e fibra.</p></div>
    <div class="acoes">${acoes || ''}</div></div>
  <div class="abas">${[['clientes', 'Clientes', '#/base'], ['atendimentos', 'Atendimentos', '#/base/atendimentos'],
    ...(SN.temTela('materiais') ? [['materiais', 'Rastreio de material', '#/base/materiais']] : [])].map(([k, r, h]) =>
    `<a class="aba ${k === aba ? 'ativa' : ''}" href="${h}" style="text-decoration:none">${r}</a>`).join('')}</div>`;
SN.filtrosBase = (base) => { const f = SN.fBase, segs = [...new Set(base.map(r => r.c.tipo || 'Sem classificação'))].sort();
  return `<div class="card card-filtros">${SN.htmlPeriodo()}
    <div class="filtros">
      <input class="inp busca" id="bQ" placeholder="Buscar: cliente, etiqueta, chamado, protocolo, técnico, quem aprovou, código, serial…" value="${SN.esc(f.q)}">
      <select class="inp" id="bSeg"><option value="">Todos os segmentos</option>${[...new Set([...segs, f.seg].filter(Boolean))].map(s => `<option ${s === f.seg ? 'selected' : ''}>${SN.esc(s)}</option>`).join('')}</select>
      <select class="inp" id="bEmp"><option value="">Todas as empresas</option>${SN.opcoesEmpresas(f.emp)}</select>
      <label class="chip ${f.soReinc ? 'sel' : ''}" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="bReinc" ${f.soReinc ? 'checked' : ''} style="display:none">Só rechamados</label>
      ${f.q || f.seg || f.emp || f.soReinc ? '<button class="btn sm" id="bLimparB">Limpar</button>' : ''}
    </div></div>`; };
SN.ligarFiltrosBase = redesenhar => { const f = SN.fBase;
  SN.ligarPeriodo(redesenhar);
  const q = SN.$('#bQ'); if (q) q.oninput = SN.debounce(e => { f.q = e.target.value; const pos = e.target.selectionStart; redesenhar(); const el = SN.$('#bQ'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }, 350);
  SN.$('#bSeg') && (SN.$('#bSeg').onchange = e => { f.seg = e.target.value; redesenhar(); });
  SN.$('#bEmp') && (SN.$('#bEmp').onchange = e => { f.emp = e.target.value; redesenhar(); });
  SN.$('#bReinc') && (SN.$('#bReinc').onchange = e => { f.soReinc = e.target.checked; redesenhar(); });
  SN.$('#bLimparB') && (SN.$('#bLimparB').onclick = () => { Object.assign(f, { q: '', seg: '', emp: '', soReinc: false }); redesenhar(); });
};
SN.kpisBase = rs => { const md = SN.medias(rs), reinc = rs.filter(r => r.reinc).length, clientes = new Set(rs.map(r => SN.chaveCliente(r.c.cliente))).size;
  const lpu = rs.reduce((s, r) => s + r.valorLpu, 0), mat = rs.reduce((s, r) => s + r.custoMat, 0);
  return `<div class="kpis-c">
      <div class="kpi destaque"><div class="rot">Clientes atendidos</div><div class="val">${clientes}</div><div class="sub">${rs.length} chamado(s) no período</div></div>
      <div class="kpi"><div class="rot">Rechamados (IRR)</div><div class="val" style="color:${reinc ? 'var(--erro)' : 'inherit'}">${reinc}</div><div class="sub">mesma etiqueta em até ${SN.IRR.dias} dias</div></div>
      <div class="kpi"><div class="rot">SLA</div><div class="val">${SN.pct(md.slaDentro, md.slaBase)}</div><div class="sub">${md.slaDentro} de ${md.slaBase} dentro do prazo</div></div>
      <div class="kpi"><div class="rot">LPU · material</div><div class="val" style="font-size:1.25rem">${SN.brl(lpu)}</div><div class="sub">material ${SN.brl(mat)}</div></div>
      <div class="kpi"><div class="rot">MTTD</div><div class="val">${SN.dur(md.mttd)}</div><div class="sub">abertura → despacho</div></div>
      <div class="kpi"><div class="rot">MTTA</div><div class="val">${SN.dur(md.mtta)}</div><div class="sub">despacho → em campo</div></div>
      <div class="kpi"><div class="rot">MTTR</div><div class="val">${SN.dur(md.mttr)}</div><div class="sub">abertura → conclusão técnica</div></div>
      <div class="kpi"><div class="rot">Em aberto</div><div class="val">${rs.filter(r => SN.STATUS[r.c.status] && SN.STATUS[r.c.status].aberto).length}</div><div class="sub">ainda sem conclusão/fechamento</div></div></div>`; };
SN.slaTxt = m => m.sla == null ? '—' : m.sla ? '<span class="badge ok">Dentro</span>' : '<span class="badge erro">Fora</span>';
SN.nomeCurto = n => n ? SN.nomeExibicao(n) : '—';

// ── Aba Clientes ──
SN.telaBase = () => {
  const redesenhar = () => SN.telaBase();
  if (SN.buscarPeriodo('base', '/base', redesenhar)) return;
  const f = SN.fBase, rs = SN.atendimentosBase(), ref = SN.periodo.ref;
  const cli = {};
  rs.forEach(r => { const k = SN.chaveCliente(r.c.cliente); const o = cli[k] = cli[k] || { k, nome: r.c.cliente || '(sem nome)', rs: [], etiquetas: new Set(), tecnicos: new Set() };
    o.rs.push(r); if (r.c.etiqueta) o.etiquetas.add(r.c.etiqueta); if (r.c.tecnico) o.tecnicos.add(r.c.tecnico); });
  const linhas = Object.values(cli).map(o => ({ ...o, n: o.rs.length, reinc: o.rs.filter(r => r.reinc).length, ent: SN.entradasCliente(o.k), md: SN.medias(o.rs),
    lpu: o.rs.reduce((s, r) => s + r.valorLpu, 0), mat: o.rs.reduce((s, r) => s + r.custoMat, 0), ultimo: o.rs[0].c.tempos.abertura }));
  const ords = { chamados: (a, b) => b.n - a.n, reinc: (a, b) => b.reinc - a.reinc || b.n - a.n, mttr: (a, b) => (b.md.mttr || 0) - (a.md.mttr || 0), lpu: (a, b) => b.lpu - a.lpu, recente: (a, b) => b.ultimo.localeCompare(a.ultimo), nome: (a, b) => a.nome.localeCompare(b.nome) };
  linhas.sort(ords[f.ord] || ords.chamados);
  const semRot = 'Semana de ' + SN.intervaloMat('semana', ref)[0].toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), mesRot = SN.mesNome(ref.slice(0, 7));
  SN.casca('base', `${SN.cabBase('clientes', '<button class="btn" id="bExpB">Exportar Excel</button>')}
    ${SN.filtrosBase(rs)}${SN.kpisBase(rs)}
    <div class="card"><div class="card-tit"><h3>Clientes <span class="badge">${linhas.length}</span></h3>
      <span class="small">Ordenar por <select class="inp" id="bOrd" style="width:auto;display:inline-block">${[['chamados', 'Mais chamados'], ['reinc', 'Mais rechamados'], ['mttr', 'Maior MTTR'], ['lpu', 'Maior valor de LPU'], ['recente', 'Mais recente'], ['nome', 'Nome']]
        .map(([k, r]) => `<option value="${k}" ${f.ord === k ? 'selected' : ''}>${r}</option>`).join('')}</select></span></div>
    <div class="tabela-wrap"><table class="tab"><thead><tr><th>Cliente</th><th>Etiquetas</th><th class="num">Chamados no período</th><th class="num" title="${semRot}">Na semana</th><th class="num" title="${mesRot}">No mês</th>
      <th class="num">Rechamados</th><th class="num">MTTD</th><th class="num">MTTA</th><th class="num">MTTR</th><th class="num">SLA</th><th class="num">LPU</th><th class="num">Material</th><th>Último chamado</th></tr></thead><tbody>
      ${linhas.map(o => `<tr class="clic" data-cli="${SN.esc(o.k)}"><td><b>${SN.esc(o.nome)}</b><div class="small muted">${o.tecnicos.size} técnico(s)</div></td><td class="small mono">${SN.esc([...o.etiquetas].slice(0, 3).join(', '))}${o.etiquetas.size > 3 ? ' +' + (o.etiquetas.size - 3) : ''}</td>
        <td class="num">${o.n}</td><td class="num">${o.ent.semana}</td><td class="num">${o.ent.mes}</td>
        <td class="num">${o.reinc ? `<span class="badge erro">${o.reinc}</span>` : '0'}</td><td class="num">${SN.dur(o.md.mttd)}</td><td class="num">${SN.dur(o.md.mtta)}</td><td class="num">${SN.dur(o.md.mttr)}</td>
        <td class="num">${SN.pct(o.md.slaDentro, o.md.slaBase)}</td><td class="num">${SN.brl(o.lpu)}</td><td class="num">${SN.brl(o.mat)}</td><td class="nowrap">${SN.dt(o.ultimo)}</td></tr>`).join('')
        || '<tr><td colspan="13" class="muted center">Nenhum atendimento neste período.</td></tr>'}
    </tbody></table></div><p class="small muted" style="margin-top:6px">"Na semana" e "No mês" contam as entradas do cliente na ${semRot.toLowerCase()} e em ${mesRot} (data de referência do período). Clique no cliente para ver a ficha completa.</p></div>`);
  SN.ligarFiltrosBase(redesenhar);
  SN.$('#bOrd').onchange = e => { f.ord = e.target.value; redesenhar(); };
  SN.$$('tr[data-cli]').forEach(tr => tr.onclick = () => SN.navegar('#/base/cliente/' + encodeURIComponent(tr.dataset.cli)));
  SN.$('#bExpB').onclick = () => SN.exportar('base_clientes_' + SN.periodo.per + '_' + SN.periodo.ref, linhas.map(o => ({ Cliente: o.nome, Etiquetas: [...o.etiquetas].join(', '),
    ChamadosNoPeriodo: o.n, NaSemana: o.ent.semana, NoMes: o.ent.mes, Rechamados: o.reinc, MTTD_min: Math.round(o.md.mttd || 0), MTTA_min: Math.round(o.md.mtta || 0), MTTR_min: Math.round(o.md.mttr || 0),
    SLA_pct: o.md.slaBase ? Math.round(100 * o.md.slaDentro / o.md.slaBase) : '', LPU: o.lpu, Material: o.mat, UltimoChamado: SN.dt(o.ultimo) })));
};

// ── Aba Atendimentos ──
SN.linhaExportAtendimento = r => { const c = r.c;
  return { Abertura: SN.dt(c.tempos.abertura), Chamado: c.id, Cliente: c.cliente, Etiqueta: c.etiqueta || '', Segmento: c.tipo || '', Categoria: [c.cat1, c.cat2, c.cat3, c.cat4].filter(Boolean).join(' > '),
    Status: (SN.STATUS[c.status] || {}).rot || c.status, Tecnico: c.tecnico || '', Empresa: c.empresa || '', Apoio: c.apoio ? c.apoio.tecnico + ' (' + c.apoio.empresa + ')' : '',
    AbertoPor: r.abertoPor, DespachadoPor: r.despachoPor, ConcluidoPor: r.concluiuPor, FechadoPor_NOC: r.fechadoPor,
    MTTD_min: r.m.mttd, MTTA_min: r.m.mtta, MTTR_min: r.m.mttr, SLA: r.m.sla == null ? '' : r.m.sla ? 'Dentro' : 'Fora',
    Rechamado: r.reinc ? 'Sim (' + r.reinc.id + ')' : '', Causa: (c.rfo && c.rfo.causa) || '',
    LPU: r.lpus.map(l => `${l.id} ${SN.LPU_STATUS[l.status] ? SN.LPU_STATUS[l.status].rot : l.status}`).join('; '), ValorLPU: r.valorLpu,
    LPU_AprovadaPor: r.lpus.map(l => l.assinaturaLider && l.assinaturaLider.nome).filter(Boolean).join('; '), LPU_ServiceDesk: r.lpus.map(l => l.assinaturaSD && l.assinaturaSD.nome).filter(Boolean).join('; '),
    Materiais: r.materiais.map(m => `${m.id} ${SN.MAT_STATUS[m.status] ? SN.MAT_STATUS[m.status].rot : m.status}`).join('; '), CustoMaterial: r.custoMat,
    BaixaInformadaPor: r.materiais.map(SN.baixaPorMat).filter(Boolean).join('; '), TitularEstoque: r.materiais.map(m => m.baixa && m.baixa.titular).filter(Boolean).join('; '),
    Fibra: r.fibras.map(x => `${x.id} ${SN.FIB_STATUS[x.status] ? SN.FIB_STATUS[x.status].rot : x.status}`).join('; '), FibraValidadaPor: r.fibras.map(x => x.validadoPor).filter(Boolean).join('; '),
    FibraCadastradaPor: r.fibras.map(x => x.cadastradoPor).filter(Boolean).join('; ') }; };
SN.telaBaseAtendimentos = () => {
  const redesenhar = () => SN.telaBaseAtendimentos();
  if (SN.buscarPeriodo('base', '/base', redesenhar)) return;
  const rs = SN.atendimentosBase();
  const lpuTxt = r => r.lpus.map(l => `${SN.badgeLpu(l.status)} ${SN.valorLpuTxt(l)}`).join('<br>') || '<span class="muted">—</span>';
  const aprovTxt = r => r.lpus.map(l => `${l.assinaturaLider ? '✔ ' + SN.esc(SN.nomeCurto(l.assinaturaLider.nome)) : '<span class="muted">líder —</span>'}${l.assinaturaSD ? ' · SD ' + SN.esc(SN.nomeCurto(l.assinaturaSD.nome)) : ''}`).join('<br>') || '<span class="muted">—</span>';
  const matTxt = r => r.materiais.map(m => `${SN.badge(SN.MAT_STATUS, m.status)}${SN.baixaPorMat(m) ? ' ' + SN.esc(SN.nomeCurto(SN.baixaPorMat(m))) : ''}`).join('<br>') || '<span class="muted">—</span>';
  const fibTxt = r => r.fibras.map(x => `${SN.badge(SN.FIB_STATUS, x.status)}${x.validadoPor ? ' · val. ' + SN.esc(SN.nomeCurto(x.validadoPor)) : ''}`).join('<br>') || '<span class="muted">—</span>';
  SN.casca('base', `${SN.cabBase('atendimentos', '<button class="btn" id="bExpA">Exportar Excel</button>')}
    ${SN.filtrosBase(rs)}${SN.kpisBase(rs)}
    <div class="card"><div class="tabela-wrap"><table class="tab small"><thead><tr><th>Abertura</th><th>Chamado</th><th>Cliente · etiqueta</th><th>Segmento</th><th>Status</th><th>Atendeu</th>
      <th>Abriu · despachou · fechou (NOC)</th><th class="num">MTTD</th><th class="num">MTTA</th><th class="num">MTTR</th><th>SLA</th><th>Rechamado</th><th>LPU</th><th>Aprovação LPU</th><th>Materiais</th><th>Fibra</th></tr></thead><tbody>
      ${rs.map(r => { const c = r.c; return `<tr class="clic" data-ch="${c.id}"><td class="nowrap">${SN.dt(c.tempos.abertura)}</td><td class="mono"><a href="#/chamado/${c.id}">${c.id}</a></td>
        <td><a href="#/base/cliente/${encodeURIComponent(SN.chaveCliente(c.cliente))}">${SN.esc(c.cliente)}</a><div class="mono muted">${SN.esc(c.etiqueta || '')}</div></td>
        <td>${SN.esc(c.tipo || '—')}</td><td>${SN.badgeStatus(c.status)}</td>
        <td>${SN.esc(SN.nomeCurto(c.tecnico))}<div class="muted">${SN.esc(c.empresa || '')}${c.apoio ? ' · apoio ' + SN.esc(c.apoio.tecnico) : ''}</div></td>
        <td>${SN.esc(SN.nomeCurto(r.abertoPor))}<br>${SN.esc(SN.nomeCurto(r.despachoPor))}<br>${SN.esc(SN.nomeCurto(r.fechadoPor))}</td>
        <td class="num">${SN.dur(r.m.mttd)}</td><td class="num">${SN.dur(r.m.mtta)}</td><td class="num">${SN.dur(r.m.mttr)}</td><td>${SN.slaTxt(r.m)}</td>
        <td>${r.reinc ? `<span class="badge erro">Sim</span> <a href="#/chamado/${r.reinc.id}">${r.reinc.id}</a>` : '—'}</td>
        <td>${lpuTxt(r)}</td><td>${aprovTxt(r)}</td><td>${matTxt(r)}</td><td>${fibTxt(r)}</td></tr>`; }).join('') || '<tr><td colspan="16" class="muted center">Nenhum atendimento neste período.</td></tr>'}
    </tbody></table></div></div>`);
  SN.ligarFiltrosBase(redesenhar);
  SN.$$('tr[data-ch]').forEach(tr => tr.onclick = e => { if (e.target.closest('a')) return; SN.navegar('#/base/cliente/' + encodeURIComponent(SN.chaveCliente((SN.db.chamados.find(x => x.id === tr.dataset.ch) || {}).cliente))); });
  SN.$('#bExpA').onclick = () => SN.exportar('base_atendimentos_' + SN.periodo.per + '_' + SN.periodo.ref, rs.map(SN.linhaExportAtendimento));
};

// ── Ficha do cliente ──
SN.telaBaseCliente = chave => {
  const redesenhar = () => SN.telaBaseCliente(chave);
  if (SN.buscarPeriodo('base', '/base', redesenhar)) return;
  const rs = SN.atendimentosBase(chave), todos = SN.db.chamados.filter(c => SN.chaveCliente(c.cliente) === chave);
  const nome = (todos[0] || {}).cliente || chave, ent = SN.entradasCliente(chave), ref = SN.periodo.ref;
  const etiquetas = [...new Set(todos.map(c => c.etiqueta).filter(Boolean))], enderecos = [...new Set(todos.map(c => [c.endereco, c.cidade].filter(Boolean).join(' · ')).filter(Boolean))];
  const tecnicos = [...new Set(todos.map(c => c.tecnico).filter(Boolean))];
  const pessoa = (rot, nomeP, ts) => `<tr><td class="muted">${rot}</td><td>${nomeP ? SN.esc(SN.nomeCurto(nomeP)) + (ts ? ' <span class="muted">· ' + SN.dt(ts) + '</span>' : '') : '<span class="muted">—</span>'}</td></tr>`;
  const cartao = r => { const c = r.c, h = re => SN.quemFez(c, re) || {};
    return `<div class="card" style="margin-top:12px"><div class="card-tit"><h3><a href="#/chamado/${c.id}">${c.id}</a> · ${SN.dt(c.tempos.abertura)} ${SN.badgeStatus(c.status)} ${SN.slaTxt(r.m)}
        ${r.reinc ? `<span class="badge erro" title="Mesma etiqueta encerrada em até ${SN.IRR.dias} dias antes">Rechamado · anterior ${r.reinc.id}</span>` : ''}</h3>
        <span class="small muted">${SN.esc([c.tipo, c.cat3 || c.cat2 || c.cat1].filter(Boolean).join(' · '))}${c.etiqueta ? ' · etiqueta ' + SN.esc(c.etiqueta) : ''}</span></div>
      <div class="grid g3">
        <div><h4>Atendimento</h4><table class="tab small"><tbody>
          ${pessoa('Abriu', h(/^Abertura/).usuario, c.tempos.abertura)}${pessoa('Despachou', h(/^(Despacho|Reatribui)/).usuario, c.tempos.atribuicao)}
          <tr><td class="muted">Atendeu</td><td>${SN.esc(SN.nomeCurto(c.tecnico))} <span class="muted">${SN.esc(c.empresa || '')}</span>${c.apoio ? `<br>apoio ${SN.esc(c.apoio.tecnico)} <span class="muted">${SN.esc(c.apoio.empresa)}</span>` : ''}</td></tr>
          ${pessoa('Concluiu', h(/^Conclus[aã]o t[eé]cnica/).usuario, c.tempos.conclusaoTecnica)}${pessoa('Fechou (NOC)', h(/^Fechamento/).usuario, c.tempos.fechamento)}
          <tr><td class="muted">Tempos</td><td>MTTD ${SN.dur(r.m.mttd)} · MTTA ${SN.dur(r.m.mtta)} · MTTR ${SN.dur(r.m.mttr)}</td></tr>
          ${c.rfo && c.rfo.causa ? `<tr><td class="muted">Causa · solução</td><td>${SN.esc(c.rfo.causa)}${c.rfo.solucao ? ' → ' + SN.esc(c.rfo.solucao) : ''}</td></tr>` : ''}
        </tbody></table></div>
        <div><h4>LPU de cobrança</h4>${r.lpus.length ? r.lpus.map(l => `<table class="tab small" style="margin-bottom:6px"><tbody>
          <tr><td class="muted">Registro</td><td><a href="#/lpu/${l.id}">${l.id}</a> ${SN.badgeLpu(l.status)}${l.papel === 'apoio' ? ' <span class="badge">APOIO</span>' : ''}</td></tr>
          <tr><td class="muted">Valor</td><td><b>${SN.valorLpuTxt(l)}</b> · ${(l.itens || []).length} item(ns)</td></tr>
          <tr><td class="muted">Técnico assinou</td><td>${SN.esc(SN.txtAssinatura(l.assinaturaTecnico))}</td></tr>
          <tr><td class="muted">Líder aprovou</td><td>${SN.esc(SN.txtAssinatura(l.assinaturaLider))}</td></tr>
          <tr><td class="muted">Service Desk</td><td>${SN.esc(SN.txtAssinatura(l.assinaturaSD))}</td></tr></tbody></table>`).join('') : '<p class="muted small">Sem LPU.</p>'}</div>
        <div><h4>Materiais e fibra</h4>${r.materiais.map(m => `<table class="tab small" style="margin-bottom:6px"><tbody>
          <tr><td class="muted">Registro</td><td>${SN.esc(m.id)} ${SN.badge(SN.MAT_STATUS, m.status)} · ${SN.brl(SN.custoMat(m))}</td></tr>
          <tr><td class="muted">Itens</td><td>${m.itens.map(i => `${SN.esc(i.desc)} <b>${SN.num(i.qtd, 0)}</b>${(i.seriais || []).filter(Boolean).length ? ' <span class="mono">[' + SN.esc(i.seriais.join(', ')) + ']</span>' : ''}`).join('<br>')}</td></tr>
          ${m.conferidoPor ? `<tr><td class="muted">Conferiu</td><td>${SN.esc(SN.nomeCurto(m.conferidoPor))} · ${SN.dt(m.conferidoEm)}</td></tr>` : ''}
          ${m.baixa ? `<tr><td class="muted">Baixa (Elleven)</td><td>informada por ${SN.esc(SN.nomeCurto(m.baixa.operador))} · titular ${SN.esc(m.baixa.titular)} · ref. <span class="mono">${SN.esc(m.baixa.documento)}</span></td></tr>`
            : m.docSap ? `<tr><td class="muted">Baixa</td><td><span class="badge alerta">simulada (anterior)</span></td></tr>` : ''}
          </tbody></table>`).join('') || '<p class="muted small">Sem material apontado.</p>'}
          ${r.fibras.map(x => `<table class="tab small" style="margin-bottom:6px"><tbody><tr><td class="muted">Fibra</td><td><a href="#/fibra/${x.id}">${x.id}</a> ${SN.badge(SN.FIB_STATUS, x.status)} · ${(x.ceos || []).length} CEO</td></tr>
            ${x.validadoPor ? `<tr><td class="muted">Validou</td><td>${SN.esc(SN.nomeCurto(x.validadoPor))} · ${SN.dt(x.validadoEm)}</td></tr>` : ''}
            ${x.cadastradoPor ? `<tr><td class="muted">GEOGRID</td><td>${SN.esc(SN.nomeCurto(x.cadastradoPor))} · ${SN.dt(x.cadastradoEm)}</td></tr>` : ''}</tbody></table>`).join('')}</div>
      </div></div>`; };
  SN.casca('base', `
    <div class="cab-pagina"><div><a href="#/base" class="small">← Base OEM</a><h1>${SN.esc(nome)}</h1>
      <p class="small">${etiquetas.length ? 'Etiquetas: <span class="mono">' + SN.esc(etiquetas.join(', ')) + '</span>' : 'Sem etiqueta'}${enderecos.length ? ' · ' + SN.esc(enderecos.slice(0, 2).join(' | ')) : ''}</p></div>
      <div class="acoes"><button class="btn" id="bExpC">Exportar Excel</button></div></div>
    <div class="card card-filtros">${SN.htmlPeriodo()}</div>
    <div class="kpis-c">
      <div class="kpi destaque"><div class="rot">Chamados no período</div><div class="val">${rs.length}</div><div class="sub">${todos.length} no total carregado</div></div>
      <div class="kpi"><div class="rot">Entradas na semana</div><div class="val">${ent.semana}</div><div class="sub">semana de ${SN.intervaloMat('semana', ref)[0].toLocaleDateString('pt-BR')}</div></div>
      <div class="kpi"><div class="rot">Entradas no mês</div><div class="val">${ent.mes}</div><div class="sub">${SN.mesNome(ref.slice(0, 7))}</div></div>
      <div class="kpi"><div class="rot">Rechamados (IRR)</div><div class="val" style="color:${rs.some(r => r.reinc) ? 'var(--erro)' : 'inherit'}">${rs.filter(r => r.reinc).length}</div><div class="sub">no período</div></div>
    ${(() => { const md = SN.medias(rs); return `
      <div class="kpi"><div class="rot">MTTD · MTTA</div><div class="val" style="font-size:1.25rem">${SN.dur(md.mttd)} · ${SN.dur(md.mtta)}</div><div class="sub">média do cliente</div></div>
      <div class="kpi"><div class="rot">MTTR</div><div class="val">${SN.dur(md.mttr)}</div><div class="sub">média do cliente</div></div>
      <div class="kpi"><div class="rot">SLA</div><div class="val">${SN.pct(md.slaDentro, md.slaBase)}</div><div class="sub">${md.slaDentro} de ${md.slaBase}</div></div>
      <div class="kpi"><div class="rot">LPU · material</div><div class="val" style="font-size:1.25rem">${SN.brl(rs.reduce((s, r) => s + r.valorLpu, 0))}</div><div class="sub">material ${SN.brl(rs.reduce((s, r) => s + r.custoMat, 0))}</div></div>`; })()}</div>
    <p class="small muted">Técnicos que já atenderam: ${SN.esc(tecnicos.map(SN.nomeCurto).join(', ') || '—')}</p>
    ${rs.map(cartao).join('') || '<div class="card"><p class="muted">Nenhum chamado deste cliente no período. Escolha "Tudo" ou outro período.</p></div>'}`);
  SN.ligarPeriodo(redesenhar);
  SN.$('#bExpC').onclick = () => SN.exportar('base_' + nome.replace(/[^\w]+/g, '_').slice(0, 40), rs.map(SN.linhaExportAtendimento));
};

SN.rota('/base', () => SN.telaBase(), { tela: 'base' });
SN.rota('/base/atendimentos', () => SN.telaBaseAtendimentos(), { tela: 'base' });
SN.rota('/base/cliente/:chave', chave => SN.telaBaseCliente(chave), { tela: 'base' });
SN.rota('/base/materiais', () => { if (!SN.temTela('materiais')) { SN.toast('Seu acesso não inclui o rastreio de material.', 'erro'); return SN.navegar('#/base'); } SN.telaMateriais(null, { base: true }); }, { tela: 'base' });
