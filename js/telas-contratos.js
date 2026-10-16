// SIGONET V2 — Contratos fixos no Service Desk (aba "CLT e contratos fixos").
// Regras em contratos-regras.js (CFR). Pedido de 2026-10-16:
//   - as OS concluídas pelas equipes do contrato somam sozinhas no ciclo (21 → 20);
//   - abaixo da meta mostra o improdutivo (só informativo); acima paga o excedente;
//   - variáveis marcadas como "cumprido" pelo Service Desk entram no valor do ciclo;
//   - "Fechar ciclo" congela os números (fica no histórico mesmo depois que os chamados
//     saem da janela de carga); histórico ano a ano com Excel.
// Registro de cada ciclo: coleção "contratos" (aba CONTRATOS), id "<contrato>|<AAAA-MM>".

SN.cf = { ciclo: '', ano: '' };
SN.cfAtivos = () => CONTRATOS_FIXOS.filter(CFR.ativo);
SN.cfEquipeDe = nome => (SN.tecnico(nome) || {}).equipe || '';
// Vínculo da LPU: equipe de contrato fixo (com meta) = só contagem, sem valor por item.
SN.contratoDoTecnico = (empresa, tecnico) => CFR.contratoDo(CONTRATOS_FIXOS, empresa, SN.cfEquipeDe(tecnico));
SN.vinculoLpu = h => SN.contratoDoTecnico(h.empresa, h.tecnico) ? 'CONTRATO_FIXO' : SN.empresa(h.empresa).vinculo;

SN.cfRegistro = (k, ciclo) => (SN.db.contratos || []).find(x => x.id === k.id + '|' + ciclo);
// Números do ciclo: fechado = o que foi congelado; aberto = calculado dos chamados carregados.
SN.cfNumeros = (k, ciclo) => {
  const reg = SN.cfRegistro(k, ciclo);
  if (reg && reg.fechado) return { ...reg.fechado.resumo, ids: reg.fechado.ids || [], fechado: reg.fechado, reg };
  const ativ = CFR.atividades(k, SN.db.chamados, SN.cfEquipeDe, ciclo);
  return { ...CFR.resumo(k, ativ.length, reg && reg.cumpridas), ids: ativ.map(c => c.id), fechado: null, reg };
};

// Ciclos fora da janela de carga: busca os meses no servidor (chamados) e redesenha.
SN.cfGarantir = (meses, redesenhar) => {
  const faltam = [...new Set(meses)].filter(m => SN.foraDaJanela(m) && !(SN.db.periodos || {})[m]);
  if (!faltam.length) return false;
  Promise.all(faltam.map(SN.garantirMes)).then(redesenhar, e => SN.toast('Não foi possível buscar os chamados antigos (' + e.message + ').', 'erro'));
  return true;
};

SN.htmlContratosFixos = () => {
  const f = SN.cf, hoje = CFR.cicloDe(SN.agora());
  if (!f.ciclo) f.ciclo = hoje;
  if (!f.ano) f.ano = f.ciclo.slice(0, 4);
  const ciclosAno = [...new Set(SN.cfAtivos().flatMap(k => CFR.ciclosDoAno(k, f.ano, hoje)))];
  const meses = CFR.mesesDoCiclo(f.ciclo).concat(...ciclosAno.map(CFR.mesesDoCiclo));
  if (SN.cfGarantir(meses, () => SN.render())) return SN.carregando('Buscando os chamados dos ciclos anteriores no servidor…');
  const fim = CFR.intervalo(f.ciclo)[1];
  const pagto = new Date(fim.getFullYear(), fim.getMonth(), 28);
  const cartao = k => {
    if (!CFR.ativo(k)) return `<div class="card"><div class="card-tit"><h3>${SN.esc(k.nome)}</h3><span class="badge alerta">${SN.esc(k.pendente || 'Sem meta definida')}</span></div>
      <p class="small muted">${SN.esc(SN.contaTxt(k.conta))} · ${SN.esc(k.ciclo)}${k.valorMensal ? ' · fixo ' + SN.brl(k.valorMensal) : ''}</p>
      ${(k.variaveis || []).length ? `<ul class="small" style="margin:6px 0 0;padding-left:18px">${k.variaveis.map(v => `<li>${SN.esc(v.desc)} — ${SN.brl(v.valor)}</li>`).join('')}</ul>` : ''}
      <p class="small muted" style="margin-top:8px">Ainda não conta atividades: falta definir a meta e as equipes do contrato.</p></div>`;
    if (k.inicio && f.ciclo < k.inicio) return `<div class="card"><div class="card-tit"><h3>${SN.esc(k.nome)}</h3></div><p class="muted small">O contrato começa a contar no ciclo ${CFR.rotulo(k.inicio)}.</p></div>`;
    const n = SN.cfNumeros(k, f.ciclo), fechado = !!n.fechado, futuro = f.ciclo > hoje;
    return `<div class="card"><div class="card-tit"><h3>${SN.esc(k.nome)}</h3>${fechado ? '<span class="badge ok">Ciclo fechado</span>' : f.ciclo === hoje ? '<span class="badge info">Ciclo em andamento</span>' : '<span class="badge alerta">Ciclo não fechado</span>'}</div>
      <p class="small muted" style="margin:0 0 8px">${SN.esc(SN.contaTxt(k.conta))} · ${k.equipes ? 'equipes ' + SN.esc(k.equipes.join(', ')) : 'todas as equipes da empresa'} · fixo ${SN.brl(k.valorMensal)} · meta ${n.meta} · excedente ${SN.brl(k.valorExcedente)}/atividade${k.observacao ? ' · ' + SN.esc(k.observacao) : ''}</p>
      <div class="kpis-fin cf-kpis">
        <div class="kpi destaque"><div class="rot">Atividades</div><div class="val">${n.feitas} de ${n.meta}</div><div class="sub">${n.pct}% da meta</div></div>
        ${n.excedente ? `<div class="kpi"><div class="rot">Excedente</div><div class="val">+${n.excedente} · ${SN.brl(n.valorExcedente)}</div><div class="sub">${n.excedente} × ${SN.brl(k.valorExcedente)} (pago)</div></div>`
          : `<div class="kpi"><div class="rot">Improdutivo</div><div class="val" style="color:${n.falta ? 'var(--erro)' : 'inherit'}">${SN.brl(n.improdutivo)}</div><div class="sub">${n.falta} faltando × ${SN.brl(n.valorAtividade)} (só informativo)</div></div>`}
        <div class="kpi"><div class="rot">Variáveis</div><div class="val">${SN.brl(n.variaveis)}</div><div class="sub">de ${SN.brl(n.variaveisMax)} possíveis</div></div>
        <div class="kpi"><div class="rot">Total a pagar</div><div class="val">${SN.brl(n.total)}</div><div class="sub">fixo + excedente + variáveis</div></div></div>
      <div class="gauge ${n.feitas < n.meta ? 'alerta' : ''}"><div style="width:${Math.min(100, n.meta ? n.feitas / n.meta * 100 : 0)}%"></div></div>
      ${n.vars.length ? `<div style="margin-top:10px"><b class="small">Variáveis do ciclo</b> <span class="small muted">(marque o que foi cumprido para pagar)</span>
        ${n.vars.map(v => `<label class="small" style="display:flex;gap:8px;align-items:flex-start;margin-top:6px"><input type="checkbox" data-cfv="${SN.esc(k.id)}" data-desc="${SN.esc(v.desc)}" ${v.cumprido ? 'checked' : ''} ${fechado || futuro ? 'disabled' : ''}>
          <span style="flex:1">${SN.esc(v.desc)}</span><b class="nowrap">${SN.brl(v.valor)}</b></label>`).join('')}</div>` : ''}
      ${fechado ? `<p class="small muted" style="margin-top:8px">Fechado por ${SN.esc(n.fechado.por)} em ${SN.dt(n.fechado.em)}.</p>` : ''}
      <div class="acoes" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn sm" data-cfver="${SN.esc(k.id)}">Ver atividades (${n.ids.length})</button>
        ${futuro ? '' : fechado ? `<button class="btn sm" data-cfreabrir="${SN.esc(k.id)}">Reabrir ciclo</button>` : `<button class="btn sm prim" data-cffechar="${SN.esc(k.id)}">Fechar ciclo</button>`}</div></div>`;
  };
  // Histórico do ano: um quadro por contrato, uma linha por ciclo.
  const hist = k => {
    const linhas = CFR.ciclosDoAno(k, f.ano, hoje).map(c => ({ c, n: SN.cfNumeros(k, c) }));
    const soma = key => linhas.reduce((s, x) => s + (x.n[key] || 0), 0);
    return `<div class="card"><div class="card-tit"><h3>${SN.esc(k.nome)} · ${f.ano}</h3><span class="small muted">meta ${k.metaAtividades}/ciclo · fixo ${SN.brl(k.valorMensal)}</span></div>
      <div class="tabela-wrap"><table class="tab small"><thead><tr><th>Ciclo</th><th class="num">Meta</th><th class="num">Feitas</th><th class="num">Faltou</th><th class="num">Improdutivo</th><th class="num">Excedente</th><th class="num">Excedente R$</th><th class="num">Variáveis R$</th><th class="num">Total a pagar</th><th>Situação</th></tr></thead><tbody>
      ${linhas.map(({ c, n }) => `<tr><td class="nowrap">${CFR.rotulo(c)}</td><td class="num">${n.meta}</td><td class="num">${n.feitas}</td><td class="num">${n.falta || '·'}</td><td class="num">${n.improdutivo ? SN.brl(n.improdutivo) : '·'}</td>
        <td class="num">${n.excedente || '·'}</td><td class="num">${n.valorExcedente ? SN.brl(n.valorExcedente) : '·'}</td><td class="num">${SN.brl(n.variaveis)}</td><td class="num"><b>${SN.brl(n.total)}</b></td>
        <td>${n.fechado ? '<span class="badge ok">Fechado</span>' : c === hoje ? '<span class="badge info">Em andamento</span>' : '<span class="badge alerta">Aberto</span>'}</td></tr>`).join('') || '<tr><td colspan="10" class="muted center">Nenhum ciclo neste ano.</td></tr>'}
      </tbody>${linhas.length > 1 ? `<tfoot><tr><td><b>Total do ano</b></td><td class="num"><b>${soma('meta')}</b></td><td class="num"><b>${soma('feitas')}</b></td><td class="num"><b>${soma('falta')}</b></td><td class="num"><b>${SN.brl(soma('improdutivo'))}</b></td>
        <td class="num"><b>${soma('excedente')}</b></td><td class="num"><b>${SN.brl(soma('valorExcedente'))}</b></td><td class="num"><b>${SN.brl(soma('variaveis'))}</b></td><td class="num"><b>${SN.brl(soma('total'))}</b></td><td></td></tr></tfoot>` : ''}</table></div></div>`;
  };
  return `<div class="card card-filtros"><div class="filtros">
      <b>Contratos fixos · ciclo</b>
      <div class="nav-data"><button class="btn" id="cfAnt" title="Ciclo anterior">◀</button><span class="rotulo-periodo">${CFR.rotulo(f.ciclo)}</span><button class="btn" id="cfProx" title="Próximo ciclo">▶</button><button class="btn" id="cfHoje">Ciclo atual</button></div>
      <span class="small muted">pagamento em ${SN.data(pagto.toISOString())}</span></div>
      <p class="small muted" style="margin:6px 0 0">As OS concluídas pelas equipes do contrato somam sozinhas (conclusão técnica entre os dias 21 e 20). Abaixo da meta, o improdutivo é só informativo e o fixo é pago cheio. Acima, cada atividade a mais paga o valor de excedente do contrato.</p></div>
    <div class="grid g2">${CONTRATOS_FIXOS.map(cartao).join('')}</div>
    <div class="cab-pagina" style="margin-top:18px"><div><h2 style="margin:0">Histórico dos contratos fixos</h2><p>Ciclo a ciclo no ano. Os ciclos fechados ficam congelados com os números do fechamento.</p></div>
      <div class="acoes"><div class="nav-data"><button class="btn" id="cfAnoAnt">◀</button><span class="rotulo-periodo">${f.ano}</span><button class="btn" id="cfAnoProx">▶</button></div><button class="btn" id="cfExp">Exportar Excel</button></div></div>
    ${SN.cfAtivos().map(hist).join('')}`;
};

SN.ligarContratosFixos = () => {
  const f = SN.cf, de = () => SN.render();
  const b = id => SN.$('#' + id);
  if (!b('cfAnt')) return; // ainda carregando
  b('cfAnt').onclick = () => { f.ciclo = CFR.mover(f.ciclo, -1); de(); };
  b('cfProx').onclick = () => { f.ciclo = CFR.mover(f.ciclo, 1); de(); };
  b('cfHoje').onclick = () => { f.ciclo = CFR.cicloDe(SN.agora()); de(); };
  b('cfAnoAnt').onclick = () => { f.ano = String(+f.ano - 1); de(); };
  b('cfAnoProx').onclick = () => { f.ano = String(+f.ano + 1); de(); };
  const contrato = id => CONTRATOS_FIXOS.find(k => k.id === id);
  const registro = k => {
    let r = SN.cfRegistro(k, f.ciclo);
    if (!r) { r = { id: k.id + '|' + f.ciclo, contrato: k.id, empresa: k.empresa, ciclo: f.ciclo, cumpridas: {}, fechado: null, historico: [] }; SN.db.contratos.push(r); }
    return r;
  };
  SN.$$('[data-cfv]').forEach(cb => cb.onchange = () => {
    const k = contrato(cb.dataset.cfv), r = registro(k), d = cb.dataset.desc;
    if (cb.checked) r.cumpridas[d] = true; else delete r.cumpridas[d];
    SN.hist(r, cb.checked ? 'Variável cumprida' : 'Variável desmarcada', d);
    SN.log('CONTRATO_VARIAVEL', r.id, (cb.checked ? 'cumprida: ' : 'desmarcada: ') + d); SN.salvar(); de();
  });
  SN.$$('[data-cffechar]').forEach(bt => bt.onclick = async () => {
    const k = contrato(bt.dataset.cffechar), n = SN.cfNumeros(k, f.ciclo);
    if (!await SN.confirmar('Fechar ciclo ' + CFR.rotulo(f.ciclo), `${SN.esc(k.nome)}: ${n.feitas} de ${n.meta} atividades · total a pagar <b>${SN.brl(n.total)}</b>${n.improdutivo ? ' · improdutivo ' + SN.brl(n.improdutivo) : ''}${n.excedente ? ' · excedente ' + n.excedente + ' (' + SN.brl(n.valorExcedente) + ')' : ''}. Os números ficam congelados no histórico (dá para reabrir).`, 'Fechar ciclo')) return;
    const r = registro(k), resumo = { ...n }; ['ids', 'fechado', 'reg'].forEach(x => delete resumo[x]);
    r.fechado = { em: SN.agora(), por: SN.usuario().nome, ids: n.ids, resumo };
    SN.hist(r, 'Ciclo fechado', `${n.feitas}/${n.meta} · ${SN.brl(n.total)}`); SN.log('CONTRATO_FECHAR', r.id, SN.brl(n.total)); SN.salvar(); SN.toast('Ciclo fechado.', 'ok'); de();
  });
  SN.$$('[data-cfreabrir]').forEach(bt => bt.onclick = async () => {
    const k = contrato(bt.dataset.cfreabrir), r = SN.cfRegistro(k, f.ciclo); if (!r) return;
    const mot = await SN.pedirTexto('Reabrir ciclo ' + CFR.rotulo(f.ciclo), 'Os números voltam a ser calculados pelos chamados. Motivo:'); if (!mot) return;
    r.fechado = null; SN.hist(r, 'Ciclo reaberto', mot); SN.log('CONTRATO_REABRIR', r.id, mot); SN.salvar(); de();
  });
  SN.$$('[data-cfver]').forEach(bt => bt.onclick = () => {
    const k = contrato(bt.dataset.cfver), n = SN.cfNumeros(k, f.ciclo);
    const chs = n.ids.map(id => SN.db.chamados.find(c => c.id === id) || { id, tempos: {} });
    SN.modal({ titulo: `${k.nome} · ${CFR.rotulo(f.ciclo)} · ${chs.length} atividade(s)`, largo: true, corpo: `<div class="tabela-wrap"><table class="tab small"><thead><tr><th>#</th><th>Chamado</th><th>Concluído</th><th>Técnico</th><th>Equipe</th><th>Cliente</th><th>Tipo</th></tr></thead><tbody>
      ${chs.map((c, i) => `<tr><td>${i + 1}</td><td><a href="#/chamado/${SN.esc(c.id)}">${SN.esc(c.id)}</a></td><td class="nowrap">${SN.dt(c.tempos.conclusaoTecnica)}</td><td>${SN.esc(c.tecnico ? SN.nomeExibicao(c.tecnico) : '—')}</td><td>${SN.esc(SN.cfEquipeDe(c.tecnico) || '—')}</td><td>${SN.esc(c.cliente || '')}</td><td>${SN.esc(c.tipo || '')}</td></tr>`).join('') || '<tr><td colspan="7" class="muted center">Nenhuma atividade concluída neste ciclo.</td></tr>'}
      </tbody></table></div>`, botoes: [{ rot: 'Fechar' }] });
  });
  b('cfExp').onclick = () => {
    const hoje = CFR.cicloDe(SN.agora());
    SN.exportar('contratos_fixos_' + f.ano, SN.cfAtivos().flatMap(k => CFR.ciclosDoAno(k, f.ano, hoje).map(c => {
      const n = SN.cfNumeros(k, c);
      return { Contrato: k.nome, Empresa: k.empresa, Equipes: k.equipes ? k.equipes.join(', ') : 'Todas', 'Conta contábil': k.conta, Ciclo: CFR.rotulo(c),
        'Valor fixo': n.fixo, Meta: n.meta, Feitas: n.feitas, Faltou: n.falta, 'Valor por atividade': n.valorAtividade, 'Improdutivo (R$)': n.improdutivo,
        Excedente: n.excedente, 'Excedente (R$)': n.valorExcedente, ...Object.fromEntries(n.vars.map(v => ['Variável: ' + v.desc, v.cumprido ? v.valor : 0])),
        'Variáveis (R$)': n.variaveis, 'Total a pagar': n.total, 'Situação': n.fechado ? 'Fechado' : c === hoje ? 'Em andamento' : 'Aberto',
        'Fechado por': n.fechado ? n.fechado.por : '', 'Fechado em': n.fechado ? SN.dt(n.fechado.em) : '', Chamados: n.ids.join(', ') };
    })));
  };
};
