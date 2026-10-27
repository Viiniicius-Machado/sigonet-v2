// SIGONET V2 — Cadastros e Acessos → Contratos fixos (cadastro pela plataforma, 27/10/2026).
// Igual a técnico/empresa: cria e edita. Cada contrato fica na empresa (empresa.contratosFixos) e cada
// mudança vale a partir de um ciclo (dia 21 em diante); os ciclos anteriores continuam calculados com
// a versão que valia neles (regras em contratos-regras.js: CFR.noCiclo).

SN.htmlCadContratosFixos = () => {
  const hoje = CFR.cicloDe(SN.agora()), defs = SN.cfDefs();
  const linha = d => {
    const k = CFR.noCiclo(d, hoje), prox = (d.versoes || []).filter(v => v.desde > hoje).sort((a, b) => a.desde.localeCompare(b.desde))[0];
    return `<tr class="clic" data-cfdef="${SN.esc(d.id)}"><td><b>${SN.esc(d.nome)}</b></td><td>${SN.esc(d.empresa)}</td>
      <td>${k ? (k.equipes ? SN.esc(k.equipes.join(', ')) : 'Empresa inteira') : '—'}</td>
      <td class="num nowrap">${k ? SN.brl(k.valorMensal) : '—'}</td><td class="num">${k && k.metaAtividades ? k.metaAtividades : '—'}</td><td class="num nowrap">${k && k.valorExcedente ? SN.brl(k.valorExcedente) : '—'}</td>
      <td class="num">${k ? (k.variaveis || []).length : '—'}</td>
      <td class="small">${k ? (CFR.ativo(k) ? '<span class="badge ok">valendo</span>' : '<span class="badge alerta">sem meta</span>') : '<span class="badge">fora do ciclo</span>'}
        ${prox ? `<div class="muted">${prox.encerrado ? 'encerra' : 'muda'} em ${SN.esc(CFR.rotulo(prox.desde))}</div>` : ''}</td></tr>`;
  };
  return `<div class="card"><div class="card-tit"><h3>Contratos fixos</h3><button class="btn prim" data-novo="cf">+ Contrato</button></div>
    <p class="small muted" style="margin-top:0">Equipe que está num contrato com meta tem a LPU só de contagem (sem valor por item) e soma para a meta no Service Desk.
      A equipe vem do cadastro do técnico (Técnicos → Equipe). Mudou valor, meta, equipes ou variáveis? Edite e escolha <b>a partir de qual ciclo</b> vale: os ciclos anteriores não mudam.</p>
    <div class="tabela-wrap"><table class="tab"><thead><tr><th>Contrato</th><th>Empresa</th><th>Equipes</th><th class="num">Fixo mensal</th><th class="num">Meta</th><th class="num">Excedente</th><th class="num">Variáveis</th><th>Ciclo atual</th></tr></thead><tbody>
    ${defs.map(linha).join('') || '<tr><td colspan="8" class="muted center">Nenhum contrato fixo.</td></tr>'}</tbody></table></div></div>`;
};

SN.editarContratoFixo = def => {
  const novo = !def, hoje = CFR.cicloDe(SN.agora());
  const ciclos = []; for (let i = 0, c = CFR.mover(hoje, -2); i <= 14; i++, c = CFR.mover(c, 1)) ciclos.push(c);
  const desdePadrao = novo ? hoje : CFR.mover(hoje, 1); // edição: por padrão vale do próximo ciclo
  const base = novo ? { equipes: null, valorMensal: '', metaAtividades: '', valorExcedente: '', variaveis: [], observacao: '' }
    : (CFR.versaoNoCiclo(def, desdePadrao) || (def.versoes || [])[0] || {});
  const vars = (base.variaveis || []).map(v => ({ ...v }));
  const hist = novo ? '' : `<details style="margin-top:10px"><summary class="small">Histórico de versões (${(def.versoes || []).length})</summary>
    <div class="tabela-wrap"><table class="tab small"><thead><tr><th>A partir do ciclo</th><th>Equipes</th><th class="num">Fixo</th><th class="num">Meta</th><th class="num">Excedente</th><th class="num">Variáveis</th></tr></thead><tbody>
    ${(def.versoes || []).slice().sort((a, b) => a.desde.localeCompare(b.desde)).map(v => `<tr><td class="nowrap">${v.encerrado ? '<b>Encerrado</b> · ' : ''}${SN.esc(CFR.rotulo(v.desde))}</td><td>${v.equipes && v.equipes.length ? SN.esc(v.equipes.join(', ')) : 'Empresa inteira'}</td>
      <td class="num nowrap">${SN.brl(v.valorMensal)}</td><td class="num">${v.metaAtividades || '—'}</td><td class="num nowrap">${SN.brl(v.valorExcedente)}</td><td class="num nowrap">${SN.brl((v.variaveis || []).reduce((s, x) => s + (Number(x.valor) || 0), 0))}</td></tr>`).join('')}</tbody></table></div></details>`;
  const pintarVars = f => {
    SN.$('#cfVars', f).innerHTML = vars.map((v, i) => `<div style="display:flex;gap:6px;margin-bottom:6px"><input class="inp" data-vd="${i}" style="flex:1;min-width:0" placeholder="Descrição da variável" value="${SN.esc(v.desc || '')}">
      <input class="inp" data-vv="${i}" type="number" min="0" step="0.01" style="width:120px" placeholder="R$" value="${v.valor ?? ''}"><button type="button" class="btn sm perigo" data-vx="${i}" title="Tirar esta variável">✕</button></div>`).join('') || '<p class="small muted" style="margin:0">Sem variáveis.</p>';
    SN.$$('[data-vd]', f).forEach(x => x.oninput = () => { vars[+x.dataset.vd].desc = x.value; });
    SN.$$('[data-vv]', f).forEach(x => x.oninput = () => { vars[+x.dataset.vv].valor = x.value; });
    SN.$$('[data-vx]', f).forEach(x => x.onclick = () => { vars.splice(+x.dataset.vx, 1); pintarVars(f); });
  };
  const num = v => v === '' || v == null ? 0 : Number(v) || 0;
  SN.modal({ titulo: novo ? 'Novo contrato fixo' : def.nome, largo: true, corpo: `<div class="linha-form">
      <div class="campo"><label>Empresa *</label><select class="inp" id="cfEmp" ${novo ? '' : 'disabled'}><option value="">Escolha…</option>${SN.opcoesEmpresas(novo ? '' : def.empresa)}</select></div>
      <div class="campo"><label>Nome do contrato *</label><input class="inp" id="cfNome" value="${SN.esc(novo ? '' : def.nome)}" placeholder="ex.: VAL · Diurno"></div>
      <div class="campo"><label>Conta contábil</label><select class="inp" id="cfConta">${SN.db.contas.map(c => `<option value="${c.codigo}" ${(novo ? c.codigo === '3.1.1.2.05.0008' : c.codigo === def.conta) ? 'selected' : ''}>${SN.esc(SN.contaTxt(c.codigo))}</option>`).join('')}</select></div></div>
    <div class="linha-form">
      <div class="campo"><label>Vale a partir do ciclo *</label><select class="inp" id="cfDesde">${ciclos.map(c => `<option value="${c}" ${c === desdePadrao ? 'selected' : ''}>${CFR.rotulo(c)}</option>`).join('')}</select>
        <div class="small muted">Os ciclos antes deste continuam com os valores de antes.</div></div>
      <div class="campo"><label>Equipes do contrato</label><input class="inp" id="cfEq" value="${SN.esc((base.equipes || []).join(', '))}" placeholder="ex.: Equipe 01, Equipe 04">
        <div class="small muted">Separe por vírgula. Vazio = a empresa inteira.</div></div></div>
    <div class="linha-form">
      <div class="campo"><label>Valor fixo mensal (R$) *</label><input class="inp" id="cfFixo" type="number" min="0" step="0.01" value="${base.valorMensal ?? ''}"></div>
      <div class="campo"><label>Meta de atividades por ciclo *</label><input class="inp" id="cfMeta" type="number" min="0" step="1" value="${base.metaAtividades ?? ''}"></div>
      <div class="campo"><label>Valor por atividade acima da meta (R$)</label><input class="inp" id="cfExc" type="number" min="0" step="0.01" value="${base.valorExcedente ?? ''}"></div></div>
    <div class="campo"><label>Variáveis do ciclo <span class="muted">(pagas quando o Service Desk marca "cumprido")</span></label><div id="cfVars"></div>
      <button type="button" class="btn sm" id="cfMaisVar" style="margin-top:4px">+ Variável</button></div>
    <div class="campo"><label>Observação</label><input class="inp" id="cfObs" value="${SN.esc(base.observacao || '')}"></div>
    ${novo ? '' : '<label class="small"><input type="checkbox" id="cfEnc"> Encerrar o contrato a partir deste ciclo (as equipes voltam à LPU com valor)</label>'}
    ${hist}`,
    aoAbrir: f => { pintarVars(f); SN.$('#cfMaisVar', f).onclick = () => { vars.push({ desc: '', valor: '' }); pintarVars(f); }; },
    botoes: [{ rot: 'Cancelar' }, { rot: 'Salvar', cls: 'prim', acao: f => {
      const emp = novo ? SN.$('#cfEmp', f).value : def.empresa, nome = SN.$('#cfNome', f).value.trim(), desde = SN.$('#cfDesde', f).value;
      const encerrado = !novo && SN.$('#cfEnc', f).checked;
      if (!emp || !nome) { SN.toast('Informe a empresa e o nome do contrato.', 'erro'); return false; }
      const v = { desde, equipes: SN.$('#cfEq', f).value.split(/[,;]/).map(s => s.trim()).filter(Boolean),
        valorMensal: num(SN.$('#cfFixo', f).value), metaAtividades: Math.round(num(SN.$('#cfMeta', f).value)), valorExcedente: num(SN.$('#cfExc', f).value),
        variaveis: vars.map(x => ({ desc: String(x.desc || '').trim(), valor: num(x.valor) })).filter(x => x.desc), observacao: SN.$('#cfObs', f).value.trim() };
      if (!v.equipes.length) v.equipes = null;
      if (encerrado) v.encerrado = true;
      else if (!(v.valorMensal > 0) || !(v.metaAtividades > 0)) { SN.toast('Informe o valor fixo e a meta de atividades.', 'erro'); return false; }
      const e = SN.db.empresas.find(x => x.nome === emp); if (!e) { SN.toast('Empresa não encontrada.', 'erro'); return false; }
      const id = novo ? (emp + '-' + nome).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') : def.id;
      if (novo && SN.cfDefs().some(x => x.id === id)) { SN.toast('Já existe um contrato com esse nome nesta empresa.', 'erro'); return false; }
      const antes = novo ? [] : JSON.parse(JSON.stringify(def.versoes || []));
      const d = { id, nome, empresa: emp, conta: SN.$('#cfConta', f).value, versoes: antes.filter(x => x.desde !== desde).concat([v]).sort((a, b) => a.desde.localeCompare(b.desde)) };
      if (!novo && def.ciclo) d.ciclo = def.ciclo;
      e.contratosFixos = (e.contratosFixos || []).filter(x => x.id !== id).concat([d]);
      SN.log(novo ? 'CRIAR_CONTRATO_FIXO' : 'EDITAR_CONTRATO_FIXO', nome, `${emp} · a partir de ${CFR.rotulo(desde)}` + (encerrado ? ' · encerrado'
        : ` · fixo ${SN.brl(v.valorMensal)} · meta ${v.metaAtividades} · excedente ${SN.brl(v.valorExcedente)} · equipes ${v.equipes ? v.equipes.join(', ') : 'todas'} · ${v.variaveis.length} variável(is)`));
      SN.salvar(); SN.toast(`${nome}: ${encerrado ? 'encerrado' : 'salvo'} a partir do ciclo ${CFR.rotulo(desde)}.`, 'ok'); SN.render(); } }] });
};
