// SIGONET V2 — Preventiva: acompanhamento AO VIVO da rota pela gestão.
//
// Técnico (SN.vst.publicarVivo): alguns segundos depois de cada alteração, manda ao
// servidor o rascunho das CS ainda não enviadas (e dos apontamentos da aérea), a aba
// aberta, a quantidade de CS e a posição do GPS. Fica só no cache do servidor: é a
// janela da gestão, não o registro (o registro continua sendo o envio da CS).
// Sem sinal, simplesmente não publica; nada no aparelho depende disso.
//
// Gestão (SN.vst.abrirAoVivo): janela com as abas das CS no MESMO formulário que o
// técnico vê (só leitura), as fotos que já subiram, o que falta preencher e, ao lado,
// a conversa da atividade. Atualiza sozinha a cada 8 s enquanto está aberta.
(() => {
  const esc = SN.esc, L = VR_LISTAS;

  // ═══════════════════════════ Técnico: publicar ═══════════════════════════
  const fila = {}; // id_rota → { timer, ultimo, rodando, pendente }
  const ESPERA = 4000, INTERVALO_MIN = 8000, BATIMENTO = 90000;
  SN.vst.publicarVivo = id_rota => {
    const u = SN.usuario();
    if (!id_rota || !u || u.tipo !== 'tecnico' || !SN.vst.disponivel()) return;
    const f = fila[id_rota] || (fila[id_rota] = { ultimo: 0 });
    clearTimeout(f.timer);
    const falta = Math.max(ESPERA, INTERVALO_MIN - (Date.now() - f.ultimo));
    f.timer = setTimeout(() => enviar(id_rota), falta);
  };
  const enviar = async id_rota => {
    const f = fila[id_rota];
    if (f.rodando) { f.pendente = true; return; }
    if (navigator.onLine === false) return;
    f.rodando = true;
    try {
      const fotosLocais = (await SN.VL.fotos.todos()).filter(x => x.id_rota === id_rota && x.status !== 'enviada' && x.status !== 'erro');
      const noAparelho = id => fotosLocais.filter(x => x.id_vistoria === id || (x.meta && x.meta.id_apontamento === id)).map(x => x.id_foto);
      const subt = (await SN.VL.rascunhos.porIndice('rota', id_rota)).filter(r => r.status_local !== 'enviada')
        .map(r => ({ id: r.id_vistoria, ordem: r.ordem, status_local: r.status_local, atualizado: r.atualizado, dados: r.dados, fotos_aparelho: noAparelho(r.id_vistoria) }));
      const aer = (await SN.VL.apontamentos.porIndice('rota', id_rota)).filter(r => r.status_local !== 'enviada')
        .map(r => ({ id: r.id_apontamento, ordem: 0, status_local: r.status_local, atualizado: r.atualizado, dados: r.dados, fotos_aparelho: noAparelho(r.id_apontamento) }));
      let qtd = 0, aba = 0;
      const rotaLocal = ((SN.vst.dados || {}).rotas || []).find(r => r.id_rota === id_rota);
      qtd = rotaLocal ? await SN.vst.qtdAbas(rotaLocal) : 0;
      try { aba = Number(sessionStorage.getItem('vst_aba_' + id_rota)) || 1; } catch (e) { }
      const p = SN.VF && SN.VF.posicao;
      f.ultimo = Date.now();
      await SN.vst.api('VST_VIVO_PUBLICAR', { id_rota, qtd, aba, rascunhos: subt.concat(aer),
        gps: p ? { lat: p.lat, lng: p.lng, precisao: p.precisao, ts: new Date(p.ts).toISOString() } : null }, 30000);
    } catch (e) { /* sem sinal: a próxima alteração tenta de novo */ }
    f.rodando = false;
    if (f.pendente) { f.pendente = false; SN.vst.publicarVivo(id_rota); }
  };
  // Batimento: com a rota aberta, atualiza a posição de tempos em tempos (mesmo sem digitar).
  setInterval(() => {
    const m = /^#\/tec\/(vistoria|aerea|prog)\/(.+)$/.exec(location.hash);
    if (m && document.visibilityState === 'visible') SN.vst.publicarVivo(decodeURIComponent(m[2]));
  }, BATIMENTO);

  // ═══════════════════════════ Gestão: acompanhar ═══════════════════════════
  const haQuanto = iso => {
    if (!iso) return '—';
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    return s < 60 ? 'agora há pouco' : s < 3600 ? 'há ' + Math.round(s / 60) + ' min' : 'às ' + SN.hora(iso) + (s > 86400 ? ' de ' + SN.data(iso) : '');
  };
  const STATUS_VIVO = { rascunho: { rot: 'Preenchendo', cls: 'alerta' }, fila: { rot: 'Enviando…', cls: 'info' }, enviando: { rot: 'Enviando…', cls: 'info' }, erro: { rot: 'Erro no envio', cls: 'erro' } };

  SN.vst.abrirAoVivo = async id_rota => {
    const A = { id_rota, rota: null, vistorias: [], producao: [], fotos: {}, cs: {}, vivo: [], carimbo: '', aba: null, assin: '', conversa: null, erro: '' };
    let timer = null, aberta = true;
    const corpo = () => SN.$('#avCorpo');

    // Junta servidor + rascunhos ao vivo (o rascunho não enviado vale por cima, como no aparelho).
    const montarCtx = () => {
      const slots = {}, fotosLocais = {}, cfg = VR.normalizarConfig((SN.vst.dados || {}).config || {});
      A.vistorias.forEach(v => { slots[v.ordem] = { id_vistoria: v.id_vistoria, ordem: v.ordem, status_local: 'enviada', dados: v, servidor: v }; });
      const quem = {};
      A.vivo.forEach(t => {
        if (t.aba) quem[t.aba] = (quem[t.aba] || []).concat(t.tecnico);
        (t.rascunhos || []).filter(r => r.ordem && r.dados && !SN.vst.rascunhoDescartavel(A.rota, r)).forEach(r => {
          const s = slots[r.ordem];
          if (s && s.status_local === 'enviada' && s.id_vistoria !== r.id && s.servidor.status_revisao !== 'REJEITADA') return;
          if (s && s.status_local !== 'enviada' && String(s.atualizado || '') > String(r.atualizado || '')) return; // dois aparelhos: vale o mais novo
          const dados = JSON.parse(JSON.stringify(r.dados));
          (r.fotos_aparelho || []).forEach(id => { fotosLocais[id] = { status: 'pendente' }; });
          slots[r.ordem] = { id_vistoria: r.id, ordem: r.ordem, status_local: r.status_local, atualizado: r.atualizado, tecnico: t.tecnico, dados, servidor: s && s.servidor };
        });
      });
      // Fotos: as que já subiram ganham a miniatura do Drive; as outras ficam "⏳ no aparelho".
      Object.values(slots).forEach(s => (s.dados.fotos || []).forEach(f => {
        const srv = A.fotos[f.id_foto];
        if (srv) { f.drive_id = srv.drive_id; f.flag_suspeita = srv.flag_suspeita; delete fotosLocais[f.id_foto]; }
        else if (!f.drive_id) fotosLocais[f.id_foto] = { status: 'pendente' };
      }));
      const maxOrdem = Math.max(0, ...Object.keys(slots).map(Number));
      // Abas: as CS despachadas + as que têm algo preenchido. Aba vazia a mais no celular do técnico não aparece aqui.
      return { rota: A.rota, cfg, cs: A.cs, slots, fotosLocais, qtd: Math.max(1, maxOrdem, (A.rota.cs_planejadas || []).length), quem };
    };

    const rotuloSlot = s => {
      if (!s) return '<span class="badge">Não iniciada</span>';
      if (s.status_local === 'enviada') return SN.vst.badgeVistoria(s.servidor ? s.servidor.status_revisao : 'AGUARDANDO_REVISAO');
      return SN.badge(STATUS_VIVO, s.status_local);
    };

    const pintarSub = ctx => {
      const r = A.rota;
      if (A.aba == null) { // abre na aba em que o técnico está
        const t = A.vivo.slice().sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];
        A.aba = t && t.aba ? t.aba : 1;
      }
      A.aba = Math.min(A.aba, ctx.qtd);
      let abas = '';
      for (let i = 1; i <= ctx.qtd; i++) {
        const s = ctx.slots[i], v = s && s.dados;
        const extra = !v && i > (r.cs_planejadas || []).length; // aba a mais aberta pelo técnico, sem nada preenchido
        const nome = v ? (v.cs_nova ? 'CS nova' : (v.id_cs || '—')) : extra ? 'aba extra (vazia)' : ((r.cs_planejadas || [])[i - 1] || '—');
        const falta = s && s.status_local !== 'enviada' ? SN.vst.validarEspelho(ctx, v).erros.length : 0;
        abas += `<button class="vst-aba ${i === A.aba ? 'ativa' : ''}" data-av-aba="${i}"><span class="small">CS ${i}${ctx.quem[i] ? ' · técnico aqui' : ''}</span><b>${esc(nome)}</b>${rotuloSlot(s)}
          ${falta ? `<span class="small muted">faltam ${falta}</span>` : ''}</button>`;
      }
      const s = ctx.slots[A.aba];
      let conteudo;
      if (!s) conteudo = '<p class="muted" style="padding:16px">O técnico ainda não começou esta CS.</p>';
      else {
        const pend = s.status_local !== 'enviada' ? SN.vst.validarEspelho(ctx, s.dados) : null;
        conteudo = `${s.status_local !== 'enviada' ? `<div class="aviso ${pend.erros.length ? 'alerta' : 'ok'} small" style="margin-bottom:10px">
            ${s.tecnico ? '<b>' + esc(s.tecnico) + '</b> preenchendo · ' : ''}atualizado ${haQuanto(s.atualizado)} · ${pend.erros.length ? `<b>falta ${pend.erros.length}</b>: ${pend.erros.slice(0, 4).map(e => esc(e.msg)).join(' · ')}${pend.erros.length > 4 ? '…' : ''}` : '✓ pronta para enviar'}</div>` : ''}
          ${SN.vst.espelhoCs(ctx, A.aba)}`;
      }
      return `<div class="vst-abas av-abas">${abas}</div><div class="av-cs">${conteudo}</div>`;
    };

    // Aérea (pedido de 2026-10-15): um cartão por apontamento; cada item pedido na atividade (Rota percorrida,
    // Postes equipados, Cordoalha…) com o número e, logo embaixo, as fotos daquele item e quantas faltam.
    const miniatura = f => `<div class="vst-thumb"><img src="https://drive.google.com/thumbnail?id=${encodeURIComponent(f.drive_id)}&sz=w240" alt="" data-ver="https://drive.google.com/thumbnail?id=${encodeURIComponent(f.drive_id)}&sz=w1600"></div>`;
    const pintarAerea = () => {
      const srv = A.producao.slice().sort((a, b) => String(a.data).localeCompare(String(b.data)));
      const vivos = [];
      A.vivo.forEach(t => (t.rascunhos || []).filter(r => !r.ordem && r.dados && !srv.some(a => a.id_apontamento === r.id && a.status_revisao !== 'REJEITADA'))
        .forEach(r => vivos.push({ ...r.dados, _vivo: r.status_local, _tec: t.tecnico, _at: r.atualizado })));
      const cartao = (a, st) => {
        const fotos = (a.fotos || []).filter(f => f.tipo_foto !== 'ficha_pdf').map(f => ({ ...f, ...(A.fotos[f.id_foto] || {}) }));
        const cr = VR.criteriosApontamento(a, A.rota), itens = cr.fotos.itens.filter(x => x.k === 'metros' || Number(a[x.k]) > 0 || x.tem);
        const item = x => {
          const doItem = fotos.filter(f => VR.fotoDoItem(f, x)), subiu = doItem.filter(f => f.drive_id), subindo = doItem.length - subiu.length;
          return `<div class="av-item"><div class="av-item-cab"><span>${esc(x.rot)}</span><b>${a[x.k] === '' || a[x.k] == null ? '—' : SN.num(Number(a[x.k]) || 0, x.k === 'cordoalha' ? 1 : 0)}</b>
              <span class="small ${x.tem < x.exigidas ? 'av-falta' : 'muted'}">fotos ${x.tem} de ${x.exigidas} exigida(s)${x.tem < x.exigidas ? ' · faltam ' + (x.exigidas - x.tem) : ''}</span></div>
            ${subiu.length || subindo ? `<div class="vst-thumbs">${subiu.map(miniatura).join('')}${subindo ? `<span class="small muted">⏳ ${subindo} foto(s) subindo</span>` : ''}</div>` : '<div class="small muted">Sem fotos neste item.</div>'}</div>`;
        };
        const soltas = fotos.filter(f => !L.producao_aerea.some(c => VR.fotoDoItem(f, c)) && f.drive_id);
        return `<div class="av-ap">
          <div class="av-ap-cab"><div><b>${a.data ? SN.vst.dia(a.data) : '—'}</b> · ${a.tipo === 'final' ? 'Finalizado' : a.tipo === 'parcial' ? 'Parcial' : '—'}${a._tec ? ` · <span class="small muted">${esc(a._tec)} · ${haQuanto(a._at)}</span>` : a.tecnico ? ` · <span class="small muted">${esc(a.tecnico)}</span>` : ''}</div><div>${st}</div></div>
          ${cr.ok ? (a._vivo ? '<div class="aviso ok small">✓ Critérios cumpridos: pronto para enviar.</div>' : '')
            : `<div class="aviso ${a._vivo ? 'alerta' : 'erro'} small">${a._vivo ? 'Falta para enviar' : 'Não cumpre os critérios (não pode ser aprovado)'}: ${cr.erros.map(esc).join(' · ')}</div>`}
          ${itens.map(item).join('')}
          ${soltas.length ? `<div class="av-item"><div class="av-item-cab"><span>Fotos sem item</span></div><div class="vst-thumbs">${soltas.map(miniatura).join('')}</div></div>` : ''}
          ${a.justificativa_metros ? `<div class="small" style="margin-top:6px"><b>Justificativa da metragem:</b> ${esc(a.justificativa_metros)}</div>` : ''}
          ${a.observacao ? `<div class="small" style="margin-top:6px"><b>Obs.:</b> ${esc(a.observacao)}</div>` : ''}</div>`;
      };
      const p = VR.producaoRota(A.rota, A.producao);
      return `<div class="small" style="margin-bottom:8px">${SN.num(p.totais.metros)} de ${SN.num(A.rota.metros_previstos)} m apontados${p.pct != null ? ' (' + p.pct + '%)' : ''}</div>
        ${vivos.map(a => cartao(a, SN.badge(STATUS_VIVO, a._vivo))).join('')}${srv.map(a => cartao(a, SN.vst.badgeVistoria(a.status_revisao))).join('')
          || (vivos.length ? '' : '<p class="muted">Nenhum apontamento ainda.</p>')}`;
    };

    // Melhoria / Retirada: apontamentos (rascunho do aparelho + enviados) com o que foi feito e as fotos.
    const pintarProg = () => {
      const r = A.rota, retirada = r.segmento === 'RETIRADA';
      const srv = A.producao.slice().sort((a, b) => String(a.data).localeCompare(String(b.data)));
      const vivos = [];
      A.vivo.forEach(t => (t.rascunhos || []).filter(x => !x.ordem && x.dados && !srv.some(a => a.id_apontamento === x.id && a.status_revisao !== 'REJEITADA'))
        .forEach(x => vivos.push({ ...x.dados, _vivo: x.status_local, _tec: t.tecnico, _at: x.atualizado, _fotosAparelho: (x.fotos_aparelho || []).length })));
      const feito = a => retirada ? `${SN.num(a.metros || 0)} m de cabo · ${SN.num(a.ceo || 0)} CEO/CTO`
        : (VR.itensProg(a).map(i => `${SN.num(i.qtd)} × ${esc((SN.itemLpu(i.cod) || {}).desc || i.cod)}`).join('<br>') || '<span class="muted">nenhum serviço ainda</span>');
      const linha = (a, st) => {
        const fotos = (a.fotos || []).map(f => A.fotos[f.id_foto] || f).filter(f => f.drive_id);
        const falta = a._vivo ? VR.validarApontamentoProg(a, r.segmento).erros.concat(VR.validarFotosProg(a, r.segmento).erros) : [];
        return `<tr><td class="nowrap">${a.data ? SN.vst.dia(a.data) : '—'}${a._tec ? `<div class="small muted">${esc(a._tec)} · ${haQuanto(a._at)}</div>` : ''}</td>
          <td>${a.tipo === 'final' ? 'Finalizado' : a.tipo === 'parcial' ? 'Parcial' : '<span class="muted">—</span>'}</td>
          <td class="small">${feito(a)}</td><td>${st}${a._vivo ? `<div class="small ${falta.length ? '' : 'muted'}">${falta.length ? 'falta ' + falta.length + ': ' + falta.slice(0, 3).map(esc).join(' · ') + (falta.length > 3 ? '…' : '') : '✓ pronto para enviar'}</div>` : ''}</td>
          <td class="small">${esc(a.observacao || '')}<div class="vst-thumbs">${fotos.map(f => `<div class="vst-thumb"><img src="https://drive.google.com/thumbnail?id=${encodeURIComponent(f.drive_id)}&sz=w240" alt="" data-ver="https://drive.google.com/thumbnail?id=${encodeURIComponent(f.drive_id)}&sz=w1600"></div>`).join('')}
          ${a._fotosAparelho ? `<span class="small muted">⏳ ${a._fotosAparelho} foto(s) subindo</span>` : ''}</div></td></tr>`;
      };
      const p = VR.producaoProg(r, A.producao);
      const tot = 'Já enviado: ' + (retirada ? `${SN.num(p.totais.metros)} m de cabo · ${SN.num(p.totais.ceo)} CEO/CTO${r.metros_previstos ? ` (de ${SN.num(r.metros_previstos)} m${p.pct != null ? ', ' + p.pct + '%' : ''})` : ''}`
        : `${Object.keys(p.totais.itens).length} serviço(s) · ${SN.num(VR.caboLancado(p.totais.itens))} m de cabo`);
      return `<div class="small" style="margin-bottom:8px">${tot}</div>
        <div class="tabela-wrap"><table class="tab"><thead><tr><th>Data</th><th>Tipo</th><th>${retirada ? 'Retirado' : 'Serviços'}</th><th>Situação</th><th>Obs. e fotos</th></tr></thead><tbody>
        ${vivos.map(a => linha(a, SN.badge(STATUS_VIVO, a._vivo))).join('')}${srv.map(a => linha(a, SN.vst.badgeVistoria(a.status_revisao))).join('')
          || (vivos.length ? '' : '<tr><td colspan="5" class="muted">Nenhum apontamento ainda.</td></tr>')}</tbody></table></div>`;
    };

    const pintar = (forcar) => {
      const el = corpo(); if (!el || !A.rota) return;
      const r = A.rota, aerea = r.segmento === 'AEREA', prog = VR.ehProg(r);
      const ctx = aerea || prog ? null : montarCtx();
      const assin = JSON.stringify([A.carimbo, A.vivo.map(t => t.ts), A.aba]);
      if (!forcar && assin === A.assin) { pintarCab(); return; } // nada mudou: não redesenha (não perde a rolagem)
      A.assin = assin;
      const rolagem = SN.$('.av-cs', el) ? SN.$('.av-cs', el).scrollTop : 0;
      // aérea e Melhoria/Retirada também dentro de .av-cs: .av-esq corta o que passa (overflow:hidden), sem isso não rolava
      el.innerHTML = `<div id="avCab"></div>${prog ? `<div class="av-cs">${pintarProg()}</div>` : aerea ? `<div class="av-cs">${pintarAerea()}</div>` : pintarSub(ctx)}`;
      pintarCab();
      if (SN.$('.av-cs', el)) SN.$('.av-cs', el).scrollTop = rolagem;
      SN.$$('[data-av-aba]', el).forEach(b => b.onclick = () => { A.aba = Number(b.dataset.avAba); pintar(true); });
    };
    const pintarCab = () => {
      const el = SN.$('#avCab'); if (!el) return;
      const r = A.rota, t = A.vivo.slice().sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];
      const ativo = t && Date.now() - new Date(t.ts).getTime() < 5 * 60000;
      el.innerHTML = `<div class="av-cab">
        <div><span class="mono">${esc(r.id_rota)}</span> ${SN.vst.badgeRota(r.status)} · ${esc(r.cidade || '')} ${VR.ehProg(r) ? (r.pop ? '· ' + (/^POP\b/i.test(r.pop) ? '' : 'POP ') + esc(r.pop) : '') + ' · ' + esc(r.servico || '') : r.segmento === 'AEREA' ? '· ' + esc(r.motivo || '') : '· Cluster ' + esc(r.cluster || '')}
          <div class="small muted">${esc(r.prestador || '')} · ${esc(r.tecnico || 'qualquer técnico do prestador')}${r.id_chamado ? ' · chamado ' + esc(r.id_chamado) : ''}</div></div>
        <div class="small right"><span class="av-ponto ${ativo ? 'on' : ''}"></span>${t ? `<b>${esc(t.tecnico)}</b> ${ativo ? 'no app' : 'visto'} ${haQuanto(t.ts)}` : (VR.ehProg(r) ? 'O técnico ainda não abriu a atividade no app' : 'O técnico ainda não abriu a rota no app')}
          ${t && t.gps ? `<br><a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${t.gps.lat},${t.gps.lng}">${SN.conversa ? SN.conversa.ico('local') : ''}posição do técnico${t.gps.precisao ? ' (±' + t.gps.precisao + ' m)' : ''}</a>` : ''}
          ${A.erro ? `<br><span style="color:var(--alerta)">${esc(A.erro)}</span>` : ''}</div></div>`;
    };

    const buscar = async () => {
      if (!aberta) return;
      clearTimeout(timer);
      try {
        const r = await SN.vst.api('VST_VIVO', { id_rota, conhecido: A.rota ? A.carimbo : undefined }, 30000);
        if (!r.ok) { A.erro = r.erro; if (!A.rota && corpo()) corpo().innerHTML = `<div class="aviso erro">${esc(r.erro)}</div>`; }
        else {
          A.erro = ''; A.vivo = r.vivo || []; A.carimbo = r.carimbo;
          if (r.rota) {
            A.rota = r.rota; A.vistorias = r.vistorias || []; A.producao = r.producao || [];
            A.fotos = {}; (r.fotos || []).forEach(f => { A.fotos[f.id_foto] = f; });
            A.cs = {}; (r.cs || []).forEach(c => { A.cs[c.id_cs] = c; });
            if (!A.conversa && A.rota.id_chamado && SN.conversa && SN.$('#avConversa')) {
              A.conversa = SN.conversa.montar(SN.$('#avConversa'), A.rota.id_chamado);
            }
          }
          pintar();
        }
      } catch (e) { A.erro = e.rede ? 'Sem conexão: tentando de novo…' : e.message; pintarCab(); if (!A.rota && corpo()) corpo().innerHTML = `<div class="aviso alerta">${esc(A.erro)}</div>`; }
      if (aberta) timer = setTimeout(buscar, document.visibilityState === 'visible' ? 8000 : 30000);
    };

    const ehProg = /^(MEL|RET)-/.test(id_rota);
    await SN.modal({ titulo: (ehProg ? 'Acompanhar atividade ' : 'Acompanhar rota ') + id_rota + ' · ao vivo', largo: true,
      corpo: `<div class="av-grade"><div class="av-esq" id="avCorpo">${SN.carregando('Buscando o que o técnico já preencheu…')}</div>
        <div class="av-dir" id="avConversa">${SN.conversa && SN.conversa.disponivel() ? '' : '<p class="muted small">Conversa indisponível.</p>'}</div></div>
        <p class="small muted" style="margin:8px 0 0">Mostra o rascunho do aparelho do técnico (atualizado alguns segundos depois de cada alteração, quando há sinal) e as fotos que já subiram. O registro oficial continua sendo ${ehProg ? 'o apontamento enviado e revisado' : 'a CS enviada e revisada'}.</p>`,
      botoes: [{ rot: 'Fechar', valor: null },
        // PDF completo: resumo da rota + cada item de cada apontamento com as fotos (o que já foi enviado).
        { rot: 'PDF', acao: () => { if (!A.rota) { SN.toast('Aguarde carregar a rota.', 'erro'); return false; }
          SN.vst.pdfCompleto(A.rota, { ...(SN.vst.dados || {}), producao: A.producao, vistorias: A.vistorias.length ? A.vistorias : ((SN.vst.dados || {}).vistorias || []) }, VR.normalizarConfig((SN.vst.dados || {}).config || {})); return false; } }],
      aoAbrir: f => { SN.$('.modal', f).classList.add('av-modal'); buscar(); } });
    aberta = false; clearTimeout(timer);
    if (A.conversa) A.conversa.parar();
  };

  // Detalhe do chamado (pedido de 2026-10-16): fotos que subiram na atividade ligada ao chamado
  // (apontamentos da aérea/Melhoria/Retirada ou CS da subterrânea), com o resumo de cada envio e
  // as fotos agrupadas por item. Mesmo pedido do Acompanhar (VST_VIVO); só leitura.
  const cacheAtiv = {}; // id_rota → { t, r }: o detalhe redesenha a cada sincronização
  SN.vst.fotosAtividade = async (el, id_rota) => {
    if (!el) return;
    const c = cacheAtiv[id_rota];
    let r = c && Date.now() - c.t < 60000 ? c.r : null;
    if (!r) {
      el.innerHTML = SN.carregando('Buscando as fotos da atividade…');
      try { r = await SN.vst.api('VST_VIVO', { id_rota }, 30000); } catch (e) { r = { ok: false, erro: e.rede ? 'Sem conexão para buscar as fotos.' : e.message }; }
      if (r.ok && r.rota) cacheAtiv[id_rota] = { t: Date.now(), r };
    }
    if (!el.isConnected) return;
    if (!r.ok || !r.rota) { el.innerHTML = `<p class="muted small">${esc(r.erro || 'Não foi possível buscar as fotos.')}</p>`; return; }
    const rota = r.rota, prog = VR.ehProg(rota), aerea = rota.segmento === 'AEREA';
    const srv = {}; (r.fotos || []).forEach(f => { srv[f.id_foto] = f; });
    const miniatura = (f, leg) => `<div class="vst-thumb"><img src="https://drive.google.com/thumbnail?id=${encodeURIComponent(f.drive_id)}&sz=w240" alt="" loading="lazy" data-leg="${esc(leg)}" data-ver="https://drive.google.com/thumbnail?id=${encodeURIComponent(f.drive_id)}&sz=w1600"></div>`;
    const rotFoto = t => (L.foto(t) || {}).rot || t || 'Outras';
    // Fotos do envio, só as que já subiram, agrupadas pelo tipo (= item na aérea, campo na subterrânea).
    const grupos = (lista, titulo) => {
      const fotos = (lista || []).filter(f => f.tipo_foto !== 'ficha_pdf').map(f => ({ ...f, ...(srv[f.id_foto] || {}) })).filter(f => f.drive_id);
      if (!fotos.length) return '<div class="small muted">Nenhuma foto enviada.</div>';
      const por = {}; fotos.forEach(f => (por[f.tipo_foto] = por[f.tipo_foto] || []).push(f));
      return `<div class="fa-itens">${Object.keys(por).map(t => `<div class="av-item"><div class="av-item-cab"><span>${esc(rotFoto(t))}</span><span class="small muted">${por[t].length} foto(s)</span></div>
        <div class="vst-thumbs">${por[t].map(f => miniatura(f, titulo + ' · ' + rotFoto(t))).join('')}</div></div>`).join('')}</div>`;
    };
    const enviado = x => x.status_revisao && x.status_revisao !== 'RASCUNHO';
    let blocos = [];
    if (aerea || prog) {
      blocos = (r.producao || []).filter(enviado).sort((a, b) => String(a.data).localeCompare(String(b.data))).map(a => {
        const tit = `${a.data ? SN.vst.dia(a.data) : '—'} · ${a.tipo === 'final' ? 'Finalizado' : a.tipo === 'parcial' ? 'Parcial' : '—'}`;
        const feito = aerea ? L.producao_aerea.filter(x => Number(a[x.k]) > 0).map(x => `${x.rot}: ${SN.num(Number(a[x.k]), x.k === 'cordoalha' ? 1 : 0)}`).join(' · ')
          : rota.segmento === 'RETIRADA' ? `${SN.num(a.metros || 0)} m de cabo · ${SN.num(a.ceo || 0)} CEO/CTO`
          : VR.itensProg(a).map(i => `${SN.num(i.qtd)} × ${(SN.itemLpu(i.cod) || {}).desc || i.cod}`).join(' · ');
        return { tit, st: a.status_revisao, quem: a.tecnico, feito, obs: a.observacao, html: grupos(a.fotos, rota.id_rota + ' · ' + tit) };
      });
    } else {
      blocos = (r.vistorias || []).filter(enviado).sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0)).map(v => {
        const tit = `CS ${v.ordem || '—'} · ${v.cs_nova ? 'CS nova' : v.id_cs || '—'}`;
        return { tit, st: v.status_revisao, quem: v.tecnico, feito: v.abriu === 'sim' ? 'Abriu a CS' : v.abriu === 'nao' ? 'Não abriu a CS' : '', obs: v.observacao, html: grupos(v.fotos, rota.id_rota + ' · ' + tit) };
      });
    }
    const total = blocos.reduce((s, b) => s + (b.html.match(/<img /g) || []).length, 0);
    el.innerHTML = !blocos.length ? `<p class="muted">Nenhum ${prog || aerea ? 'apontamento' : 'CS'} enviado ainda nesta atividade.</p>`
      : `<p class="small muted" style="margin:0 0 8px">${blocos.length} ${prog || aerea ? 'apontamento(s)' : 'CS'} · ${total} foto(s) · toque na foto para ampliar</p>`
        + blocos.map(b => `<div class="av-ap"><div class="av-ap-cab"><div><b>${esc(b.tit)}</b>${b.quem ? ` · <span class="small muted">${esc(b.quem)}</span>` : ''}</div><div>${SN.vst.badgeVistoria(b.st)}</div></div>
          ${b.feito ? `<div class="small" style="margin-bottom:6px">${esc(b.feito)}</div>` : ''}${b.html}
          ${b.obs ? `<div class="small" style="margin-top:6px"><b>Obs.:</b> ${esc(b.obs)}</div>` : ''}</div>`).join('');
  };
})();
