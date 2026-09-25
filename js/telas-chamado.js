// SIGONET V2 — Login, Início e Tela do Chamado (fluxo operacional).

// ═══════════════════════════ Login ═══════════════════════════
SN.rota('/login', () => {
  if (SN.usuario()) { location.hash = SN.usuario().tipo === 'tecnico' ? '#/tec' : '#/inicio'; return; }
  const lids = SN.db.lideranca.filter(l => l.ativo).sort((a, b) => a.nome.localeCompare(b.nome));
  const emps = [...new Set(SN.db.tecnicos.filter(t => t.ativo).map(t => t.empresa))].sort();
  document.getElementById('app').innerHTML = `
  <div class="login-wrap"><div class="login-box">
    <div class="login-marca">
      <img class="login-logo" src="${MARCA.LOGO}" alt="SigoNet — Sistema Integrado de Gestão Operacional da Netturbo">
      <p class="small center">Field Desk · V2</p>
      <ul>
        <li>Chamado mede a operação: MTTD, MTTA, MTTR e SLA</li>
        <li>LPU, Materiais e Fibra com ciclos próprios</li>
        <li>Tudo rastreável pelo ID do chamado</li>
      </ul>
    </div>
    <div class="login-form">
      <div class="abas" id="abasLogin">
        <button class="aba ativa" data-t="lideranca">Painel de gestão</button>
        <button class="aba" data-t="tecnico">Técnico de campo</button>
      </div>
      <h2 id="lgTit">Acesso ao painel de gestão</h2>
      <p class="muted small" id="lgSub">Entre com seu nome, PIN e complemento pessoal.</p>
      <form id="fLogin" autocomplete="off">
        <div id="blocoLid">
          <div class="campo"><label>Nome</label><select class="inp" id="lgNome"><option value="">Selecione…</option>
            ${lids.map(l => `<option>${SN.esc(l.nome)}</option>`).join('')}</select></div>
        </div>
        <div id="blocoTec" class="oculto">
          <div class="campo"><label>Empresa</label><select class="inp" id="lgEmp"><option value="">Selecione…</option>
            ${emps.map(e => `<option>${SN.esc(e)}</option>`).join('')}</select></div>
          <div class="campo"><label>Técnico</label><select class="inp" id="lgTec"><option value="">Selecione a empresa</option></select></div>
        </div>
        <div class="campo"><label>PIN</label><input class="inp" id="lgPin" type="password" inputmode="numeric" placeholder="PIN fornecido pela gestão"></div>
        <div class="campo" id="cpComp"><label>Complemento</label><input class="inp" id="lgComp" type="password" placeholder="Sua senha pessoal"></div>
        <div id="cpNovo" class="oculto">
          <div class="aviso info small" style="margin-bottom:10px">Primeiro acesso: crie seu complemento pessoal (mín. 4 caracteres). Só você sabe — a gestão não vê.</div>
          <div class="campo"><label>Novo complemento</label><input class="inp" id="lgNovo" type="password"></div>
          <div class="campo"><label>Repita o complemento</label><input class="inp" id="lgNovo2" type="password"></div>
        </div>
        <button class="btn prim lg bloco" type="submit">Entrar</button>
        <p class="muted small" style="margin-top:12px">Esqueceu o complemento? Peça à gestão para resetar em Cadastros e Acessos.</p>
      </form>
    </div>
  </div></div>`;
  let tipo = 'lideranca', primeiro = false;
  SN.$$('#abasLogin .aba').forEach(b => b.onclick = () => {
    SN.$$('#abasLogin .aba').forEach(x => x.classList.toggle('ativa', x === b)); tipo = b.dataset.t; primeiro = false;
    SN.$('#blocoLid').classList.toggle('oculto', tipo !== 'lideranca'); SN.$('#blocoTec').classList.toggle('oculto', tipo !== 'tecnico');
    SN.$('#cpNovo').classList.add('oculto'); SN.$('#cpComp').classList.remove('oculto');
    SN.$('#lgTit').textContent = tipo === 'lideranca' ? 'Acesso ao painel de gestão' : 'Acesso do técnico';
    SN.$('#lgSub').textContent = tipo === 'lideranca' ? 'Entre com seu nome, PIN e complemento pessoal.' : 'Escolha sua empresa e seu nome.';
  });
  SN.$('#lgEmp').onchange = e => {
    const lista = SN.db.tecnicos.filter(t => t.ativo && t.empresa === e.target.value).sort((a, b) => a.nome.localeCompare(b.nome));
    SN.$('#lgTec').innerHTML = '<option value="">Selecione…</option>' + lista.map(t => `<option>${SN.esc(t.nome)}</option>`).join('');
  };
  SN.$('#fLogin').onsubmit = async ev => {
    ev.preventDefault();
    const dados = { tipo, pin: SN.$('#lgPin').value.trim(), complemento: SN.$('#lgComp').value,
      nome: tipo === 'lideranca' ? SN.$('#lgNome').value : SN.$('#lgTec').value, empresa: tipo === 'tecnico' ? SN.$('#lgEmp').value : '' };
    if (!dados.nome || !dados.pin) return SN.toast('Preencha nome e PIN.', 'erro');
    if (primeiro) {
      const a = SN.$('#lgNovo').value, b = SN.$('#lgNovo2').value;
      if (a !== b) return SN.toast('Os complementos não conferem.', 'erro');
      dados.novoComplemento = a;
    }
    try {
      const r = await SN.login(dados);
      if (r.primeiroAcesso) { primeiro = true; SN.$('#cpNovo').classList.remove('oculto'); SN.$('#cpComp').classList.add('oculto'); SN.$('#lgNovo').focus(); return; }
      location.hash = tipo === 'tecnico' ? '#/tec' : '#/inicio';
    } catch (e) { SN.toast(e.message, 'erro'); }
  };
});

// ═══════════════════════════ Início (hub) ═══════════════════════════
SN.rota('/inicio', () => {
  const d = SN.db, hoje = SN.agora().slice(0, 10);
  const abertos = d.chamados.filter(c => SN.STATUS[c.status].aberto);
  const cont = {
    chamados: d.chamados.filter(c => c.status === 'NAO_ATRIBUIDO').length,
    lpu: d.lpus.filter(l => l.status === 'AGUARDANDO_LIDER').length,
    servicedesk: d.lpus.filter(l => l.status === 'NO_SERVICE_DESK').length + d.pagamentos.filter(p => p.status !== 'PAGO').length,
    materiais: d.materiais.filter(m => ['REGISTRADO', 'CONFERIDO', 'DIVERGENTE'].includes(m.status)).length,
    fibra: d.fibras.filter(f => ['AGUARDANDO_VALIDACAO', 'PENDENTE_CADASTRO'].includes(f.status)).length
  };
  const cards = [
    ['chamados', '#/chamados', '📞', 'Chamados (NOC)', 'Abertura, classificação, despacho e fechamento. Mede MTTD/MTTA/MTTR/SLA.', 'não atribuídos'],
    ['lpu', '#/lpu', '📄', 'Gestão de LPU', 'Líder confere, edita (com log), aprova ou reprova e envia ao Service Desk.', 'aguardando líder'],
    ['servicedesk', '#/servicedesk', '🎧', 'Service Desk', 'Contabilização, conta contábil, tratativa de pagamento e NF.', 'pendências'],
    ['materiais', '#/materiais', '📦', 'Gestão de Materiais', 'Conferência, baixa SAP (mov. 261) e alocação ao cliente.', 'em aberto'],
    ['fibra', '#/fibra', '🧵', 'Cadastro de Fibra', 'Validação do líder e cadastro GEOGRID pela sala técnica.', 'em fila'],
    ['portal', '#/portal', '📊', 'Portal de Gestão', 'Indicadores, eficiência por técnico, relatórios e fechamento mensal.', ''],
    ['cadastros', '#/cadastros', '👥', 'Cadastros e Acessos', 'Técnicos, prestadores/CNPJ, liderança, telas, disponibilidade e budgets.', ''],
    ['auditoria', '#/auditoria', '🕑', 'Auditoria', 'Quem fez o quê e quando — e o log de integrações.', '']
  ].filter(c => SN.temTela(c[0]));
  const estourados = abertos.filter(c => SN.prazoInfo(c).estourado).length;
  SN.casca('inicio', `
    <div class="cab-pagina"><div><h1>Olá, ${SN.esc(SN.usuario().nome)}</h1>
      <p>Acesso rápido às telas do Sistema Integrado de Gestão Operacional da Netturbo.</p></div></div>
    <div class="grid g4" style="margin-bottom:16px">
      <div class="kpi destaque"><div class="rot">Chamados em aberto</div><div class="val">${abertos.length}</div><div class="sub">${cont.chamados} aguardando atribuição</div></div>
      <div class="kpi"><div class="rot">Estourados agora</div><div class="val" style="color:${estourados ? 'var(--erro)' : 'inherit'}">${estourados}</div><div class="sub">passaram do prazo limite</div></div>
      <div class="kpi"><div class="rot">Fechados hoje</div><div class="val">${d.chamados.filter(c => (c.tempos.fechamento || '').startsWith(hoje)).length}</div><div class="sub">validados pelo NOC</div></div>
      <div class="kpi"><div class="rot">Técnicos em campo</div><div class="val">${new Set(abertos.filter(c => ['EM_CAMPO', 'EM_DESLOCAMENTO'].includes(c.status)).map(c => c.tecnico)).size}</div><div class="sub">em deslocamento ou no local</div></div>
    </div>
    <div class="faixa" style="margin-bottom:16px">
      <div class="fluxo"><b style="margin-right:6px">Fluxo operacional:</b>
        ${['Abertura', 'Classificação', 'Despacho', 'Atendimento', 'Diagnóstico e tratamento', 'Conclusão técnica', 'Fechamento'].map(x => `<span>${x}</span>`).join('<span class="sep">›</span>')}</div>
      <div class="fluxo" style="margin-top:8px"><b style="margin-right:6px">Gestões vinculadas (ciclo próprio):</b>
        ${['LPU', 'Materiais', 'Cadastro de fibra', 'Validação', 'Financeiro'].map(x => `<span>${x}</span>`).join('<span class="sep">›</span>')}</div>
    </div>
    <div class="hub">${cards.map(([k, h, ico, t, desc, rot]) => `<a class="hub-card" href="${h}">
      ${cont[k] != null && rot ? `<span class="num" title="${rot}">${cont[k]}</span>` : ''}<span class="ico">${ico}</span><h3>${t}</h3><p>${desc}</p></a>`).join('')}</div>`);
});

// ═══════════════════════════ Classificação (cascata da matriz) ═══════════════════════════
// Monta selects Tipo → Cat1 → Cat2 → Cat3 → Cat4 restritos à matriz oficial.
SN.cascata = (el, valores, travados) => {
  const niveis = ['tipo', 'cat1', 'cat2', 'cat3', 'cat4'], rot = ['Tipo de Solicitação', 'Categoria 1', 'Categoria 2', 'Categoria 3', 'Categoria 4'];
  const v = { ...valores }; travados = travados || 0;
  const desenhar = () => {
    let html = '<div class="linha-form">';
    for (let i = 0; i < 5; i++) {
      const ops = SN.opcoesMatriz(i, v);
      if (i > 0 && !ops.length) { v[niveis[i]] = ''; continue; }
      if (v[niveis[i]] && !ops.includes(v[niveis[i]])) v[niveis[i]] = '';
      html += `<div class="campo"><label>${rot[i]}</label><select class="inp" data-n="${i}" ${i < travados ? 'disabled' : ''}>
        <option value="">Selecione…</option>${ops.map(o => `<option ${o === v[niveis[i]] ? 'selected' : ''}>${SN.esc(o)}</option>`).join('')}</select></div>`;
      if (!v[niveis[i]]) { for (let j = i + 1; j < 5; j++) v[niveis[j]] = ''; break; }
    }
    const sla = SN.slaDe(v.tipo, v.cat1, v.cat2, v.cat3, v.cat4);
    html += `</div><div class="small ${sla ? '' : 'muted'}">${sla ? `<span class="badge verde">SLA ${sla}h</span> definido pela matriz oficial` : 'Complete a classificação para definir o SLA.'}</div>`;
    el.innerHTML = html;
    SN.$$('select', el).forEach(s => s.onchange = () => { const n = +s.dataset.n; v[niveis[n]] = s.value; for (let j = n + 1; j < 5; j++) v[niveis[j]] = ''; desenhar(); el.dispatchEvent(new Event('mudou')); });
  };
  desenhar();
  return () => ({ ...v, sla: SN.slaDe(v.tipo, v.cat1, v.cat2, v.cat3, v.cat4) });
};

// Parser da máscara colada pelo NOC/Delivery (mesmos rótulos usados hoje).
SN.lerMascara = txt => {
  const r = {}; const pega = (re) => { const m = txt.match(re); return m ? m[1].trim() : ''; };
  r.motivo = pega(/motivo\s*:\s*(.+)/i);
  let cli = pega(/cliente(?:\s*\(id\))?\s*:\s*(.+)/i);
  const et = pega(/etiqueta\s*:\s*(\S+)/i) || (cli.match(/\(([A-Z0-9]{6,10})\)\s*$/) || [])[1] || (cli.match(/-\s*([A-Z0-9]{8})$/) || [])[1] || '';
  r.etiqueta = et; r.cliente = cli.replace(/\s*\([A-Z0-9]{6,10}\)\s*$/, '').trim();
  r.endereco = pega(/endere[cç]o\s*:\s*(.+)/i) || pega(/logradouro\s*:\s*(.+)/i);
  r.cidade = pega(/cidade\s*:\s*(.+)/i);
  r.gps = pega(/localiza[cç][aã]o\s*:\s*(\S+)/i);
  r.protocoloNoc = pega(/protocolo\s*(?:noc|asc)[^:]*:\s*(\d+)/i);
  r.protocoloOem = pega(/prot(?:ocolo)?\.?\s*:?\s*o&m\s*:\s*(\d+)/i);
  const duplo = txt.match(/protocolo\s*noc\s*\/\s*o[e&]m\s*:\s*(\d+)\s*[\/|]\s*(\d+)/i);
  if (duplo) { r.protocoloNoc = duplo[1]; r.protocoloOem = duplo[2]; }
  r.porta = pega(/porta\s*:\s*(.+)/i) || pega(/equipamento\s*:\s*(.+)/i);
  r.obs = pega(/obs\.?\s*:\s*(.+)/i);
  return r;
};

// ═══════════════════════════ Chamados (kanban NOC) ═══════════════════════════
SN.filtroTipoChamados = 'Todos';
SN.rota('/chamados', () => {
  const tipos = ['Todos', ...new Set(MATRIZ_SLA.map(m => m.tipo))];
  const hoje = SN.agora().slice(0, 10);
  const lista = SN.db.chamados.filter(c => SN.filtroTipoChamados === 'Todos' || c.tipo === SN.filtroTipoChamados || (!c.tipo && SN.filtroTipoChamados === 'Todos'));
  const cols = [
    ['Não atribuídas', c => c.status === 'NAO_ATRIBUIDO'],
    ['Despachadas', c => ['ATRIBUIDO', 'ACEITO', 'EM_DESLOCAMENTO'].includes(c.status)],
    ['Em campo', c => ['EM_CAMPO', 'DEVOLVIDO'].includes(c.status)],
    ['Conclusão técnica · aguardando fechamento', c => c.status === 'CONCLUIDO_TECNICO'],
    ['Fechadas hoje', c => c.status === 'FECHADO' && (c.tempos.fechamento || '').startsWith(hoje)]
  ];
  const card = c => {
    const p = SN.prazoInfo(c), u = SN.ultimaEtapa(c);
    return `<div class="os ${p.estourado ? 'estourado' : p.atencao ? 'atencao' : ''}" data-id="${c.id}">
      <div class="l1"><span class="mono">${c.id}</span><span>${SN.esc(c.tipo ? c.tipo.toUpperCase() : 'SEM CLASSIFICAÇÃO')}</span></div>
      <div class="cli">${SN.esc(c.cliente || '—')}</div>
      <div class="l3">${c.tecnico ? `👷 ${SN.esc(SN.nomeExibicao(c.tecnico))}` : '<span class="muted">sem técnico</span>'}
        ${c.protocoloOem || c.protocoloNoc ? `<span class="muted">#${SN.esc(c.protocoloOem || c.protocoloNoc)}</span>` : ''}</div>
      <div class="l3" style="margin-top:4px"><span class="badge ${p.cls}">${SN.esc(p.txt)}</span>
        ${u ? `<span class="muted">${u.n} ${SN.hora(u.ts)}</span>` : ''}</div></div>`;
  };
  const cont = t => SN.db.chamados.filter(c => SN.STATUS[c.status].aberto && (t === 'Todos' || c.tipo === t)).length;
  const despachaveis = SN.tecnicosDespacho();
  SN.casca('chamados', `
    <div class="cab-pagina"><div><h1>Chamados · fluxo operacional</h1>
      <p>O chamado conta a história do atendimento. Fecha quando a parte técnica termina — LPU, materiais e fibra seguem seus próprios fluxos.</p></div>
      <div class="acoes"><button class="btn" id="btnElleven" title="Simula uma OS recebida do ERP Elleven via webhook">⤓ Receber OS do Elleven</button>
        <button class="btn prim" id="btnNova">+ Nova OS</button></div></div>
    <div class="abas">${tipos.map(t => `<button class="aba ${t === SN.filtroTipoChamados ? 'ativa' : ''}" data-t="${t}">${t}<span class="n">${cont(t)}</span></button>`).join('')}</div>
    <div class="kanban">${cols.map(([nome, f]) => { const itens = lista.filter(f).sort((a, b) => (a.prazoLimite || 'z').localeCompare(b.prazoLimite || 'z'));
      return `<div class="coluna"><h4>${nome}<span class="badge">${itens.length}</span></h4>${itens.map(card).join('') || '<p class="muted small center">Vazio</p>'}</div>`; }).join('')}</div>
    <div class="card" style="margin-top:16px"><div class="card-tit"><h3>Mão de obra hoje</h3><span class="muted small">Titulares de dupla representam a equipe</span></div>
      <div class="tabela-wrap"><table class="tab"><thead><tr><th>Técnico / equipe</th><th>Empresa</th><th>Frente</th><th>Situação</th><th class="num">OS em aberto</th></tr></thead><tbody>
      ${despachaveis.sort((a, b) => a.empresa.localeCompare(b.empresa) || a.nome.localeCompare(b.nome)).map(t => { const ind = SN.indisponivel(t.nome); const carga = SN.cargaAberta(t.nome);
        const emCampo = SN.db.chamados.some(c => c.tecnico === t.nome && ['EM_CAMPO', 'EM_DESLOCAMENTO'].includes(c.status));
        return `<tr><td>${SN.esc(SN.nomeExibicao(t.nome))}</td><td>${SN.esc(t.empresa)}</td><td>${SN.esc(t.frente || '—')}</td>
          <td>${ind ? `<span class="badge erro">${MOTIVOS_DISPONIBILIDADE[ind.motivo]}</span>` : emCampo ? '<span class="badge verde">Em atividade</span>' : '<span class="badge">Disponível</span>'}</td>
          <td class="num">${carga}</td></tr>`; }).join('')}
      </tbody></table></div></div>`);
  SN.$$('.aba[data-t]').forEach(b => b.onclick = () => { SN.filtroTipoChamados = b.dataset.t; SN.render(); });
  SN.$$('.os').forEach(o => o.onclick = () => SN.navegar('#/chamado/' + o.dataset.id));
  SN.$('#btnNova').onclick = () => SN.novaOS();
  SN.$('#btnElleven').onclick = () => SN.novaOS({ origem: 'Elleven', motivo: 'POSSÍVEL ROMPIMENTO', cliente: 'CLIENTE EXEMPLO LTDA', etiqueta: 'AB12CD34',
    endereco: 'Av. Exemplo, 100', cidade: 'Campinas', protocoloOem: String(140000 + SN.db.chamados.length) });
});

SN.novaOS = (pre) => {
  pre = pre || {};
  let classif;
  SN.modal({ titulo: pre.origem === 'Elleven' ? 'OS recebida do Elleven (sem técnico)' : 'Nova OS', largo: true, corpo: `
    <div class="campo"><label>Colar máscara do NOC / Delivery (opcional — preenche os campos abaixo)</label>
      <textarea class="inp" id="nMasc" placeholder="MOTIVO: ...&#10;CLIENTE: ...&#10;ENDEREÇO: ...&#10;PROTOCOLO O&M: ..."></textarea></div>
    <div class="linha-form">
      <div class="campo"><label>Origem</label><select class="inp" id="nOrig">${['NOC', 'Delivery', 'Elleven'].map(o => `<option ${o === (pre.origem || 'NOC') ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="campo"><label>Protocolo NOC</label><input class="inp" id="nPNoc" value="${SN.esc(pre.protocoloNoc || '')}"></div>
      <div class="campo"><label>Protocolo O&amp;M</label><input class="inp" id="nPOem" value="${SN.esc(pre.protocoloOem || '')}"></div>
      <div class="campo"><label>Etiqueta / ID</label><input class="inp" id="nEt" value="${SN.esc(pre.etiqueta || '')}"></div>
    </div>
    <div class="linha-form">
      <div class="campo"><label>Cliente *</label><input class="inp" id="nCli" value="${SN.esc(pre.cliente || '')}"></div>
      <div class="campo"><label>Motivo</label><input class="inp" id="nMot" value="${SN.esc(pre.motivo || '')}"></div>
    </div>
    <div class="linha-form">
      <div class="campo"><label>Endereço</label><input class="inp" id="nEnd" value="${SN.esc(pre.endereco || '')}"></div>
      <div class="campo"><label>Cidade</label><input class="inp" id="nCid" value="${SN.esc(pre.cidade || '')}"></div>
      <div class="campo"><label>Localização (link do mapa)</label><input class="inp" id="nGps" value="${SN.esc(pre.gps || '')}"></div>
    </div>
    <div class="linha-form">
      <div class="campo"><label>Porta / equipamento</label><input class="inp" id="nPorta" value="${SN.esc(pre.porta || '')}"></div>
      <div class="campo"><label>Observações</label><input class="inp" id="nObs" value="${SN.esc(pre.obs || '')}"></div>
    </div>
    <h4 style="margin-top:6px">Classificação (define o SLA)</h4><div id="nClass"></div>
    <div class="campo"><label>Conta contábil</label><select class="inp" id="nConta"><option value="">Selecione…</option>
      ${SN.db.contas.map(c => `<option value="${c.codigo}">${SN.esc(SN.contaTxt(c.codigo))} (${c.grupo})</option>`).join('')}</select></div>`,
    botoes: [{ rot: 'Cancelar', valor: null }, { rot: 'Abrir chamado', cls: 'prim', acao: async () => {
      const cl = classif();
      const g = id => SN.$('#' + id).value.trim();
      if (!g('nCli')) { SN.toast('Informe o cliente.', 'erro'); return false; }
      const agora = SN.agora();
      let novoId; try { novoId = await SN.novoId('CH'); } catch (e) { SN.toast(e.message, 'erro'); return false; }
      const c = { id: novoId, origem: g('nOrig'), protocoloNoc: g('nPNoc'), protocoloOem: g('nPOem'), etiqueta: g('nEt'), cliente: g('nCli'),
        motivo: g('nMot'), endereco: g('nEnd'), cidade: g('nCid'), gps: g('nGps'), porta: g('nPorta'), obs: g('nObs'),
        tipo: '', cat1: '', cat2: '', cat3: '', cat4: '', slaHoras: null, prazoLimite: null, conta: g('nConta'),
        empresa: '', tecnico: '', apoio: null, status: 'NAO_ATRIBUIDO', tempos: { abertura: agora }, rfo: {}, fotos: [], historico: [] };
      if (cl.sla) SN.aplicarClassificacao(c, cl);
      SN.hist(c, 'Abertura', `Origem ${c.origem}`);
      SN.db.chamados.push(c); SN.log('ABRIR_CHAMADO', c.id, c.cliente);
      SN.int.ellevenStatus(c, 'Aberta (sem técnico)');
      SN.salvar(); SN.toast(`Chamado ${c.id} aberto — está em "Não atribuídas".`, 'ok');
      SN.render();
    } }],
    aoAbrir: f => {
      classif = SN.cascata(SN.$('#nClass', f), {});
      SN.$('#nClass', f).addEventListener('mudou', () => { const t = classif().tipo; if (t && !SN.$('#nConta', f).value) SN.$('#nConta', f).value = CONTA_PADRAO_POR_TIPO[t] || ''; });
      SN.$('#nMasc', f).oninput = () => {
        const r = SN.lerMascara(SN.$('#nMasc', f).value);
        const mapa = { nPNoc: 'protocoloNoc', nPOem: 'protocoloOem', nEt: 'etiqueta', nCli: 'cliente', nMot: 'motivo', nEnd: 'endereco', nCid: 'cidade', nGps: 'gps', nPorta: 'porta', nObs: 'obs' };
        Object.entries(mapa).forEach(([id, k]) => { if (r[k]) SN.$('#' + id, f).value = r[k]; });
      };
    }
  });
};

SN.aplicarClassificacao = (c, cl) => {
  const antes = [c.tipo, c.cat1, c.cat2, c.cat3, c.cat4].filter(Boolean).join(' › ');
  Object.assign(c, { tipo: cl.tipo, cat1: cl.cat1, cat2: cl.cat2 || '', cat3: cl.cat3 || '', cat4: cl.cat4 || '' });
  if (!c.tempos.classificacao) {
    // SLA e prazo limite são fixados na primeira classificação e nunca recalculados.
    c.tempos.classificacao = SN.agora(); c.slaHoras = cl.sla;
    c.prazoLimite = new Date(new Date(c.tempos.abertura).getTime() + cl.sla * 3600e3).toISOString();
  }
  if (!c.conta) c.conta = CONTA_PADRAO_POR_TIPO[cl.tipo] || '';
  SN.hist(c, 'Classificação', (antes ? antes + ' → ' : '') + [c.tipo, c.cat1, c.cat2, c.cat3, c.cat4].filter(Boolean).join(' › '));
};

SN.classificar = c => {
  let get;
  SN.modal({ titulo: 'Classificar chamado ' + c.id, largo: true, corpo: `<div id="cClass"></div>
      ${c.tempos.classificacao ? '<div class="aviso info small">O SLA/prazo limite já foi fixado na primeira classificação e não muda.</div>' : ''}
      <div class="campo" style="margin-top:10px"><label>Conta contábil</label><select class="inp" id="cConta">
      ${SN.db.contas.map(x => `<option value="${x.codigo}" ${x.codigo === c.conta ? 'selected' : ''}>${SN.esc(SN.contaTxt(x.codigo))}</option>`).join('')}</select></div>`,
    botoes: [{ rot: 'Cancelar' }, { rot: 'Salvar', cls: 'prim', acao: f => {
      const cl = get(); if (!cl.sla) { SN.toast('Complete a classificação.', 'erro'); return false; }
      SN.aplicarClassificacao(c, cl); c.conta = SN.$('#cConta', f).value;
      SN.log('CLASSIFICAR', c.id, [cl.tipo, cl.cat1, cl.cat2, cl.cat3].join(' › ')); SN.salvar(); SN.render();
    } }],
    aoAbrir: f => { get = SN.cascata(SN.$('#cClass', f), c); }
  });
};

SN.atribuir = c => {
  if (!c.tipo) { SN.toast('Classifique o chamado antes de despachar (define o SLA).', 'erro'); return SN.classificar(c); }
  const porEmp = {};
  SN.tecnicosDespacho().forEach(t => (porEmp[t.empresa] = porEmp[t.empresa] || []).push(t));
  const opts = sel => Object.keys(porEmp).sort().map(e => `<optgroup label="${SN.esc(e)}">${porEmp[e].sort((a, b) => a.nome.localeCompare(b.nome)).map(t => {
    const ind = SN.indisponivel(t.nome);
    return `<option value="${SN.esc(t.nome)}" ${ind ? 'disabled' : ''} ${t.nome === sel ? 'selected' : ''}>${SN.esc(SN.nomeExibicao(t.nome))} · ${SN.cargaAberta(t.nome)} OS${t.frente ? ' · ' + t.frente : ''}${ind ? ' · ' + MOTIVOS_DISPONIBILIDADE[ind.motivo] : ''}</option>`; }).join('')}</optgroup>`).join('');
  const todos = SN.db.tecnicos.filter(t => t.ativo).sort((a, b) => a.empresa.localeCompare(b.empresa) || a.nome.localeCompare(b.nome));
  SN.modal({ titulo: (c.tecnico ? 'Reatribuir ' : 'Atribuir ') + c.id, corpo: `
    <p class="small muted">${SN.esc(c.cliente)} · ${SN.esc(c.tipo)} · SLA ${c.slaHoras}h</p>
    <div class="campo"><label>Técnico titular</label><select class="inp" id="aTec"><option value="">Selecione…</option>${opts(c.tecnico)}</select></div>
    <div class="campo"><label>Equipe de apoio (opcional)</label><select class="inp" id="aApo"><option value="">Sem apoio</option>
      ${todos.map(t => `<option value="${SN.esc(t.empresa + '|' + t.nome)}" ${c.apoio && c.apoio.tecnico === t.nome ? 'selected' : ''}>${SN.esc(t.empresa)} · ${SN.esc(t.nome)}</option>`).join('')}</select></div>
    <p class="small muted">Técnicos indisponíveis hoje (férias, atestado etc.) ficam bloqueados. Pode reatribuir a qualquer momento antes da conclusão técnica.</p>`,
    botoes: [{ rot: 'Cancelar' }, { rot: 'Despachar', cls: 'prim', acao: f => {
      const nome = SN.$('#aTec', f).value; if (!nome) { SN.toast('Escolha o técnico.', 'erro'); return false; }
      const t = SN.tecnico(nome), apo = SN.$('#aApo', f).value;
      const anterior = c.tecnico;
      c.tecnico = t.nome; c.empresa = t.empresa;
      c.apoio = apo ? { empresa: apo.split('|')[0], tecnico: apo.split('|').slice(1).join('|') } : null;
      if (!c.tempos.atribuicao) c.tempos.atribuicao = SN.agora();
      if (anterior && anterior !== t.nome) { // reatribuição: o novo técnico recomeça aceite/deslocamento
        ['aceite', 'deslocamento', 'chegada'].forEach(k => delete c.tempos[k]); c.status = 'ATRIBUIDO';
      } else if (c.status === 'NAO_ATRIBUIDO') c.status = 'ATRIBUIDO';
      SN.hist(c, anterior ? 'Reatribuição' : 'Despacho', `${anterior ? anterior + ' → ' : ''}${t.nome} (${t.empresa})${c.apoio ? ' · apoio ' + c.apoio.tecnico : ''}`);
      SN.log(anterior ? 'REATRIBUIR' : 'DESPACHAR', c.id, t.nome);
      SN.int.ellevenStatus(c, 'Atribuída');
      SN.salvar(); SN.toast('Chamado enviado para a fila do técnico.', 'ok'); SN.render();
    } }]
  });
};

// ═══════════════════════════ Detalhe do chamado ═══════════════════════════
SN.rota('/chamado/:id', id => {
  const c = SN.db.chamados.find(x => x.id === id);
  if (!c) { SN.toast('Chamado não encontrado.', 'erro'); return SN.navegar('#/chamados'); }
  const m = SN.metricas(c), p = SN.prazoInfo(c), mod = SN.modulosDo(c.id);
  const atual = SN.ultimaEtapa(c);
  let anterior = null;
  const etapas = SN.ETAPAS.map(([k, n], i) => {
    const ts = c.tempos[k]; const dur = ts && anterior ? SN.min(anterior, ts) : null; if (ts) anterior = ts;
    return `<div class="etapa ${ts ? 'feita' : ''} ${atual && atual.k === k && c.status !== 'FECHADO' ? 'atual' : ''}"><div class="bola">${ts ? '✓' : i + 1}</div>
      <div class="nome">${n}</div><div class="hora">${ts ? SN.dt(ts) : '—'}</div>${dur != null ? `<div class="dur">+${SN.dur(dur)}</div>` : ''}</div>`;
  }).join('');
  const aberto = SN.STATUS[c.status].aberto;
  const linhaMod = (rotulo, lista, mapa, rota, valor) => `<tr><td><b>${rotulo}</b></td><td>${lista.length ? lista.map(x =>
    `<a href="#/${rota}/${x.id}">${x.id}</a> ${SN.badge(mapa, x.status)}${valor ? ' · ' + valor(x) : ''}${x.papel === 'apoio' ? ' <span class="badge">APOIO</span>' : ''}`).join('<br>') : '<span class="muted">Nenhum registro</span>'}</td></tr>`;
  SN.casca('chamados', `
    <div class="cab-pagina"><div><a href="#/chamados" class="small">← Chamados</a>
      <h1>${c.id} · ${SN.esc(c.cliente)}</h1>
      <p>${SN.badgeStatus(c.status)} <span class="badge ${p.cls}">${SN.esc(p.txt)}</span> ${c.tipo ? `<span class="badge verde">${SN.esc(c.tipo)} · SLA ${c.slaHoras}h</span>` : '<span class="badge alerta">Sem classificação</span>'}</p></div>
      <div class="acoes">
        ${aberto && c.status !== 'CONCLUIDO_TECNICO' ? `<button class="btn" id="bClass">${c.tipo ? 'Reclassificar' : 'Classificar'}</button><button class="btn prim" id="bAtr">${c.tecnico ? 'Reatribuir' : 'Atribuir técnico'}</button>` : ''}
        ${c.status === 'CONCLUIDO_TECNICO' ? `<button class="btn perigo" id="bDev">Devolver ao técnico</button><button class="btn ok" id="bFechar">Fechar chamado</button>` : ''}
        ${aberto && c.status !== 'CONCLUIDO_TECNICO' ? '<button class="btn perigo" id="bCanc">Cancelar</button>' : ''}
        <button class="btn" id="bPdf">PDF do atendimento</button></div></div>
    ${(() => { const ant = SN.reincidencia(c); if (!ant) return '';
      const dias = Math.round((new Date(c.tempos.abertura) - new Date(ant.tempos.conclusaoTecnica || ant.tempos.fechamento)) / 864e5);
      return `<div class="aviso alerta" style="margin-bottom:12px">⚠ <b>Reincidente (IRR)</b>: a etiqueta ${SN.esc(SN.etiquetaIrr(c))} teve o chamado
        <a href="#/chamado/${ant.id}">${ant.id}</a> encerrado ${dias} dia(s) antes desta abertura${ant.tecnico ? ` · atendido por ${SN.esc(SN.nomeExibicao(ant.tecnico))}` : ''}${ant.rfo && ant.rfo.causa ? ` · causa: ${SN.esc(ant.rfo.causa)}` : ''}.</div>`; })()}
    <div class="card"><div class="timeline">${etapas}</div></div>
    <div class="grid g6" style="margin-top:14px">
      <div class="kpi"><div class="rot">MTTD</div><div class="val">${SN.dur(m.mttd)}</div><div class="sub">abertura → despacho</div></div>
      <div class="kpi"><div class="rot">MTTA</div><div class="val">${SN.dur(m.mtta)}</div><div class="sub">despacho → em campo</div></div>
      <div class="kpi"><div class="rot">MTTR</div><div class="val">${SN.dur(m.mttr)}</div><div class="sub">abertura → conclusão técnica</div></div>
      <div class="kpi"><div class="rot">Tempo em campo</div><div class="val">${SN.dur(m.tmc)}</div><div class="sub">chegada → conclusão</div></div>
      <div class="kpi"><div class="rot">SLA</div><div class="val" style="color:${m.sla === false ? 'var(--erro)' : m.sla ? 'var(--ok)' : 'inherit'}">${m.sla == null ? '—' : m.sla ? 'Dentro' : 'Fora'}</div><div class="sub">prazo ${SN.dt(c.prazoLimite)}</div></div>
      ${(() => { if (SN.empresa(c.empresa).vinculo !== 'CLT') return `<div class="kpi"><div class="rot">Origem</div><div class="val" style="font-size:1.2rem">${SN.esc(c.origem)}</div><div class="sub">aberto ${SN.dt(c.tempos.abertura)}</div></div>`;
        const hh = SN.horaHomem(c, 'titular');
        return `<div class="kpi"><div class="rot">Hora-homem</div><div class="val">${hh.pendente ? '—' : SN.num(hh.horas, 1)}</div><div class="sub">automática · (desloc. + campo) × ${hh.pessoas} pessoa(s)</div></div>`; })()}
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>Dados do atendimento</h3><table class="tab"><tbody>
        <tr><td class="muted">Origem</td><td>${SN.esc(c.origem)} · aberto ${SN.dt(c.tempos.abertura)}</td></tr>
        <tr><td class="muted">Protocolos</td><td>NOC ${SN.esc(c.protocoloNoc || '—')} · O&amp;M ${SN.esc(c.protocoloOem || '—')}</td></tr>
        <tr><td class="muted">Etiqueta</td><td>${SN.esc(c.etiqueta || '—')}</td></tr>
        <tr><td class="muted">Motivo</td><td>${SN.esc(c.motivo || '—')}</td></tr>
        <tr><td class="muted">Endereço</td><td>${SN.esc(c.endereco || '—')} ${SN.esc(c.cidade || '')} ${c.gps ? `· <a href="${SN.esc(c.gps)}" target="_blank" rel="noopener">mapa</a>` : ''}</td></tr>
        <tr><td class="muted">Porta</td><td>${SN.esc(c.porta || '—')}</td></tr>
        <tr><td class="muted">Obs.</td><td>${SN.esc(c.obs || '—')}</td></tr></tbody></table></div>
      <div class="card"><h3>Classificação e equipe</h3><table class="tab"><tbody>
        <tr><td class="muted">Categoria</td><td>${SN.esc([c.cat1, c.cat2, c.cat3, c.cat4].filter(Boolean).join(' › ') || '—')}</td></tr>
        <tr><td class="muted">Conta contábil</td><td>${SN.esc(SN.contaTxt(c.conta))}</td></tr>
        <tr><td class="muted">Técnico</td><td>${SN.esc(c.tecnico ? SN.nomeExibicao(c.tecnico) + ' · ' + c.empresa : '—')}</td></tr>
        <tr><td class="muted">Apoio</td><td>${SN.esc(c.apoio ? c.apoio.tecnico + ' · ' + c.apoio.empresa : '—')}</td></tr>
        <tr><td class="muted">GPS chegada</td><td>${c.gpsChegada ? `<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${c.gpsChegada}">${SN.esc(c.gpsChegada)}</a>` : '—'}</td></tr></tbody></table></div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>RFO · causa, ação e solução</h3>
        ${c.rfo && c.rfo.causa ? `<table class="tab"><tbody><tr><td class="muted">Causa</td><td>${SN.esc(c.rfo.causa)}</td></tr>
          <tr><td class="muted">Ação</td><td>${SN.esc(c.rfo.acao)}</td></tr><tr><td class="muted">Solução</td><td>${SN.esc(c.rfo.solucao)}</td></tr>
          ${c.rfo.localFalha || c.rfo.gpsFalha ? `<tr><td class="muted">Local da falha</td><td>${SN.esc(c.rfo.localFalha || '')}
            ${c.rfo.gpsFalha ? `${c.rfo.localFalha ? '<br>' : ''}<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${SN.esc(c.rfo.gpsFalha.lat + ',' + c.rfo.gpsFalha.lng)}">📍 ${SN.esc(c.rfo.gpsFalha.lat + ',' + c.rfo.gpsFalha.lng)}</a>` : ''}</td></tr>` : ''}
          ${c.rfo.obs ? `<tr><td class="muted">Observações</td><td>${SN.esc(c.rfo.obs)}</td></tr>` : ''}</tbody></table>` : '<p class="muted">Ainda não preenchido pelo técnico.</p>'}
        ${c.motivoDevolucao ? `<div class="aviso erro small" style="margin-top:8px">Devolvido: ${SN.esc(c.motivoDevolucao)}</div>` : ''}
        <h4 style="margin-top:12px">Fotos e evidências</h4><div class="fotos" id="fotosCh"></div></div>
      <div class="card"><h3>Gestões vinculadas <span class="muted small">(ciclo próprio · não alteram MTTR/SLA)</span></h3>
        <table class="tab"><tbody>
          ${linhaMod('LPU', mod.lpus, SN.LPU_STATUS, 'lpu', x => x.vinculo === 'PRESTADOR' ? SN.brl(SN.valorLpu(x)) : x.vinculo === 'CLT' ? SN.hhTxt(SN.hhDaLpu(x)) : 'produção')}
          ${linhaMod('Materiais', mod.materiais, SN.MAT_STATUS, 'materiais', x => x.itens.length + ' item(ns)')}
          ${linhaMod('Cadastro de fibra', mod.fibras, SN.FIB_STATUS, 'fibra', x => x.ceos.length + ' CEO')}
        </tbody></table>
        <p class="small muted" style="margin-top:8px">A única correlação obrigatória é o ID do chamado. Cada gestão tem status, fila, validação e fechamento próprios.</p></div>
    </div>
    <div class="card" style="margin-top:14px"><h3>Histórico</h3><div class="tabela-wrap"><table class="tab"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>
      ${(c.historico || []).slice().reverse().map(h => `<tr><td class="nowrap">${SN.dt(h.ts)}</td><td>${SN.esc(h.usuario)}</td><td>${SN.esc(h.acao)}</td><td>${SN.esc(h.detalhe)}</td></tr>`).join('')}
    </tbody></table></div></div>`);
  SN.pintarFotos(SN.$('#fotosCh'), c.fotos || []);
  const b = id => SN.$('#' + id);
  b('bClass') && (b('bClass').onclick = () => SN.classificar(c));
  b('bAtr') && (b('bAtr').onclick = () => SN.atribuir(c));
  b('bFechar') && (b('bFechar').onclick = async () => {
    if (!await SN.confirmar('Fechar chamado', 'Confirmar o fechamento operacional? O MTTR já foi medido na conclusão técnica. LPU, materiais e fibra continuam seus fluxos normalmente.', 'Fechar')) return;
    c.status = 'FECHADO'; c.tempos.fechamento = SN.agora(); SN.hist(c, 'Fechamento', 'Validado pelo NOC');
    SN.log('FECHAR_CHAMADO', c.id, ''); SN.int.ellevenStatus(c, 'Concluída'); SN.salvar(); SN.toast('Chamado fechado.', 'ok'); SN.render();
  });
  b('bDev') && (b('bDev').onclick = async () => {
    const mot = await SN.pedirTexto('Devolver ao técnico', 'O que precisa ser corrigido/concluído? (o tempo do chamado volta a correr)');
    if (!mot) return;
    c.status = 'DEVOLVIDO'; c.motivoDevolucao = mot; delete c.tempos.conclusaoTecnica;
    SN.hist(c, 'Devolvido ao técnico', mot); SN.log('DEVOLVER_CHAMADO', c.id, mot); SN.salvar(); SN.render();
  });
  b('bCanc') && (b('bCanc').onclick = async () => {
    const mot = await SN.pedirTexto('Cancelar chamado', 'Motivo do cancelamento'); if (!mot) return;
    c.status = 'CANCELADO'; c.tempos.fechamento = SN.agora(); SN.hist(c, 'Cancelado', mot); SN.log('CANCELAR_CHAMADO', c.id, mot);
    SN.int.ellevenStatus(c, 'Cancelada'); SN.salvar(); SN.render();
  });
  b('bPdf').onclick = () => SN.pdfChamado(c, true);
});

// PDF do atendimento (história operacional). Também é gerado ao concluir.
SN.pdfChamado = (c, abrir) => {
  const doc = SN.novoPdf('Relatório de atendimento · ' + c.id); if (!doc) return null;
  const m = SN.metricas(c);
  doc.secao('Identificação');
  doc.linha('Cliente', c.cliente); doc.linha('Etiqueta', c.etiqueta); doc.linha('Protocolos', `NOC ${c.protocoloNoc || '—'} · O&M ${c.protocoloOem || '—'}`);
  doc.linha('Endereço', [c.endereco, c.cidade].filter(Boolean).join(' - ')); doc.linha('Classificação', [c.tipo, c.cat1, c.cat2, c.cat3, c.cat4].filter(Boolean).join(' > '));
  doc.linha('Técnico', c.tecnico ? `${c.tecnico} (${c.empresa})` : '—'); if (c.apoio) doc.linha('Apoio', `${c.apoio.tecnico} (${c.apoio.empresa})`);
  doc.secao('Linha do tempo');
  SN.ETAPAS.forEach(([k, n]) => doc.linha(n, SN.dt(c.tempos[k])));
  doc.secao('Indicadores');
  doc.linha('MTTD / MTTA', `${SN.dur(m.mttd)} / ${SN.dur(m.mtta)}`); doc.linha('MTTR / Em campo', `${SN.dur(m.mttr)} / ${SN.dur(m.tmc)}`);
  doc.linha('SLA', m.sla == null ? '—' : m.sla ? 'Dentro do prazo' : 'Fora do prazo');
  doc.secao('RFO');
  doc.linha('Causa', c.rfo.causa); doc.linha('Ação', c.rfo.acao); doc.linha('Solução', c.rfo.solucao);
  if (c.rfo.localFalha || c.rfo.gpsFalha) doc.linha('Local da falha', [c.rfo.localFalha, c.rfo.gpsFalha && 'GPS ' + c.rfo.gpsFalha.lat + ',' + c.rfo.gpsFalha.lng].filter(Boolean).join(' · '));
  if (c.rfo.obs) doc.linha('Observações', c.rfo.obs);
  if (abrir) window.open(doc.output('bloburl'));
  return doc;
};
