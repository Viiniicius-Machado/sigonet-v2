// SIGONET V2 — Estoque dos técnicos (telas). Regras em estoque-regras.js (SN.ER).
//
// Gestão (#/estoque, tela "materiais"): importa o relatório de movimentações do Elleven,
// vincula cada técnico ao estoque de onde sai o material dele e acompanha os saldos.
// Técnico (#/tec/estoque): "Meu estoque" — saldo do relatório, o que ele já apontou
// nos chamados depois do relatório e o disponível.
(() => {
  const esc = SN.esc, ER = SN.ER;
  const estoques = () => SN.db.estoques || (SN.db.estoques = []);
  const qtd = (v, un) => SN.num(v, Number.isInteger(Number(v)) ? 0 : 2) + (un ? ' ' + String(un).toLowerCase().replace('unid', 'un') : '');
  const dataRel = e => e && e.relatorio && e.relatorio.data ? SN.dt(e.relatorio.data) : '—';
  SN.estoqueDoTecnico = (empresa, nome) => ER.estoqueDe(estoques(), empresa, nome);

  // Tabela de produtos de um estoque (gestão e técnico usam a mesma).
  const tabelaProdutos = (linhas, q) => {
    const qn = SN.normal(q || ''), vis = linhas.filter(x => !qn || SN.normal(x.cod + ' ' + x.d).includes(qn));
    return `<div class="tabela-wrap" style="max-height:520px"><table class="tab small"><thead><tr><th>Código</th><th>Produto</th><th class="num">Saldo no relatório</th><th class="num">Usado no SigoNet</th><th class="num">Disponível</th></tr></thead><tbody>
      ${vis.map(x => `<tr><td class="mono">${esc(x.cod)}</td><td>${esc(x.d || (SN.material(x.cod) || {}).d || '')}</td><td class="num">${qtd(x.saldo, x.un)}</td>
        <td class="num">${x.usado ? qtd(x.usado, x.un) : '<span class="muted">—</span>'}</td>
        <td class="num"><b style="color:${x.disp < 0 ? 'var(--erro)' : 'inherit'}">${qtd(x.disp, x.un)}</b>${x.disp < 0 ? '<div class="small" style="color:var(--erro)">usou mais que o saldo</div>' : ''}</td></tr>`).join('')
      || '<tr><td colspan="5" class="muted">Nenhum produto.</td></tr>'}</tbody></table></div>`;
  };
  // Registros de material que já saíram deste estoque depois do relatório.
  const htmlUsados = (e, link) => {
    const ids = {}; ER.disponivel(e, SN.db.materiais).forEach(x => x.regs.forEach(id => { ids[id] = true; }));
    const regs = SN.db.materiais.filter(m => ids[m.id]).sort((a, b) => String(b.registradoEm).localeCompare(String(a.registradoEm)));
    if (!regs.length) return '<p class="muted small">Nada apontado no SigoNet depois do relatório.</p>';
    return `<table class="tab small"><thead><tr><th>Quando</th><th>Chamado</th><th>Técnico</th><th>Itens</th></tr></thead><tbody>${regs.map(m => `<tr>
      <td class="nowrap">${SN.dt(m.registradoEm)}</td><td>${link ? `<a href="#/materiais/${esc(m.id)}">${esc(m.chamadoId)}</a>` : esc(m.chamadoId)}</td><td>${esc((m.cab || {}).tecnico || '')}</td>
      <td>${m.itens.map(i => `${esc(i.desc)} × ${SN.num(i.qtd, 2)}`).join('; ')}</td></tr>`).join('')}</tbody></table>`;
  };

  // ═══════════════════════════ Gestão ═══════════════════════════
  let aba = 'SALDOS', previa = null, filtro = { q: '', emp: '' }, escolhas = null;
  SN.rota('/estoque', () => {
    // Estoques com técnico vinculado primeiro (os sem vínculo são, em geral, estoques antigos ou de terceiros).
    const lista = estoques().slice().sort((a, b) => (!(b.tecnicos || []).length - !(a.tecnicos || []).length) || a.nome.localeCompare(b.nome));
    const ult = lista.map(e => e.relatorio && e.relatorio.data).filter(Boolean).sort().pop();
    SN.casca('estoque', `
      <div class="cab-pagina"><div><h1>Estoque dos técnicos</h1><p>Saldo de cada estoque no último relatório do Elleven, menos o que os técnicos apontaram nos chamados depois dele. O Elleven continua sendo o estoque oficial.</p></div>
        <div class="acoes"><a class="btn" href="#/materiais">Controle de Materiais</a></div></div>
      ${ult ? `<div class="faixa small" style="margin-bottom:12px">Último relatório importado: <b>${SN.dt(ult)}</b> · ${lista.length} estoque(s). Importe um relatório novo sempre que possível: a conta do "usado no SigoNet" recomeça a partir dele.</div>`
        : '<div class="aviso alerta small" style="margin-bottom:12px">Nenhum relatório importado ainda. Use a aba "Importar relatório".</div>'}
      <div class="abas">${[['SALDOS', 'Saldos'], ['VINC', 'Vínculos técnico × estoque'], ['IMP', 'Importar relatório']].map(([k, r]) => `<button class="aba ${aba === k ? 'ativa' : ''}" data-aba="${k}">${r}</button>`).join('')}</div>
      <div id="eCorpo"></div>`);
    SN.$$('[data-aba]').forEach(b => b.onclick = () => { aba = b.dataset.aba; SN.render(); });
    ({ SALDOS: pintarSaldos, VINC: pintarVinculos, IMP: pintarImportar })[aba](lista);
  }, { tela: 'materiais' });

  const pintarSaldos = lista => {
    const linhas = lista.map(e => { const d = ER.disponivel(e, SN.db.materiais);
      return { e, d, usados: d.filter(x => x.usado).length, neg: d.filter(x => x.disp < 0).length, valor: d.reduce((s, x) => s + Math.max(0, x.disp) * x.valor, 0) }; });
    const qn = SN.normal(filtro.q);
    const vis = linhas.filter(x => (!qn || SN.normal(x.e.nome + ' ' + (x.e.tecnicos || []).join(' ')).includes(qn)) && (!filtro.emp || (filtro.emp === '_sem' ? !(x.e.tecnicos || []).length : (x.e.tecnicos || []).some(k => k.split('|')[0] === filtro.emp))));
    const emps = [...new Set(lista.flatMap(e => (e.tecnicos || []).map(k => k.split('|')[0])))].sort();
    SN.$('#eCorpo').innerHTML = `<div class="acoes" style="margin-bottom:8px"><input class="inp" id="eQ" placeholder="Buscar estoque ou técnico" value="${esc(filtro.q)}" style="max-width:300px">
        <select class="inp" id="eEmp" style="max-width:240px"><option value="">Todas as empresas</option>${emps.map(x => `<option ${filtro.emp === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}<option value="_sem" ${filtro.emp === '_sem' ? 'selected' : ''}>Sem técnico vinculado</option></select></div>
      <div class="tabela-wrap"><table class="tab small"><thead><tr><th>Estoque (Elleven)</th><th>Técnicos vinculados</th><th>Relatório</th><th class="num">Produtos</th><th class="num">Usados no SigoNet</th><th class="num">Abaixo de zero</th><th class="num">Valor disponível</th></tr></thead><tbody>
      ${vis.map(x => `<tr class="clic" data-est="${esc(x.e.id)}"><td><b>${esc(x.e.nome)}</b></td><td class="small">${(x.e.tecnicos || []).map(k => esc(k.split('|')[1]) + ' <span class="muted">(' + esc(k.split('|')[0]) + ')</span>').join('<br>') || '<span class="muted">nenhum</span>'}</td>
        <td class="nowrap small">${dataRel(x.e)}</td><td class="num">${Object.keys(x.e.itens || {}).length}</td><td class="num">${x.usados || ''}</td>
        <td class="num">${x.neg ? `<b style="color:var(--erro)">${x.neg}</b>` : ''}</td><td class="num">${SN.brl(x.valor)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhum estoque.</td></tr>'}</tbody></table></div>`;
    SN.$('#eQ').oninput = SN.debounce(e => { filtro.q = e.target.value; pintarSaldos(lista); SN.$('#eQ').focus(); }, 250);
    SN.$('#eEmp').onchange = e => { filtro.emp = e.target.value; pintarSaldos(lista); };
    SN.$$('[data-est]').forEach(tr => tr.onclick = () => abrirEstoque(lista.find(e => e.id === tr.dataset.est)));
  };
  const abrirEstoque = e => {
    const d = ER.disponivel(e, SN.db.materiais);
    SN.modal({ titulo: e.nome, largo: true, corpo: `<p class="small">Relatório de <b>${dataRel(e)}</b>${e.relatorio && e.relatorio.arquivo ? ' (' + esc(e.relatorio.arquivo) + ')' : ''} · técnicos: ${(e.tecnicos || []).map(k => esc(k.split('|')[1])).join(', ') || 'nenhum vinculado'}</p>
      <input class="inp" id="mQ" placeholder="Buscar produto" style="max-width:300px;margin-bottom:6px"><div id="mTab">${tabelaProdutos(d)}</div>
      <h4 style="margin-top:12px">Apontado no SigoNet depois do relatório</h4>${htmlUsados(e, true)}`,
      aoAbrir: m => { SN.$('#mQ', m).oninput = ev => { SN.$('#mTab', m).innerHTML = tabelaProdutos(d, ev.target.value); }; } });
  };

  // Vínculos: técnico do SigoNet → estoque do Elleven (com sugestão pelo nome).
  const pintarVinculos = lista => {
    const tecs = SN.db.tecnicos.filter(t => t.ativo !== false).sort((a, b) => (a.empresa + a.nome).localeCompare(b.empresa + b.nome));
    const sug = ER.sugerirVinculos(lista, tecs);
    if (!escolhas) { escolhas = {}; tecs.forEach(t => { const e = ER.estoqueDe(lista, t.empresa, t.nome); escolhas[ER.chaveTec(t.empresa, t.nome)] = e ? e.id : ''; }); }
    const semVinc = tecs.filter(t => !escolhas[ER.chaveTec(t.empresa, t.nome)]);
    const nSug = semVinc.filter(t => sug[ER.chaveTec(t.empresa, t.nome)]).length;
    const rotMot = { nome: 'pelo nome', apelido: 'pelo apelido', empresa: 'único estoque da empresa' };
    const opcoes = sel => `<option value="">— sem estoque —</option>` + lista.map(e => `<option value="${esc(e.id)}" ${sel === e.id ? 'selected' : ''}>${esc(e.nome)}</option>`).join('');
    SN.$('#eCorpo').innerHTML = !lista.length ? '<p class="muted">Importe um relatório primeiro.</p>' : `
      <p class="small muted">Escolha de qual estoque do Elleven sai o material de cada técnico. Um estoque pode servir vários técnicos (bolsão da equipe). O técnico só vê o estoque dele em "Meu estoque".</p>
      <div class="acoes" style="margin-bottom:8px">${nSug ? `<button class="btn" id="vSug">Usar as ${nSug} sugestões nos técnicos sem estoque</button>` : ''}<span class="small muted">${semVinc.length} técnico(s) sem estoque</span></div>
      <div class="tabela-wrap"><table class="tab small"><thead><tr><th>Empresa</th><th>Técnico</th><th>Estoque no Elleven</th><th>Sugestão</th></tr></thead><tbody>
      ${tecs.map(t => { const k = ER.chaveTec(t.empresa, t.nome), s = sug[k];
        return `<tr><td>${esc(t.empresa)}</td><td>${esc(t.nome)}</td><td><select class="inp" data-vk="${esc(k)}" style="min-width:260px">${opcoes(escolhas[k])}</select></td>
          <td class="small">${s ? `${s.id === escolhas[k] ? '✓ ' : ''}${esc(s.id)} <span class="muted">(${rotMot[s.motivo]})</span>` : '<span class="muted">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>
      <button class="btn prim lg" id="vSalvar" style="margin-top:10px">Salvar vínculos</button>`;
    if (!lista.length) return;
    SN.$$('[data-vk]').forEach(s => s.onchange = () => { escolhas[s.dataset.vk] = s.value; });
    if (SN.$('#vSug')) SN.$('#vSug').onclick = () => { semVinc.forEach(t => { const k = ER.chaveTec(t.empresa, t.nome); if (sug[k]) escolhas[k] = sug[k].id; }); pintarVinculos(lista); SN.toast('Sugestões aplicadas na tela. Confira e clique em Salvar.'); };
    SN.$('#vSalvar').onclick = () => {
      let mud = 0;
      lista.forEach(e => {
        const novos = Object.keys(escolhas).filter(k => escolhas[k] === e.id).sort(), antes = (e.tecnicos || []).slice().sort();
        if (JSON.stringify(novos) === JSON.stringify(antes)) return;
        e.tecnicos = novos; SN.hist(e, 'Vínculos alterados', `${antes.map(k => k.split('|')[1]).join(', ') || 'nenhum'} → ${novos.map(k => k.split('|')[1]).join(', ') || 'nenhum'}`); mud++;
      });
      if (!mud) return SN.toast('Nada mudou.');
      SN.log('ESTOQUE_VINCULOS', '', mud + ' estoque(s)'); SN.salvar(); escolhas = null;
      SN.toast(`Vínculos salvos (${mud} estoque(s)).`, 'ok'); SN.render();
    };
  };

  const pintarImportar = lista => {
    SN.$('#eCorpo').innerHTML = `<div class="card"><h3>Relatório de movimentações do Elleven (CSV)</h3>
      <p class="small muted">Arquivo "Movimentacoes Tecnicos-data-AAAA-MM-DD hh_mm_ss.csv". O saldo de cada estoque é calculado com todas as entradas e saídas do arquivo; a data do relatório vem do nome do arquivo. Reimportar atualiza os saldos e mantém os vínculos.</p>
      <label class="btn">Escolher o CSV<input type="file" id="iArq" accept=".csv,text/csv" hidden></label><div id="iPrevia" style="margin-top:10px"></div></div>`;
    SN.$('#iArq').onchange = async ev => {
      const file = ev.target.files && ev.target.files[0]; if (!file) return;
      const el = SN.$('#iPrevia'); el.innerHTML = '<span class="muted small">Lendo o arquivo…</span>';
      try {
        const texto = await file.text(), linhas = ER.lerCsv(texto);
        if (!linhas.length || !('Tecnico' in linhas[0]) || !('Cod. Produto' in linhas[0])) throw new Error('Este arquivo não parece o relatório de movimentações do Elleven (faltam as colunas "Tecnico" e "Cod. Produto").');
        previa = { arquivo: file.name, ...ER.agregar(linhas, file.name), linhas: linhas.length };
        const ant = lista.map(e => e.relatorio && e.relatorio.data).filter(Boolean).sort().pop();
        const prods = new Set(previa.estoques.flatMap(e => Object.keys(e.itens)));
        const foraCat = [...prods].filter(c => !SN.material(c));
        el.innerHTML = `<div class="faixa small"><b>${esc(file.name)}</b>: ${SN.num(previa.linhas)} movimentações · <b>${previa.estoques.length}</b> estoques · ${prods.size} produtos com saldo · relatório de <b>${SN.dt(previa.data)}</b>
          ${previa.erros.length ? `<br><span style="color:var(--erro)">${previa.erros.length} linha(s) ignorada(s): ${esc(previa.erros[0].msg)}</span>` : ''}
          ${foraCat.length ? `<br>${foraCat.length} produto(s) fora do catálogo do SigoNet (aparecem pelo nome do Elleven).` : ''}</div>
          ${ant && previa.data <= ant ? `<div class="aviso alerta small" style="margin-top:6px">Este relatório (${SN.dt(previa.data)}) não é mais novo que o importado (${SN.dt(ant)}).</div>` : ''}
          <div class="tabela-wrap" style="max-height:300px;margin-top:8px"><table class="tab small"><thead><tr><th>Estoque</th><th class="num">Produtos com saldo</th><th>Última movimentação</th><th>Já existe</th></tr></thead><tbody>
          ${previa.estoques.map(e => `<tr><td>${esc(e.nome)}</td><td class="num">${Object.keys(e.itens).length}</td><td class="small">${SN.dt(e.ultimaMov.replace(' ', 'T'))}</td><td class="small">${lista.some(x => x.id === e.id) ? 'sim (atualiza)' : '<b>novo</b>'}</td></tr>`).join('')}</tbody></table></div>
          <button class="btn prim" id="iImp" style="margin-top:8px">Importar ${previa.estoques.length} estoques</button>`;
        SN.$('#iImp').onclick = () => {
          const u = SN.usuario(), quando = SN.agora(), rel = { data: new Date(previa.data).toISOString(), arquivo: previa.arquivo, importadoEm: quando, por: u.nome };
          previa.estoques.forEach(n => {
            const e = estoques().find(x => x.id === n.id);
            if (e) { Object.assign(e, { nome: n.nome, itens: n.itens, movimentos: n.movimentos, ultimaMov: n.ultimaMov, relatorio: rel }); SN.hist(e, 'Relatório importado', previa.arquivo); }
            else { const novo = { ...n, tecnicos: [], relatorio: rel, historico: [] }; SN.hist(novo, 'Relatório importado', previa.arquivo); estoques().push(novo); }
          });
          SN.log('ESTOQUE_IMPORTAR', previa.arquivo, previa.estoques.length + ' estoques'); SN.salvar();
          SN.toast(`${previa.estoques.length} estoques importados. Confira os vínculos dos técnicos.`, 'ok'); previa = null; escolhas = null; aba = 'VINC'; SN.render();
        };
      } catch (e) { el.innerHTML = `<div class="aviso erro small">${esc(e.message)}</div>`; }
    };
  };

  // ═══════════════════════════ Técnico: Meu estoque ═══════════════════════════
  SN.rota('/tec/estoque', () => {
    const u = SN.usuario(), e = SN.estoqueDoTecnico(u.empresa, u.nome);
    if (!e) return SN.cascaTec('estoque', `<div class="aviso info">Seu estoque ainda não foi vinculado pela gestão de materiais. Quando for, você vê aqui o saldo de cada material.</div>`, 'Meu estoque');
    const d = ER.disponivel(e, SN.db.materiais), neg = d.filter(x => x.disp < 0).length;
    SN.cascaTec('estoque', `
      <p class="small muted" style="margin-top:-4px">Estoque <b>${esc(e.nome)}</b> · relatório do Elleven de ${dataRel(e)}${(e.tecnicos || []).length > 1 ? ' · usado também por ' + e.tecnicos.filter(k => k !== ER.chaveTec(u.empresa, u.nome)).map(k => esc(k.split('|')[1])).join(', ') : ''}</p>
      <div class="grid g2" style="margin-bottom:10px">
        <div class="kpi destaque"><div class="rot">Materiais com saldo</div><div class="val">${d.filter(x => x.disp > 0).length}</div></div>
        <div class="kpi"><div class="rot">Usados desde o relatório</div><div class="val">${d.filter(x => x.usado).length}</div></div></div>
      ${neg ? `<div class="aviso erro small" style="margin-bottom:8px">${neg} material(is) com uso acima do saldo. Fale com a gestão de materiais.</div>` : ''}
      <input class="inp" id="tQ" placeholder="Buscar material" style="margin-bottom:6px">
      <div id="tLista"></div>
      <h3 style="margin-top:14px">Apontado nos chamados depois do relatório</h3>${htmlUsados(e, false)}
      <p class="small muted">Disponível = saldo do relatório − o que você (e quem usa o mesmo estoque) apontou nos chamados depois dele. O estoque oficial é o Elleven.</p>`, 'Meu estoque');
    const pintar = q => {
      const qn = SN.normal(q || ''), vis = d.filter(x => !qn || SN.normal(x.cod + ' ' + x.d).includes(qn));
      SN.$('#tLista').innerHTML = vis.map(x => `<div class="item-lpu" style="grid-template-columns:1fr auto"><div><div class="d">${esc(x.d || (SN.material(x.cod) || {}).d || x.cod)}</div>
        <div class="c">${esc(x.cod)} · relatório ${qtd(x.saldo, x.un)}${x.usado ? ' − usado ' + qtd(x.usado, x.un) : ''}</div></div>
        <div style="text-align:right"><b style="font-size:1.1rem;color:${x.disp < 0 ? 'var(--erro)' : 'inherit'}">${qtd(x.disp, x.un)}</b><div class="small muted">disponível</div></div></div>`).join('') || '<p class="muted">Nenhum material.</p>';
    };
    pintar(''); SN.$('#tQ').oninput = SN.debounce(ev => pintar(ev.target.value), 200);
  }, { familia: 'tecnico' });
})();
