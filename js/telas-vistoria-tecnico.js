// SIGONET V2 — Preventiva: app do técnico (mobile first).
//
// Rotas do dia → dentro da rota: quantidade de CS, uma aba por CS e, a partir da
// 2ª, o bloco do trecho entre a CS anterior e ela. Cada CS é salva no aparelho a
// cada alteração (rascunho) e enviada SOZINHA quando o técnico termina — nunca
// um envio único no fim do dia. Cada foto sobe no momento da captura.
//
// O botão "Enviar CS" só libera com tudo o que as regras exigem (VR.validarVistoria),
// e o servidor confere de novo.
(() => {
  const L = VR_LISTAS, esc = SN.esc;

  // ═══════════════════════════ Lista de rotas ═══════════════════════════
  SN.rota('/tec/vistorias', async () => {
    if (!SN.vst.disponivel()) return SN.cascaTec('vst', SN.vst.semServidorHtml, 'Preventiva');
    SN.cascaTec('vst', SN.carregando('Carregando rotas…'), 'Minhas rotas de preventiva');
    let d;
    try { d = await SN.vst.carregar(); }
    catch (e) { return SN.cascaTec('vst', `<div class="aviso erro">${esc(e.message)}</div>`, 'Minhas rotas de preventiva'); }
    if (location.hash !== '#/tec/vistorias') return;
    const locais = await SN.VL.rascunhos.todos();
    const hoje = SN.agora().slice(0, 10);
    const card = r => {
      if (r.segmento === 'AEREA') return cardAereo(r);
      const vs = d.vistorias.filter(v => v.id_rota === r.id_rota);
      const n = s => vs.filter(v => v.status_revisao === s).length;
      const pend = locais.filter(l => l.id_rota === r.id_rota && l.status_local !== 'enviada').length;
      const rej = n('REJEITADA');
      return `<div class="tec-os ${rej ? 'estourado' : ''}" data-rota="${esc(r.id_rota)}" data-seg="SUBTERRANEA">
        <div class="small muted" style="display:flex;justify-content:space-between"><span class="mono">${esc(r.id_rota)} · ${SN.vst.dia(r.data_planejada)}</span>${SN.vst.badgeRota(r.status)}</div>
        <span class="badge">🕳️ Subterrânea</span>
        <div class="cli">${esc(r.cidade || '')} · Cluster ${esc(r.cluster)} · ${SN.num(r.extensao_km, 2)} km</div>
        <div class="small">${(r.cs_planejadas || []).length} CS planejadas · ${vs.length} enviadas · ${n('APROVADA')} aprovadas</div>
        <div style="margin-top:6px">${rej ? `<span class="badge erro">${rej} rejeitada(s): refazer</span> ` : ''}${pend ? `<span class="badge alerta">${pend} no aparelho</span>` : ''}</div></div>`;
    };
    // Aérea: metros apontados × previstos (produção não rejeitada, servidor + aparelho).
    const aptLocais = await SN.VL.apontamentos.todos();
    const cardAereo = r => {
      const srv = (d.producao || []).filter(a => a.id_rota === r.id_rota);
      const p = VR.producaoRota(r, srv);
      const pend = aptLocais.filter(l => l.id_rota === r.id_rota && l.status_local !== 'enviada').length;
      const rej = srv.filter(a => a.status_revisao === 'REJEITADA').length;
      return `<div class="tec-os ${rej ? 'estourado' : ''}" data-rota="${esc(r.id_rota)}" data-seg="AEREA">
        <div class="small muted" style="display:flex;justify-content:space-between"><span class="mono">${esc(r.id_rota)} · ${SN.vst.dia(r.data_planejada)}</span>${SN.vst.badgeRota(r.status)}</div>
        <span class="badge verde">🗼 Aérea</span>
        <div class="cli">${esc(r.cidade || '')} · ${esc(r.motivo || '')}</div>
        <div class="small">${SN.num(p.totais.metros)} de ${SN.num(r.metros_previstos)} m apontados${p.pct != null ? ' (' + p.pct + '%)' : ''} · ${esc(r.solicitante || '')}</div>
        <div style="margin-top:6px">${rej ? `<span class="badge erro">${rej} rejeitado(s): refazer</span> ` : ''}${pend ? `<span class="badge alerta">${pend} no aparelho</span>` : ''}</div></div>`;
    };
    const ativas = d.rotas.filter(r => r.status !== 'CONCLUIDA').sort((a, b) => String(a.data_planejada).localeCompare(String(b.data_planejada)));
    const doDia = ativas.filter(r => String(r.data_planejada).slice(0, 10) <= hoje), futuras = ativas.filter(r => String(r.data_planejada).slice(0, 10) > hoje);
    const concluidas = d.rotas.filter(r => r.status === 'CONCLUIDA');
    SN.cascaTec('vst', `
      ${d.offline ? `<div class="aviso alerta" style="margin-bottom:10px">Sem sinal: mostrando as rotas salvas no aparelho em ${SN.dt(d.carregadoEm)}.</div>` : ''}
      <div id="vstFila"></div>
      <h3>Rotas do dia (${doDia.length})</h3>${doDia.map(card).join('') || '<p class="muted">Nenhuma rota para hoje.</p>'}
      ${futuras.length ? `<h3 style="margin-top:16px">Próximas (${futuras.length})</h3>${futuras.map(card).join('')}` : ''}
      ${concluidas.length ? `<h3 style="margin-top:16px">Concluídas (${concluidas.length})</h3>${concluidas.map(card).join('')}` : ''}`, 'Minhas rotas de preventiva');
    SN.$$('[data-rota]').forEach(el => el.onclick = () => SN.navegar((el.dataset.seg === 'AEREA' ? '#/tec/aerea/' : '#/tec/vistoria/') + encodeURIComponent(el.dataset.rota)));
    pintarFila();
  }, { familia: 'tecnico' });

  // Faixa com o que ainda está no aparelho aguardando envio.
  const pintarFila = async () => {
    const el = SN.$('#vstFila'); if (!el) return;
    const r = await SN.VL.resumoPendente();
    const semRede = !navigator.onLine || SN.VL.estado.semRede;
    el.innerHTML = r.fotos || r.cs
      ? `<div class="aviso ${semRede ? 'alerta' : 'info'}" style="margin-bottom:10px">${semRede ? '📶 Sem sinal — ' : '⟳ Enviando — '}${r.fotos} foto(s) e ${r.cs} CS aguardando.
          Nada se perde: o envio continua sozinho quando a conexão voltar.</div>`
      : '<div class="aviso ok" style="margin-bottom:10px">✓ Tudo o que foi feito neste aparelho já está no servidor.</div>';
  };

  // ═══════════════════════════ Rota ═══════════════════════════
  // Estado da tela da rota (fica em memória enquanto a rota está aberta).
  let T = null;
  const rotaAberta = () => T && location.hash === '#/tec/vistoria/' + encodeURIComponent(T.rota.id_rota);

  SN.rota('/tec/vistoria/:id', async id => {
    if (!SN.vst.disponivel()) return SN.cascaTec('vst', SN.vst.semServidorHtml, 'Preventiva');
    if (T && T.rota.id_rota === id) { // re-render sem recarregar (não perde o que está sendo digitado)
      SN.VF.ligarGps(); if (!T.desligar) T.desligar = SN.VL.aoMudar(aoMudarFila);
      return pintarRota();
    }
    SN.cascaTec('vst', '<p class="muted">Abrindo rota…</p>');
    let d;
    try { d = SN.vst.dados && SN.vst.dados.rotas.some(r => r.id_rota === id) ? SN.vst.dados : await SN.vst.carregar(); }
    catch (e) { return SN.cascaTec('vst', `<div class="aviso erro">${esc(e.message)}</div>`); }
    const rota = d.rotas.find(r => r.id_rota === id);
    if (!rota) { SN.toast('Rota não encontrada nas suas rotas.', 'erro'); return SN.navegar('#/tec/vistorias'); }
    if (rota.segmento === 'AEREA') return SN.navegar('#/tec/aerea/' + encodeURIComponent(id)); // OS aérea cai aqui pelo botão "Abrir rota"
    T = { rota, dados: d, cfg: VR.normalizarConfig(d.config), cs: {}, slots: {}, fotosLocais: {}, aba: 1, qtd: 0 };
    d.cs.forEach(c => { T.cs[c.id_cs] = c; });
    try { await montarSlots(); }
    catch (e) { // sem IndexedDB (ex.: navegador em modo privado) não dá para garantir o rascunho
      T = null;
      return SN.cascaTec('vst', `<div class="aviso erro">Não foi possível usar o armazenamento deste aparelho (${esc(e.message || e)}).
        Sem ele os rascunhos e as fotos não ficam guardados. Saia do modo anônimo/privado ou libere o armazenamento do site e abra de novo.</div>`);
    }
    try { T.aba = Number(sessionStorage.getItem('vst_aba_' + id)) || 1; } catch (e) { }
    T.aba = Math.min(T.aba, T.qtd);
    SN.VF.ligarGps();
    if (T.desligar) T.desligar();
    T.desligar = SN.VL.aoMudar(aoMudarFila);
    pintarRota();
    // Atualiza do servidor em segundo plano (status de revisão mais novo).
    if (!d.offline) SN.vst.carregar().then(nd => { if (!rotaAberta()) return; T.dados = nd; const r = nd.rotas.find(x => x.id_rota === id); if (r) T.rota = r; montarSlots().then(pintarRota); }).catch(() => { });
  }, { familia: 'tecnico' });

  // Junta o que está no servidor com os rascunhos do aparelho, por ordem da CS.
  const montarSlots = async () => {
    const locais = await SN.VL.rascunhos.porIndice('rota', T.rota.id_rota);
    const slots = {};
    T.dados.vistorias.filter(v => v.id_rota === T.rota.id_rota).forEach(v => {
      slots[v.ordem] = { id_vistoria: v.id_vistoria, id_rota: v.id_rota, ordem: v.ordem, status_local: 'enviada', dados: v, servidor: v };
    });
    locais.forEach(l => {
      const s = slots[l.ordem];
      if (l.status_local !== 'enviada' || !s) { slots[l.ordem] = { ...l, servidor: (s && s.servidor) || l.servidor }; }
    });
    T.slots = slots;
    for (const f of await SN.VL.fotos.todos()) if (f.id_rota === T.rota.id_rota) T.fotosLocais[f.id_foto] = f;
    const maxOrdem = Math.max(0, ...Object.keys(slots).map(Number));
    let qtdSalva = 0; try { qtdSalva = Number(await SN.VL.meta.get('qtd|' + T.rota.id_rota)) || 0; } catch (e) { }
    T.qtd = Math.max(1, maxOrdem, qtdSalva || (T.rota.cs_planejadas || []).length);
  };

  // Saiu da tela da rota: salva o que falta, desliga GPS e para de ouvir a fila.
  const sair = () => { if (!T) return; flush(); if (T.desligar) { T.desligar(); T.desligar = null; } SN.VF.desligarGps(); };
  window.addEventListener('hashchange', () => { if (T && !rotaAberta()) sair(); });

  const aoMudarFila = async () => {
    if (!rotaAberta()) { sair(); return; }
    for (const f of await SN.VL.fotos.todos()) if (f.id_rota === T.rota.id_rota) T.fotosLocais[f.id_foto] = f;
    const locais = await SN.VL.rascunhos.porIndice('rota', T.rota.id_rota);
    let enviouAlguma = false;
    locais.forEach(l => {
      const s = T.slots[l.ordem];
      if (s && s.id_vistoria === l.id_vistoria && s.status_local !== l.status_local) {
        if (l.status_local === 'enviada') enviouAlguma = true;
        Object.assign(s, { status_local: l.status_local, erro: l.erro, erros: l.erros, servidor: l.servidor || s.servidor });
      }
    });
    pintarAbas(); pintarFaixa();
    const ativo = document.activeElement;
    if (!(ativo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ativo.tagName))) pintarCs();
    // CS confirmada: a rota pode ter mudado no servidor (ex.: DESPACHADA → EM_CAMPO).
    // Também puxa o chamado (OS) atualizado: a 1ª CS o põe em campo e libera Materiais/Fibra.
    if (enviouAlguma) Promise.all([SN.vst.carregar(), SN.sincronizar ? SN.sincronizar().catch(() => { }) : null]).then(([nd]) => {
      if (!rotaAberta()) return;
      T.dados = nd;
      const r = nd.rotas.find(x => x.id_rota === T.rota.id_rota);
      if (r) T.rota = r;
      const a = document.activeElement;
      if (!(a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName))) pintarRota();
    }).catch(() => { });
  };

  // ─────────── Slot (CS de uma aba) ───────────
  const novaVistoria = ordem => {
    const u = SN.usuario();
    const usadas = Object.values(T.slots).filter(s => s.dados && !s.dados.cs_nova).map(s => s.dados.id_cs);
    const sugerida = (T.rota.cs_planejadas || [])[ordem - 1];
    return {
      id_vistoria: 'V' + SN.uid() + SN.uid(), id_rota: T.rota.id_rota, ordem, cs_nova: false,
      id_cs: sugerida && !usadas.includes(sugerida) ? sugerida : '',
      endereco: sugerida && T.cs[sugerida] && !usadas.includes(sugerida) ? (T.cs[sugerida].endereco || '') : '',
      cluster: T.rota.cluster, prestador: T.rota.prestador, tecnico: u.nome, inicio: '', fim: '',
      fotos: [], cabos: [], cabos_divergencias: [],
      trecho: ordem > 1 ? { cs_origem: '', superficie_percorrida: '', anomalias: [] } : undefined
    };
  };
  const slot = ordem => {
    if (!T.slots[ordem]) T.slots[ordem] = { id_vistoria: null, id_rota: T.rota.id_rota, ordem, status_local: 'rascunho', dados: null, novo: true };
    const s = T.slots[ordem];
    if (!s.dados) { s.dados = novaVistoria(ordem); s.id_vistoria = s.dados.id_vistoria; }
    return s;
  };
  const statusServidor = s => (s.servidor && s.servidor.status_revisao) || '';
  const editavel = s => ['rascunho', 'erro'].includes(s.status_local);
  const salvarSlot = async s => {
    const v = s.dados;
    if (!v.inicio) v.inicio = SN.agora();
    s.novo = false;
    await SN.VL.salvarRascunho({ id_vistoria: s.id_vistoria, id_rota: s.id_rota, ordem: s.ordem, status_local: s.status_local, dados: v,
      erro: s.erro || '', erros: s.erros || [], servidor: s.servidor || null });
  };
  let timerSalvar = null;
  const salvarDepois = s => { clearTimeout(timerSalvar); timerSalvar = setTimeout(() => salvarSlot(s), 300); };
  document.addEventListener('visibilitychange', () => { if (document.hidden && T && timerSalvar) { clearTimeout(timerSalvar); const s = T.slots[T.aba]; if (s && s.dados && editavel(s)) salvarSlot(s); } });

  // ─────────── Pintura da rota ───────────
  const pintarRota = () => {
    const r = T.rota, cen = r.cenario_esperado || {};
    SN.cascaTec('vst', `
      <a href="#/tec/vistorias" class="small">← Minhas rotas</a>
      <div class="tec-os" style="margin-top:8px">
        <div class="small muted" style="display:flex;justify-content:space-between"><span class="mono">${esc(r.id_rota)}</span>${SN.vst.badgeRota(r.status)}</div>
        <div class="cli">${esc(r.cidade || '')} · Cluster ${esc(r.cluster)} · ${SN.num(r.extensao_km, 2)} km</div>
        <table class="tab" style="margin-top:6px"><tbody>
          <tr><td class="muted">Data</td><td>${SN.vst.dia(r.data_planejada)}</td></tr>
          <tr><td class="muted">Prestador</td><td>${esc(r.prestador)}${r.tecnico ? ' · ' + esc(r.tecnico) : ''}</td></tr>
          <tr><td class="muted">Técnico</td><td>${esc(SN.usuario().nome)}</td></tr>
          <tr><td class="muted">Cenário esperado</td><td>Dono do duto: ${esc(cen.dono_duto || '—')}<br>Operadoras nos cabos: ${esc((cen.operadoras || []).join(', ') || '—')}</td></tr>
          ${r.observacao ? `<tr><td class="muted">Obs.</td><td>${esc(r.observacao)}</td></tr>` : ''}
        </tbody></table>
      </div>
      ${htmlOs(r, T.slots)}
      ${T.dados.offline ? '<div class="aviso alerta" style="margin-bottom:8px">Sem sinal: trabalhando com os dados salvos no aparelho. Tudo fica guardado e é enviado quando a conexão voltar.</div>' : ''}
      <div id="vstFaixa"></div>
      ${T.cfg && VR.pendenciasConfig(T.cfg).length ? `<details class="small muted" style="margin:6px 0"><summary>Configurações ainda a definir (${VR.pendenciasConfig(T.cfg).length})</summary><ul>${VR.pendenciasConfig(T.cfg).map(p => `<li>${esc(p)}</li>`).join('')}</ul></details>` : ''}
      <div class="vst-qtd"><span>Quantidade de CS nesta rota</span>
        <button class="btn sm" id="vQtdMenos">−</button><b id="vQtd">${T.qtd}</b><button class="btn sm" id="vQtdMais">+</button></div>
      <div class="vst-abas" id="vstAbas"></div>
      <div id="vstCs"></div>
      ${r.status === 'DESPACHADA' ? '<button class="btn bloco" id="vIniciar" style="margin-top:12px">▶ Iniciar rota</button>' : ''}
      ${r.status === 'EM_CAMPO' ? '<button class="btn ok lg bloco" id="vConcluir" style="margin-top:12px">✔ Concluir rota</button><p class="small muted center">Só conclui com todas as CS planejadas enviadas e nenhuma rejeitada.</p>' : ''}`);
    SN.$$('[data-os]').forEach(el => el.onclick = () => { flush(); SN.navegar(el.dataset.os); });
    SN.$('#vQtdMais').onclick = () => mudarQtd(1);
    SN.$('#vQtdMenos').onclick = () => mudarQtd(-1);
    if (SN.$('#vIniciar')) SN.$('#vIniciar').onclick = () => mudarStatusRota('EM_CAMPO');
    if (SN.$('#vConcluir')) SN.$('#vConcluir').onclick = () => mudarStatusRota('CONCLUIDA');
    pintarFaixa(); pintarAbas(); pintarCs();
  };
  // OS (chamado Preventiva) da rota: é por ela que o prestador aponta materiais e
  // cobra a LPU, no fluxo normal. A LPU libera quando todas as CS forem aprovadas.
  const htmlOs = (r, slots) => {
    if (!r.id_chamado) return '';
    const c = (SN.db.chamados || []).find(x => x.id === r.id_chamado);
    const papel = c && SN.papelNo ? SN.papelNo(c) : null;
    const lpuLiberada = c && c.preventiva && c.preventiva.lpu_sugerida;
    const lpu = c && papel ? SN.db.lpus.find(l => l.chamadoId === c.id && l.papel === papel) : null;
    const mat = c && papel ? SN.db.materiais.find(m => m.chamadoId === c.id && m.papel === papel) : null;
    const podeMat = c && papel && SN.faseModulos(c);
    // Cadastro de Fibra (fusão / emenda aberta) pelo fluxo normal do chamado.
    const fib = c ? SN.db.fibras.find(f => f.chamadoId === c.id) : null;
    const podeFib = podeMat && typeof TIPOS_COM_FIBRA !== 'undefined' && TIPOS_COM_FIBRA.includes(c.tipo);
    const comEmenda = Object.values(slots || {}).filter(s => s.dados && s.dados.emenda_aberta === 'sim').map(s => 'CS ' + s.ordem);
    return `<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div><b>OS ${esc(r.id_chamado)}</b><div class="small muted">Apontamentos e cobrança pelo fluxo normal</div></div>${c ? SN.badgeStatus(c.status) : ''}</div>
      <div class="modulos vst-modulos" style="margin-top:10px">
        <div class="modulo" data-os="#/tec/os/${esc(r.id_chamado)}"><span class="ico">📋</span>OS<span class="st">abrir</span></div>
        <div class="modulo ${mat ? 'feito' : ''} ${podeMat ? '' : 'bloq'}" ${podeMat ? `data-os="#/tec/mat/${esc(r.id_chamado)}/${papel}"` : ''}><span class="ico">📦</span>Materiais
          <span class="st">${mat ? esc(SN.MAT_STATUS[mat.status].rot) : podeMat ? 'apontar uso' : 'após a 1ª CS'}</span></div>
        <div class="modulo ${lpu ? 'feito' : ''} ${lpuLiberada && papel ? '' : 'bloq'}" ${lpuLiberada && papel ? `data-os="#/tec/lpu/${esc(r.id_chamado)}/${papel}"` : ''}><span class="ico">📄</span>LPU
          <span class="st">${lpu ? esc(SN.LPU_STATUS[lpu.status].rot) : lpuLiberada ? 'conferir e enviar' : 'após aprovação'}</span></div>
        <div class="modulo ${fib ? 'feito' : ''} ${podeFib ? '' : 'bloq'}" ${podeFib ? `data-os="#/tec/fibra/${esc(r.id_chamado)}"` : ''}><span class="ico">🧵</span>Fibra
          <span class="st">${fib ? esc(SN.FIB_STATUS[fib.status].rot) : podeFib ? 'se houve fusão' : 'após a 1ª CS'}</span></div>
      </div>
      ${comEmenda.length && !fib ? `<div class="aviso alerta small" style="margin-top:8px">Emenda aberta em ${comEmenda.join(', ')}: registre o <b>Cadastro de Fibra</b> do que foi executado.</div>` : ''}</div>`;
  };

  SN.vst.cartaoOs = htmlOs; // também usado na tela da rota aérea

  const mudarQtd = async delta => {
    const n = T.qtd + delta;
    if (n < 1) return;
    if (delta < 0 && T.slots[T.qtd] && !T.slots[T.qtd].novo) return SN.toast('A última aba já tem dados. Não dá para diminuir.', 'erro');
    if (delta < 0) delete T.slots[T.qtd];
    T.qtd = n; await SN.VL.meta.set('qtd|' + T.rota.id_rota, n);
    if (T.aba > n) T.aba = n;
    SN.$('#vQtd').textContent = n; pintarAbas(); pintarCs();
  };
  const mudarStatusRota = async para => {
    try {
      const r = await SN.vst.exec('VST_ROTA_STATUS', { id_rota: T.rota.id_rota, para });
      T.rota = r.rota; SN.toast(para === 'CONCLUIDA' ? 'Rota concluída.' : 'Rota iniciada.', 'ok'); pintarRota();
    } catch (e) { SN.toast(e.rede ? 'Sem sinal: tente de novo quando a conexão voltar.' : e.message, 'erro'); }
  };

  const pintarFaixa = async () => {
    const el = SN.$('#vstFaixa'); if (!el) return;
    const pend = Object.values(T.fotosLocais).filter(f => f.status === 'pendente' || f.status === 'enviando').length;
    const erroFoto = Object.values(T.fotosLocais).filter(f => f.status === 'erro').length;
    const csFila = Object.values(T.slots).filter(s => ['fila', 'enviando'].includes(s.status_local)).length;
    const semRede = !navigator.onLine || SN.VL.estado.semRede;
    el.innerHTML = pend || csFila || erroFoto
      ? `<div class="aviso ${erroFoto ? 'erro' : semRede ? 'alerta' : 'info'}" style="margin-bottom:8px">${semRede ? '📶 Sem sinal — ' : '⟳ '}${pend} foto(s) e ${csFila} CS aguardando envio${erroFoto ? ` · ${erroFoto} foto(s) recusada(s)` : ''}.</div>` : '';
  };

  const rotuloSlot = s => {
    const st = statusServidor(s);
    if (s.status_local === 'enviada' && st) return SN.vst.badgeVistoria(st);
    return SN.vst.badgeLocal(s.status_local);
  };
  const pintarAbas = () => {
    const el = SN.$('#vstAbas'); if (!el) return;
    let html = '';
    for (let i = 1; i <= T.qtd; i++) {
      const s = T.slots[i], v = s && s.dados;
      const nome = v ? (v.cs_nova ? 'CS nova' : (v.id_cs || '—')) : ((T.rota.cs_planejadas || [])[i - 1] || '—');
      html += `<button class="vst-aba ${i === T.aba ? 'ativa' : ''}" data-aba="${i}"><span class="small">CS ${i}</span><b>${esc(nome)}</b>${s ? rotuloSlot(s) : SN.vst.badgeLocal('rascunho')}</button>`;
    }
    el.innerHTML = html;
    SN.$$('[data-aba]', el).forEach(b => b.onclick = () => { flush(); T.aba = Number(b.dataset.aba); try { sessionStorage.setItem('vst_aba_' + T.rota.id_rota, T.aba); } catch (e) { } pintarAbas(); pintarCs(); SN.$('#vstAbas').scrollIntoView({ block: 'start' }); });
  };
  const flush = () => { if (timerSalvar) { clearTimeout(timerSalvar); timerSalvar = null; const s = T.slots[T.aba]; if (s && s.dados && editavel(s)) salvarSlot(s); } };

  // ═══════════════════════════ Formulário da CS ═══════════════════════════
  const obter = (v, caminho) => caminho.split('.').reduce((o, k) => (o == null ? undefined : o[k]), v);
  const definir = (v, caminho, valor) => {
    const p = caminho.split('.'); let o = v;
    for (let i = 0; i < p.length - 1; i++) { if (o[p[i]] == null) o[p[i]] = /^\d+$/.test(p[i + 1]) ? [] : {}; o = o[p[i]]; }
    o[p[p.length - 1]] = valor;
  };
  const csAnterior = ordem => { const s = T.slots[ordem - 1]; const v = s && s.dados; return v ? (v.cs_nova ? '(fora do cadastro)' : v.id_cs) : ''; };
  const ctxValidacao = v => ({ config: T.cfg, csBase: v.cs_nova ? null : T.cs[v.id_cs] || null, rota: T.rota });
  // Validação com hora de fim provisória (a de verdade é gravada ao enviar).
  const validar = v => {
    const r = VR.validarVistoria({ ...v, inicio: v.inicio || SN.agora(), fim: v.fim || SN.agora() }, ctxValidacao(v));
    // Regras só do aparelho: mesma CS em duas abas.
    if (!v.cs_nova && v.id_cs) {
      const outra = Object.values(T.slots).find(s => s.dados && s.dados !== v && !s.dados.cs_nova && s.dados.id_cs === v.id_cs);
      if (outra) { r.erros.push({ codigo: 'cs_repetida', campo: 'id_cs', msg: `A CS ${v.id_cs} já está na aba CS ${outra.ordem}.` }); r.ok = false; }
    }
    return r;
  };

  const pintarCs = () => {
    const el = SN.$('#vstCs'); if (!el) return;
    const s = slot(T.aba), v = s.dados, ro = !editavel(s);
    const y = window.scrollY;
    el.innerHTML = htmlCs(s, v, ro);
    ligarCs(el, s, v, ro);
    window.scrollTo(0, y);
  };

  // ─────────── Peças de formulário ───────────
  const H = ro => {
    const chips = (k, lista, v, multi) => `<div class="chips">${lista.map(([val, rot]) => {
      const sel = multi ? (obter(v, k) || []).includes(val) : obter(v, k) === val;
      return `<button type="button" class="chip ${sel ? 'sel' : ''}" data-chip="${esc(k)}" data-v="${esc(val)}" ${multi ? 'data-multi="1"' : ''} ${ro ? 'disabled' : ''}>${esc(rot)}</button>`;
    }).join('')}</div>`;
    const campo = (k, rot, corpo, obrig = true, dica = '') => `<div class="campo vst-campo" data-campo="${esc(k)}"><label>${esc(rot)}${obrig ? ' *' : ''}</label>${corpo}${dica ? `<div class="small muted">${dica}</div>` : ''}</div>`;
    return {
      chips, campo,
      escolha: (v, k, rot, lista, dica) => campo(k, rot, chips(k, typeof lista === 'string' ? L[lista] : lista, v, false), true, dica),
      multi: (v, k, rot, lista) => campo(k, rot, chips(k, typeof lista === 'string' ? L[lista] : lista, v, true)),
      numero: (v, k, rot, dica) => campo(k, rot, `<input class="inp" type="number" inputmode="decimal" min="0" step="any" data-inp="${esc(k)}" data-num="1" value="${esc(obter(v, k) ?? '')}" ${ro ? 'disabled' : ''}>`, true, dica),
      texto: (v, k, rot, obrig, area, ph) => campo(k, rot, area
        ? `<textarea class="inp" data-inp="${esc(k)}" placeholder="${esc(ph || '')}" ${ro ? 'disabled' : ''}>${esc(obter(v, k) || '')}</textarea>`
        : `<input class="inp" data-inp="${esc(k)}" placeholder="${esc(ph || '')}" value="${esc(obter(v, k) || '')}" ${ro ? 'disabled' : ''}>`, obrig)
    };
  };
  const bloco = (titulo, corpo, id) => `<div class="card vst-bloco" ${id ? `id="${id}"` : ''}><h3>${titulo}</h3>${corpo}</div>`;

  // Campo de foto (cada tipo tem o seu; nunca um anexo genérico).
  const htmlFoto = (v, tipo, ref, ro, obrig = true) => {
    const info = L.foto(tipo);
    const lista = (v.fotos || []).filter(f => f.tipo_foto === tipo && (ref === undefined || String(f.ref) === String(ref)));
    const campo = tipo === 'anomalia' ? 'trecho.anomalias.' + ref : 'foto:' + tipo;
    const thumbs = lista.map(f => {
      const l = T.fotosLocais[f.id_foto];
      const src = l && l.thumb ? l.thumb : (f.drive_id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(f.drive_id)}&sz=w240` : '');
      const st = !l ? 'enviada' : l.status;
      const ico = { pendente: '⏳', enviando: '⟳', enviada: '✓', erro: '⚠' }[st] || '';
      return `<div class="vst-thumb ${f.flag_suspeita ? 'suspeita' : ''} st-${st}" title="${esc(l && l.erro ? l.erro : st)}">
        ${src ? `<img src="${src}" alt="">` : '<div class="vazio">📷</div>'}<span class="st">${ico}</span>
        ${f.flag_suspeita ? '<span class="sus">suspeita</span>' : ''}
        ${!ro ? `<button type="button" class="del" data-del-foto="${esc(f.id_foto)}" title="Remover">×</button>` : ''}</div>`;
    }).join('');
    const podeMais = !ro && (info.multipla || !lista.length);
    return `<div class="vst-foto" data-campo="${esc(campo)}">
      <div class="rot">📷 ${info.n}. ${esc(info.rot)}${obrig ? ' *' : ''}</div>
      <div class="vst-thumbs">${thumbs}
        ${podeMais ? `<label class="vst-cap"><input type="file" accept="image/*" capture="environment" data-foto="${tipo}" ${ref !== undefined ? `data-ref="${ref}"` : ''} hidden><span>＋<br>${lista.length ? 'Mais uma' : 'Tirar foto'}</span></label>` : ''}
        ${!ro && !info.multipla && lista.length ? `<label class="vst-cap refazer"><input type="file" accept="image/*" capture="environment" data-foto="${tipo}" ${ref !== undefined ? `data-ref="${ref}"` : ''} hidden><span>↻<br>Refazer</span></label>` : ''}
      </div></div>`;
  };

  const htmlCs = (s, v, ro) => {
    const h = H(ro), cfg = T.cfg, abriu = v.abriu === 'sim';
    const base = v.cs_nova ? null : T.cs[v.id_cs];
    const exige = new Set(VR.fotosObrigatorias(v).map(f => f.tipo));
    const foto = (tipo, ref) => htmlFoto(v, tipo, ref, ro);
    const st = statusServidor(s), srv = s.servidor || {};
    let topo = '';
    if (s.status_local === 'enviada' && st === 'REJEITADA' && !editavel(s)) {
      topo = `<div class="aviso erro" style="margin-bottom:10px"><b>Rejeitada na revisão</b> por ${esc(srv.revisor || '')} em ${SN.dt(srv.data_revisao)}:<br>
        ${(srv.motivo_rejeicao || []).map(m => '• ' + esc(L.rotulo('motivos_rejeicao', m))).join('<br>')}${srv.motivo_rejeicao_texto ? '<br>' + esc(srv.motivo_rejeicao_texto) : ''}
        <button class="btn prim bloco" id="vRefazer" style="margin-top:8px">✏️ Refazer esta CS</button></div>`;
    } else if (s.status_local === 'enviada') {
      topo = `<div class="aviso ${st === 'APROVADA' ? 'ok' : 'info'}" style="margin-bottom:10px">${st === 'APROVADA' ? '✓ Aprovada na revisão.' : '✓ Enviada. Aguardando revisão.'}
        ${srv.enviado_em ? ' Enviada em ' + SN.dt(srv.enviado_em) + '.' : ''}</div>`;
    } else if (['fila', 'enviando'].includes(s.status_local)) {
      topo = '<div class="aviso info" style="margin-bottom:10px">⟳ Na fila de envio. Pode seguir para a próxima CS: o envio continua sozinho, mesmo sem sinal agora.</div>';
    } else if (s.status_local === 'erro') {
      topo = `<div class="aviso erro" style="margin-bottom:10px"><b>O servidor não aceitou:</b> ${esc(s.erro || '')}
        ${(s.erros || []).length ? '<br>' + s.erros.map(e => '• ' + esc(e.msg)).join('<br>') : ''}<br>Corrija e envie de novo.</div>`;
    }
    if (st === 'REJEITADA' && editavel(s) && srv.motivo_rejeicao) {
      topo += `<div class="aviso alerta" style="margin-bottom:10px">Refazendo CS rejeitada. Motivo: ${(srv.motivo_rejeicao || []).map(m => esc(L.rotulo('motivos_rejeicao', m))).join(', ')}${srv.motivo_rejeicao_texto ? ' — ' + esc(srv.motivo_rejeicao_texto) : ''}</div>`;
    }

    // ── Trecho (da CS anterior até esta) ──
    let trecho = '';
    if (s.ordem > 1) {
      const t = v.trecho || {}, an = t.anomalias || [];
      trecho = bloco(`🚶 Trecho: ${esc(csAnterior(s.ordem) || 'CS ' + (s.ordem - 1))} → ${esc(v.cs_nova ? 'CS nova' : v.id_cs || 'esta CS')}`, `
        ${h.escolha(v, 'trecho.superficie_percorrida', 'Superfície percorrida', 'sim_nao')}
        <div class="small muted" style="margin-bottom:6px">Anomalias no trecho (uma por ocorrência, cada uma com posição e foto)</div>
        ${an.map((a, i) => `<div class="vst-anomalia" data-campo="trecho.anomalias.${i}">
          <div style="display:flex;justify-content:space-between;align-items:center"><b>Anomalia ${i + 1}</b>${!ro ? `<button type="button" class="btn sm perigo" data-del-anom="${i}">Remover</button>` : ''}</div>
          ${h.escolha(v, 'trecho.anomalias.' + i + '.tipo', 'Tipo', 'anomalia_trecho')}
          ${a.tipo === 'outro' ? h.texto(v, 'trecho.anomalias.' + i + '.texto', 'Descreva', true) : ''}
          ${htmlGps(a.lat, a.lng, a.precisao, 'trecho.anomalias.' + i, ro)}
          ${foto('anomalia', i)}</div>`).join('')}
        ${!ro ? '<button type="button" class="btn bloco" id="vAddAnom">＋ Adicionar anomalia</button>' : ''}`);
    }

    // ── Identificação ──
    const usadas = Object.values(T.slots).filter(x => x.dados && x.dados !== v && !x.dados.cs_nova).map(x => x.dados.id_cs);
    const opcoesCs = (T.rota.cs_planejadas || []).map(id => `<option value="${esc(id)}" ${v.id_cs === id && !v.cs_nova ? 'selected' : ''}>${esc(id)}${usadas.includes(id) ? ' (em outra aba)' : ''}${T.cs[id] && T.cs[id].endereco ? ' — ' + esc(T.cs[id].endereco) : ''}</option>`).join('');
    const extra = v.id_cs && !v.cs_nova && !(T.rota.cs_planejadas || []).includes(v.id_cs) ? `<option value="${esc(v.id_cs)}" selected>${esc(v.id_cs)} (fora da rota)</option>` : '';
    const gps = base ? VR.gpsDivergencia(v.lat, v.lng, base.lat, base.lng, cfg.gps_max_m) : { distancia_m: null, divergente: null };
    const ident = bloco('🆔 Identificação', `
      ${h.campo('id_cs', 'ID da CS', `<select class="inp" data-sel-cs ${ro ? 'disabled' : ''}><option value="">Escolha…</option>${opcoesCs}${extra}
        <option value="__nova" ${v.cs_nova ? 'selected' : ''}>CS não consta no cadastro</option></select>`)}
      ${base ? `<div class="small muted" style="margin:-4px 0 8px">Cadastro: ${esc(base.endereco || 'sem endereço')} · ${base.lat}, ${base.lng}
        · <a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${base.lat},${base.lng}">abrir no mapa</a></div>` : ''}
      ${htmlGps(v.lat, v.lng, v.gps_precisao, '', ro, 'lat')}
      ${gps.distancia_m != null ? `<div class="small" style="margin:-4px 0 8px">A <b>${gps.distancia_m} m</b> da posição cadastrada
        ${gps.divergente === true ? `<span class="badge erro">acima de ${cfg.gps_max_m} m</span>` : gps.divergente === false ? '<span class="badge ok">dentro da tolerância</span>' : '<span class="badge">tolerância a definir</span>'}</div>` : ''}
      ${h.texto(v, 'endereco', 'Endereço e referência', true, true, 'Rua, número, ponto de referência')}
      ${v.cs_nova ? '<div class="small muted" style="margin-bottom:8px">Situação no cadastro: <b>não consta</b> (gera registro de CS fora do cadastro).</div>'
        : h.escolha(v, 'situacao_cadastro', 'Situação no cadastro', L.situacao_cadastro.filter(x => x[0] !== 'nao_consta'))}
      ${gps.divergente && v.situacao_cadastro !== 'consta_divergente' ? h.texto(v, 'gps_justificativa', 'Justificativa da posição (ou marque "posição divergente")', true, true) : ''}`, 'vbIdent');

    const semCs = !v.id_cs && !v.cs_nova;
    const aviso = semCs ? '<div class="aviso alerta" style="margin-bottom:10px">Escolha a CS acima antes de tirar fotos (o ID vai na marca d\'água).</div>' : '';

    const acesso = bloco('🔓 Acesso', `
      ${h.escolha(v, 'abriu', 'Conseguiu abrir?', 'sim_nao')}
      ${v.abriu === 'nao' ? h.escolha(v, 'motivo_nao_abriu', 'Motivo', 'motivo_nao_abriu') : ''}
      ${v.abriu === 'nao' && v.motivo_nao_abriu === 'outro' ? h.texto(v, 'motivo_nao_abriu_texto', 'Descreva o motivo', true, true) : ''}`);

    const solo = bloco('🛣️ Condição do solo no entorno (na chegada)', `
      ${h.escolha(v, 'solo_entorno', 'Entorno', 'solo_entorno')}
      ${exige.has('anomalia_solo') ? foto('anomalia_solo') : ''}`);

    const tampa = bloco('⚫ Tampa', `
      ${cfg.tampa_tipos.length ? h.escolha(v, 'tampa_tipo', 'Tipo e material', cfg.tampa_tipos.map(x => [x, x])) : '<div class="small muted" style="margin-bottom:8px">Tipo e material da tampa: lista ainda não definida.</div>'}
      ${h.escolha(v, 'tampa_estado', 'Estado', 'tampa_estado')}
      ${h.escolha(v, 'tampa_identificacao', 'Identificação na tampa', 'tampa_identificacao')}
      ${foto('contexto')}${foto('tampa_perto')}`);

    let interno = '';
    if (abriu) {
      const fora = VR.foraDoCriterio(v.profundidade_cm, cfg.profundidade_min_cm);
      const n = Number(v.cabos_qtd) || 0, cen = T.rota.cenario_esperado || {};
      const opsCabo = cfg.operadoras;
      const cabos = Array.from({ length: n }, (_, i) => {
        const op = ((v.cabos || [])[i] || {}).operadora || '';
        const k = 'cabos.' + i + '.operadora';
        return `<div class="vst-cabo" data-campo="cabos.${i}"><span>Cabo ${i + 1}</span>${opsCabo.length
          ? `<select class="inp" data-inp="${k}" ${ro ? 'disabled' : ''}><option value="">Operadora pela plaqueta…</option>${opsCabo.map(o => `<option ${op === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
              <option value="nao_identificado" ${op === 'nao_identificado' ? 'selected' : ''}>Não identificado</option></select>`
          : `<input class="inp" data-inp="${k}" placeholder="Operadora na plaqueta" value="${esc(op === 'nao_identificado' ? '' : op)}" ${ro ? 'disabled' : ''}>
             <button type="button" class="chip ${op === 'nao_identificado' ? 'sel' : ''}" data-chip="${k}" data-v="nao_identificado" ${ro ? 'disabled' : ''}>Não identificado</button>`}</div>`;
      }).join('');
      interno = bloco('💧 Interior', `
          ${foto('tampa_aberta')}
          ${h.escolha(v, 'agua', 'Água', 'agua')}${h.escolha(v, 'limpeza', 'Limpeza', 'limpeza')}
          ${h.escolha(v, 'assoreamento', 'Acúmulo de terra no fundo', 'assoreamento')}
          ${h.escolha(v, 'terra_dutos', 'Terra entrando pelos dutos', 'sim_nao')}${h.escolha(v, 'infiltracao', 'Infiltração nas paredes', 'sim_nao')}
          ${h.escolha(v, 'estrutura', 'Estrutura das paredes e do fundo', 'estrutura')}`)
        + bloco('🟫 Dutos', `
          <div class="linha-form">${h.numero(v, 'dutos_entradas', 'Entradas')}${h.numero(v, 'dutos_ocupadas', 'Ocupadas')}${h.numero(v, 'dutos_vagas', 'Vagas')}</div>
          ${Number(v.dutos_vagas) > 0 ? h.escolha(v, 'tamponamento', 'Tamponamento dos dutos vagos', 'sim_nao_parcial') : ''}
          ${h.numero(v, 'profundidade_cm', 'Profundidade (cm)', 'Trena do nível do pavimento até o topo do duto, na parede da caixa.')}
          ${fora === true ? `<div class="aviso alerta small" style="margin:-4px 0 8px">Fora do critério: abaixo de ${cfg.profundidade_min_cm} cm.</div>`
            : fora === null && cfg.profundidade_min_cm == null && v.profundidade_cm ? '<div class="small muted" style="margin:-4px 0 8px">Profundidade mínima ainda não definida: o valor fica registrado.</div>' : ''}
          ${foto('profundidade')}${foto('parede')}`)
        + bloco('🔌 Cabos', `
          <div class="faixa small" style="margin-bottom:10px">Cenário esperado da rota — operadoras: <b>${esc((cen.operadoras || []).join(', ') || '—')}</b> · dono do duto: ${esc(cen.dono_duto || '—')}</div>
          ${h.numero(v, 'cabos_qtd', 'Quantidade de cabos')}
          ${cabos}
          ${h.escolha(v, 'cabos_batem', 'Bate com o cenário esperado?', 'sim_nao')}
          ${v.cabos_batem === 'nao' ? h.multi(v, 'cabos_divergencias', 'O que diverge (pode marcar mais de um)', 'cabos_divergencia') : ''}
          ${exige.has('plaquetas') || v.cabos_batem === 'nao' ? foto('plaquetas') : ''}`)
        + bloco('🧰 Organização', `
          ${h.escolha(v, 'fixacao', 'Cabos fixados em ferragem ou suporte', 'sim_nao_parcial')}
          ${h.escolha(v, 'reserva', 'Reserva técnica', 'reserva')}${h.escolha(v, 'organizacao', 'Estado geral', 'organizacao')}
          ${foto('organizacao')}`)
        + bloco('🔗 Emenda', `
          ${h.escolha(v, 'emenda_existe', 'Existe emenda?', 'sim_nao')}
          ${v.emenda_existe === 'sim' ? `<div class="small muted" style="margin-bottom:6px">Inspeção visual externa</div>
            ${h.escolha(v, 'emenda_caixa', 'Caixa de emenda', 'emenda_caixa')}${h.escolha(v, 'emenda_fixacao', 'Fixação', 'emenda_fixacao')}
            ${h.escolha(v, 'emenda_submersa', 'Submersa?', 'emenda_submersa')}${h.escolha(v, 'emenda_vedacao', 'Vedação aparente', 'emenda_vedacao')}
            ${foto('emenda_externa')}
            ${h.escolha(v, 'emenda_aberta', 'Emenda aberta?', 'sim_nao')}
            ${v.emenda_aberta === 'sim' ? `${h.texto(v, 'emenda_autorizado_por', 'Autorizado por', true)}${h.texto(v, 'emenda_tecnico', 'Técnico de emenda', true)}
              ${foto('emenda_antes')}${foto('emenda_depois')}` : ''}` : ''}`);
    }

    const conclusao = bloco('✅ Conclusão', `
      ${h.escolha(v, 'conclusao', 'Conclusão', 'conclusao')}${h.escolha(v, 'prioridade', 'Prioridade', 'prioridade')}
      ${h.texto(v, 'observacao', 'Observação', false, true, 'Complementar (opcional)')}
      ${abriu ? foto('tampa_final') : ''}`);

    const inicio = v.inicio ? `<div class="small muted" style="margin-bottom:8px">Início ${SN.dt(v.inicio)}${v.fim ? ' · fim ' + SN.dt(v.fim) : ''}</div>` : '';
    return topo + inicio + trecho + ident + aviso + acesso + solo + tampa + interno + conclusao
      + (ro ? '' : `<div class="vst-envio" id="vEnvio"></div><div class="vst-barra" id="vBarra"></div>`);
  };

  const htmlGps = (lat, lng, precisao, prefixo, ro, campo) => {
    const tem = lat != null && lat !== '' && lng != null && lng !== '';
    return `<div class="campo vst-campo" ${campo ? `data-campo="${campo}"` : ''}><label>Posição (lat/lng) *</label>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${!ro ? `<button type="button" class="btn" data-gps="${esc(prefixo)}">📍 ${tem ? 'Capturar de novo' : 'Capturar posição'}</button>` : ''}
        <span class="small ${tem ? '' : 'muted'}">${tem ? `${lat}, ${lng}${precisao ? ' · ±' + precisao + ' m' : ''} · <a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${lat},${lng}">mapa</a>` : 'não capturada'}</span>
      </div></div>`;
  };

  // Painel "falta para enviar" + botão.
  const pintarEnvio = (s, v) => {
    const el = SN.$('#vEnvio'); if (!el) return;
    const r = validar(v);
    // Lista completa no fim do formulário; fixa no rodapé só uma barra compacta.
    el.innerHTML = `<div id="vFaltas" style="scroll-margin-bottom:90px">${r.erros.length ? `<div class="aviso alerta"><b>Falta para enviar (${r.erros.length})</b> <span class="small">— toque num item para ir ao campo</span>
        <ul class="vst-faltas">${r.erros.map(e => `<li data-ir="${esc(e.campo)}">${esc(e.msg)}</li>`).join('')}</ul></div>`
      : '<div class="aviso ok">✓ Tudo preenchido. Pode enviar esta CS.</div>'}
      ${r.avisos.length ? `<div class="small muted" style="margin-top:6px">${r.avisos.map(esc).join('<br>')}</div>` : ''}</div>`;
    SN.$('#vBarra').innerHTML = `${r.erros.length ? `<button type="button" class="btn fantasma" id="vVerFaltas">Faltam ${r.erros.length} ▾</button>` : '<span class="small" style="color:var(--ok);font-weight:600">✓ Completa</span>'}
        <button class="btn prim" id="vEnviar" ${r.ok ? '' : 'disabled'}>📤 Enviar CS ${s.ordem}</button>`;
    const ver = SN.$('#vVerFaltas');
    if (ver) ver.onclick = () => SN.$('#vFaltas').scrollIntoView({ behavior: 'smooth', block: 'center' });
    SN.$$('[data-ir]', el).forEach(li => li.onclick = () => {
      const c = li.dataset.ir;
      const alvo = SN.$(`[data-campo="${CSS.escape(c)}"]`) || SN.$(`[data-campo^="${CSS.escape(c.split('.').slice(0, 2).join('.'))}"]`);
      if (alvo) { alvo.scrollIntoView({ behavior: 'smooth', block: 'center' }); alvo.classList.add('vst-piscar'); setTimeout(() => alvo.classList.remove('vst-piscar'), 1600); }
    });
    SN.$('#vEnviar').onclick = () => enviar(s, v);
  };

  // ─────────── Eventos ───────────
  const ligarCs = (el, s, v, ro) => {
    const refazer = SN.$('#vRefazer', el);
    if (refazer) refazer.onclick = async () => {
      const srv = s.servidor;
      const limpo = JSON.parse(JSON.stringify(srv));
      ['status_revisao', 'revisor', 'data_revisao', 'motivo_rejeicao', 'motivo_rejeicao_texto', 'enviado_em', 'envios', 'historico', 'flags', 'fora_da_rota', 'cenario_esperado'].forEach(k => delete limpo[k]);
      limpo.fim = '';
      Object.assign(s, { dados: limpo, status_local: 'rascunho', erro: '', erros: [] });
      await salvarSlot(s); pintarAbas(); pintarCs();
    };
    if (ro) return;
    const mudou = (rerender = true) => { salvarDepois(s); if (rerender) { pintarCs(); pintarAbas(); } else pintarEnvio(s, v); };

    SN.$$('[data-chip]', el).forEach(b => b.onclick = () => {
      const k = b.dataset.chip, val = b.dataset.v;
      if (b.dataset.multi) { const a = obter(v, k) || []; definir(v, k, a.includes(val) ? a.filter(x => x !== val) : [...a, val]); }
      else definir(v, k, obter(v, k) === val ? '' : val);
      // Limpa o que deixou de se aplicar, para não enviar lixo escondido.
      if (k === 'abriu' && v.abriu !== 'nao') { v.motivo_nao_abriu = ''; v.motivo_nao_abriu_texto = ''; }
      if (k === 'cabos_batem' && v.cabos_batem !== 'nao') v.cabos_divergencias = [];
      if (k === 'emenda_existe' && v.emenda_existe !== 'sim') v.emenda_aberta = '';
      mudou();
    });
    SN.$$('[data-inp]', el).forEach(i => {
      const ler = () => {
        let val = i.value;
        if (i.dataset.num) val = val === '' ? '' : Number(val);
        else if (i.tagName !== 'SELECT') val = val.replace(/^\s+/, '');
        return val;
      };
      i.oninput = () => { definir(v, i.dataset.inp, ler()); mudou(false); };
      i.onchange = () => {
        definir(v, i.dataset.inp, ler());
        if (i.dataset.inp === 'cabos_qtd') { const n = Math.max(0, Math.floor(Number(v.cabos_qtd) || 0)); v.cabos = Array.from({ length: n }, (_, k) => (v.cabos || [])[k] || { operadora: '' }); }
        mudou(i.dataset.num || i.tagName === 'SELECT');
      };
    });
    const selCs = SN.$('[data-sel-cs]', el);
    if (selCs) selCs.onchange = () => {
      const val = selCs.value;
      if (val === '__nova') { v.cs_nova = true; v.id_cs = ''; v.situacao_cadastro = 'nao_consta'; v.gps_justificativa = ''; }
      else {
        v.cs_nova = false; v.id_cs = val;
        if (v.situacao_cadastro === 'nao_consta') v.situacao_cadastro = '';
        if (val && T.cs[val] && !v.endereco) v.endereco = T.cs[val].endereco || '';
      }
      if (v.fotos.length) SN.toast('As fotos já tiradas continuam com a marca d\'água da CS anterior. Refaça-as se a CS mudou.', 'erro');
      mudou();
    };
    SN.$$('[data-gps]', el).forEach(b => b.onclick = async () => {
      b.disabled = true; const t = b.textContent; b.textContent = 'Obtendo GPS…';
      try {
        const p = await SN.VF.pegarPosicao(10000);
        const pre = b.dataset.gps;
        if (pre) { definir(v, pre + '.lat', p.lat); definir(v, pre + '.lng', p.lng); definir(v, pre + '.precisao', p.precisao); }
        else { v.lat = p.lat; v.lng = p.lng; v.gps_precisao = p.precisao; v.gps_em = SN.agora(); }
        if (p.precisao > 50) SN.toast(`Precisão baixa (±${p.precisao} m). Se puder, capture de novo em local aberto.`);
        mudou();
      } catch (e) { SN.toast(e.message, 'erro'); b.disabled = false; b.textContent = t; }
    });
    const add = SN.$('#vAddAnom', el);
    if (add) add.onclick = () => { v.trecho = v.trecho || { anomalias: [] }; (v.trecho.anomalias = v.trecho.anomalias || []).push({ tipo: '', texto: '', lat: '', lng: '' }); mudou(); };
    SN.$$('[data-del-anom]', el).forEach(b => b.onclick = async () => {
      const i = Number(b.dataset.delAnom);
      if (!await SN.confirmar('Remover anomalia', `Remover a anomalia ${i + 1} e a foto dela?`, 'Remover', 'perigo')) return;
      v.trecho.anomalias.splice(i, 1);
      // fotos: remove a da anomalia e renumera as seguintes
      v.fotos = v.fotos.filter(f => !(f.tipo_foto === 'anomalia' && Number(f.ref) === i))
        .map(f => f.tipo_foto === 'anomalia' && Number(f.ref) > i ? { ...f, ref: Number(f.ref) - 1 } : f);
      mudou();
    });
    SN.$$('[data-del-foto]', el).forEach(b => b.onclick = async () => {
      if (!await SN.confirmar('Remover foto', 'Remover esta foto da CS?', 'Remover', 'perigo')) return;
      v.fotos = v.fotos.filter(f => f.id_foto !== b.dataset.delFoto); mudou();
    });
    SN.$$('[data-foto]', el).forEach(inp => inp.onchange = async () => {
      const file = inp.files && inp.files[0]; if (!file) return;
      await capturar(s, v, inp.dataset.foto, inp.dataset.ref !== undefined ? Number(inp.dataset.ref) : undefined, file);
    });
    pintarEnvio(s, v);
  };

  // ─────────── Foto: captura → marca d'água → aparelho → fila ───────────
  const capturar = async (s, v, tipo, ref, file) => {
    if (!v.id_cs && !v.cs_nova) return SN.toast('Escolha a CS antes das fotos.', 'erro');
    SN.toast('Processando foto…');
    try {
      const info = L.foto(tipo);
      // GPS (até 8 s) + endereço + data do arquivo + marca d'água estilo Timemark com a logo.
      const img = await SN.VF.fotoCarimbada(file, `${v.cs_nova ? 'CS nova' : v.id_cs} · ${T.rota.id_rota} · Foto ${info.n}${ref !== undefined ? ' (anomalia ' + (ref + 1) + ')' : ''} · Preventiva`);
      const agora = img.agora, pos = img.pos;
      const dataArq = img.dataArquivo ? new Date(img.dataArquivo) : null, exif = img.fonteData === 'exif';
      const id_foto = 'F' + SN.uid() + SN.uid();
      const sus = VR.fotoSuspeita(dataArq && dataArq.toISOString(), agora, T.cfg.foto_tolerancia_min);
      const meta = { id_foto, id_vistoria: v.id_vistoria, id_trecho: tipo === 'anomalia' ? 'T_' + v.id_vistoria : '', id_rota: T.rota.id_rota,
        id_cs: v.cs_nova ? '' : v.id_cs, tipo_foto: tipo, ref: ref === undefined ? '' : ref, lat: pos ? pos.lat : '', lng: pos ? pos.lng : '',
        data_hora_captura: agora, data_hora_arquivo: dataArq ? dataArq.toISOString() : '', fonte_data_arquivo: exif ? 'exif' : 'lastModified', endereco: img.endereco || '' };
      if (!info.multipla) v.fotos = v.fotos.filter(f => !(f.tipo_foto === tipo && (ref === undefined || String(f.ref) === String(ref))));
      v.fotos.push({ id_foto, tipo_foto: tipo, ref: meta.ref, lat: meta.lat, lng: meta.lng, data_hora_captura: agora,
        data_hora_arquivo: meta.data_hora_arquivo, flag_suspeita: sus.suspeita, diferenca_min: sus.diferenca_min });
      const reg = { id_foto, id_vistoria: v.id_vistoria, id_rota: T.rota.id_rota, meta, dataUrl: img.dataUrl, thumb: img.thumb, criadaEm: agora, status: 'pendente' };
      T.fotosLocais[id_foto] = reg;
      await salvarSlot(s);
      await SN.VL.guardarFoto(reg);
      if (sus.suspeita) SN.toast('Atenção: a data do arquivo não bate com a hora atual. A foto será marcada para a revisão. Use sempre a câmera.', 'erro');
      if (!pos) SN.toast('Foto sem GPS: a posição não entrou na marca d\'água.', 'erro');
      pintarCs(); pintarFaixa();
    } catch (e) { SN.toast('Não foi possível processar a foto: ' + (e.message || e), 'erro'); }
  };

  // ─────────── Enviar a CS ───────────
  const enviar = async (s, v) => {
    flush();
    if (s.ordem > 1) v.trecho = { ...(v.trecho || {}), cs_origem: csAnterior(s.ordem) };
    const r = validar(v);
    if (!r.ok) { pintarEnvio(s, v); return SN.toast('Ainda falta preencher: ' + r.erros[0].msg, 'erro'); }
    const nomeCs = v.cs_nova ? 'CS nova (fora do cadastro)' : v.id_cs;
    if (!await SN.confirmar('Enviar CS ' + s.ordem, `Enviar <b>${esc(nomeCs)}</b>? Depois de enviada ela só volta para edição se a revisão rejeitar.`, 'Enviar', 'prim')) return;
    v.fim = SN.agora();
    // PDF de controle da CS: gerado aqui (com as miniaturas do aparelho) e enviado
    // pela mesma fila das fotos. Sem a biblioteca de PDF, a CS segue sem a ficha.
    try {
      const pdf = await SN.vst.pdfFichaCs({ ...v, tecnico: SN.usuario().nome }, T.rota, T.fotosLocais);
      if (pdf) {
        const id_foto = 'P' + SN.uid() + SN.uid(), agora = SN.agora();
        const meta = { id_foto, id_vistoria: v.id_vistoria, id_rota: T.rota.id_rota, id_cs: v.cs_nova ? '' : v.id_cs, tipo_foto: 'ficha_pdf', ref: '',
          lat: v.lat, lng: v.lng, data_hora_captura: agora, data_hora_arquivo: agora };
        v.fotos = v.fotos.filter(f => f.tipo_foto !== 'ficha_pdf').concat([{ id_foto, tipo_foto: 'ficha_pdf', ref: '', data_hora_captura: agora, data_hora_arquivo: agora, flag_suspeita: false }]);
        const reg = { id_foto, id_vistoria: v.id_vistoria, id_rota: T.rota.id_rota, meta, dataUrl: pdf, thumb: null, criadaEm: agora, status: 'pendente' };
        T.fotosLocais[id_foto] = reg;
        await SN.VL.guardarFoto(reg);
      }
    } catch (e) { console.error('[Preventiva] ficha PDF:', e); SN.toast('A CS vai sem a ficha PDF: ' + (e.message || e), 'erro'); }
    s.status_local = 'fila';
    await SN.VL.enfileirar({ id_vistoria: s.id_vistoria, id_rota: s.id_rota, ordem: s.ordem, dados: v, servidor: s.servidor || null });
    SN.toast('CS ' + s.ordem + ' na fila de envio.', 'ok');
    if (s.ordem < T.qtd) { T.aba = s.ordem + 1; try { sessionStorage.setItem('vst_aba_' + T.rota.id_rota, T.aba); } catch (e) { } }
    pintarAbas(); pintarCs(); pintarFaixa();
    SN.$('#vstAbas').scrollIntoView({ block: 'start' });
  };
})();
