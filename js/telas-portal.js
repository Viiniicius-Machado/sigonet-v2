// SIGONET V2 — Portal de Gestão (indicadores, relatórios, fechamento mensal),
// Cadastros e Acessos, Auditoria e dados de demonstração.

// Barras horizontais de uma série (cor única da marca, valor em texto, tooltip nativo).
SN.barras = (pares, fmt) => {
  if (!pares.length) return '<p class="muted small">Sem dados no período.</p>';
  const max = Math.max(...pares.map(p => p[1]), 1);
  return `<div class="barras">${pares.map(([n, v, dica]) => `<div class="barra" title="${SN.esc(n)}: ${SN.esc(fmt ? fmt(v) : v)}${dica ? ' · ' + SN.esc(dica) : ''}">
    <span class="nm">${SN.esc(n)}</span><div class="trilho"><div class="fill" style="width:${v / max * 100}%"></div></div><span class="v">${fmt ? fmt(v) : v}</span></div>`).join('')}</div>`;
};
SN.contar = (lista, chave) => { const o = {}; lista.forEach(x => { const k = chave(x); if (k) o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]); };

// ═══════════════════════════ Portal de Gestão ═══════════════════════════
SN.fPortal = { mes: SN.agora().slice(0, 7), tipo: '', emp: '' };
SN.rota('/portal', () => {
  const f = SN.fPortal, d = SN.db;
  const meses = [...new Set([f.mes, SN.agora().slice(0, 7), ...d.chamados.map(c => SN.mesChave(c.tempos.abertura))])].filter(Boolean).sort().reverse();
  const filtra = c => (!f.tipo || c.tipo === f.tipo) && (!f.emp || c.empresa === f.emp);
  const abertos = d.chamados.filter(c => filtra(c) && SN.mesChave(c.tempos.abertura) === f.mes && c.status !== 'CANCELADO');
  const concl = d.chamados.filter(c => filtra(c) && SN.mesChave(c.tempos.conclusaoTecnica) === f.mes);
  const ms = concl.map(c => ({ c, m: SN.metricas(c) }));
  const dentro = ms.filter(x => x.m.sla === true).length, fora = ms.filter(x => x.m.sla === false).length;
  const ef = concl.length ? dentro / concl.length : null;
  // Eficiência por técnico
  const porTec = {};
  ms.forEach(({ c, m }) => { const k = c.tecnico; const o = porTec[k] = porTec[k] || { emp: c.empresa, n: 0, d: 0, f: 0, mttr: [], mtta: [], hh: 0 };
    o.n++; if (m.sla === true) o.d++; if (m.sla === false) o.f++; o.mttr.push(m.mttr); o.mtta.push(m.mtta);
    if (SN.empresa(c.empresa).vinculo === 'CLT') o.hh += SN.horaHomem(c, 'titular').horas; });
  const hhTotal = Object.values(porTec).reduce((s, o) => s + o.hh, 0);
  const tecs = Object.entries(porTec).sort((a, b) => b[1].n - a[1].n);
  // Financeiro por conta (LPU de prestador contabilizada/em pagamento/paga no ciclo do mês)
  const lpusMes = d.lpus.filter(l => SN.cicloDe(l) === f.mes && (!f.emp || l.cab.empresa === f.emp));
  const gastoConta = cod => lpusMes.filter(l => l.cab.conta === cod && ['CONTABILIZADA', 'EM_PAGAMENTO', 'PAGA'].includes(l.status)).reduce((s, l) => s + SN.valorLpu(l), 0);
  const [ano, mm] = f.mes.split('-').map(Number), diasMes = new Date(ano, mm, 0).getDate();
  const hojeMes = SN.agora().slice(0, 7) === f.mes ? new Date().getDate() : diasMes;
  const somaSt = st => lpusMes.filter(l => l.status === st).reduce((s, l) => s + SN.valorLpu(l), 0);
  const tiposLista = [...new Set(MATRIZ_SLA.map(m => m.tipo))];
  SN.casca('portal', `
    <div class="cab-pagina"><div><h1>Portal de Gestão</h1><p>Visão do ciclo completo: chamados, LPU, materiais e fibra — com relatórios do período e assinatura do fechamento.</p></div>
      <div class="acoes"><button class="btn" id="bRelCh">Relatório de chamados</button><button class="btn" id="bRelTec">Eficiência por técnico</button></div></div>
    <div class="linha-form" style="margin-bottom:14px">
      <select class="inp" id="pMes">${meses.map(m => `<option value="${m}" ${m === f.mes ? 'selected' : ''}>${SN.mesNome(m)} (dia 1º a ${new Date(+m.slice(0, 4), +m.slice(5), 0).getDate()})</option>`).join('')}</select>
      <select class="inp" id="pTipo"><option value="">Todos os segmentos</option>${tiposLista.map(t => `<option ${t === f.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <select class="inp" id="pEmp"><option value="">Todas as empresas</option>${SN.opcoesEmpresas(f.emp)}</select></div>
    <div class="grid g6">
      <div class="kpi destaque"><div class="rot">Volume</div><div class="val">${abertos.length}</div><div class="sub">chamados abertos no mês</div></div>
      <div class="kpi"><div class="rot">MTTD</div><div class="val">${SN.dur(SN.media(ms.map(x => x.m.mttd)))}</div><div class="sub">detecção · abertura → despacho</div></div>
      <div class="kpi"><div class="rot">MTTA</div><div class="val">${SN.dur(SN.media(ms.map(x => x.m.mtta)))}</div><div class="sub">atendimento · despacho → campo</div></div>
      <div class="kpi"><div class="rot">MTTR</div><div class="val">${SN.dur(SN.media(ms.map(x => x.m.mttr)))}</div><div class="sub">resolução · abertura → conclusão</div></div>
      <div class="kpi"><div class="rot">SLA</div><div class="val">${ef == null ? '—' : SN.num(ef * 100) + '%'}</div><div class="sub">${dentro} dentro · ${fora} fora (${concl.length} concluídos)</div></div>
      <div class="kpi"><div class="rot">Eficiência</div><div class="val">${ef == null ? '—' : SN.num(ef * 10, 1) + '/10'}</div><div class="sub">a cada 10 chamados, no prazo</div></div>
    </div>
    <div class="grid g2" style="margin-top:14px;grid-template-columns:minmax(0,3fr) minmax(0,2fr)">
      <div class="card"><div class="card-tit"><h3>Eficiência por técnico</h3><span class="muted small">concluídos no mês</span></div>
        <div class="tabela-wrap" style="max-height:420px"><table class="tab"><thead><tr><th>Técnico</th><th>Empresa</th><th class="num">Chamados</th><th class="num">Dentro</th><th class="num">Fora</th><th class="num">SLA</th><th class="num">MTTR</th><th class="num" title="Hora-homem automática (CLT/NETTURBO)">h·h</th></tr></thead><tbody>
        ${tecs.map(([t, o]) => `<tr><td>${SN.esc(SN.nomeExibicao(t))}</td><td>${SN.esc(o.emp)}</td><td class="num">${o.n}</td><td class="num">${o.d}</td><td class="num">${o.f}</td>
          <td class="num"><span class="badge ${o.d / o.n >= .9 ? 'ok' : o.d / o.n >= .7 ? 'alerta' : 'erro'}">${SN.num(o.d / o.n * 100)}%</span></td><td class="num">${SN.dur(SN.media(o.mttr))}</td>
          <td class="num">${SN.empresa(o.emp).vinculo === 'CLT' ? SN.num(o.hh, 1) : '—'}</td></tr>`).join('') || '<tr><td colspan="8" class="muted center">Sem chamados concluídos.</td></tr>'}
        ${hhTotal ? `<tr><td colspan="7"><b>Total hora-homem NETTURBO (automática)</b></td><td class="num"><b>${SN.num(hhTotal, 1)}</b></td></tr>` : ''}
        </tbody></table></div></div>
      <div class="card"><h3>Chamados por técnico</h3>${SN.barras(tecs.slice(0, 15).map(([t, o]) => [SN.nomeExibicao(t), o.n, o.emp]))}</div>
    </div>
    <div class="grid g3" style="margin-top:14px">
      <div class="card"><h3>Por segmento</h3>${SN.barras(SN.contar(abertos, c => c.tipo || 'Sem classificação'))}</div>
      <div class="card"><h3>Ocorrências mais comuns</h3>${SN.barras(SN.contar(concl, c => c.cat3 || c.cat2).slice(0, 10))}</div>
      <div class="card"><h3>Cidades com mais chamados</h3>${SN.barras(SN.contar(abertos, c => (c.cidade || '').toUpperCase()).slice(0, 10))}</div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><div class="card-tit"><h3>Orçamento por conta contábil</h3><span class="muted small">LPU de prestador contabilizada no ciclo</span></div>
        ${d.contas.map(c => { const g = gastoConta(c.codigo); if (!c.budget && !g) return '';
          const pct = c.budget ? g / c.budget : 0, proj = hojeMes ? g / hojeMes * diasMes : g;
          const st = pct > 1 ? 'erro' : proj > c.budget && c.budget ? 'alerta' : '';
          return `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:8px"><span class="small"><b>${c.codigo.slice(-4)}</b> ${SN.esc(c.nome)} <span class="badge">${c.grupo}</span></span>
            <span class="small nowrap">${SN.brl(g)} / ${SN.brl(c.budget)}</span></div>
            <div class="gauge ${st}"><div style="width:${Math.min(100, pct * 100)}%"></div></div>
            <div class="small muted">${SN.num(pct * 100)}% usado · projeção de fim de mês ${SN.brl(proj)} ${st === 'alerta' ? '<span class="badge alerta">⚠ risco de estourar</span>' : st === 'erro' ? '<span class="badge erro">✕ estourado</span>' : ''}</div></div>`; }).join('')}</div>
      <div class="card"><h3>Ciclo administrativo</h3>
        <table class="tab"><thead><tr><th>LPU (prestadores)</th><th class="num">Qtd</th><th class="num">Valor</th></tr></thead><tbody>
          ${Object.entries(SN.LPU_STATUS).map(([k, v]) => `<tr><td>${SN.badgeLpu(k)}</td><td class="num">${lpusMes.filter(l => l.status === k).length}</td><td class="num">${SN.brl(somaSt(k))}</td></tr>`).join('')}
        </tbody></table>
        <div class="grid g2" style="margin-top:12px">
          <div><h4>Materiais</h4>${Object.entries(SN.MAT_STATUS).map(([k, v]) => `<div class="small" style="display:flex;justify-content:space-between"><span>${v.rot}</span><b>${d.materiais.filter(m => m.status === k).length}</b></div>`).join('')}</div>
          <div><h4>Cadastro de fibra</h4>${Object.entries(SN.FIB_STATUS).map(([k, v]) => `<div class="small" style="display:flex;justify-content:space-between"><span>${v.rot}</span><b>${d.fibras.filter(m => m.status === k).length}</b></div>`).join('')}</div>
        </div></div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><div class="card-tit"><h3>Fechamento mensal</h3><span class="muted small">portal renova a cada ciclo</span></div>
        <p class="small">Gera o extrato de atividades de <b>${SN.mesNome(f.mes)}</b> (chamados, SLA, LPU por prestador) e registra a assinatura do responsável para encaminhar ao pagamento.</p>
        ${SN.ehGestor() ? '<button class="btn prim" id="bFechMes">Gerar extrato e assinar fechamento</button>' : '<p class="muted small">Assinatura restrita a Gestor/Gerente.</p>'}
        <div class="tabela-wrap" style="margin-top:10px"><table class="tab small"><thead><tr><th>Ciclo</th><th>Assinado por</th><th class="num">Chamados</th><th class="num">LPU</th></tr></thead><tbody>
        ${d.fechamentos.slice().reverse().map(x => `<tr><td>${SN.mesNome(x.mes)}</td><td>${SN.esc(SN.txtAssinatura(x.assinatura))}</td><td class="num">${x.chamados}</td><td class="num">${SN.brl(x.totalLpu)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nenhum fechamento.</td></tr>'}
        </tbody></table></div></div>
      <div class="card"><h3>Relatórios e extrações do período</h3>
        <div class="acoes"><button class="btn" id="bRelLpu">LPU</button><button class="btn" id="bRelMat">Materiais</button><button class="btn" id="bRelFib">Cadastro de fibra</button></div>
        <h4 style="margin-top:14px">Como os indicadores são medidos</h4>
        <ul class="small" style="padding-left:18px;margin:0">
          <li><b>MTTD</b>: abertura → despacho. <b>MTTA</b>: despacho → chegada em campo.</li>
          <li><b>MTTR</b>: abertura → conclusão técnica. <b>SLA</b>: conclusão técnica até o prazo limite (abertura + SLA da matriz, fixado na 1ª classificação).</li>
          <li>Aprovação de LPU, baixa de materiais, cadastro de fibra e fechamento pelo NOC <b>não</b> entram no tempo operacional.</li>
        </ul></div>
    </div>`);
  SN.$('#pMes').onchange = e => { f.mes = e.target.value; SN.render(); };
  SN.$('#pTipo').onchange = e => { f.tipo = e.target.value; SN.render(); };
  SN.$('#pEmp').onchange = e => { f.emp = e.target.value; SN.render(); };
  SN.$('#bRelCh').onclick = () => SN.exportar('chamados_' + f.mes, abertos.concat(concl.filter(c => !abertos.includes(c))).map(c => { const m = SN.metricas(c);
    return { Chamado: c.id, Origem: c.origem, ProtocoloNOC: c.protocoloNoc, ProtocoloOEM: c.protocoloOem, Cliente: c.cliente, Etiqueta: c.etiqueta, Cidade: c.cidade,
      Tipo: c.tipo, Cat1: c.cat1, Cat2: c.cat2, Cat3: c.cat3, Cat4: c.cat4, SLAh: c.slaHoras, Conta: c.conta, Empresa: c.empresa, Tecnico: c.tecnico,
      Apoio: c.apoio ? c.apoio.tecnico : '', Status: SN.STATUS[c.status].rot, Abertura: SN.dt(c.tempos.abertura), Despacho: SN.dt(c.tempos.atribuicao),
      Chegada: SN.dt(c.tempos.chegada), ConclusaoTecnica: SN.dt(c.tempos.conclusaoTecnica), Fechamento: SN.dt(c.tempos.fechamento), PrazoLimite: SN.dt(c.prazoLimite),
      MTTD_min: m.mttd, MTTA_min: m.mtta, MTTR_min: m.mttr, EmCampo_min: m.tmc, SLA: m.sla == null ? '' : m.sla ? 'Dentro' : 'Fora',
      Causa: c.rfo.causa || '', Acao: c.rfo.acao || '', Solucao: c.rfo.solucao || '' }; }));
  SN.$('#bRelTec').onclick = () => SN.exportar('eficiencia_' + f.mes, tecs.map(([t, o]) => ({ Tecnico: t, Empresa: o.emp, Chamados: o.n, DentroSLA: o.d, ForaSLA: o.f,
    SLA_pct: Math.round(o.d / o.n * 100), MTTR_min: Math.round(SN.media(o.mttr) || 0), MTTA_min: Math.round(SN.media(o.mtta) || 0),
    HoraHomem: SN.empresa(o.emp).vinculo === 'CLT' ? +o.hh.toFixed(2) : '' })));
  SN.$('#bRelLpu').onclick = () => SN.exportar('lpu_' + f.mes, lpusMes.map(l => ({ LPU: l.id, Chamado: l.chamadoId, Cliente: l.cab.cliente, Empresa: l.cab.empresa, CNPJ: l.cab.cnpj,
    Tecnico: l.cab.tecnico, Conta: l.cab.conta, Vinculo: l.vinculo, Valor: SN.valorLpu(l), HoraHomem: l.vinculo === 'CLT' ? +SN.hhDaLpu(l).horas.toFixed(2) : '', Status: SN.LPU_STATUS[l.status].rot })));
  SN.$('#bRelMat').onclick = () => SN.exportar('materiais_' + f.mes, d.materiais.filter(m => SN.mesChave(m.registradoEm) === f.mes).flatMap(m => m.itens.map(i => ({ Registro: m.id,
    Chamado: m.chamadoId, Cliente: m.cliente, Tecnico: m.cab.tecnico, Empresa: m.cab.empresa, Codigo: i.cod, Descricao: i.desc, Qtd: i.qtd, Seriais: (i.seriais || []).join(', '), Status: SN.MAT_STATUS[m.status].rot }))));
  SN.$('#bRelFib').onclick = () => SN.exportar('fibra_' + f.mes, d.fibras.filter(x => SN.mesChave(x.enviadoEm) === f.mes).flatMap(x => x.ceos.map(e => ({ Registro: x.id,
    Chamado: x.chamadoId, Cliente: x.cliente, Tecnico: x.cab.tecnico, CEO: e.numero, Caixa: e.tipoCaixa, LadoA: e.nomA + ' ' + e.caboA, LadoB: e.nomB + ' ' + e.caboB,
    Splitter: e.splitter, Ligacoes: e.ligacoes.length, Status: SN.FIB_STATUS[x.status].rot, CadastradoPor: x.cadastradoPor || '' }))));
  const bF = SN.$('#bFechMes');
  if (bF) bF.onclick = async () => {
    if (!await SN.confirmar('Assinar fechamento de ' + SN.mesNome(f.mes), 'Gerar o extrato de atividades e registrar sua assinatura para encaminhar ao pagamento?', 'Assinar')) return;
    const porEmp = {}; lpusMes.filter(l => l.vinculo === 'PRESTADOR' && ['CONTABILIZADA', 'EM_PAGAMENTO', 'PAGA'].includes(l.status)).forEach(l => porEmp[l.cab.empresa] = (porEmp[l.cab.empresa] || 0) + SN.valorLpu(l));
    const a = SN.assinar('Fechamento mensal'); const total = Object.values(porEmp).reduce((s, v) => s + v, 0);
    d.fechamentos.push({ mes: f.mes, assinatura: a, chamados: concl.length, totalLpu: total, porEmpresa: porEmp });
    SN.log('FECHAMENTO_MENSAL', f.mes, SN.brl(total)); SN.salvar();
    const doc = SN.novoPdf('Extrato de atividades · ' + SN.mesNome(f.mes));
    if (doc) {
      doc.secao('Operação'); doc.linha('Chamados abertos', abertos.length); doc.linha('Concluídos', concl.length);
      doc.linha('SLA', ef == null ? '—' : `${SN.num(ef * 100)}% (${dentro} dentro / ${fora} fora)`);
      doc.linha('MTTD / MTTA / MTTR', `${SN.dur(SN.media(ms.map(x => x.m.mttd)))} / ${SN.dur(SN.media(ms.map(x => x.m.mtta)))} / ${SN.dur(SN.media(ms.map(x => x.m.mttr)))}`);
      doc.secao('LPU por prestador (contabilizada)'); Object.entries(porEmp).forEach(([e, v]) => doc.linha(e, `${SN.brl(v)} · CNPJ ${SN.empresa(e).cnpj || '—'}`));
      doc.linha('TOTAL', SN.brl(total));
      doc.secao('Assinatura'); doc.linha('Responsável', SN.txtAssinatura(a));
      window.open(doc.output('bloburl'));
    }
    SN.render();
  };
}, { tela: 'portal' });

// ═══════════════════════════ Cadastros e Acessos ═══════════════════════════
SN.TELAS = { chamados: 'Chamados (NOC)', lpu: 'Gestão de LPU', servicedesk: 'Service Desk', materiais: 'Gestão de Materiais', fibra: 'Cadastro de Fibra',
  portal: 'Portal de Gestão', cadastros: 'Cadastros e Acessos', auditoria: 'Auditoria' };
SN.abaCad = 'tecnicos';
// Com servidor, PIN/complemento ficam só na planilha; a tela recebe apenas "configurado sim/não".
SN.acessoOk = x => SN.remoto ? !!(SN._acessos[x.id] && SN._acessos[x.id].configurado) : !!x.complementoHash;
SN.ultimoAcesso = x => SN.remoto ? (SN._acessos[x.id] && SN._acessos[x.id].ultimo) : x.ultimoAcesso;
// Grava PIN / reseta complemento. Local: no próprio registro. Servidor: ação ACESSO (só quem tem Cadastros).
SN.gravarAcesso = async (tipo, reg, { pin, reset }) => {
  if (!SN.remoto) { if (pin) reg.pin = pin; if (reset) reg.complementoHash = ''; SN.salvar(); return; }
  await SN.salvarAgora(); // garante que o registro já existe no servidor
  await SN.api('ACESSO', { tipo, id: reg.id, pin: pin || undefined, resetComplemento: !!reset });
  await SN.carregarStatusAcessos();
};
SN.rota('/cadastros', () => {
  // Com servidor, atualiza quem já configurou o complemento (no máximo a cada 30s).
  if (SN.remoto && Date.now() - SN._acessosTs > 30000) SN.carregarStatusAcessos().then(() => { if (location.hash.startsWith('#/cadastros')) SN.render(); });
  const d = SN.db, aba = SN.abaCad;
  const abas = [['tecnicos', 'Técnicos'], ['empresas', 'Prestadores / CNPJ'], ['lideranca', 'Liderança e acessos'], ['disp', 'Disponibilidade da M.O.'], ['contas', 'Contas e budget'], ['sistema', 'Sistema']];
  let html = '';
  if (aba === 'tecnicos') html = `<div class="card"><div class="card-tit"><h3>Técnicos (${d.tecnicos.length})</h3><button class="btn prim" data-novo="tec">+ Técnico</button></div>
    <div class="tabela-wrap"><table class="tab"><thead><tr><th>Empresa</th><th>Nome</th><th>Equipe</th><th>Titular</th><th>Frente</th><th>Vínculo</th><th>1º acesso</th><th>Ativo</th></tr></thead><tbody>
    ${d.tecnicos.slice().sort((a, b) => a.empresa.localeCompare(b.empresa) || a.nome.localeCompare(b.nome)).map(t => `<tr class="clic" data-tec="${t.id}"><td>${SN.esc(t.empresa)}</td><td>${SN.esc(t.nome)}</td>
      <td>${SN.esc(t.equipe || '—')}</td><td>${t.equipe ? (t.titular ? '✔' : '') : '—'}</td><td>${SN.esc(t.frente || '')}</td><td class="small">${SN.empresa(t.empresa).vinculo}</td>
      <td>${SN.acessoOk(t) ? '<span class="badge ok">configurado</span>' : '<span class="badge">pendente</span>'}</td><td>${t.ativo ? '✔' : '<span class="badge erro">inativo</span>'}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  if (aba === 'empresas') html = `<div class="card"><div class="card-tit"><h3>Prestadores e empresas</h3><button class="btn prim" data-novo="emp">+ Empresa</button></div>
    <div class="tabela-wrap"><table class="tab"><thead><tr><th>Empresa</th><th>Razão social</th><th>CNPJ</th><th>Vínculo</th><th>Responsável LPU/NF</th><th class="num">Técnicos</th><th>Ativa</th></tr></thead><tbody>
    ${d.empresas.map((e, i) => `<tr class="clic" data-emp="${i}"><td><b>${SN.esc(e.nome)}</b></td><td>${SN.esc(e.razao || '')}</td><td class="mono">${SN.esc(e.cnpj || '—')}</td>
      <td>${{ CLT: 'CLT (hora-homem)', PRESTADOR: 'Prestador (LPU)', CONTRATO_FIXO: 'Contrato fixo' }[e.vinculo]}</td><td>${SN.esc(e.responsavelLpu || '—')}</td>
      <td class="num">${d.tecnicos.filter(t => t.empresa === e.nome && t.ativo).length}</td><td>${e.ativo !== false ? '✔' : '—'}</td></tr>`).join('')}</tbody></table></div></div>`;
  if (aba === 'lideranca') html = `<div class="card"><div class="card-tit"><h3>Liderança e operação</h3><button class="btn prim" data-novo="lid">+ Pessoa</button></div>
    <div class="aviso info small" style="margin-bottom:10px">Modelo de acesso: <b>Nome + PIN</b> (definido aqui) <b>+ Complemento</b> pessoal criado no 1º acesso (guardado só como hash).
      As <b>telas</b> definem o que cada um abre; o <b>cargo</b> libera ações: Gerente/Gestor tudo · Encarregado aprova LPU e valida fibra · OEM atua na sala técnica (GEOGRID/materiais/service desk).</div>
    <div class="tabela-wrap"><table class="tab"><thead><tr><th>Nome</th><th>Cargo</th><th>Telas liberadas</th><th>1º acesso</th><th>Último acesso</th><th>Ativo</th></tr></thead><tbody>
    ${d.lideranca.map(l => `<tr class="clic" data-lid="${l.id}"><td><b>${SN.esc(l.nome)}</b>${l.nomeCompleto ? `<div class="small muted">${SN.esc(l.nomeCompleto)}</div>` : ''}</td><td>${SN.esc(l.cargo)}</td>
      <td class="small">${l.telas.includes('*') ? '<span class="badge verde">Todas</span>' : l.telas.map(t => SN.TELAS[t] || t).join(', ')}</td>
      <td>${SN.acessoOk(l) ? '<span class="badge ok">configurado</span>' : '<span class="badge">pendente</span>'}</td><td class="nowrap">${SN.dt(SN.ultimoAcesso(l))}</td><td>${l.ativo ? '✔' : '—'}</td></tr>`).join('')}</tbody></table></div></div>`;
  if (aba === 'disp') html = `<div class="card"><div class="card-tit"><h3>Disponibilidade da mão de obra</h3><button class="btn prim" data-novo="disp">+ Registrar período</button></div>
    <p class="small muted">Técnico com período cobrindo o dia fica bloqueado no despacho (férias, atestado, folga compensada…).</p>
    <div class="tabela-wrap"><table class="tab"><thead><tr><th>Técnico</th><th>Empresa</th><th>Motivo</th><th>Início</th><th>Fim</th><th>Registrado por</th><th></th></tr></thead><tbody>
    ${d.disponibilidade.slice().sort((a, b) => b.inicio.localeCompare(a.inicio)).map(x => `<tr><td>${SN.esc(x.tecnico)}</td><td>${SN.esc((SN.tecnico(x.tecnico) || {}).empresa || '')}</td>
      <td>${MOTIVOS_DISPONIBILIDADE[x.motivo]}</td><td>${x.inicio.split('-').reverse().join('/')}</td><td>${x.fim.split('-').reverse().join('/')}</td><td>${SN.esc(x.por)}</td>
      <td><button class="btn sm perigo" data-deldisp="${x.id}">Excluir</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted center">Nenhum período registrado.</td></tr>'}</tbody></table></div></div>`;
  if (aba === 'contas') html = `<div class="card"><h3>Contas contábeis e budget mensal</h3>
    <div class="tabela-wrap"><table class="tab"><thead><tr><th>Código</th><th>Conta</th><th>Grupo</th><th>Itens de LPU</th><th class="num">Budget mensal (R$)</th></tr></thead><tbody>
    ${d.contas.map((c, i) => `<tr><td class="mono">${c.codigo}</td><td>${SN.esc(c.nome)}</td><td><span class="badge">${c.grupo}</span></td><td class="small">${SN.itensDaConta(c.codigo).length} serviços</td>
      <td class="num"><input class="inp" type="number" min="0" step="100" data-budget="${i}" value="${c.budget}" style="width:140px;text-align:right" ${SN.ehGestor() ? '' : 'disabled'}></td></tr>`).join('')}</tbody></table></div></div>`;
  if (aba === 'sistema') html = SN.remoto ? `<div class="grid g2">
    <div class="card"><h3>Onde os dados ficam</h3><p class="small">Conectado ao servidor do V2: os registros ficam na planilha <b>SigoNet V2 - Base</b> (uma aba por assunto)
      e fotos, PDFs e NFs na pasta do Drive <b>SigoNet V2 - Anexos</b>. O V1 não é alterado.</p>
      <p class="small muted">Endereço: <span class="mono">${SN.esc(SIGONET_SERVIDOR)}</span></p>
      <div class="acoes"><button class="btn" id="bBackup">Baixar cópia (.json)</button></div></div>
    <div class="card"><h3>Zerar operação</h3><p class="small muted">Apaga chamados, LPUs, materiais, fibras e pagamentos da planilha (para começar do zero depois dos testes).
      Cadastros, PINs e auditoria são mantidos. A demonstração fica desativada na base real.</p>
      <button class="btn perigo" id="bZerar">Zerar operação</button></div></div>` : `<div class="grid g2">
    <div class="card"><h3>Backup da base</h3><p class="small muted">Modo teste: os dados ficam só neste navegador. Para a equipe usar junto, configure o servidor (README → Servidor).</p>
      <div class="acoes"><button class="btn" id="bBackup">Baixar backup (.json)</button><label class="btn">Restaurar backup<input type="file" id="inRest" accept=".json" hidden></label></div></div>
    <div class="card"><h3>Demonstração</h3><p class="small muted">Gera chamados fictícios no mês atual (marcados como "Demo") com os técnicos reais, para testar telas e indicadores.</p>
      <div class="acoes"><button class="btn" id="bDemo">Gerar dados de demonstração</button><button class="btn perigo" id="bZerar">Zerar base</button></div></div></div>`;
  SN.casca('cadastros', `<div class="cab-pagina"><div><h1>Cadastros e Acessos</h1><p>Tudo editável aqui — sem mexer em código.</p></div></div>
    <div class="abas">${abas.map(([k, r]) => `<button class="aba ${k === aba ? 'ativa' : ''}" data-aba="${k}">${r}</button>`).join('')}</div>${html}`);
  SN.$$('[data-aba]').forEach(b => b.onclick = () => { SN.abaCad = b.dataset.aba; SN.render(); });
  SN.$$('[data-tec]').forEach(tr => tr.onclick = () => SN.editarTecnico(SN.db.tecnicos.find(t => t.id === tr.dataset.tec)));
  SN.$$('[data-emp]').forEach(tr => tr.onclick = () => SN.editarEmpresa(SN.db.empresas[+tr.dataset.emp]));
  SN.$$('[data-lid]').forEach(tr => tr.onclick = () => SN.editarLider(SN.db.lideranca.find(t => t.id === tr.dataset.lid)));
  SN.$$('[data-novo]').forEach(b => b.onclick = () => ({ tec: () => SN.editarTecnico(null), emp: () => SN.editarEmpresa(null), lid: () => SN.editarLider(null), disp: SN.novaDisp })[b.dataset.novo]());
  SN.$$('[data-deldisp]').forEach(b => b.onclick = () => { SN.db.disponibilidade = SN.db.disponibilidade.filter(x => x.id !== b.dataset.deldisp); SN.log('EXCLUIR_DISPONIBILIDADE', b.dataset.deldisp); SN.salvar(); SN.render(); });
  SN.$$('[data-budget]').forEach(inp => inp.onchange = () => { const c = SN.db.contas[+inp.dataset.budget]; const antes = c.budget; c.budget = +inp.value || 0;
    SN.log('ALTERAR_BUDGET', c.codigo, `${antes} → ${c.budget}`); SN.salvar(); SN.toast('Budget atualizado.', 'ok'); });
  const q = id => SN.$('#' + id);
  if (q('bBackup')) {
    q('bBackup').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(SN.db)], { type: 'application/json' }));
      a.download = 'sigonet_v2_backup_' + SN.agora().slice(0, 10) + '.json'; a.click(); SN.log('BACKUP', ''); SN.salvar(); };
    if (q('inRest')) q('inRest').onchange = async ev => { try { const nova = JSON.parse(await ev.target.files[0].text()); if (nova.versao !== 1 || !nova.chamados) throw 0;
      if (!await SN.confirmar('Restaurar backup', 'Substituir a base atual pelo backup? (anexos/fotos não vêm no backup)', 'Restaurar', 'perigo')) return;
      SN.db = nova; SN.log('RESTAURAR_BACKUP', ''); SN.salvar(); SN.render(); } catch (e) { SN.toast('Arquivo de backup inválido.', 'erro'); } };
    if (q('bDemo')) q('bDemo').onclick = () => { SN.gerarDemo(); SN.toast('Dados de demonstração gerados.', 'ok'); };
    q('bZerar').onclick = async () => { if (!SN.ehGestor()) return SN.toast('Só Gestor/Gerente.', 'erro');
      if (SN.remoto) {
        if (!await SN.confirmar('Zerar operação no servidor', 'Apagar da planilha TODOS os chamados, LPUs, materiais, fibras e pagamentos? Não tem volta. Cadastros, PINs e auditoria ficam.', 'Apagar tudo', 'perigo')) return;
        try { await SN.salvarAgora(); await SN.api('ZERAR_OPERACAO'); SN.log('ZERAR_OPERACAO', ''); await SN.carregarRemoto(); SN.toast('Operação zerada.', 'ok'); SN.render(); }
        catch (e) { SN.toast(e.message, 'erro'); }
        return;
      }
      if (!await SN.confirmar('Zerar base', 'Apagar TODOS os chamados, LPUs, materiais, fibras e pagamentos? Os cadastros (técnicos, prestadores, liderança, PINs) são mantidos.', 'Apagar tudo', 'perigo')) return;
      Object.assign(SN.db, { chamados: [], lpus: [], materiais: [], fibras: [], pagamentos: [], fechamentos: [], integracoes: [], seq: { CH: 0, LPU: 0, MAT: 0, FIB: 0, PAG: 0 } });
      await SN.anexos.limpar(); SN.log('ZERAR_BASE', ''); SN.salvar(); SN.render(); };
  }
}, { tela: 'cadastros' });

SN.editarTecnico = t => {
  const novo = !t; t = t || { id: SN.uid(), empresa: '', nome: '', equipe: '', titular: true, frente: '', pin: PIN_INICIAL, complementoHash: '', ativo: true };
  SN.modal({ titulo: novo ? 'Novo técnico' : t.nome, corpo: `<div class="linha-form">
    <div class="campo"><label>Empresa</label><select class="inp" id="eEmp">${SN.opcoesEmpresas(t.empresa)}</select></div>
    <div class="campo"><label>Nome completo</label><input class="inp" id="eNome" value="${SN.esc(t.nome)}"></div></div>
    <div class="linha-form"><div class="campo"><label>Equipe (dupla)</label><input class="inp" id="eEq" value="${SN.esc(t.equipe)}" placeholder="ex.: Equipe 01"></div>
    <div class="campo"><label>Frente</label><input class="inp" id="eFr" value="${SN.esc(t.frente)}" placeholder="Manutenção, GTD…"></div>
    <div class="campo"><label>PIN</label><input class="inp" id="ePin" value="${SN.remoto ? '' : SN.esc(t.pin)}" placeholder="${SN.remoto ? (novo ? PIN_INICIAL + ' (padrão)' : 'em branco = mantém o atual') : ''}"></div></div>
    <label class="small"><input type="checkbox" id="eTit" ${t.titular ? 'checked' : ''}> Titular da dupla (recebe despacho)</label><br>
    <label class="small"><input type="checkbox" id="eAt" ${t.ativo ? 'checked' : ''}> Ativo</label>`,
    botoes: [{ rot: 'Cancelar' }, ...(novo ? [] : [{ rot: 'Resetar complemento', acao: async () => {
        try { await SN.gravarAcesso('tecnico', t, { reset: true }); } catch (e) { SN.toast(e.message, 'erro'); return false; }
        SN.log('RESET_COMPLEMENTO', t.nome); SN.salvar(); SN.toast('No próximo acesso ele cria um novo complemento.'); SN.render(); } }]),
      { rot: 'Salvar', cls: 'prim', acao: async () => {
        const nome = SN.$('#eNome').value.trim(); if (!nome) { SN.toast('Informe o nome.', 'erro'); return false; }
        const pinNovo = SN.$('#ePin').value.trim();
        const antes = { ...t, pin: 0, complementoHash: 0 };
        Object.assign(t, { empresa: SN.$('#eEmp').value, nome, equipe: SN.$('#eEq').value.trim(), frente: SN.$('#eFr').value.trim(),
          titular: SN.$('#eTit').checked, ativo: SN.$('#eAt').checked });
        if (SN.remoto) delete t.pin; else t.pin = pinNovo || t.pin || PIN_INICIAL;
        if (novo) SN.db.tecnicos.push(t);
        SN.log(novo ? 'CRIAR_TECNICO' : 'EDITAR_TECNICO', t.nome, novo ? t.empresa : SN.diff(antes, { ...t, pin: 0, complementoHash: 0 }) + (pinNovo ? '; PIN alterado' : '')); SN.salvar();
        if (SN.remoto && (novo || pinNovo)) { try { await SN.gravarAcesso('tecnico', t, { pin: pinNovo || PIN_INICIAL }); } catch (e) { SN.toast('Cadastro salvo, mas o PIN não: ' + e.message, 'erro'); } }
        SN.render(); } }] });
};
SN.editarEmpresa = e => {
  const novo = !e; e = e || { nome: '', razao: '', cnpj: '', vinculo: 'PRESTADOR', responsavelLpu: '', ativo: true };
  const tecs = SN.db.tecnicos.filter(t => t.empresa === e.nome);
  SN.modal({ titulo: novo ? 'Nova empresa' : e.nome, corpo: `<div class="linha-form">
    <div class="campo"><label>Nome</label><input class="inp" id="mNome" value="${SN.esc(e.nome)}" ${novo ? '' : 'readonly'}></div>
    <div class="campo"><label>Razão social</label><input class="inp" id="mRaz" value="${SN.esc(e.razao || '')}"></div>
    <div class="campo"><label>CNPJ</label><input class="inp" id="mCnpj" value="${SN.esc(e.cnpj)}" placeholder="00.000.000/0000-00"></div></div>
    <div class="linha-form"><div class="campo"><label>Vínculo</label><select class="inp" id="mVin">${[['PRESTADOR', 'Prestador (LPU com valor)'], ['CLT', 'CLT (hora-homem)'], ['CONTRATO_FIXO', 'Contrato fixo']].map(([k, r]) => `<option value="${k}" ${k === e.vinculo ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
    <div class="campo"><label>Responsável pela LPU / NF</label><select class="inp" id="mResp"><option value="">Cada técnico faz a sua</option>${tecs.map(t => `<option ${t.nome === e.responsavelLpu ? 'selected' : ''}>${SN.esc(t.nome)}</option>`).join('')}</select></div></div>
    <label class="small"><input type="checkbox" id="mAt" ${e.ativo !== false ? 'checked' : ''}> Ativa</label>`,
    botoes: [{ rot: 'Cancelar' }, { rot: 'Salvar', cls: 'prim', acao: () => {
      const nome = SN.$('#mNome').value.trim().toUpperCase(); if (!nome) { SN.toast('Informe o nome.', 'erro'); return false; }
      if (novo && SN.db.empresas.some(x => x.nome === nome)) { SN.toast('Empresa já existe.', 'erro'); return false; }
      const antes = { ...e };
      Object.assign(e, { nome, razao: SN.$('#mRaz').value.trim(), cnpj: SN.$('#mCnpj').value.trim(), vinculo: SN.$('#mVin').value, responsavelLpu: SN.$('#mResp').value, ativo: SN.$('#mAt').checked });
      if (novo) SN.db.empresas.push(e);
      SN.log(novo ? 'CRIAR_EMPRESA' : 'EDITAR_EMPRESA', e.nome, SN.diff(antes, e)); SN.salvar(); SN.render(); } }] });
};
SN.editarLider = l => {
  const novo = !l; l = l || { id: SN.uid(), nome: '', nomeCompleto: '', cargo: 'Encarregado', telas: ['chamados'], pin: PIN_INICIAL, complementoHash: '', ativo: true };
  SN.modal({ titulo: novo ? 'Nova pessoa' : l.nome, corpo: `<div class="linha-form">
    <div class="campo"><label>Nome (login)</label><input class="inp" id="lNome" value="${SN.esc(l.nome)}"></div>
    <div class="campo"><label>Nome completo (assinaturas)</label><input class="inp" id="lComp" value="${SN.esc(l.nomeCompleto || '')}"></div></div>
    <div class="linha-form"><div class="campo"><label>Cargo</label><select class="inp" id="lCargo">${['Gerente', 'Gestor', 'Encarregado', 'OEM'].map(c => `<option ${c === l.cargo ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="campo"><label>PIN</label><input class="inp" id="lPin" value="${SN.remoto ? '' : SN.esc(l.pin)}" placeholder="${SN.remoto ? (novo ? PIN_INICIAL + ' (padrão)' : 'em branco = mantém o atual') : ''}"></div></div>
    <div class="campo"><label>Telas liberadas</label><div class="chips">
      <label class="chip"><input type="checkbox" data-tela="*" ${l.telas.includes('*') ? 'checked' : ''}> Todas</label>
      ${Object.entries(SN.TELAS).map(([k, r]) => `<label class="chip"><input type="checkbox" data-tela="${k}" ${l.telas.includes(k) ? 'checked' : ''}> ${r}</label>`).join('')}</div></div>
    <label class="small"><input type="checkbox" id="lAt" ${l.ativo ? 'checked' : ''}> Ativo</label>`,
    botoes: [{ rot: 'Cancelar' }, ...(novo ? [] : [{ rot: 'Resetar complemento', acao: async () => {
        try { await SN.gravarAcesso('lideranca', l, { reset: true }); } catch (e) { SN.toast(e.message, 'erro'); return false; }
        SN.log('RESET_COMPLEMENTO', l.nome); SN.salvar(); SN.toast('Complemento resetado.'); SN.render(); } }]),
      { rot: 'Salvar', cls: 'prim', acao: async () => {
        const nome = SN.$('#lNome').value.trim(); if (!nome) { SN.toast('Informe o nome.', 'erro'); return false; }
        const telas = SN.$$('[data-tela]').filter(x => x.checked).map(x => x.dataset.tela);
        const pinNovo = SN.$('#lPin').value.trim();
        const antes = { ...l, pin: 0, complementoHash: 0 };
        Object.assign(l, { nome, nomeCompleto: SN.$('#lComp').value.trim(), cargo: SN.$('#lCargo').value,
          telas: telas.includes('*') ? ['*'] : telas, ativo: SN.$('#lAt').checked });
        if (SN.remoto) delete l.pin; else l.pin = pinNovo || l.pin || PIN_INICIAL;
        if (novo) SN.db.lideranca.push(l);
        SN.log(novo ? 'CRIAR_LIDERANCA' : 'EDITAR_LIDERANCA', l.nome, SN.diff(antes, { ...l, pin: 0, complementoHash: 0 }) + (pinNovo ? '; PIN alterado' : '')); SN.salvar();
        if (SN.remoto && (novo || pinNovo)) { try { await SN.gravarAcesso('lideranca', l, { pin: pinNovo || PIN_INICIAL }); } catch (e) { SN.toast('Cadastro salvo, mas o PIN não: ' + e.message, 'erro'); } }
        SN.render(); } }] });
};
SN.novaDisp = () => {
  const hoje = SN.agora().slice(0, 10);
  SN.modal({ titulo: 'Registrar indisponibilidade', corpo: `
    <div class="campo"><label>Técnico</label><select class="inp" id="dTec">${SN.db.tecnicos.filter(t => t.ativo).sort((a, b) => a.empresa.localeCompare(b.empresa) || a.nome.localeCompare(b.nome))
      .map(t => `<option value="${SN.esc(t.nome)}">${SN.esc(t.empresa)} · ${SN.esc(t.nome)}</option>`).join('')}</select></div>
    <div class="linha-form"><div class="campo"><label>Motivo</label><select class="inp" id="dMot">${Object.entries(MOTIVOS_DISPONIBILIDADE).map(([k, r]) => `<option value="${k}">${r}</option>`).join('')}</select></div>
    <div class="campo"><label>Início</label><input class="inp" type="date" id="dIni" value="${hoje}"></div><div class="campo"><label>Fim</label><input class="inp" type="date" id="dFim" value="${hoje}"></div></div>`,
    botoes: [{ rot: 'Cancelar' }, { rot: 'Registrar', cls: 'prim', acao: () => {
      const x = { id: SN.uid(), tecnico: SN.$('#dTec').value, motivo: SN.$('#dMot').value, inicio: SN.$('#dIni').value, fim: SN.$('#dFim').value, por: SN.usuario().nome };
      if (!x.inicio || !x.fim || x.fim < x.inicio) { SN.toast('Período inválido.', 'erro'); return false; }
      SN.db.disponibilidade.push(x); SN.log('REGISTRAR_DISPONIBILIDADE', x.tecnico, `${x.motivo} ${x.inicio}→${x.fim}`); SN.salvar(); SN.render(); } }] });
};

// ═══════════════════════════ Auditoria ═══════════════════════════
SN.fAud = { q: '', aba: 'log' };
SN.rota('/auditoria', () => {
  const f = SN.fAud, q = SN.normal(f.q);
  const log = SN.db.log.filter(x => !q || SN.normal([x.usuario, x.acao, x.ref, x.detalhe].join(' ')).includes(q)).slice(-800).reverse();
  const ints = SN.db.integracoes.slice(-300).reverse();
  SN.casca('auditoria', `<div class="cab-pagina"><div><h1>Auditoria</h1><p>Toda ação grava usuário, data, hora e a alteração realizada.</p></div>
    <div class="acoes"><button class="btn" id="bExpLog">Exportar</button></div></div>
    <div class="abas"><button class="aba ${f.aba === 'log' ? 'ativa' : ''}" data-a="log">Ações dos usuários</button><button class="aba ${f.aba === 'int' ? 'ativa' : ''}" data-a="int">Integrações (Elleven / SAP)</button></div>
    ${f.aba === 'log' ? `<input class="inp" id="aQ" placeholder="Filtrar por usuário, ação, ID do chamado/LPU…" value="${SN.esc(f.q)}" style="margin-bottom:10px">
    <div class="card"><div class="tabela-wrap" style="max-height:70vh"><table class="tab"><thead><tr><th>Quando</th><th>Usuário</th><th>Perfil</th><th>Ação</th><th>Referência</th><th>Detalhe</th></tr></thead><tbody>
      ${log.map(x => `<tr><td class="nowrap">${SN.dt(x.ts)}</td><td>${SN.esc(x.usuario)}</td><td>${SN.esc(x.perfil)}</td><td class="mono small">${SN.esc(x.acao)}</td><td class="mono">${SN.esc(x.ref)}</td><td class="small">${SN.esc(x.detalhe)}</td></tr>`).join('')}
    </tbody></table></div></div>` : `<div class="aviso info small" style="margin-bottom:10px">Modo simulado: as chamadas ficam registradas aqui até as APIs do ERP Elleven e do SAP serem ligadas em <span class="mono">SN.int</span> (nucleo.js).</div>
    <div class="card"><div class="tabela-wrap" style="max-height:70vh"><table class="tab"><thead><tr><th>Quando</th><th>Sistema</th><th>Operação</th><th>Envio</th><th>Resposta</th></tr></thead><tbody>
      ${ints.map(x => `<tr><td class="nowrap">${SN.dt(x.ts)}</td><td>${SN.esc(x.sistema)}</td><td>${SN.esc(x.operacao)}</td><td class="mono small">${SN.esc(JSON.stringify(x.payload))}</td><td class="mono small">${SN.esc(JSON.stringify(x.resposta))}</td></tr>`).join('') || '<tr><td colspan="5" class="muted center">Nenhuma chamada.</td></tr>'}
    </tbody></table></div></div>`}`);
  SN.$$('[data-a]').forEach(b => b.onclick = () => { f.aba = b.dataset.a; SN.render(); });
  const aq = SN.$('#aQ'); if (aq) aq.oninput = SN.debounce(e => { f.q = e.target.value; SN.render(); SN.$('#aQ').focus(); SN.$('#aQ').setSelectionRange(99, 99); }, 350);
  SN.$('#bExpLog').onclick = () => SN.exportar('auditoria', f.aba === 'log' ? log.map(x => ({ Quando: SN.dt(x.ts), Usuario: x.usuario, Perfil: x.perfil, Acao: x.acao, Referencia: x.ref, Detalhe: x.detalhe }))
    : ints.map(x => ({ Quando: SN.dt(x.ts), Sistema: x.sistema, Operacao: x.operacao, Envio: JSON.stringify(x.payload), Resposta: JSON.stringify(x.resposta) })));
}, { tela: 'auditoria' });

// ═══════════════════════════ Dados de demonstração ═══════════════════════════
SN.gerarDemo = () => {
  const rnd = n => Math.floor(Math.random() * n), pick = a => a[rnd(a.length)];
  const clientes = ['FOXCONN BRASIL', 'IGN TELECOMUNICAÇÕES', 'REPETIDORA PIRACICABA', 'AMANA CAFETERIA', 'NIPRO MEDICAL', 'CENTRYX SOLUÇÕES', 'ATRIO HOTÉIS', 'RODA LOGÍSTICA', 'EASYIT TECNOLOGIA', 'PROCAMPO DE CAMPINAS', 'SOLUCIONA LOGÍSTICA', 'U.S.J. AÇÚCAR E ÁLCOOL'];
  const cidades = ['Campinas', 'Jundiaí', 'Piracicaba', 'Valinhos', 'Sorocaba', 'Americana', 'Hortolândia', 'Itatiba'];
  const tecs = SN.tecnicosDespacho().filter(t => t.frente !== 'Liderança');
  const agora = Date.now(), inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(7, 0, 0, 0);
  const janela = Math.max(3600e3, agora - inicioMes.getTime() - 6 * 3600e3);
  const iso = t => new Date(t).toISOString();
  for (let i = 0; i < 45; i++) {
    const m = pick(MATRIZ_SLA.filter(x => !/Improdutiva/.test(x.cat1 + x.cat2)));
    const t0 = inicioMes.getTime() + rnd(janela);
    const tec = pick(tecs.filter(t => !t.frente || t.frente === m.tipo || rnd(4) === 0)) || pick(tecs);
    const c = { id: SN.proxId('CH'), origem: 'Demo', protocoloNoc: String(138000 + i * 7), protocoloOem: String(138001 + i * 7), etiqueta: Math.random().toString(36).slice(2, 10).toUpperCase(),
      cliente: pick(clientes), motivo: m.cat2.toUpperCase(), endereco: 'Rua Exemplo, ' + (10 + rnd(900)), cidade: pick(cidades), gps: '', porta: '', obs: '',
      tipo: m.tipo, cat1: m.cat1, cat2: m.cat2, cat3: m.cat3, cat4: m.cat4, slaHoras: m.sla, prazoLimite: iso(t0 + m.sla * 3600e3), conta: CONTA_PADRAO_POR_TIPO[m.tipo],
      empresa: tec.empresa, tecnico: tec.nome, apoio: null, status: 'FECHADO', tempos: { abertura: iso(t0), classificacao: iso(t0 + 2 * 60e3) }, rfo: {}, fotos: [], historico: [{ ts: iso(t0), usuario: 'demo', acao: 'Abertura', detalhe: 'Demo' }] };
    let t = t0 + (5 + rnd(50)) * 60e3;
    const passos = [['atribuicao', 'ATRIBUIDO'], ['aceite', 'ACEITO'], ['deslocamento', 'EM_DESLOCAMENTO'], ['chegada', 'EM_CAMPO'], ['diagnostico', 'EM_CAMPO'], ['conclusaoTecnica', 'CONCLUIDO_TECNICO'], ['fechamento', 'FECHADO']];
    const inc = [0, 3, 5, 20 + rnd(70), 10, 30 + rnd(m.sla * 45), 20 + rnd(200)];
    let st = 'NAO_ATRIBUIDO';
    for (let k = 0; k < passos.length; k++) { t += inc[k] * 60e3; if (t > agora) break; c.tempos[passos[k][0]] = iso(t); st = passos[k][1]; }
    c.status = st;
    if (st === 'NAO_ATRIBUIDO') { c.empresa = ''; c.tecnico = ''; }
    if (c.tempos.diagnostico) c.rfo = { causa: pick(['Rompimento por poda de árvore', 'Cabo cortado por caminhão', 'Conector danificado', 'Atenuação em CEO', 'Queda de energia no POP']),
      acao: 'Identificado o ponto e realizada a correção', solucao: pick(['Fusão de 12 fibras em CEO nova', 'Troca do conector', 'Reposicionamento de CEO', 'Religado equipamento']) };
    SN.db.chamados.push(c);
    if (['CONCLUIDO_TECNICO', 'FECHADO'].includes(st) && rnd(10) < 8) {
      const emp = SN.empresa(c.empresa), itens = SN.itensDaConta(c.conta);
      const ls = [pick(itens), pick(itens)].filter((x, ix, a) => a.indexOf(x) === ix).map(x => ({ cod: x.cod, qtd: 1 + rnd(x.medida.toLowerCase() === 'metro' ? 300 : 4), fator: rnd(5) ? 'comum' : 'critico' }));
      const lst = pick(['AGUARDANDO_LIDER', 'AGUARDANDO_LIDER', 'NO_SERVICE_DESK', 'CONTABILIZADA', 'CONTABILIZADA']);
      SN.db.lpus.push({ id: SN.proxId('LPU'), chamadoId: c.id, papel: 'titular', cab: SN.cabecalhoDe(c, 'titular'), vinculo: emp.vinculo, itens: ls, obs: '',
        status: lst, criadoEm: c.tempos.conclusaoTecnica, enviadoEm: c.tempos.conclusaoTecnica, assinaturaTecnico: { nome: c.tecnico, papel: 'Prestador', ts: c.tempos.conclusaoTecnica, n: 1 },
        assinaturaLider: lst !== 'AGUARDANDO_LIDER' ? { nome: 'Vinicius Gabriel de Oliveira Machado', papel: 'Líder', ts: c.tempos.conclusaoTecnica, n: 1 } : null,
        assinaturaSD: lst === 'CONTABILIZADA' ? { nome: 'Giselle Silva', papel: 'Service Desk', ts: c.tempos.conclusaoTecnica, n: 1 } : null, historico: [] });
      if (rnd(2)) SN.db.materiais.push({ id: SN.proxId('MAT'), chamadoId: c.id, papel: 'titular', cab: SN.cabecalhoDe(c, 'titular'), cliente: c.cliente,
        itens: [{ tipo: 'INS', cod: 'INS000093', desc: 'CABO ÓPTICO ASU80 SM CFOA NR - 12FO', qtd: 50 + rnd(200), seriais: [] }, { tipo: 'INS', cod: 'INS000044', desc: 'PLAQUETA DE IDENTIFICAÇÃO DE FO - NETTURBO', qtd: 1 + rnd(8), seriais: [] }],
        obs: '', status: pick(['REGISTRADO', 'CONFERIDO', 'BAIXADO_SAP']), registradoEm: c.tempos.conclusaoTecnica, historico: [] });
      if (TIPOS_COM_FIBRA.includes(c.tipo) && rnd(3) === 0) SN.db.fibras.push({ id: SN.proxId('FIB'), chamadoId: c.id, cab: SN.cabecalhoDe(c, 'titular'), cliente: c.cliente,
        ceos: [{ numero: String(1000 + rnd(8999)), tipoCaixa: 'Nova', modelo: '', gps: '', nomA: 'CB-' + rnd(99), caboA: '12F', nomB: 'CB-' + rnd(99), caboB: '12F', splitter: '',
          ligacoes: Array.from({ length: 12 }, (_, k) => ({ de: 'A' + (k + 1), para: 'B' + (k + 1) })), obs: '' }],
        status: pick(['AGUARDANDO_VALIDACAO', 'PENDENTE_CADASTRO', 'CADASTRADO']), enviadoEm: c.tempos.conclusaoTecnica, historico: [] });
    }
  }
  SN.log('GERAR_DEMO', '45 chamados'); SN.salvar(); SN.render();
};
