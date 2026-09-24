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
SN.fLpu = { st: 'AGUARDANDO_LIDER', conta: '', emp: '', q: '' };
SN.telaLpu = abrirId => {
  const f = SN.fLpu;
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
    ${SN.chipsStatus(SN.LPU_STATUS, f.st, k => base.filter(l => !k || l.status === k).length)}
    <div class="linha-form" style="margin-bottom:12px">
      <select class="inp" id="fConta"><option value="">Todas as contas</option>${SN.opcoesContas(f.conta)}</select>
      <select class="inp" id="fEmp"><option value="">Todos os prestadores</option>${SN.opcoesEmpresas(f.emp)}</select>
      <input class="inp" id="fQ" placeholder="Buscar chamado, cliente, técnico…" value="${SN.esc(f.q)}"></div>
    <div class="card"><div class="tabela-wrap"><table class="tab"><thead><tr><th>LPU</th><th>Chamado</th><th>Cliente</th><th>Empresa · técnico</th><th>Conta</th><th>Vínculo</th><th class="num">Valor / h·h</th><th>Status</th><th>Enviado</th></tr></thead><tbody>
      ${lista.map(l => `<tr class="clic" data-id="${l.id}"><td class="mono">${l.id}${l.papel === 'apoio' ? ' <span class="badge">APOIO</span>' : ''}</td><td class="mono">${l.chamadoId}</td>
        <td>${SN.esc(l.cab.cliente)}</td><td>${SN.esc(l.cab.empresa)} · ${SN.esc(l.cab.tecnico)}</td><td class="small">${SN.esc(SN.contaTxt(l.cab.conta))}</td>
        <td>${l.vinculo}</td><td class="num">${SN.valorLpuTxt(l)}</td><td>${SN.badgeLpu(l.status)}</td><td class="nowrap">${SN.dt(l.enviadoEm)}</td></tr>`).join('')
        || '<tr><td colspan="9" class="muted center">Nenhuma LPU neste filtro.</td></tr>'}</tbody></table></div></div>
    <div class="card"><div class="card-tit"><h3>Aguardando preenchimento do técnico</h3><span class="muted small">chamados já concluídos sem LPU apontada</span></div>
      ${Object.keys(pend).length ? `<div class="barras">${Object.entries(pend).sort((a, b) => b[1].length - a[1].length).map(([e, ids]) =>
        `<div class="barra" title="${ids.join(', ')}"><span class="nm">${SN.esc(e)}</span><div class="trilho"><div class="fill" style="width:${ids.length / Math.max(...Object.values(pend).map(x => x.length)) * 100}%"></div></div><span class="v">${ids.length} obra(s)</span></div>`).join('')}</div>`
        : '<p class="muted">Nenhuma pendência.</p>'}</div>`);
  SN.$$('[data-st]').forEach(b => b.onclick = () => { f.st = b.dataset.st; SN.telaLpu(); });
  SN.$('#fConta').onchange = e => { f.conta = e.target.value; SN.telaLpu(); };
  SN.$('#fEmp').onchange = e => { f.emp = e.target.value; SN.telaLpu(); };
  SN.$('#fQ').oninput = SN.debounce(e => { f.q = e.target.value; SN.telaLpu(); SN.$('#fQ').focus(); SN.$('#fQ').setSelectionRange(99, 99); }, 350);
  SN.$$('tr[data-id]').forEach(tr => tr.onclick = () => SN.detalheLpu(tr.dataset.id));
  SN.$('#bExpLpu').onclick = () => SN.exportar('lpu', lista.flatMap(l => (l.itens.length ? l.itens : [{}]).map(it => {
    const cat = SN.itemLpu(it.cod) || {};
    return { LPU: l.id, Chamado: l.chamadoId, Cliente: l.cab.cliente, Empresa: l.cab.empresa, CNPJ: l.cab.cnpj, Tecnico: l.cab.tecnico, Papel: l.papel,
      Conta: l.cab.conta, Vinculo: l.vinculo, Codigo: it.cod || '', Servico: cat.desc || '', Qtd: it.qtd || '', Fator: it.fator || '',
      Valor: l.vinculo === 'PRESTADOR' && it.cod ? SN.valorItem(it) : '', HoraHomem: l.vinculo === 'CLT' ? +SN.hhDaLpu(l).horas.toFixed(2) : '', Status: SN.LPU_STATUS[l.status].rot, Enviado: SN.dt(l.enviadoEm) };
  })));
  if (abrirId) SN.detalheLpu(abrirId);
};
SN.rota('/lpu', () => SN.telaLpu(), { tela: 'lpu' });
SN.rota('/lpu/:id', id => SN.telaLpu(id), { tela: 'lpu' });

SN.detalheLpu = id => {
  const l = SN.db.lpus.find(x => x.id === id); if (!l) return;
  const podeEditar = l.status === 'AGUARDANDO_LIDER' && SN.podeAprovar();
  let itens = JSON.parse(JSON.stringify(l.itens || [])), assin = null;
  const hh = l.vinculo === 'CLT' ? SN.hhDaLpu(l) : null; // automática — nem o líder edita
  const catConta = SN.itensDaConta(l.cab.conta);
  const corpo = () => `
    ${SN.htmlCabecalho(l.cab)}
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
          ${podeEditar ? `<td><button class="btn sm perigo" data-rm="${i}">✕</button></td>` : ''}</tr>`; }).join('') || '<tr><td colspan="7" class="muted">Sem itens.</td></tr>'}
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

SN.pdfLpu = l => {
  const doc = SN.novoPdf('LPU ' + l.id + ' · chamado ' + l.chamadoId); if (!doc) return;
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
  window.open(doc.output('bloburl'));
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
    <div class="tabela-wrap"><table class="tab"><thead><tr><th>LPU</th><th>Chamado</th><th>Empresa</th><th>Conta</th><th>Vínculo</th><th class="num">Valor / h·h</th><th>Aprovado por</th></tr></thead><tbody>
    ${noSD.map(l => `<tr class="clic" data-sd="${l.id}"><td class="mono">${l.id}</td><td class="mono">${l.chamadoId}</td><td>${SN.esc(l.cab.empresa)}</td><td class="small">${SN.esc(SN.contaTxt(l.cab.conta))}</td>
      <td>${l.vinculo}</td><td class="num">${SN.valorLpuTxt(l)}</td><td class="small">${SN.esc(SN.txtAssinatura(l.assinaturaLider))}</td></tr>`).join('') || '<tr><td colspan="7" class="muted center">Nada aguardando contabilização.</td></tr>'}
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
    <div class="abas">${[['contabil', 'Contabilização', noSD.length], ['pagamento', 'Tratativa de pagamento', pags.filter(p => p.status !== 'PAGO').length], ['produtividade', 'CLT e contratos fixos', '']].map(([k, r, n]) =>
      `<button class="aba ${k === aba ? 'ativa' : ''}" data-aba="${k}">${r}${n !== '' ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>${html}`);
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

// ═══════════════════════════ Gestão de Materiais ═══════════════════════════
SN.fMat = { st: '', q: '', emp: '' };
SN.telaMateriais = abrirId => {
  const f = SN.fMat;
  const base = SN.db.materiais.filter(m => (!f.emp || m.cab.empresa === f.emp) && (!f.q || SN.normal([m.id, m.chamadoId, m.cliente, m.cab.tecnico, ...m.itens.map(i => i.cod + ' ' + i.desc + ' ' + (i.seriais || []).join(' '))].join(' ')).includes(SN.normal(f.q))));
  const lista = base.filter(m => !f.st || m.status === f.st).sort((a, b) => (b.registradoEm || '').localeCompare(a.registradoEm || ''));
  const custo = m => m.itens.reduce((s, i) => s + ((SN.material(i.cod) || {}).p || 0) * i.qtd, 0);
  SN.casca('materiais', `
    <div class="cab-pagina"><div><h1>Gestão de Materiais</h1><p>O chamado é a referência de onde o material foi usado; a baixa (SAP mov. 261) e a alocação ao cliente seguem aqui, sem prender o chamado.</p></div>
      <div class="acoes"><button class="btn" id="bExpMat">Exportar</button></div></div>
    ${SN.chipsStatus(SN.MAT_STATUS, f.st, k => base.filter(m => !k || m.status === k).length)}
    <div class="linha-form" style="margin-bottom:12px"><select class="inp" id="fEmp"><option value="">Todas as empresas</option>${SN.opcoesEmpresas(f.emp)}</select>
      <input class="inp" id="fQ" placeholder="Buscar chamado, cliente, código, serial…" value="${SN.esc(f.q)}"></div>
    <div class="card"><div class="tabela-wrap"><table class="tab"><thead><tr><th>Registro</th><th>Chamado</th><th>Cliente</th><th>Técnico · empresa</th><th>Itens</th><th class="num">Custo</th><th>Status</th><th>Registrado</th></tr></thead><tbody>
      ${lista.map(m => `<tr class="clic" data-id="${m.id}"><td class="mono">${m.id}</td><td class="mono">${m.chamadoId}</td><td>${SN.esc(m.cliente)}</td><td>${SN.esc(m.cab.tecnico)} · ${SN.esc(m.cab.empresa)}</td>
        <td class="small">${m.itens.slice(0, 3).map(i => `${SN.esc(i.desc)} (${SN.num(i.qtd, 0)})`).join('<br>')}${m.itens.length > 3 ? `<br>+${m.itens.length - 3}` : ''}</td>
        <td class="num">${SN.brl(custo(m))}</td><td>${SN.badge(SN.MAT_STATUS, m.status)}</td><td class="nowrap">${SN.dt(m.registradoEm)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted center">Nenhum registro.</td></tr>'}
    </tbody></table></div></div>`);
  SN.$$('[data-st]').forEach(b => b.onclick = () => { f.st = b.dataset.st; SN.telaMateriais(); });
  SN.$('#fEmp').onchange = e => { f.emp = e.target.value; SN.telaMateriais(); };
  SN.$('#fQ').oninput = SN.debounce(e => { f.q = e.target.value; SN.telaMateriais(); SN.$('#fQ').focus(); SN.$('#fQ').setSelectionRange(99, 99); }, 350);
  SN.$$('tr[data-id]').forEach(tr => tr.onclick = () => SN.detalheMaterial(tr.dataset.id));
  SN.$('#bExpMat').onclick = () => SN.exportar('materiais', lista.flatMap(m => m.itens.map(i => ({ Registro: m.id, Chamado: m.chamadoId, Cliente: m.cliente,
    Etiqueta: m.cab.etiqueta, Tecnico: m.cab.tecnico, Empresa: m.cab.empresa, Tipo: i.tipo, Codigo: i.cod, Descricao: i.desc, Quantidade: i.qtd,
    Seriais: (i.seriais || []).join(', '), CustoUnit: (SN.material(i.cod) || {}).p || '', Status: SN.MAT_STATUS[m.status].rot, DocSAP: m.docSap || '' }))));
  if (abrirId) SN.detalheMaterial(abrirId);
};
SN.rota('/materiais', () => SN.telaMateriais(), { tela: 'materiais' });
SN.rota('/materiais/:id', id => SN.telaMateriais(id), { tela: 'materiais' });

SN.detalheMaterial = id => {
  const m = SN.db.materiais.find(x => x.id === id); if (!m) return;
  const acao = (novo, rot, extra) => { m.status = novo; Object.assign(m, extra || {}); SN.hist(m, rot, extra ? JSON.stringify(extra) : ''); SN.log('MATERIAL_' + novo, m.id, ''); SN.salvar(); SN.telaMateriais(); };
  const botoes = [{ rot: 'Fechar' }];
  if (['REGISTRADO', 'DIVERGENTE'].includes(m.status)) botoes.push(
    { rot: 'Apontar divergência', cls: 'perigo', acao: async () => { const mot = await SN.pedirTexto('Divergência', 'O que não confere? (o técnico verá)'); if (!mot) return false; acao('DIVERGENTE', 'Divergência', { motivo: mot }); } },
    { rot: 'Conferido', cls: 'prim', acao: () => acao('CONFERIDO', 'Conferido', { conferidoPor: SN.usuario().nome, conferidoEm: SN.agora() }) });
  if (m.status === 'CONFERIDO') botoes.push({ rot: 'Dar baixa no SAP (261)', cls: 'prim', acao: () => {
    const r = SN.int.sapBaixa261({ ...m, itens: m.itens });
    acao('BAIXADO_SAP', 'Baixa SAP mov. 261', { docSap: r.documento, baixadoPor: SN.usuario().nome, baixadoEm: SN.agora() }); SN.toast('Baixa registrada · doc. ' + r.documento, 'ok'); } });
  if (m.status === 'BAIXADO_SAP') botoes.push({ rot: 'Alocar ao cliente', cls: 'prim', acao: () => {
    SN.int.sapAlocarCliente(m); acao('ALOCADO_CLIENTE', 'Alocado ao cliente', { alocadoEm: SN.agora() }); } });
  SN.modal({ titulo: `${m.id} · ${SN.MAT_STATUS[m.status].rot}`, largo: true, botoes, corpo: `${SN.htmlCabecalho(m.cab)}
    ${m.motivo ? `<div class="aviso erro small">Divergência: ${SN.esc(m.motivo)}</div>` : ''}
    <div class="tabela-wrap"><table class="tab"><thead><tr><th>Tipo</th><th>Código</th><th>Descrição</th><th class="num">Qtd</th><th>Seriais</th><th class="num">Custo</th></tr></thead><tbody>
    ${m.itens.map(i => `<tr><td>${i.tipo}</td><td class="mono">${i.cod}</td><td>${SN.esc(i.desc)}</td><td class="num">${SN.num(i.qtd, 2)}</td><td class="small">${SN.esc((i.seriais || []).join(', '))}</td>
      <td class="num">${SN.brl(((SN.material(i.cod) || {}).p || 0) * i.qtd)}</td></tr>`).join('')}</tbody></table></div>
    ${m.obs ? `<p class="small"><b>Obs.:</b> ${SN.esc(m.obs)}</p>` : ''}
    ${m.docSap ? `<p class="small"><b>Documento SAP:</b> ${m.docSap} · ${SN.esc(m.baixadoPor)} · ${SN.dt(m.baixadoEm)}</p>` : ''}
    <h4>Histórico</h4><table class="tab small"><tbody>${m.historico.slice().reverse().map(h => `<tr><td class="nowrap">${SN.dt(h.ts)}</td><td>${SN.esc(h.usuario)}</td><td>${SN.esc(h.acao)}</td></tr>`).join('')}</tbody></table>` });
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
    ${grupos.map(([st, tit, sub]) => { const l = SN.db.fibras.filter(x => x.status === st).sort((a, b) => (b.enviadoEm || '').localeCompare(a.enviadoEm || ''));
      if (st === 'AGUARDANDO_VALIDACAO' && oem) return `<div class="card"><h3>${tit} <span class="badge">${l.length}</span></h3><p class="muted small">Etapa do líder — a sala técnica atua a partir da etapa seguinte.</p></div>`;
      return `<div class="card"><div class="card-tit"><h3>${tit} <span class="badge">${l.length}</span></h3><span class="muted small">${sub}</span></div>
      ${l.length ? `<div class="tabela-wrap"><table class="tab"><thead><tr><th>Registro</th><th>Chamado</th><th>Cliente</th><th>Técnico</th><th>CEOs</th><th>Enviado</th></tr></thead><tbody>
        ${l.map(x => `<tr class="clic" data-id="${x.id}"><td class="mono">${x.id}</td><td class="mono">${x.chamadoId}</td><td>${SN.esc(x.cliente)}</td><td>${SN.esc(x.cab.tecnico)}</td>
          <td>${x.ceos.map(e => SN.esc(e.numero)).join(', ')}</td><td class="nowrap">${SN.dt(x.enviadoEm)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Vazio.</p>'}</div>`; }).join('')}`);
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
      ${SN.svgFibra(e)}${e.obs ? `<p class="small">${SN.esc(e.obs)}</p>` : ''}</div>`).join('')}
    <h4 style="margin-top:10px">Histórico</h4><table class="tab small"><tbody>${r.historico.slice().reverse().map(h => `<tr><td class="nowrap">${SN.dt(h.ts)}</td><td>${SN.esc(h.usuario)}</td><td>${SN.esc(h.acao)}</td><td>${SN.esc(h.detalhe)}</td></tr>`).join('')}</tbody></table>` });
};
