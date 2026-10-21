// SIGONET V2 — Esteira de cada programa: Preventiva, Melhoria de rede e Retirada de cabo.
//
// Pedido de 21/10/2026: a Esteira (#/chamados) misturava as atividades da operação com as
// rotas da Preventiva e as atividades de Melhoria/Retirada. Agora cada programa tem a sua
// esteira dentro do próprio grupo do menu (#/vst/esteira, #/mel/esteira, #/ret/esteira) e a
// Esteira principal fica só com o que nasce na operação (SN.programaDoChamado).
//
// Colunas pelo andamento da rota/atividade (não pelo chamado): Planejadas → Despachadas →
// Em campo → Em revisão (técnico finalizou, falta aprovar) → Aprovadas (últimos 7 dias).
// Em cada cartão: Acompanhar ao vivo (SN.vst.abrirAoVivo) e Revisar (abre a revisão do
// programa já filtrada na rota). Também tem a Linha do tempo por técnico, com os chamados do programa.
// Quem vê: quem planeja ou revisa o programa (telas vst_/mel_/ret_esteira em SN.temTela).
(() => {
  const esc = SN.esc;
  const PROG = {
    PREVENTIVA: { rot: 'Preventiva', tela: 'vst_esteira', href: '#/vst/esteira', revTela: 'vst_revisao', plan: '#/vst/planejamento', planTela: 'vst_planejamento' },
    MELHORIA: { rot: 'Melhoria de rede', tela: 'mel_esteira', href: '#/mel/esteira', revTela: 'mel_revisao', plan: '#/mel/planejamento', planTela: 'mel_planejamento' },
    RETIRADA: { rot: 'Retirada de cabo', tela: 'ret_esteira', href: '#/ret/esteira', revTela: 'ret_revisao', plan: '#/ret/planejamento', planTela: 'ret_planejamento' }
  };
  const est = {}; // por programa: busca, segmento (Preventiva), visão
  const E = k => est[k] || (est[k] = { q: '', seg: 'TODOS' });
  const DIAS_APROVADAS = 7;

  // Rotas/atividades do programa e os itens que o técnico manda para revisão.
  const dadosDe = (k, d) => {
    if (k === 'PREVENTIVA') return {
      rotas: (d.rotas || []).filter(r => !r.importado_planilha), vist: d.vistorias || [], prod: d.producao || [],
      itens: [...(d.vistorias || []), ...(d.producao || []).filter(a => !a.importado_planilha)]
    };
    const doSeg = r => r.segmento === k || (VR_LISTAS.programas[r.segmento] || {}).dentroDe === k;
    const rotas = (d.prog_rotas || []).filter(doSeg), ids = {};
    rotas.forEach(r => { ids[r.id_rota] = true; });
    return { rotas, prod: d.prog_producao || [], itens: (d.prog_producao || []).filter(a => ids[a.id_rota] && !a.importado_planilha) };
  };
  const chamado = id => id ? SN.db.chamados.find(c => c.id === id) : null;
  const FIM = ['CONCLUIDO_TECNICO', 'FECHADO'];
  // Tudo aprovado pela mesma regra que o servidor usa para concluir o chamado (VST_REVISAR). Não
  // depende do chamado já sincronizado aqui: logo depois de aprovar, SN.db ainda pode estar com o status antigo.
  const tudoAprovado = (r, dd) => { try { return (VR.ehProg(r) ? VR.resumoChamadoProg(r, dd.prod) : ehAerea(r) ? VR.resumoChamadoAereo(r, dd.prod) : VR.resumoChamado(r, dd.vist)).pronto; } catch (e) { return false; } };
  const situacao = (r, itens, dd) => {
    const meus = itens.filter(a => a.id_rota === r.id_rota), ch = chamado(r.id_chamado);
    const pend = meus.filter(a => a.status_revisao === 'AGUARDANDO_REVISAO').length, rej = meus.filter(a => a.status_revisao === 'REJEITADA').length;
    const aprov = meus.filter(a => a.status_revisao === 'APROVADA').length;
    const aprovada = r.status === 'CONCLUIDA' && (r.concluida_pela_gestao || (ch && FIM.includes(ch.status)) || tudoAprovado(r, dd));
    const col = r.status === 'PLANEJADA' ? 0 : r.status === 'DESPACHADA' ? 1 : r.status === 'EM_CAMPO' ? 2 : r.status === 'CONCLUIDA' ? (aprovada ? 4 : 3) : -1;
    const quando = aprovada ? ((ch && (ch.tempos.conclusaoTecnica || ch.tempos.fechamento)) || meus.map(a => a.data_revisao || '').sort().pop() || r.concluida_em || '') : '';
    return { r, ch, pend, rej, aprov, total: meus.length, col, quando };
  };
  const dia = v => { const s = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : ''; };
  const ehAerea = r => r.segmento === 'AEREA';
  const descricao = (k, r) => k === 'PREVENTIVA' ? (ehAerea(r) ? r.motivo || r.regiao || '' : r.cluster ? 'Cluster ' + r.cluster + ((r.cs_planejadas || []).length ? ` · ${(r.cs_planejadas || []).length} CS` : '') : '')
    : [r.servico, r.pop ? 'POP ' + r.pop : ''].filter(Boolean).join(' · ');

  const abrir = async k => {
    const P = PROG[k];
    if (!SN.vst.disponivel()) return SN.casca(P.tela, SN.vst.semServidorHtml);
    SN.casca(P.tela, SN.carregando('Carregando a esteira…'));
    let d; try { d = await SN.vst.carregar(); } catch (e) { return SN.casca(P.tela, `<div class="aviso erro">${esc(e.message)}</div>`); }
    if (location.hash !== P.href) return;
    pintar(k, d);
  };

  const pintar = (k, d) => {
    const P = PROG[k], e = E(k), dd = dadosDe(k, d), { rotas, itens } = dd;
    const limite = new Date(Date.now() - DIAS_APROVADAS * 864e5).toISOString();
    const q = SN.normal(e.q);
    const todas = rotas.map(r => situacao(r, itens, dd)).filter(x => x.col >= 0 && (x.col < 4 || String(x.quando) >= limite));
    const doSeg = todas.filter(x => k !== 'PREVENTIVA' || e.seg === 'TODOS' || (e.seg === 'AEREA') === ehAerea(x.r));
    const vis = doSeg.filter(x => !q || SN.normal([x.r.id_rota, x.r.id_chamado, x.r.cidade, x.r.cluster, x.r.motivo, x.r.servico, x.r.pop, x.r.endereco, x.r.prestador, x.r.tecnico, x.r.notificacao].join(' ')).includes(q));
    // Chamados do programa sem rota (ex.: NOC classificou como Preventiva): esperam virar rota/atividade.
    const soltos = SN.db.chamados.filter(c => SN.programaDoChamado(c) === k && !(c.preventiva && c.preventiva.id_rota) && SN.STATUS[c.status].aberto);
    const pendTot = doSeg.reduce((s, x) => s + x.pend, 0);
    const cols = ['Planejadas', 'Despachadas', 'Em campo', 'Em revisão', `Aprovadas · ${DIAS_APROVADAS} dias`];
    const podeRev = SN.temTela(P.revTela), podePlan = SN.temTela(P.planTela);
    const card = x => {
      const r = x.r, ch = x.ch, prazo = r.data_limite || r.data_planejada, atrasada = x.col < 3 && r.data_limite && String(r.data_limite).slice(0, 10) < SN.dataIsoLocal(new Date());
      const nova = ch && SN.conversa && SN.conversa.naoLida(ch.id);
      const vivo = ['DESPACHADA', 'EM_CAMPO', 'CONCLUIDA'].includes(r.status) && SN.vst.abrirAoVivo;
      const rev = podeRev && (x.total || x.col >= 2);
      return `<div class="os ${atrasada ? 'estourado' : ''} ${nova ? 'conv-destaque' : ''}" ${ch ? `data-ch="${esc(ch.id)}" data-conv-card="${esc(ch.id)}"` : `data-plan="1"`}>
        ${ch && SN.conversa ? `<div class="l3 conv-selo-card">${SN.conversa.seloCard(ch.id)}</div>` : ''}
        <div class="l1"><span class="mono">${esc(r.id_rota)}</span><span>${k === 'PREVENTIVA' ? (ehAerea(r) ? '🗼 AÉREA' : '🕳️ SUBTERRÂNEA') : esc(ch ? ch.id : '')}</span></div>
        <div class="cli">${esc(r.cidade || '—')}</div>
        ${descricao(k, r) ? `<div class="l3 small">${esc(descricao(k, r))}</div>` : ''}
        <div class="l3">${r.tecnico ? `👷 ${esc(SN.nomeExibicao(r.tecnico))}` : `<span class="muted">${esc(r.prestador || 'sem técnico')}</span>`}</div>
        <div class="l3" style="margin-top:4px">${prazo ? `<span class="badge badge-quebra ${atrasada ? 'erro' : ''}">${r.data_limite ? 'até' : 'planejada'} ${dia(prazo)}</span>` : ''}
          ${x.pend ? `<span class="badge badge-quebra alerta">🔎 ${x.pend} aguardando revisão</span>` : ''}${x.rej ? ` <span class="badge badge-quebra erro">${x.rej} rejeitada(s)</span>` : ''}
          ${x.aprov && x.col < 4 ? ` <span class="badge badge-quebra verde">${x.aprov} aprovada(s)</span>` : ''}${x.col === 3 && !x.pend && !x.rej ? ` <span class="badge badge-quebra info" title="Nada aguardando revisão, mas ainda não fecha a aprovação">${VR.ehSubOuNada(r) ? 'faltam CS planejadas aprovadas' : 'falta o apontamento Finalizado aprovado'}</span>` : ''}${x.col === 4 ? ` <span class="badge badge-quebra verde">✔ aprovada ${dia(x.quando)}</span>` : ''}</div>
        ${vivo || rev ? `<div class="pe-acoes">${vivo ? `<button type="button" class="btn sm ${r.status === 'EM_CAMPO' ? 'prim' : ''}" data-vivo="${esc(r.id_rota)}" title="Ver ao vivo o que o técnico está preenchendo e conversar com ele">${SN.conversa ? SN.conversa.ico('olho') : ''}Acompanhar</button>` : ''}
          ${rev ? `<button type="button" class="btn sm ${x.pend ? 'ok' : ''}" data-rev="${esc(r.id_rota)}" title="Revisar e aprovar o que o técnico mandou">🔎 Revisar${x.pend ? ' (' + x.pend + ')' : ''}</button>` : ''}</div>` : ''}</div>`;
    };
    const chamadosProg = SN.db.chamados.filter(c => SN.programaDoChamado(c) === k);
    const linha = SN.visaoProg === 'linha' && SN.htmlLinhaTempo;
    SN.casca(P.tela, `<style>
      .pe-kanban{grid-template-columns:repeat(5,minmax(0,1fr));overflow-x:visible}
      .pe-kanban .coluna h4{gap:6px;min-height:2.2em}
      .pe-kanban .os,.pe-kanban .os *{overflow-wrap:anywhere}
      .pe-kanban .os .cli{line-height:1.25}
      .pe-acoes{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
      .pe-acoes .btn{flex:1 1 110px;justify-content:center;min-width:0;white-space:normal}
      @media (max-width:1100px){.pe-kanban{grid-template-columns:repeat(5,minmax(190px,1fr));overflow-x:auto}}
    </style>
      <div class="cab-pagina"><div><h1>${esc(P.rot)} · Esteira</h1>
        <p>Acompanhe cada ${k === 'PREVENTIVA' ? 'rota' : 'atividade'} do planejamento até a aprovação. ${podeRev ? `Use <b>Revisar</b> para olhar o que o técnico mandou e aprovar se estiver de acordo${pendTot ? ` (<b>${pendTot}</b> aguardando)` : ''}.` : ''} As atividades da operação (NOC, O&amp;M, CPFL…) ficam na <a href="#/chamados">Esteira</a> principal.</p></div>
        <div class="acoes">${podePlan ? `<a class="btn" href="${P.plan}">🗺️ Planejamento</a>` : ''}<button class="btn" id="peAtualizar">⟳ Atualizar</button></div></div>
      ${soltos.length ? `<div class="aviso alerta" style="margin-bottom:12px"><b>${soltos.length}</b> chamado(s) classificados como ${esc(P.rot)} sem ${k === 'PREVENTIVA' ? 'rota' : 'atividade planejada'}${k === 'PREVENTIVA' ? ' (abra e use "Transformar em rota de Preventiva")' : ''}:
        ${soltos.map(c => `<a href="#/chamado/${esc(c.id)}" class="mono">${esc(c.id)}</a> <span class="small">${esc(c.cliente || '')}</span>`).join(' · ')}</div>` : ''}
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        ${k === 'PREVENTIVA' ? `<div class="abas" style="flex:1">${[['TODOS', 'Todas'], ['SUBTERRANEA', '🕳️ Subterrânea'], ['AEREA', '🗼 Aérea']].map(([s, rot]) =>
          `<button class="aba ${e.seg === s ? 'ativa' : ''}" data-peseg="${s}">${rot}<span class="n">${todas.filter(x => s === 'TODOS' || (s === 'AEREA') === ehAerea(x.r)).filter(x => x.col < 4).length}</span></button>`).join('')}</div>` : '<div style="flex:1"></div>'}
        ${linha ? '' : `<input class="inp busca" id="peQ" style="max-width:280px;margin-bottom:8px" placeholder="Buscar ${k === 'PREVENTIVA' ? 'rota, cluster' : 'atividade, POP'}, cidade, técnico…" value="${esc(e.q)}">`}
        ${SN.htmlLinhaTempo ? `<div class="chips" style="margin-bottom:8px"><button class="chip ${linha ? '' : 'sel'}" data-pevisao="quadro">Quadro</button><button class="chip ${linha ? 'sel' : ''}" data-pevisao="linha">Linha do tempo</button></div>` : ''}</div>
      ${linha ? SN.htmlLinhaTempo(chamadosProg, SN.tecnicosDespacho()) : `<div class="kanban pe-kanban">${cols.map((nome, i) => { const l = vis.filter(x => x.col === i)
        .sort((a, b) => i === 4 ? String(b.quando).localeCompare(String(a.quando)) : (b.pend - a.pend) || String(a.r.data_limite || a.r.data_planejada || 'z').localeCompare(String(b.r.data_limite || b.r.data_planejada || 'z')));
        return `<div class="coluna"><h4>${nome}<span class="badge">${l.length}</span></h4>${l.map(card).join('') || '<p class="muted small center">Vazio</p>'}</div>`; }).join('')}</div>`}`);
    SN.$('#peAtualizar').onclick = async ev => { ev.target.disabled = true; try { pintar(k, await SN.vst.carregar(true)); } catch (er) { SN.toast(er.message, 'erro'); ev.target.disabled = false; } };
    SN.$$('[data-peseg]').forEach(b => b.onclick = () => { e.seg = b.dataset.peseg; pintar(k, d); });
    SN.$$('[data-pevisao]').forEach(b => b.onclick = () => { SN.visaoProg = b.dataset.pevisao; pintar(k, d); });
    const qi = SN.$('#peQ'); if (qi) qi.oninput = SN.debounce(() => { e.q = qi.value.trim(); SN.redesenharDigitando(() => pintar(k, d)); }, 300);
    if (linha && SN.ligarLinhaTempo) SN.ligarLinhaTempo();
    SN.$$('.os[data-ch]').forEach(o => o.onclick = () => SN.navegar('#/chamado/' + o.dataset.ch));
    SN.$$('.os[data-plan]').forEach(o => o.onclick = () => { if (podePlan) SN.navegar(P.plan); });
    SN.$$('[data-vivo]').forEach(b => b.onclick = ev => { ev.stopPropagation();
      SN.vst.abrirAoVivo(b.dataset.vivo).then(() => SN.vst.carregar()).then(nd => { if (location.hash === P.href) pintar(k, nd); }).catch(() => { }); });
    SN.$$('[data-rev]').forEach(b => b.onclick = ev => { ev.stopPropagation();
      if (k === 'PREVENTIVA') SN.vst.revisarRota(b.dataset.rev); else SN.vst.revisarProg(k, b.dataset.rev); });
  };

  Object.keys(PROG).forEach(k => SN.rota(PROG[k].href.slice(1), () => abrir(k), { tela: PROG[k].tela }));
})();
