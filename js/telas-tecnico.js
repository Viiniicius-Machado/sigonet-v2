// SIGONET V2 — App do técnico (uma única jornada, simples como aplicativo).
// Receber → aceitar → deslocar → chegar (GPS) → RFO + fotos → apontar LPU /
// materiais / fibra → concluir. O técnico não precisa conhecer a parte
// administrativa: cada botão abre seu módulo com o cabeçalho já preenchido.

SN.cascaTec = (ativo, html, titulo) => {
  const u = SN.usuario();
  const emp = SN.empresa(u.empresa);
  const fin = emp.vinculo === 'PRESTADOR' && (!emp.responsavelLpu || emp.responsavelLpu === u.nome);
  document.getElementById('app').innerHTML = `<div class="app-tec">
    <header class="topbar"><div class="marca"><img class="topbar-logo" src="${MARCA.LETRAS}" alt="SigoNet"></div><div class="espaco"></div>
      ${SN.remoto ? '<span class="chip-user small" id="sync">●</span>' : ''}
      <div class="chip-user">${SN.esc(SN.nomeExibicao(u.nome))} <button id="btnSair">Sair</button></div></header>
    <div class="tec-corpo">${titulo ? `<h2>${titulo}</h2>` : ''}${html}</div>
    <nav class="tabbar">
      <a href="#/tec" class="${ativo === 'fila' ? 'ativo' : ''}"><span class="ico">📋</span>Minha fila</a>
      <a href="#/tec/resumo" class="${ativo === 'resumo' ? 'ativo' : ''}"><span class="ico">📈</span>Meu resumo</a>
      ${fin ? `<a href="#/tec/financeiro" class="${ativo === 'fin' ? 'ativo' : ''}"><span class="ico">💰</span>Financeiro</a>` : ''}
    </nav></div>`;
  SN.$('#btnSair').onclick = SN.sair;
};

// Chamados que o técnico logado enxerga: os dele, os da dupla (mesma equipe)
// e os em que ele é apoio.
SN.meusNomes = () => { const u = SN.usuario(); return [u.nome, ...SN.parceiros(u).map(p => p.nome)]; };
SN.papelNo = c => {
  const nomes = SN.meusNomes();
  if (nomes.includes(c.tecnico)) return 'titular';
  if (c.apoio && nomes.includes(c.apoio.tecnico)) return 'apoio';
  return null;
};
// Quem registra LPU: se a empresa centraliza num responsável, só ele.
SN.podeLpu = (c, papel) => {
  const u = SN.usuario(); const emp = SN.empresa(papel === 'apoio' ? c.apoio.empresa : c.empresa);
  if (emp.responsavelLpu) return emp.responsavelLpu === u.nome;
  return SN.papelNo(c) === papel;
};
SN.faseModulos = c => ['EM_CAMPO', 'DEVOLVIDO', 'CONCLUIDO_TECNICO', 'FECHADO'].includes(c.status);

// ═══════════════════════════ Fila ═══════════════════════════
SN.rota('/tec', () => {
  const u = SN.usuario();
  const minhas = SN.db.chamados.filter(c => SN.papelNo(c));
  const ativas = minhas.filter(c => ['ATRIBUIDO', 'ACEITO', 'EM_DESLOCAMENTO', 'EM_CAMPO', 'DEVOLVIDO'].includes(c.status))
    .sort((a, b) => (a.prazoLimite || 'z').localeCompare(b.prazoLimite || 'z'));
  // Pós-atendimento: concluídas com LPU/materiais/fibra ainda por apontar (não bloqueiam o chamado).
  const pos = minhas.filter(c => ['CONCLUIDO_TECNICO', 'FECHADO'].includes(c.status) && SN.pendenciasPos(c).length)
    .sort((a, b) => (b.tempos.conclusaoTecnica || '').localeCompare(a.tempos.conclusaoTecnica || ''));
  const emp = SN.empresa(u.empresa);
  const lpuEquipe = emp.responsavelLpu === u.nome ? SN.db.chamados.filter(c => !SN.papelNo(c) && ['CONCLUIDO_TECNICO', 'FECHADO'].includes(c.status) &&
    ((c.empresa === u.empresa && !SN.db.lpus.some(l => l.chamadoId === c.id && l.papel === 'titular')) ||
     (c.apoio && c.apoio.empresa === u.empresa && !SN.db.lpus.some(l => l.chamadoId === c.id && l.papel === 'apoio')))) : [];
  const card = c => {
    const p = SN.prazoInfo(c), papel = SN.papelNo(c) || 'titular';
    return `<div class="tec-os ${p.estourado ? 'estourado' : ''}" data-id="${c.id}">
      <div class="small muted" style="display:flex;justify-content:space-between"><span class="mono">${c.id}${c.protocoloOem ? ' · #' + SN.esc(c.protocoloOem) : ''}</span>${SN.badgeStatus(c.status)}</div>
      <div class="cli">${SN.esc(c.cliente)}</div>
      <div class="small">${SN.esc(c.tipo || '')}${c.cat2 ? ' · ' + SN.esc(c.cat2) : ''}</div>
      <div class="small muted">📍 ${SN.esc([c.endereco, c.cidade].filter(Boolean).join(' - ') || '—')}</div>
      <div style="margin-top:6px"><span class="badge ${p.cls}">${SN.esc(p.txt)}</span> ${papel === 'apoio' ? '<span class="badge">APOIO</span>' : ''}
        ${SN.pendenciasPos(c).map(x => `<span class="badge alerta">${x}</span>`).join(' ')}</div></div>`;
  };
  const novas = ativas.filter(c => c.status === 'ATRIBUIDO').length;
  SN.cascaTec('fila', `
    ${novas ? `<div class="aviso ok" style="margin-bottom:10px">🔔 Você recebeu ${novas} nova(s) OS. Toque para aceitar.</div>` : ''}
    <h3>Em andamento (${ativas.length})</h3>${ativas.map(card).join('') || '<p class="muted">Nenhuma OS na sua fila agora.</p>'}
    ${pos.length ? `<h3 style="margin-top:18px">Pós-atendimento (${pos.length})</h3><p class="small muted">Chamado já concluído — falta apontar. Isso não altera seu MTTR/SLA.</p>${pos.map(card).join('')}` : ''}
    ${lpuEquipe.length ? `<h3 style="margin-top:18px">LPU da equipe ${SN.esc(u.empresa)} (${lpuEquipe.length})</h3><p class="small muted">Você é o responsável pela LPU da empresa.</p>
      ${lpuEquipe.map(c => { const papel = c.empresa === u.empresa ? 'titular' : 'apoio'; return `<div class="tec-os" data-lpu="${c.id}" data-papel="${papel}">
        <div class="small muted">${c.id} · ${SN.esc(papel === 'apoio' ? c.apoio.tecnico : c.tecnico)}</div><div class="cli">${SN.esc(c.cliente)}</div>
        <span class="badge alerta">LPU pendente</span></div>`; }).join('')}` : ''}`);
  SN.$$('.tec-os[data-id]').forEach(el => el.onclick = () => SN.navegar('#/tec/os/' + el.dataset.id));
  SN.$$('.tec-os[data-lpu]').forEach(el => el.onclick = () => SN.navegar(`#/tec/lpu/${el.dataset.lpu}/${el.dataset.papel}`));
}, { familia: 'tecnico' });

SN.pendenciasPos = c => {
  const papel = SN.papelNo(c); if (!papel || !SN.faseModulos(c)) return [];
  const out = [];
  if (SN.podeLpu(c, papel) && !SN.db.lpus.some(l => l.chamadoId === c.id && l.papel === papel)) out.push('LPU');
  const fib = SN.db.fibras.find(f => f.chamadoId === c.id);
  if (fib && fib.status === 'CORRECAO') out.push('Corrigir fibra');
  const lp = SN.db.lpus.find(l => l.chamadoId === c.id && l.papel === papel);
  if (lp && lp.status === 'REPROVADA') out.push('LPU reprovada');
  return out;
};

// ═══════════════════════════ OS ═══════════════════════════
SN.rota('/tec/os/:id', id => {
  const c = SN.db.chamados.find(x => x.id === id);
  const papel = c && SN.papelNo(c);
  if (!c || !papel) { SN.toast('OS não encontrada na sua fila.', 'erro'); return SN.navegar('#/tec'); }
  const titular = papel === 'titular';
  const p = SN.prazoInfo(c);
  const emCampo = ['EM_CAMPO', 'DEVOLVIDO'].includes(c.status);
  const mod = SN.modulosDo(c.id);
  const lpu = mod.lpus.find(l => l.papel === papel), mat = mod.materiais.find(l => l.papel === papel), fib = mod.fibras[0];
  const libera = SN.faseModulos(c);
  const temFibra = TIPOS_COM_FIBRA.includes(c.tipo);
  const acao = {
    ATRIBUIDO: ['aceitar', '✅ Aceitar OS'], ACEITO: ['deslocar', '🚗 Iniciar deslocamento'], EM_DESLOCAMENTO: ['chegar', '📍 Cheguei no local']
  }[c.status];
  SN.cascaTec('fila', `
    <a href="#/tec" class="small">← Minha fila</a>
    <div class="tec-os ${p.estourado ? 'estourado' : ''}" style="margin-top:8px">
      <div class="small muted" style="display:flex;justify-content:space-between"><span class="mono">${c.id}</span>${SN.badgeStatus(c.status)}</div>
      <div class="cli">${SN.esc(c.cliente)}</div>
      <div class="small">${SN.esc([c.tipo, c.cat1, c.cat2, c.cat3, c.cat4].filter(Boolean).join(' › '))}</div>
      <div style="margin:6px 0"><span class="badge ${p.cls}">${SN.esc(p.txt)}</span> ${!titular ? '<span class="badge">Você é APOIO</span>' : ''}</div>
      <table class="tab" style="margin-top:6px"><tbody>
        <tr><td class="muted">Motivo</td><td>${SN.esc(c.motivo || '—')}</td></tr>
        <tr><td class="muted">Endereço</td><td>${SN.esc([c.endereco, c.cidade].filter(Boolean).join(' - ') || '—')}
          ${c.gps ? `<br><a href="${SN.esc(c.gps)}" target="_blank" rel="noopener">Abrir no mapa</a>` : ''}</td></tr>
        <tr><td class="muted">Etiqueta</td><td>${SN.esc(c.etiqueta || '—')}</td></tr>
        <tr><td class="muted">Protocolos</td><td>NOC ${SN.esc(c.protocoloNoc || '—')} · O&amp;M ${SN.esc(c.protocoloOem || '—')}</td></tr>
        <tr><td class="muted">Porta</td><td>${SN.esc(c.porta || '—')}</td></tr>
        ${c.obs ? `<tr><td class="muted">Obs.</td><td>${SN.esc(c.obs)}</td></tr>` : ''}
      </tbody></table>
    </div>
    ${c.status === 'DEVOLVIDO' ? `<div class="aviso erro" style="margin-bottom:10px">NOC devolveu: ${SN.esc(c.motivoDevolucao)}</div>` : ''}
    ${titular && acao ? `<button class="btn prim lg bloco" id="bAcao">${acao[1]}</button>` : ''}
    ${titular && emCampo ? `
      <div class="card" style="margin-top:12px"><h3>Diagnóstico e tratamento</h3>
        <p class="small muted">Categoria 1 veio do despacho e não muda. Ajuste as demais se o que encontrou em campo for diferente.</p>
        <div id="tecClass"></div>
        <div class="campo"><label>Causa *</label><textarea class="inp" id="rCausa">${SN.esc(c.rfo.causa || '')}</textarea></div>
        <div class="campo"><label>Ação realizada *</label><textarea class="inp" id="rAcao">${SN.esc(c.rfo.acao || '')}</textarea></div>
        <div class="campo"><label>Solução *</label><textarea class="inp" id="rSol">${SN.esc(c.rfo.solucao || '')}</textarea></div>
        <div class="campo"><label>Local da falha</label><input class="inp" id="rLocal" value="${SN.esc(c.rfo.localFalha || '')}"></div>
        <div class="campo"><label>Observações</label><textarea class="inp" id="rObs">${SN.esc(c.rfo.obs || '')}</textarea></div>
        <h4>Fotos e evidências</h4><div class="fotos" id="tecFotos"></div>
        <label class="btn bloco" style="margin-top:8px">📷 Tirar / anexar fotos<input type="file" id="inFoto" accept="image/*,application/pdf" multiple capture="environment" hidden></label>
        <button class="btn bloco" id="bSalvarRfo" style="margin-top:8px">Salvar RFO</button>
      </div>` : ''}
    ${libera ? `<div class="card" style="margin-top:12px"><h3>Apontamentos</h3>
      <p class="small muted">Cada um tem vida própria: salvar fecha a tela e segue para a gestão, sem prender o chamado.</p>
      <div class="modulos">
        ${SN.podeLpu(c, papel) ? `<div class="modulo ${lpu ? 'feito' : ''}" data-go="#/tec/lpu/${c.id}/${papel}"><span class="ico">📄</span>LPU<span class="st">${lpu ? SN.LPU_STATUS[lpu.status].rot : 'Apontar serviços'}</span></div>`
          : `<div class="modulo bloq" title="A LPU da sua empresa é feita pelo responsável"><span class="ico">📄</span>LPU<span class="st">pelo responsável</span></div>`}
        <div class="modulo ${mat ? 'feito' : ''}" data-go="#/tec/mat/${c.id}/${papel}"><span class="ico">📦</span>Materiais<span class="st">${mat ? SN.MAT_STATUS[mat.status].rot : 'Apontar uso'}</span></div>
        ${temFibra ? `<div class="modulo ${fib ? 'feito' : ''}" data-go="#/tec/fibra/${c.id}"><span class="ico">🧵</span>Cadastro de fibra<span class="st">${fib ? SN.FIB_STATUS[fib.status].rot : 'Se houve fusão'}</span></div>`
          : `<div class="modulo bloq"><span class="ico">🧵</span>Fibra<span class="st">não se aplica</span></div>`}
      </div></div>` : ''}
    ${titular && emCampo ? `<button class="btn ok lg bloco" id="bConcluir" style="margin-top:12px">✔ Concluir atendimento</button>
      <p class="small muted center">Concluir encerra a parte técnica e para o relógio do SLA. LPU, materiais e fibra podem ser apontados depois.</p>` : ''}
    ${['CONCLUIDO_TECNICO', 'FECHADO'].includes(c.status) ? `<div class="aviso ok" style="margin-top:12px">Atendimento concluído em ${SN.dt(c.tempos.conclusaoTecnica)} · MTTR ${SN.dur(SN.metricas(c).mttr)}</div>` : ''}`);

  SN.$$('.modulo[data-go]').forEach(el => el.onclick = () => SN.navegar(el.dataset.go));
  let getClass = null;
  if (SN.$('#tecClass')) getClass = SN.cascata(SN.$('#tecClass'), c, 2);
  SN.pintarFotos(SN.$('#tecFotos'), c.fotos || []);
  const bA = SN.$('#bAcao');
  if (bA) bA.onclick = async () => {
    const agora = SN.agora();
    if (c.status === 'ATRIBUIDO') { c.status = 'ACEITO'; c.tempos.aceite = agora; SN.hist(c, 'Aceite', c.tecnico); }
    else if (c.status === 'ACEITO') { c.status = 'EM_DESLOCAMENTO'; c.tempos.deslocamento = agora; SN.hist(c, 'Deslocamento', ''); }
    else if (c.status === 'EM_DESLOCAMENTO') {
      bA.disabled = true; bA.textContent = 'Obtendo GPS…';
      c.gpsChegada = await new Promise(res => {
        if (!navigator.geolocation) return res('');
        navigator.geolocation.getCurrentPosition(pos => res(pos.coords.latitude.toFixed(6) + ',' + pos.coords.longitude.toFixed(6)), () => res(''), { timeout: 8000, enableHighAccuracy: true });
      });
      c.status = 'EM_CAMPO'; c.tempos.chegada = SN.agora(); SN.hist(c, 'Chegada em campo', c.gpsChegada ? 'GPS ' + c.gpsChegada : 'GPS indisponível');
      SN.int.ellevenStatus(c, 'Em execução');
      if (!c.gpsChegada) SN.toast('Não foi possível obter o GPS — chegada registrada sem coordenada.');
    }
    SN.log('TECNICO_' + c.status, c.id, ''); SN.salvar(); SN.render();
  };
  const salvarRfo = () => {
    const cl = getClass();
    if (cl.sla && (cl.cat2 !== c.cat2 || cl.cat3 !== c.cat3 || cl.cat4 !== c.cat4)) {
      SN.hist(c, 'Categoria ajustada em campo', [c.cat2, c.cat3, c.cat4].filter(Boolean).join(' › ') + ' → ' + [cl.cat2, cl.cat3, cl.cat4].filter(Boolean).join(' › '));
      Object.assign(c, { cat2: cl.cat2 || '', cat3: cl.cat3 || '', cat4: cl.cat4 || '' });
    }
    c.rfo = { causa: SN.$('#rCausa').value.trim(), acao: SN.$('#rAcao').value.trim(), solucao: SN.$('#rSol').value.trim(),
      localFalha: SN.$('#rLocal').value.trim(), obs: SN.$('#rObs').value.trim() };
    if (!c.tempos.diagnostico && (c.rfo.causa || c.rfo.acao)) c.tempos.diagnostico = SN.agora();
    return cl;
  };
  const bR = SN.$('#bSalvarRfo');
  if (bR) {
    bR.onclick = () => { salvarRfo(); SN.hist(c, 'RFO salvo', ''); SN.log('SALVAR_RFO', c.id, ''); SN.salvar(); SN.toast('RFO salvo.', 'ok'); };
    SN.$('#inFoto').onchange = async ev => {
      salvarRfo();
      SN.toast('Enviando ' + ev.target.files.length + ' arquivo(s)…');
      for (const f of ev.target.files) { try { c.fotos.push(await SN.guardarArquivo(f, c.id)); } catch (e) { SN.toast('Falha ao guardar ' + f.name + ': ' + (e.message || e), 'erro'); } }
      SN.hist(c, 'Evidências anexadas', ev.target.files.length + ' arquivo(s)'); SN.salvar(); SN.pintarFotos(SN.$('#tecFotos'), c.fotos);
    };
    SN.$('#bConcluir').onclick = async () => {
      const cl = salvarRfo();
      if (!c.rfo.causa || !c.rfo.acao || !c.rfo.solucao) { SN.salvar(); return SN.toast('Preencha causa, ação e solução para concluir (análise e tratamento são obrigatórios).', 'erro'); }
      if (!cl.sla) return SN.toast('Complete as categorias.', 'erro');
      const semFoto = !(c.fotos || []).some(f => f.tipo === 'imagem');
      if (!await SN.confirmar('Concluir atendimento', (semFoto ? '<b>Atenção: nenhuma foto anexada.</b><br>' : '') + 'Confirmar a conclusão técnica? O chamado segue para o fechamento do NOC.', 'Concluir', 'ok')) return;
      c.status = 'CONCLUIDO_TECNICO'; c.tempos.conclusaoTecnica = SN.agora(); c.motivoDevolucao = '';
      if (!c.tempos.diagnostico) c.tempos.diagnostico = c.tempos.conclusaoTecnica;
      SN.hist(c, 'Conclusão técnica', `MTTR ${SN.dur(SN.metricas(c).mttr)}`);
      SN.salvar();
      const ax = await SN.anexarPdf(SN.pdfChamado(c, false), `Atendimento ${c.id}.pdf`, c.id);
      if (ax) c.fotos.push(ax);
      SN.int.ellevenStatus(c, 'Concluída pelo técnico');
      SN.log('CONCLUIR_TECNICO', c.id, ''); SN.salvar(); SN.toast('Atendimento concluído! Agora aponte LPU e materiais.', 'ok'); SN.render();
    };
  }
}, { familia: 'tecnico' });

// ═══════════════════════════ Cabeçalho automático dos módulos ═══════════════════════════
SN.htmlCabecalho = h => `<div class="faixa small" style="margin-bottom:12px">
  <b>${h.chamadoId}</b> · ${SN.esc(h.cliente)}${h.etiqueta ? ' · ' + SN.esc(h.etiqueta) : ''}<br>
  ${SN.esc(h.tipo || '')}${h.categoria ? ' · ' + SN.esc(h.categoria) : ''}<br>
  Técnico: ${SN.esc(SN.nomeExibicao(h.tecnico))} · ${SN.esc(h.empresa)}${h.cnpj ? ' · CNPJ ' + h.cnpj : ''}${h.papel === 'apoio' ? ' · <b>APOIO</b>' : ''}<br>
  Conta: ${SN.esc(SN.contaTxt(h.conta))}</div>`;

// ═══════════════════════════ LPU (sem valor para o técnico) ═══════════════════════════
SN.rota('/tec/lpu/:id/:papel', (id, papel) => {
  const c = SN.db.chamados.find(x => x.id === id);
  if (!c || !SN.podeLpu(c, papel)) { SN.toast('Sem acesso à LPU deste chamado.', 'erro'); return SN.navegar('#/tec'); }
  let l = SN.db.lpus.find(x => x.chamadoId === id && x.papel === papel);
  const h = l ? l.cab : SN.cabecalhoDe(c, papel);
  const emp = SN.empresa(h.empresa), vinc = emp.vinculo;
  const editavel = !l || ['AGUARDANDO_LIDER', 'REPROVADA'].includes(l.status);
  const itens = SN.itensDaConta(h.conta);
  const qtd = {}; const fator = {};
  (l ? l.itens : []).forEach(i => { qtd[i.cod] = i.qtd; fator[i.cod] = i.fator; });
  const hh = SN.horaHomem(c, papel); // automática, vinda dos KPIs do chamado
  let assinatura = l ? l.assinaturaTecnico : null;
  SN.cascaTec('fila', `
    <a href="#/tec/os/${c.id}" class="small">← Voltar à OS</a><h2 style="margin-top:6px">LPU · serviços realizados</h2>
    ${SN.htmlCabecalho(h)}
    ${l && l.status === 'REPROVADA' ? `<div class="aviso erro" style="margin-bottom:10px">Reprovada: ${SN.esc(l.motivoReprovacao)}</div>` : ''}
    ${l && !editavel ? `<div class="aviso info" style="margin-bottom:10px">Status: ${SN.LPU_STATUS[l.status].rot}. Já está com a gestão — não pode mais ser editada.</div>` : ''}
    <div class="aviso info small" style="margin-bottom:10px">Aqui você registra apenas <b>o que foi feito (volume)</b>. O valor financeiro é tratado pela gestão.</div>
    ${vinc === 'CLT' ? SN.htmlHoraHomem(hh) : ''}
    ${vinc === 'CONTRATO_FIXO' ? '<div class="aviso alerta small" style="margin-bottom:10px">Contrato fixo: a produção conta para a meta mensal, sem valor por item.</div>' : ''}
    <div class="card" style="margin-top:12px"><div class="card-tit"><h3>Serviços</h3><span class="badge" id="lpuCont"></span></div>
      <input class="inp" id="lpuBusca" placeholder="Buscar serviço (código ou descrição)">
      <div id="lpuLista" style="margin-top:6px"></div></div>
    <div class="campo" style="margin-top:12px"><label>Observações</label><textarea class="inp" id="lpuObs" ${editavel ? '' : 'disabled'}>${SN.esc(l ? l.obs : '')}</textarea></div>
    <div class="card"><h3>Assinatura do ${vinc === 'CLT' ? 'técnico' : 'prestador'}</h3>
      <p class="small" id="assTxt">${assinatura ? SN.esc(SN.txtAssinatura(assinatura)) : 'Ainda não assinado.'}</p>
      ${editavel ? '<button class="btn" id="bAss">✍ Assinar</button>' : ''}</div>
    ${editavel ? '<button class="btn prim lg bloco" id="bEnviarLpu" style="margin-top:12px">Enviar LPU para o líder</button>' : ''}`);
  const pintar = () => {
    const q = SN.normal(SN.$('#lpuBusca').value);
    const vis = itens.filter(i => !q || SN.normal(i.cod + ' ' + i.desc).includes(q));
    SN.$('#lpuLista').innerHTML = vis.map(i => `<div class="item-lpu ${qtd[i.cod] ? 'tem' : ''}"><div><div class="d">${SN.esc(i.desc)}</div>
      <div class="c">${i.cod} · ${i.classe} · por ${i.medida}
      ${vinc === 'PRESTADOR' && i.valorCritico != null ? ` · <label><input type="checkbox" data-f="${i.cod}" ${fator[i.cod] === 'critico' ? 'checked' : ''} ${editavel ? '' : 'disabled'}> condição crítica</label>` : ''}</div></div>
      <input class="inp" type="number" min="0" step="any" inputmode="decimal" data-q="${i.cod}" value="${qtd[i.cod] || ''}" placeholder="0" ${editavel ? '' : 'disabled'}></div>`).join('') || '<p class="muted">Nenhum serviço.</p>';
    SN.$$('[data-q]').forEach(inp => inp.oninput = () => { const v = parseFloat(inp.value); if (v > 0) qtd[inp.dataset.q] = v; else delete qtd[inp.dataset.q];
      inp.parentElement.classList.toggle('tem', v > 0); SN.$('#lpuCont').textContent = Object.keys(qtd).length + ' item(ns)'; });
    SN.$$('[data-f]').forEach(cb => cb.onchange = () => { fator[cb.dataset.f] = cb.checked ? 'critico' : 'comum'; });
    SN.$('#lpuCont').textContent = Object.keys(qtd).length + ' item(ns)';
  };
  SN.$('#lpuBusca').oninput = SN.debounce(pintar, 150); pintar();
  if (!editavel) return;
  SN.$('#bAss').onclick = () => { assinatura = SN.assinar(vinc === 'CLT' ? 'Técnico' : 'Prestador'); SN.$('#assTxt').textContent = SN.txtAssinatura(assinatura); SN.salvar(); };
  SN.$('#bEnviarLpu').onclick = async ev => {
    const lista = Object.keys(qtd).map(cod => ({ cod, qtd: qtd[cod], fator: fator[cod] || 'comum' }));
    // CLT pode enviar só com a hora-homem (automática); prestador precisa de serviço.
    if (!lista.length && vinc !== 'CLT') return SN.toast('Informe ao menos um serviço.', 'erro');
    if (!assinatura) return SN.toast('Clique em Assinar antes de enviar.', 'erro');
    const novo = !l;
    ev.target.disabled = true;
    if (novo) { try { l = { id: await SN.novoId('LPU') }; } catch (e) { ev.target.disabled = false; return SN.toast(e.message, 'erro'); }
      l = { id: l.id, chamadoId: c.id, papel, cab: h, vinculo: vinc, criadoEm: SN.agora(), historico: [] }; SN.db.lpus.push(l); }
    const antes = { itens: l.itens };
    l.itens = lista; l.obs = SN.$('#lpuObs').value.trim(); l.assinaturaTecnico = assinatura;
    delete l.horaHomem; // hora-homem nunca é gravada pelo técnico: sempre SN.hhDaLpu(l)
    l.status = 'AGUARDANDO_LIDER'; l.motivoReprovacao = ''; l.enviadoEm = SN.agora();
    SN.hist(l, novo ? 'Registro pelo técnico' : 'Reenvio após correção', novo ? `${lista.length} item(ns)` : SN.diff(antes, { itens: l.itens }));
    SN.hist(c, 'LPU registrada', l.id);
    SN.log(novo ? 'REGISTRAR_LPU' : 'REENVIAR_LPU', l.id, c.id); SN.salvar();
    SN.toast('LPU enviada. Ela segue seu próprio fluxo de aprovação.', 'ok'); SN.navegar('#/tec/os/' + c.id);
  };
}, { familia: 'tecnico' });

// ═══════════════════════════ Materiais ═══════════════════════════
SN.rota('/tec/mat/:id/:papel', (id, papel) => {
  const c = SN.db.chamados.find(x => x.id === id);
  if (!c || SN.papelNo(c) !== papel) { SN.toast('Sem acesso.', 'erro'); return SN.navegar('#/tec'); }
  let reg = SN.db.materiais.find(x => x.chamadoId === id && x.papel === papel);
  const h = reg ? reg.cab : SN.cabecalhoDe(c, papel);
  const editavel = !reg || ['REGISTRADO', 'DIVERGENTE'].includes(reg.status);
  let itens = reg ? JSON.parse(JSON.stringify(reg.itens)) : [];
  let tipo = 'INS';
  SN.cascaTec('fila', `
    <a href="#/tec/os/${c.id}" class="small">← Voltar à OS</a><h2 style="margin-top:6px">Materiais utilizados</h2>
    ${SN.htmlCabecalho(h)}
    ${reg && reg.status === 'DIVERGENTE' ? `<div class="aviso erro" style="margin-bottom:10px">Divergência apontada: ${SN.esc(reg.motivo)}</div>` : ''}
    ${!editavel ? `<div class="aviso info" style="margin-bottom:10px">Status: ${SN.MAT_STATUS[reg.status].rot}. Já está com a gestão de materiais.</div>` : ''}
    <div class="card"><div class="card-tit"><h3>Itens (${'<span id="nIt"></span>'})</h3></div><div id="matItens"></div></div>
    ${editavel ? `<div class="card" style="margin-top:12px"><h3>Adicionar</h3>
      <div class="chips" id="chTipo"><button class="chip sel" data-t="INS">INS · insumo</button><button class="chip" data-t="ATN">ATN · patrimônio (serial)</button></div>
      <input class="inp" id="matBusca" placeholder="Buscar por código ou descrição" style="margin-top:8px">
      <div id="matRes" style="margin-top:6px;max-height:320px;overflow:auto"></div>
      <p class="small muted">Saldo do depósito consultado no SAP (simulado até a integração ficar ativa).</p></div>
    <div class="campo" style="margin-top:12px"><label>Observações</label><textarea class="inp" id="matObs">${SN.esc(reg ? reg.obs : '')}</textarea></div>
    <button class="btn prim lg bloco" id="bSalvarMat">Salvar materiais</button>` : ''}`);
  const pintarItens = () => {
    SN.$('#nIt').textContent = itens.length;
    SN.$('#matItens').innerHTML = itens.map((it, i) => `<div class="item-lpu tem" style="grid-template-columns:1fr auto"><div>
      <div class="d">${SN.esc(it.desc)}</div><div class="c">${it.tipo} · ${it.cod}</div>
      ${it.tipo === 'INS' ? `<input class="inp" type="number" min="1" step="any" data-qi="${i}" value="${it.qtd}" style="width:110px;margin-top:4px" ${editavel ? '' : 'disabled'}>`
        : it.seriais.map((s, k) => `<input class="inp" data-s="${i}|${k}" value="${SN.esc(s)}" placeholder="Nº de série ${k + 1}" style="margin-top:4px" ${editavel ? '' : 'disabled'}>`).join('')}
      </div>${editavel ? `<button class="btn sm perigo" data-rm="${i}">✕</button>` : ''}</div>`).join('') || '<p class="muted">Nenhum material apontado.</p>';
    SN.$$('[data-qi]').forEach(x => x.oninput = () => { itens[+x.dataset.qi].qtd = parseFloat(x.value) || 0; });
    SN.$$('[data-s]').forEach(x => x.oninput = () => { const [i, k] = x.dataset.s.split('|'); itens[+i].seriais[+k] = x.value.trim(); });
    SN.$$('[data-rm]').forEach(x => x.onclick = () => { itens.splice(+x.dataset.rm, 1); pintarItens(); });
  };
  pintarItens();
  if (!editavel) return;
  const buscar = () => {
    const q = SN.normal(SN.$('#matBusca').value);
    const res = q.length < 2 ? [] : CATALOGO_MATERIAIS.filter(m => m.t === tipo && SN.normal(m.c + ' ' + m.d).includes(q)).slice(0, 40);
    SN.$('#matRes').innerHTML = res.map(m => { const e = SN.int.sapEstoque(m.c); return `<div class="item-lpu" style="grid-template-columns:1fr auto"><div><div class="d">${SN.esc(m.d)}</div>
      <div class="c">${m.c} · ${e.deposito}: ${e.qtd} disp.</div></div><button class="btn sm" data-add="${m.c}">+ Adicionar</button></div>`; }).join('')
      || `<p class="muted small">${q.length < 2 ? 'Digite ao menos 2 letras.' : 'Nada encontrado.'}</p>`;
    SN.$$('[data-add]').forEach(b => b.onclick = async () => {
      const m = SN.material(b.dataset.add);
      if (m.t === 'ATN') {
        const n = await SN.modal({ titulo: 'Quantidade (patrimônio)', corpo: '<div class="campo"><label>Quantas unidades? (1 nº de série por unidade)</label><input class="inp" type="number" min="1" value="1" id="mq"></div>',
          botoes: [{ rot: 'Cancelar', valor: 0 }, { rot: 'OK', cls: 'prim', acao: f => Math.max(1, +SN.$('#mq', f).value || 1) }] });
        if (!n) return;
        itens.push({ tipo: 'ATN', cod: m.c, desc: m.d, qtd: n, seriais: Array(n).fill('') });
      } else {
        const ex = itens.find(i => i.cod === m.c); if (ex) ex.qtd += 1; else itens.push({ tipo: 'INS', cod: m.c, desc: m.d, qtd: 1, seriais: [] });
      }
      pintarItens(); SN.toast(m.d + ' adicionado.');
    });
  };
  SN.$('#matBusca').oninput = SN.debounce(buscar, 200);
  SN.$$('#chTipo .chip').forEach(ch => ch.onclick = () => { tipo = ch.dataset.t; SN.$$('#chTipo .chip').forEach(x => x.classList.toggle('sel', x === ch)); buscar(); });
  SN.$('#bSalvarMat').onclick = async ev => {
    if (!itens.length) return SN.toast('Adicione ao menos um material.', 'erro');
    if (itens.some(i => i.tipo === 'ATN' && i.seriais.some(s => !s))) return SN.toast('Informe o nº de série de cada patrimônio (ATN).', 'erro');
    if (itens.some(i => !(i.qtd > 0))) return SN.toast('Quantidade inválida.', 'erro');
    const novo = !reg;
    ev.target.disabled = true;
    let novoId = null;
    if (novo) { try { novoId = await SN.novoId('MAT'); } catch (e) { ev.target.disabled = false; return SN.toast(e.message, 'erro'); } }
    if (novo) { reg = { id: novoId, chamadoId: c.id, papel, cab: h, cliente: c.cliente, historico: [] }; SN.db.materiais.push(reg); }
    const antes = reg.itens;
    reg.itens = itens; reg.obs = SN.$('#matObs').value.trim(); reg.status = 'REGISTRADO'; reg.motivo = ''; reg.registradoEm = SN.agora();
    SN.hist(reg, novo ? 'Registro pelo técnico' : 'Correção pelo técnico', novo ? itens.length + ' item(ns)' : SN.diff({ itens: antes }, { itens }));
    SN.hist(c, 'Materiais registrados', reg.id); SN.log(novo ? 'REGISTRAR_MATERIAL' : 'CORRIGIR_MATERIAL', reg.id, c.id); SN.salvar();
    SN.toast('Materiais salvos. A gestão de materiais segue com a baixa.', 'ok'); SN.navegar('#/tec/os/' + c.id);
  };
}, { familia: 'tecnico' });

// ═══════════════════════════ Cadastro de fibra ═══════════════════════════
SN.CORES_FIBRA = ['#1b9e3e', '#f2c200', '#e8e8e8', '#1f5fd1', '#d62828', '#7b3fb5', '#7a4a1e', '#f28cb1', '#222222', '#9e9e9e', '#f07d00', '#2ec4d6'];
SN.nFibras = cabo => parseInt(cabo, 10) || 0;
SN.nSaidas = sp => sp ? parseInt(sp.split('x')[1], 10) : 0;
// Layout comum ao SVG da tela e ao desenho do PDF.
SN.layoutFibra = ceo => {
  const na = SN.nFibras(ceo.caboA), nb = SN.nFibras(ceo.caboB), ns = SN.nSaidas(ceo.splitter);
  const passo = 26, h = Math.max(na, nb, ns + 1, 2) * passo + 50;
  const pts = {};
  for (let i = 1; i <= na; i++) pts['A' + i] = { x: 90, y: 40 + (i - 1) * passo, cor: SN.CORES_FIBRA[(i - 1) % 12], rot: 'A' + i };
  for (let i = 1; i <= nb; i++) pts['B' + i] = { x: 430, y: 40 + (i - 1) * passo, cor: SN.CORES_FIBRA[(i - 1) % 12], rot: 'B' + i };
  if (ns) {
    pts.SE = { x: 230, y: 40, cor: '#6a8f1f', rot: 'Entrada' };
    for (let i = 1; i <= ns; i++) pts['S' + i] = { x: 290, y: 40 + i * passo, cor: '#6a8f1f', rot: 'S' + i };
  }
  return { w: 520, h, passo, pts };
};
// opts.interativo: pontos e linhas tocáveis (editor do técnico); opts.sel: ponto selecionado.
SN.svgFibra = (ceo, opts) => {
  opts = opts || {};
  const L = SN.layoutFibra(ceo);
  const corLinha = a => a.cor === '#e8e8e8' ? '#9aa38f' : a.cor;
  const linhas = (ceo.ligacoes || []).map((g, k) => { const a = L.pts[g.de], b = L.pts[g.para]; if (!a || !b) return '';
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${corLinha(a)}" stroke-width="3" stroke-linecap="round"/>`
      + (opts.interativo ? `<line class="fb-lig" data-lig="${k}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="transparent" stroke-width="14"><title>Tocar para desfazer ${g.de} → ${g.para === 'SE' ? 'Entrada' : g.para}</title></line>` : ''); }).join('');
  const usados = new Set((ceo.ligacoes || []).flatMap(g => [g.de, g.para]));
  const nos = Object.entries(L.pts).map(([k, p]) => `${opts.sel === k ? `<circle cx="${p.x}" cy="${p.y}" r="11" fill="none" stroke="#3d4f11" stroke-width="3"/>` : ''}
    <circle cx="${p.x}" cy="${p.y}" r="7" fill="${p.cor}" stroke="${usados.has(k) ? '#3d4f11' : '#666'}" stroke-width="${usados.has(k) ? 2 : 1}"/>
    <text x="${k.startsWith('A') ? p.x - 14 : p.x + 14}" y="${p.y + 4}" font-size="12" text-anchor="${k.startsWith('A') ? 'end' : 'start'}" fill="#333">${p.rot}</text>
    ${opts.interativo ? `<circle class="fb-pt" data-p="${k}" cx="${p.x}" cy="${p.y}" r="${Math.floor(L.passo / 2)}" fill="transparent"><title>${p.rot}</title></circle>` : ''}`).join('');
  const tit = `<text x="90" y="20" font-size="12" font-weight="700" text-anchor="middle" fill="#3d4f11">Lado A ${SN.esc(ceo.nomA || '')} ${ceo.caboA || ''}</text>
    <text x="430" y="20" font-size="12" font-weight="700" text-anchor="middle" fill="#3d4f11">Lado B ${SN.esc(ceo.nomB || '')} ${ceo.caboB || ''}</text>
    ${ceo.splitter ? `<rect x="218" y="26" width="84" height="${SN.nSaidas(ceo.splitter) * L.passo + 30}" rx="6" fill="#f2f7e8" stroke="#a8c93c"/><text x="260" y="20" font-size="12" font-weight="700" text-anchor="middle" fill="#3d4f11">Splitter ${ceo.splitter}</text>` : ''}`;
  return `<svg class="fibra-svg ${opts.interativo ? 'interativo' : ''}" viewBox="0 0 ${L.w} ${L.h}" role="img" aria-label="Diagrama de fusão da CEO ${SN.esc(ceo.numero)}">${tit}${linhas}${nos}</svg>`;
};
// Ligação por toque: 1º toque seleciona um ponto, 2º toque no ponto de destino liga.
// Só liga colunas vizinhas (A↔B, A↔Entrada do splitter, Saída do splitter↔B); uma
// ponta que já estava ligada tem a ligação antiga substituída.
SN.ehOrigem = k => /^A\d/.test(k) || /^S\d/.test(k);
SN.ligarPontos = (ceo, p, q) => {
  let de, para;
  if (SN.ehOrigem(p) && !SN.ehOrigem(q)) { de = p; para = q; } else if (SN.ehOrigem(q) && !SN.ehOrigem(p)) { de = q; para = p; } else return { ok: false, trocar: true };
  if (/^S\d/.test(de) && para === 'SE') return { ok: false, msg: 'A saída do splitter não liga na própria entrada.' };
  const antes = ceo.ligacoes.length;
  ceo.ligacoes = ceo.ligacoes.filter(g => g.de !== de && g.para !== para);
  ceo.ligacoes.push({ de, para });
  return { ok: true, substituiu: ceo.ligacoes.length <= antes };
};

SN.rota('/tec/fibra/:id', id => {
  const c = SN.db.chamados.find(x => x.id === id);
  if (!c || !SN.papelNo(c)) { SN.toast('Sem acesso.', 'erro'); return SN.navegar('#/tec'); }
  let reg = SN.db.fibras.find(x => x.chamadoId === id);
  const h = reg ? reg.cab : SN.cabecalhoDe(c, SN.papelNo(c));
  const editavel = !reg || ['AGUARDANDO_VALIDACAO', 'CORRECAO'].includes(reg.status);
  let ceos = reg ? JSON.parse(JSON.stringify(reg.ceos)) : [];
  const caixas = CATALOGO_MATERIAIS.filter(m => /EMENDA|CEO|FOSC|TERMINA[CÇ][AÃ]O|CTO/i.test(m.d));
  const novaCeo = () => ({ numero: '', tipoCaixa: 'Nova', modelo: '', gps: '', nomA: '', caboA: '12F', nomB: '', caboB: '12F', splitter: '', ligacoes: [], obs: '' });
  if (!ceos.length) ceos.push(novaCeo());
  SN.cascaTec('fila', `
    <a href="#/tec/os/${c.id}" class="small">← Voltar à OS</a><h2 style="margin-top:6px">Cadastro de fibra · evidência técnica</h2>
    ${SN.htmlCabecalho(h)}
    ${reg && reg.status === 'CORRECAO' ? `<div class="aviso erro" style="margin-bottom:10px">Correção solicitada: ${SN.esc(reg.motivo)}</div>` : ''}
    ${!editavel ? `<div class="aviso info" style="margin-bottom:10px">Status: ${SN.FIB_STATUS[reg.status].rot}.</div>` : ''}
    <p class="small muted">Registre cabos, fibras e ligações realizadas. Ao salvar, é gerado um PDF anexado ao chamado. Não interfere no MTTR/SLA.</p>
    <div id="ceos"></div>
    ${editavel ? `<button class="btn bloco" id="bMaisCeo">+ Adicionar outra CEO</button>
    <button class="btn prim lg bloco" id="bSalvarFib" style="margin-top:10px">Salvar e gerar PDF</button>` : ''}`);
  let sel = null; // { i: índice da CEO, p: ponto selecionado }
  const pintar = () => {
    SN.$('#ceos').innerHTML = ceos.map((e, i) => {
      const dis = editavel ? '' : 'disabled';
      return `<div class="card" style="margin-bottom:12px" data-i="${i}"><div class="card-tit"><h3>CEO ${i + 1}</h3>${editavel && ceos.length > 1 ? `<button class="btn sm perigo" data-rmceo="${i}">Remover</button>` : ''}</div>
        <div class="linha-form">
          <div class="campo"><label>Nº da CEO *</label><input class="inp" data-k="numero" value="${SN.esc(e.numero)}" ${dis}></div>
          <div class="campo"><label>Caixa</label><select class="inp" data-k="tipoCaixa" ${dis}>${['Nova', 'Existente', 'Nenhuma'].map(o => `<option ${o === e.tipoCaixa ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        </div>
        <div class="campo"><label>Modelo da emenda (material)</label><select class="inp" data-k="modelo" ${dis}><option value="">—</option>${caixas.map(m => `<option value="${m.c}" ${m.c === e.modelo ? 'selected' : ''}>${SN.esc(m.d)}</option>`).join('')}</select></div>
        <div class="linha-form">
          <div class="campo"><label>Nomenclatura lado A</label><input class="inp" data-k="nomA" value="${SN.esc(e.nomA)}" ${dis}></div>
          <div class="campo"><label>Cabo A</label><select class="inp" data-k="caboA" ${dis}><option value="">—</option>${TIPOS_CABO.map(o => `<option ${o === e.caboA ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="campo"><label>Nomenclatura lado B</label><input class="inp" data-k="nomB" value="${SN.esc(e.nomB)}" ${dis}></div>
          <div class="campo"><label>Cabo B</label><select class="inp" data-k="caboB" ${dis}><option value="">—</option>${TIPOS_CABO.map(o => `<option ${o === e.caboB ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="campo"><label>Splitter</label><select class="inp" data-k="splitter" ${dis}><option value="">Sem splitter</option>${SPLITTERS.map(o => `<option ${o === e.splitter ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        </div>
        ${editavel ? `<div class="aviso info small" style="margin-bottom:6px">${sel && sel.i === i
          ? `<b>${SN.esc(sel.p === 'SE' ? 'Entrada do splitter' : sel.p)}</b> selecionado — toque no ponto de destino (ou nele de novo para cancelar).`
          : 'Toque num ponto e depois no ponto de destino para ligar. Toque numa linha para desfazer.'}</div>` : ''}
        ${SN.svgFibra(e, { interativo: editavel, sel: sel && sel.i === i ? sel.p : null })}
        <div class="small" style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;gap:8px;flex-wrap:wrap">
          <b>${e.ligacoes.length} ligação(ões)</b>
          ${editavel ? `<span><button class="btn sm" data-corcor="${i}">Cor com cor (A1→B1…)</button>
            ${e.ligacoes.length ? `<button class="btn sm perigo" data-limpar="${i}">Limpar</button>` : ''}</span>` : ''}</div>
        <div class="campo" style="margin-top:8px"><label>Observações</label><input class="inp" data-k="obs" value="${SN.esc(e.obs)}" ${dis}></div>
      </div>`;
    }).join('');
    if (!editavel) return;
    SN.$$('[data-i]').forEach(card => {
      const e = ceos[+card.dataset.i];
      SN.$$('[data-k]', card).forEach(inp => inp.onchange = () => {
        e[inp.dataset.k] = inp.value;
        if (['caboA', 'caboB', 'splitter'].includes(inp.dataset.k)) {
          const pts = SN.layoutFibra(e).pts; e.ligacoes = e.ligacoes.filter(g => pts[g.de] && pts[g.para]); sel = null; pintar(); }
      });
      // Toque nos pontos do desenho
      SN.$$('.fb-pt', card).forEach(pt => pt.onclick = () => {
        const p = pt.dataset.p, i = +card.dataset.i;
        if (!sel || sel.i !== i) { sel = { i, p }; return pintar(); }
        if (sel.p === p) { sel = null; return pintar(); }
        const r = SN.ligarPontos(e, sel.p, p);
        if (r.trocar) { sel = { i, p }; return pintar(); } // mesma coluna: troca a seleção
        if (!r.ok) { SN.toast(r.msg, 'erro'); sel = null; return pintar(); }
        if (r.substituiu) SN.toast('Ligação anterior daquela ponta foi substituída.');
        sel = null; pintar();
      });
      // Toque na linha desfaz a ligação
      SN.$$('.fb-lig', card).forEach(ln => ln.onclick = () => { e.ligacoes.splice(+ln.dataset.lig, 1); sel = null; pintar(); });
      const bLimpar = SN.$('[data-limpar]', card);
      if (bLimpar) bLimpar.onclick = () => { e.ligacoes = []; sel = null; pintar(); };
      SN.$('[data-corcor]', card).onclick = () => {
        const n = Math.min(SN.nFibras(e.caboA), SN.nFibras(e.caboB));
        for (let k = 1; k <= n; k++) if (!e.ligacoes.some(g => g.de === 'A' + k || g.para === 'B' + k)) e.ligacoes.push({ de: 'A' + k, para: 'B' + k });
        sel = null; pintar();
      };
    });
    SN.$$('[data-rmceo]').forEach(b => b.onclick = () => { ceos.splice(+b.dataset.rmceo, 1); sel = null; pintar(); });
  };
  pintar();
  if (!editavel) return;
  SN.$('#bMaisCeo').onclick = () => { ceos.push(novaCeo()); pintar(); };
  SN.$('#bSalvarFib').onclick = async () => {
    if (ceos.some(e => !e.numero.trim())) return SN.toast('Informe o número de cada CEO.', 'erro');
    if (ceos.some(e => e.tipoCaixa === 'Nova' && !e.nomA.trim())) return SN.toast('Caixa nova exige a nomenclatura do cabo (lado A).', 'erro');
    const novo = !reg;
    const bS = SN.$('#bSalvarFib'); bS.disabled = true; bS.textContent = 'Salvando…';
    let novoId = null;
    if (novo) { try { novoId = await SN.novoId('FIB'); } catch (e) { bS.disabled = false; bS.textContent = 'Salvar e gerar PDF'; return SN.toast(e.message, 'erro'); } }
    if (novo) { reg = { id: novoId, chamadoId: c.id, cab: h, cliente: c.cliente, historico: [] }; SN.db.fibras.push(reg); }
    reg.ceos = ceos; reg.status = 'AGUARDANDO_VALIDACAO'; reg.motivo = ''; reg.enviadoEm = SN.agora();
    SN.salvar();
    const ax = await SN.anexarPdf(SN.pdfFibra(reg), `Cadastro de fibra ${reg.id}.pdf`, c.id);
    if (ax) { // PDF anexado automaticamente ao chamado
      reg.pdf = ax; c.fotos = (c.fotos || []).filter(f => !f.fibra); c.fotos.push({ ...ax, fibra: true });
    }
    SN.hist(reg, novo ? 'Registro pelo técnico' : 'Correção reenviada', ceos.length + ' CEO(s)');
    SN.hist(c, 'Cadastro de fibra registrado', reg.id); SN.log(novo ? 'REGISTRAR_FIBRA' : 'CORRIGIR_FIBRA', reg.id, c.id); SN.salvar();
    SN.toast('Cadastro de fibra salvo e PDF anexado ao chamado.', 'ok'); SN.navegar('#/tec/os/' + c.id);
  };
}, { familia: 'tecnico' });

// PDF do cadastro de fibra (fotografia formal do que foi executado).
SN.pdfFibra = reg => {
  const doc = SN.novoPdf('Cadastro de fibra · ' + reg.id); if (!doc) return null;
  const h = reg.cab;
  doc.secao('Chamado'); doc.linha('Chamado', h.chamadoId); doc.linha('Cliente', h.cliente); doc.linha('Técnico', `${h.tecnico} (${h.empresa})`);
  doc.linha('Classificação', [h.tipo, h.categoria].filter(Boolean).join(' > ')); doc.linha('Registrado em', SN.dt(reg.enviadoEm));
  reg.ceos.forEach((e, i) => {
    doc.addPage(); doc._y = 18; doc.secao(`CEO ${i + 1} · Nº ${e.numero}`);
    doc.linha('Caixa', `${e.tipoCaixa}${e.modelo ? ' · ' + (SN.material(e.modelo) || {}).d : ''}`);
    doc.linha('Lado A', `${e.nomA || '—'} · ${e.caboA || '—'}`); doc.linha('Lado B', `${e.nomB || '—'} · ${e.caboB || '—'}`);
    doc.linha('Splitter', e.splitter || 'Sem splitter'); doc.linha('Ligações', e.ligacoes.map(g => `${g.de}→${g.para === 'SE' ? 'Splitter' : g.para}`).join(', ') || '—');
    if (e.obs) doc.linha('Obs.', e.obs);
    const L = SN.layoutFibra(e), ox = 20, oy = doc._y + 6;
    const k = Math.min(170 / L.w, (285 - oy) / L.h); // cabos grandes (72F/144F) encolhem para caber na página
    const rgb = hex => [1, 3, 5].map(j => parseInt(hex.slice(j, j + 2), 16));
    doc.setDrawColor(200); doc.rect(ox - 4, oy - 4, 178, L.h * k + 8);
    e.ligacoes.forEach(g => { const a = L.pts[g.de], b = L.pts[g.para]; if (!a || !b) return; doc.setDrawColor(...rgb(a.cor === '#e8e8e8' ? '#9aa38f' : a.cor)); doc.setLineWidth(0.5);
      doc.line(ox + a.x * k, oy + a.y * k, ox + b.x * k, oy + b.y * k); });
    doc.setLineWidth(0.2); doc.setFontSize(6.5);
    Object.entries(L.pts).forEach(([key, p]) => { doc.setFillColor(...rgb(p.cor)); doc.setDrawColor(80); doc.circle(ox + p.x * k, oy + p.y * k, 1.2, 'FD');
      doc.setTextColor(40); doc.text(p.rot, ox + p.x * k + (key.startsWith('A') ? -3 : 3), oy + p.y * k + 1, { align: key.startsWith('A') ? 'right' : 'left' }); });
    doc.setFontSize(9.5);
  });
  return doc;
};

// ═══════════════════════════ Meu resumo ═══════════════════════════
SN.rota('/tec/resumo', () => {
  const mes = SN.agora().slice(0, 7);
  const minhas = SN.db.chamados.filter(c => SN.papelNo(c) === 'titular' && (c.tempos.conclusaoTecnica || '').startsWith(mes));
  const ms = minhas.map(SN.metricas);
  const dentro = ms.filter(m => m.sla === true).length, fora = ms.filter(m => m.sla === false).length;
  const ef = minhas.length ? dentro / minhas.length : null;
  SN.cascaTec('resumo', `
    <p class="muted">${SN.mesNome(mes)} · atendimentos concluídos por você/sua equipe</p>
    <div class="grid g2">
      <div class="kpi destaque"><div class="rot">Concluídos</div><div class="val">${minhas.length}</div></div>
      <div class="kpi"><div class="rot">Eficiência SLA</div><div class="val">${ef == null ? '—' : SN.num(ef * 100) + '%'}</div><div class="sub">${ef == null ? '' : `a cada 10, ${SN.num(ef * 10, 1)} no prazo`}</div></div>
      <div class="kpi"><div class="rot">Dentro / fora</div><div class="val">${dentro} / ${fora}</div></div>
      <div class="kpi"><div class="rot">MTTR médio</div><div class="val">${SN.dur(SN.media(ms.map(m => m.mttr)))}</div></div>
      <div class="kpi"><div class="rot">MTTA médio</div><div class="val">${SN.dur(SN.media(ms.map(m => m.mtta)))}</div><div class="sub">despacho → chegada</div></div>
      <div class="kpi"><div class="rot">Tempo em campo</div><div class="val">${SN.dur(SN.media(ms.map(m => m.tmc)))}</div></div>
      ${SN.empresa(SN.usuario().empresa).vinculo === 'CLT' ? `<div class="kpi destaque"><div class="rot">Hora-homem no mês</div>
        <div class="val">${SN.num(minhas.reduce((s, c) => s + SN.horaHomem(c, 'titular').horas, 0), 1)}</div><div class="sub">automática, pelos horários dos chamados</div></div>` : ''}
    </div>`, 'Meu resumo');
}, { familia: 'tecnico' });

// ═══════════════════════════ Financeiro do prestador ═══════════════════════════
// Valor aprovado no ciclo (dia 01 ao fim do mês) e envio da NF do lote.
SN.rota('/tec/financeiro', () => {
  const u = SN.usuario(), emp = SN.empresa(u.empresa);
  if (emp.vinculo !== 'PRESTADOR' || (emp.responsavelLpu && emp.responsavelLpu !== u.nome)) return SN.navegar('#/tec');
  const lpus = SN.db.lpus.filter(l => l.cab.empresa === u.empresa);
  const soma = st => lpus.filter(l => st.includes(l.status)).reduce((s, l) => s + SN.valorLpu(l), 0);
  const pags = SN.db.pagamentos.filter(p => p.empresa === u.empresa).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  SN.cascaTec('fin', `
    <p class="muted">${SN.esc(u.empresa)} · CNPJ ${SN.esc(emp.cnpj || '—')}</p>
    <div class="grid g2">
      <div class="kpi"><div class="rot">Em aprovação</div><div class="val">${SN.brl(soma(['AGUARDANDO_LIDER', 'NO_SERVICE_DESK']))}</div></div>
      <div class="kpi destaque"><div class="rot">Aprovado (a faturar)</div><div class="val">${SN.brl(soma(['CONTABILIZADA']))}</div></div>
      <div class="kpi"><div class="rot">Em pagamento</div><div class="val">${SN.brl(soma(['EM_PAGAMENTO']))}</div></div>
      <div class="kpi"><div class="rot">Pago</div><div class="val">${SN.brl(soma(['PAGA']))}</div></div>
    </div>
    <p class="small muted" style="margin-top:10px">Ciclo da LPU: produção do dia 01 ao último dia do mês. O Service Desk gera o lote; você anexa uma única NF com o valor total; pagamento no dia ${CICLO_LPU.diaPagamento} (útil).</p>
    <h3 style="margin-top:14px">Lotes de pagamento</h3>
    ${pags.map(p => `<div class="tec-os"><div style="display:flex;justify-content:space-between"><b>${p.id} · ${SN.mesNome(p.ciclo)}</b>${SN.badge(SN.PAG_STATUS, p.status)}</div>
      <div class="cli">${SN.brl(p.total)}</div><div class="small muted">${p.lpuIds.length} LPU(s)</div>
      ${p.motivoNf ? `<div class="aviso erro small">NF reprovada: ${SN.esc(p.motivoNf)}</div>` : ''}
      ${p.status === 'AGUARDANDO_NF' ? `<label class="btn prim bloco" style="margin-top:8px">📎 Anexar Nota Fiscal<input type="file" data-nf="${p.id}" accept="application/pdf,image/*" hidden></label>` : ''}
      ${p.nf ? `<button class="btn sm" data-ver="${p.nf.id}" style="margin-top:6px">Ver NF</button>` : ''}</div>`).join('') || '<p class="muted">Nenhum lote gerado ainda.</p>'}`, 'Financeiro');
  SN.$$('[data-nf]').forEach(inp => inp.onchange = async () => {
    const p = SN.db.pagamentos.find(x => x.id === inp.dataset.nf); const f = inp.files[0]; if (!f) return;
    try { p.nf = await SN.guardarArquivo(f, 'NF ' + p.empresa); } catch (e) { return SN.toast('Falha ao enviar a NF: ' + (e.message || e), 'erro'); }
    p.status = 'NF_ANEXADA'; p.motivoNf = ''; SN.hist(p, 'NF anexada pelo prestador', f.name);
    SN.log('ANEXAR_NF', p.id, f.name); SN.salvar(); SN.toast('NF enviada ao Service Desk.', 'ok'); SN.render();
  });
  SN.$$('[data-ver]').forEach(b => b.onclick = () => SN.abrirAnexo(b.dataset.ver));
}, { familia: 'tecnico' });
