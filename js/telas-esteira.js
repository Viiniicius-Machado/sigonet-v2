// SIGONET V2 — Chamados · Linha do tempo (visão de despacho no estilo Oracle Field Service / ZEUS).
//
// Cada técnico é uma linha; as horas do dia correm na horizontal. Cada chamado vira um bloco:
//   • tracejado claro = despachado, esperando o técnico sair;
//   • listrado azul   = deslocamento (com o losango da previsão de chegada);
//   • cheio           = em campo (verde), conclusão técnica (roxo), fechado (cinza), devolvido (vermelho);
//   • risquinho vermelho = prazo (SLA); borda vermelha = estourado.
// No topo, a fila de não atribuídos. A linha vermelha vertical é a hora atual. Tocar no bloco abre o chamado.
// Só leitura: usa os tempos que o chamado já registra (tempos.*, deslocamento.previsaoChegada, prazoLimite).
(() => {
  const esc = SN.esc;
  SN.diaEsteira = SN.diaEsteira || '';
  const ms = v => v ? new Date(v).getTime() : null;
  const fimAtendimento = c => { const t = c.tempos || {}; return t.conclusaoTecnica || t.fechamento || null; };
  // Cara do SigoNet (mesma lógica do Dispatch Console): claro = aguardando, listrado = deslocamento,
  // verde da marca = em execução, verde-escuro = conclusão técnica, grafite = fechado, vermelho = devolvido.
  const COR = { EM_CAMPO: '#6a8f1f', DEVOLVIDO: '#c62828', CONCLUIDO_TECNICO: '#3d4f11', FECHADO: '#8d9682', CANCELADO: '#c9cec2' };

  SN.htmlLinhaTempo = (lista, tecnicos) => {
    const hojeIso = SN.dataIsoLocal(new Date());
    const dia = SN.diaEsteira || hojeIso, d0 = new Date(dia + 'T00:00:00').getTime(), d1 = d0 + 864e5, agora = Date.now();
    // Janela de horas: 06–22 h por padrão, abrindo se houver atividade fora dela.
    const doDia = lista.filter(c => { const t = c.tempos || {}, ini = ms(t.atribuicao || t.abertura), fim = ms(fimAtendimento(c)) || (SN.STATUS[c.status].aberto ? agora : ms(t.fechamento));
      return ini != null && ini < d1 && (fim == null || fim >= d0); });
    let h0 = 6, h1 = 22;
    doDia.forEach(c => { const t = c.tempos || {}; [t.atribuicao, t.abertura, t.chegada, fimAtendimento(c)].forEach(v => { const x = ms(v); if (x == null || x < d0 || x >= d1) return; const h = new Date(x).getHours(); h0 = Math.min(h0, h); h1 = Math.max(h1, h + 1); }); });
    const j0 = d0 + h0 * 36e5, j1 = d0 + h1 * 36e5, pct = x => Math.max(0, Math.min(100, (x - j0) / (j1 - j0) * 100));
    const seg = (a, b, cls, estilo, titulo) => { if (a == null || b == null || b <= j0 || a >= j1) return ''; const l = pct(a), w = Math.max(0.6, pct(b) - l);
      return `<div class="est-seg ${cls}" style="left:${l}%;width:${w}%;${estilo || ''}" title="${esc(titulo || '')}"></div>`; };
    const marca = (x, cls, titulo) => x == null || x < j0 || x > j1 ? '' : `<div class="${cls}" style="left:${pct(x)}%" title="${esc(titulo)}"></div>`;
    const bloco = c => {
      const t = c.tempos || {}, p = SN.prazoInfo(c), fim = ms(fimAtendimento(c)) || (SN.STATUS[c.status].aberto ? agora : null);
      const atr = ms(t.atribuicao || t.abertura), des = ms(t.deslocamento), che = ms(t.chegada), ate = Math.min(fim || agora, d1);
      const tit = `${c.id} · ${c.cliente || ''} · ${c.tipo || ''} › ${c.cat2 || ''}\n${SN.STATUS[c.status].rot}${c.tecnico ? ' · ' + c.tecnico : ''}\nprazo ${SN.hora(c.prazoLimite)}${p.estourado ? ' (ESTOURADO)' : ''}`;
      let h = seg(atr, des || che || ate, 'est-espera', '', tit);
      if (des) h += seg(des, che || ate, 'est-desloc', '', tit + '\ndeslocamento');
      if (che) h += seg(che, ate, 'est-campo' + (p.estourado ? ' est-estourado' : ''), `background:${COR[c.status] || '#2e7d32'}`, tit);
      const pv = c.deslocamento && c.deslocamento.previsaoChegada && !che ? marca(ms(c.deslocamento.previsaoChegada), 'est-prev', 'previsão de chegada ' + SN.hora(c.deslocamento.previsaoChegada)) : '';
      const sla = marca(ms(c.prazoLimite), 'est-sla', 'prazo ' + SN.hora(c.prazoLimite));
      const iniRot = Math.max(atr || j0, j0), rot = che || des || atr;
      return `<div class="est-os" data-id="${esc(c.id)}">${h}${pv}${sla}
        <div class="est-rot" style="left:${pct(Math.max(rot || j0, j0))}%">${esc(c.cliente || c.id)}${c.tipo ? ` <span>${esc(c.cat2 || c.tipo)}</span>` : ''}</div></div>`;
    };
    // Linhas: técnicos despacháveis (agrupados por empresa) + quem tem chamado no dia.
    const nomes = {}; (tecnicos || []).forEach(tc => { nomes[tc.nome] = tc; });
    doDia.forEach(c => { if (c.tecnico && !nomes[c.tecnico]) nomes[c.tecnico] = { nome: c.tecnico, empresa: c.empresa || '' }; });
    const porTec = {}; doDia.forEach(c => { if (c.tecnico && c.status !== 'NAO_ATRIBUIDO') (porTec[c.tecnico] = porTec[c.tecnico] || []).push(c); });
    const situacao = n => { const ab = SN.db.chamados.filter(c => c.tecnico === n && SN.STATUS[c.status].aberto);
      if (SN.indisponivel && SN.indisponivel(n)) return ['indisp', 'indisponível'];
      if (ab.some(c => c.status === 'EM_CAMPO' || c.status === 'DEVOLVIDO')) return ['campo', 'em campo'];
      if (ab.some(c => c.status === 'EM_DESLOCAMENTO')) return ['desloc', 'em deslocamento'];
      if (ab.length) return ['fila', ab.length + ' na fila']; return ['livre', 'disponível']; };
    // Padrão: só quem teve chamado no dia ou está em atividade agora; "mostrar todos" abre a equipe inteira.
    const ativos = Object.values(nomes).filter(tc => porTec[tc.nome] || situacao(tc.nome)[0] !== 'livre');
    const visiveis = SN.esteiraTodos ? Object.values(nomes) : ativos;
    const grupos = {}; visiveis.forEach(tc => { (grupos[tc.empresa || '—'] = grupos[tc.empresa || '—'] || []).push(tc); });
    const linhaTec = tc => { const [cls, txt] = situacao(tc.nome), cs = (porTec[tc.nome] || []).sort((a, b) => (ms(a.tempos.atribuicao) || 0) - (ms(b.tempos.atribuicao) || 0));
      // Vários chamados no mesmo horário: empilha em faixas para não sobrepor.
      const faixas = []; cs.forEach(c => { const ini = ms(c.tempos.atribuicao || c.tempos.abertura), fim = ms(fimAtendimento(c)) || agora; let k = faixas.findIndex(f => f <= ini); if (k < 0) { k = faixas.length; faixas.push(0); } faixas[k] = fim; c._faixa = k; });
      const alt = Math.max(1, faixas.length) * 26 + 4;
      return `<div class="est-linha"><div class="est-nome"><span class="est-dot dot-${cls}"></span><div><b>${esc(SN.nomeExibicao ? SN.nomeExibicao(tc.nome) : tc.nome)}</b>${cs.length ? ` <span class="muted">(${cs.filter(c => !SN.STATUS[c.status].aberto || c.status === 'CONCLUIDO_TECNICO').length}/${cs.length})</span>` : ''}<div class="muted">${txt}</div></div></div>
        <div class="est-trilho" style="height:${alt}px">${cs.map(c => `<div style="position:absolute;left:0;right:0;top:${2 + c._faixa * 26}px;height:24px">${bloco(c)}</div>`).join('')}</div></div>`; };
    const naoAtr = lista.filter(c => c.status === 'NAO_ATRIBUIDO');
    const horas = []; for (let h = h0; h <= h1; h++) horas.push(h);
    const ehHoje = dia === hojeIso;
    return `<style>
      .est{background:var(--card,#fff);border:1px solid var(--borda,#e2e8da);border-radius:var(--raio,12px);overflow:hidden;box-shadow:var(--sombra)}
      .est-topo{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;background:#1f2614;color:#fff}
      .est-topo b{color:#a8c93c;text-transform:capitalize}
      .est-topo .muted{color:#c9d3bd}
      .est-topo .btn{background:transparent;color:#fff;border-color:rgba(255,255,255,.3)}
      .est-topo .btn:hover{border-color:#a8c93c;color:#a8c93c}
      .est-linha{display:grid;grid-template-columns:220px 1fr;border-bottom:1px solid var(--bg-2,#f0f2ed);min-height:30px}
      .est-linha:hover{background:var(--verde-bg,#f2f7e8)}
      .est-nome{display:flex;gap:8px;align-items:center;padding:3px 10px;font-size:.78rem;border-right:1px solid var(--borda,#e2e8da);line-height:1.2}
      .est-nome .muted{font-size:.72rem}
      .est-grupo{background:var(--verde-bg,#f2f7e8);font-size:.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--verde-escuro,#3d4f11);padding:4px 10px;border-bottom:1px solid var(--verde-borda,#d6e6b8)}
      .est-trilho{position:relative;background-image:linear-gradient(to right,var(--bg-2,#eef0ea) 1px,transparent 1px);background-size:calc(100% / ${h1 - h0}) 100%}
      .est-escala{position:relative;height:22px;font-size:.7rem;color:var(--texto-3,#7a8570)}
      .est-escala span{position:absolute;transform:translateX(-50%);top:4px}
      .est-os{position:absolute;inset:0;cursor:pointer}
      .est-os:hover .est-seg{filter:brightness(1.08)}
      .est-seg{position:absolute;top:3px;bottom:3px;border-radius:5px}
      .est-espera{background:#e3edc8;box-shadow:inset 0 0 0 1px #b9cc84}
      .est-desloc{background:repeating-linear-gradient(135deg,#a8c93c 0 4px,#d4e59a 4px 8px);box-shadow:inset 0 0 0 1px #8fae2c}
      .est-campo{box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}
      .est-estourado{outline:2px solid var(--erro,#c62828);outline-offset:-1px}
      .est-rot{position:absolute;top:5px;padding:0 6px;font-size:.72rem;font-weight:600;color:var(--texto,#1d2614);white-space:nowrap;pointer-events:none;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 2px #fff}
      .est-rot span{font-weight:400;color:var(--texto-2,#4a5540)}
      .est-sla{position:absolute;top:0;bottom:0;width:2px;background:var(--erro,#c62828);opacity:.65}
      .est-prev{position:absolute;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;background:#3d4f11;transform:rotate(45deg);border:2px solid #a8c93c}
      .est-agora{position:absolute;top:0;bottom:0;width:2px;background:#3d4f11;z-index:3;pointer-events:none;box-shadow:0 0 0 1px rgba(168,201,60,.5)}
      .est-dot{width:10px;height:10px;border-radius:50%;flex:none}
      .dot-campo{background:#6a8f1f}.dot-desloc{background:#a8c93c}.dot-fila{background:#fff;box-shadow:inset 0 0 0 2px #6a8f1f}.dot-livre{background:#c9d3bd}.dot-indisp{background:var(--erro,#c62828)}
      .est-leg{display:flex;gap:12px;flex-wrap:wrap;font-size:.72rem;color:var(--texto-2,#4a5540);padding:8px 12px;border-top:1px solid var(--borda,#e2e8da);background:var(--bg-2,#f6f8f3)}
      .est-leg i{display:inline-block;width:18px;height:10px;border-radius:3px;vertical-align:middle;margin-right:4px}
      .est-fila{display:flex;gap:6px;flex-wrap:wrap;padding:6px 10px}
      .est-hora{position:absolute;top:1px;transform:translateX(-50%);background:#3d4f11;color:#a8c93c;font-size:.68rem;font-weight:700;border-radius:4px;padding:1px 6px;z-index:4}
      .est-chip{border:1px solid var(--verde-borda,#d6e6b8);background:#fff;border-radius:6px;padding:3px 8px;font-size:.74rem;cursor:pointer}
      .est-chip:hover{border-color:var(--verde,#6a8f1f)}
    </style>
    <div class="est">
      <div class="est-topo"><button class="btn sm" data-estdia="-1">◀</button><b>${new Date(d0).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}</b>
        <button class="btn sm" data-estdia="1">▶</button>${ehHoje ? '' : '<button class="btn sm" data-estdia="0">Hoje</button>'}
        <span class="muted small" style="margin-left:auto">${doDia.filter(c => c.tecnico).length} chamado(s) no dia · ${ativos.length} técnico(s) com atividade</span>
        <button class="btn sm" data-esttodos>${SN.esteiraTodos ? 'Só com atividade' : `Mostrar todos (${Object.keys(nomes).length})`}</button></div>
      ${naoAtr.length ? `<div class="est-grupo">Não atribuídos (${naoAtr.length})</div><div class="est-fila">${naoAtr.sort((a, b) => (a.prazoLimite || 'z').localeCompare(b.prazoLimite || 'z')).map(c => { const p = SN.prazoInfo(c);
        return `<span class="est-chip" data-id="${esc(c.id)}" title="${esc(c.id + ' · ' + (c.cliente || '') + ' · prazo ' + SN.hora(c.prazoLimite))}">${esc(c.cliente || c.id)} · <b style="color:${p.estourado ? 'var(--erro,#c62828)' : 'var(--verde-escuro,#3d4f11)'}">${esc(p.txt)}</b></span>`; }).join('')}</div>` : ''}
      <div class="est-linha" style="min-height:22px;background:#fafbf8"><div class="est-nome muted">Técnico</div><div class="est-escala">${horas.map(h => `<span style="left:${(h - h0) / (h1 - h0) * 100}%">${String(h).padStart(2, '0')}h</span>`).join('')}${ehHoje && agora > j0 && agora < j1 ? `<b class="est-hora" style="left:${pct(agora)}%">${SN.hora(new Date(agora).toISOString())}</b>` : ''}</div></div>
      <div style="position:relative">
        ${ehHoje && agora > j0 && agora < j1 ? `<div style="position:absolute;top:0;bottom:0;left:220px;right:0;pointer-events:none"><div class="est-agora" style="left:${pct(agora)}%"></div></div>` : ''}
        ${Object.keys(grupos).sort().map(g => `<div class="est-grupo">${esc(g)}</div>${grupos[g].sort((a, b) => ((porTec[b.nome] || []).length - (porTec[a.nome] || []).length) || a.nome.localeCompare(b.nome)).map(linhaTec).join('')}`).join('')}
      </div>
      <div class="est-leg"><span><i style="background:#e3edc8;box-shadow:inset 0 0 0 1px #b9cc84"></i>despachado (aguardando)</span><span><i style="background:repeating-linear-gradient(135deg,#a8c93c 0 4px,#d4e59a 4px 8px)"></i>deslocamento</span>
        <span><i style="background:#6a8f1f"></i>em execução</span><span><i style="background:#3d4f11"></i>conclusão técnica</span><span><i style="background:#8d9682"></i>fechado</span><span><i style="background:#c62828"></i>devolvido</span>
        <span><i style="width:2px;background:#c62828"></i>prazo (SLA)</span><span><i style="width:9px;height:9px;background:#3d4f11;border:2px solid #a8c93c;transform:rotate(45deg)"></i>previsão de chegada</span><span><i style="width:2px;background:#3d4f11"></i>agora</span></div>
    </div>`;
  };
  SN.ligarLinhaTempo = () => {
    SN.$$('[data-estdia]').forEach(b => b.onclick = () => { const n = +b.dataset.estdia, base = SN.diaEsteira || SN.dataIsoLocal(new Date());
      SN.diaEsteira = n === 0 ? '' : SN.dataIsoLocal(new Date(new Date(base + 'T12:00:00').getTime() + n * 864e5)); if (SN.diaEsteira === SN.dataIsoLocal(new Date())) SN.diaEsteira = ''; SN.render(); });
    const bt = SN.$('[data-esttodos]'); if (bt) bt.onclick = () => { SN.esteiraTodos = !SN.esteiraTodos; SN.render(); };
    SN.$$('.est-os[data-id], .est-chip[data-id]').forEach(el => el.onclick = () => SN.navegar('#/chamado/' + el.dataset.id));
  };
})();
