// SIGONET V2 — Melhoria de rede e Retirada de cabo (telas mel_planejamento / ret_planejamento).
//
// Assuntos separados da Preventiva (pedido do usuário, 2026-10-09), cada um com a sua
// conta contábil: Melhoria → 3.1.1.2.05.0103, Retirada → 3.1.1.2.05.0102. No servidor
// usam o mesmo motor da Preventiva (aba ROTAS com segmento MELHORIA/RETIRADA, apontamentos
// em PRODUCAO, fotos no Drive, revisão, chamado e LPU sugerida), mas não aparecem em
// nenhuma tela da Preventiva (SN.vst.separar).
//
// Menu (como o da Preventiva): grupo "Melhoria de rede" e grupo "Retirada de cabo",
// cada um com Planejamento, Revisão e Dashboard (mesma permissão: tela mel_/ret_planejamento).
//   Planejamento — abas Atividades (lista, despachar / retirar despacho / editar / excluir /
//                  cancelar) e Nova atividade (cidade → região, endereço, POP na melhoria,
//                  serviço, prestador, datas). Despachar cria o chamado na conta do programa.
//   Revisão      — apontamentos do técnico: aprovar / rejeitar / reabrir. Aprovado o
//                  "Finalizado", o chamado conclui e a LPU nasce preenchida.
//   Dashboard    — Retirada: cabo e CEO/CTO retirados por região. Melhoria: cabo
//                  lançado por POP e cidade. Os dois: valor atingido na conta × budget.
// Técnico: telas-programadas-tecnico.js (#/tec/prog/:id).
(() => {
  const L = VR_LISTAS, esc = SN.esc;
  const est = {}; // estado por programa: aba, form, filtros, período
  let seg = null, d = null, vista = 'PLAN'; // PLAN | REV | DASH (item do menu)
  const P = () => L.programas[seg];
  const VISTAS = { PLAN: ['planejamento', 'Planejamento'], REV: ['revisao', 'Revisão'], DASH: ['dashboard', 'Dashboard'] };
  const base = () => P().href.replace('/planejamento', '');
  const hrefVista = v => base() + '/' + VISTAS[v][0];
  const idMenuDe = (p, v) => v === 'PLAN' ? p.tela : p.tela.replace('planejamento', VISTAS[v][0]);
  const idMenu = v => idMenuDe(P(), v);
  const E = () => est[seg] || (est[seg] = { aba: 'LISTA', form: null, filtro: { status: '', q: '' }, periodo: { per: 'mes', ref: '' }, dash: { per: 'mes', ref: '' }, revQ: '' });
  const hoje = () => SN.dataIsoLocal(new Date());
  const empresas = () => SN.db.empresas.filter(e => e.ativo !== false).map(e => e.nome).sort();
  const tecnicosDe = emp => SN.db.tecnicos.filter(t => t.ativo !== false && t.empresa === emp).map(t => t.nome).sort();
  const opcoes = (lista, sel, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '') + lista.map(v => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const cfg = () => VR.normalizarConfig(d.config);
  const rotas = () => (d.prog_rotas || []).filter(r => r.segmento === seg);
  const aps = () => { const ids = {}; rotas().forEach(r => { ids[r.id_rota] = true; }); return (d.prog_producao || []).filter(a => ids[a.id_rota]); };
  const retirada = () => seg === 'RETIRADA';
  const popTxt = p => (/^POP\b/i.test(p) ? '' : 'POP ') + p; // o cadastro às vezes já traz "POP" no nome
  const diaLocal = v => { const s = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : (v ? new Date(v) : null); };
  const noIv = (iv, v) => { if (!iv) return true; const t = diaLocal(v); return !!t && t >= iv[0] && t < iv[1]; };

  const abrir = async (s, v) => {
    seg = s; vista = v;
    const tela = idMenu(v);
    if (!SN.vst.disponivel()) return SN.casca(tela, SN.vst.semServidorHtml.replace('A Preventiva precisa', 'Esta tela precisa'));
    SN.casca(tela, SN.carregando('Carregando as atividades…'));
    try { d = await SN.vst.carregar(); } catch (e) { return SN.casca(tela, `<div class="aviso erro">${esc(e.message)}</div>`); }
    if (location.hash !== hrefVista(v) || seg !== s || vista !== v) return;
    pintar();
  };
  Object.keys(L.programas).forEach(s => Object.keys(VISTAS).forEach(v => {
    const p = L.programas[s];
    SN.rota(p.href.replace('#', '').replace('planejamento', VISTAS[v][0]), () => abrir(s, v), { tela: v === 'REV' ? idMenuDe(p, v) : p.tela });
  }));
  const recarregar = async () => { d = await SN.vst.carregar(true); pintar(); };

  const pintar = () => {
    const e = E(), pend = aps().filter(a => a.status_revisao === 'AGUARDANDO_REVISAO').length;
    const abas = [['LISTA', 'Atividades'], ['NOVA', e.form && e.form.id_rota ? 'Editar atividade' : 'Nova atividade']];
    const sub = { PLAN: `Planeje e despache as atividades de ${esc(P().rot.toLowerCase())}. Ao despachar, o chamado é criado na conta <b>${esc(SN.contaTxt(P().conta))}</b> e entra na fila do técnico.`,
      REV: `Apontamentos do técnico${pend ? ` (<b>${pend}</b> aguardando)` : ''}. Aprovado o "Finalizado", o chamado conclui e a LPU nasce preenchida.`,
      DASH: `Produção aprovada e valor atingido na conta <b>${esc(SN.contaTxt(P().conta))}</b>.` }[vista];
    SN.casca(idMenu(vista), `
      <div class="cab-pagina"><div><h1>${esc(P().rot)} · ${VISTAS[vista][1]}</h1><p>${sub}</p></div>
        <button class="btn" id="pAtualizar">⟳ Atualizar</button></div>
      ${vista === 'PLAN' ? `<div class="abas">${abas.map(([k, r]) => `<button class="aba ${e.aba === k ? 'ativa' : ''}" data-aba="${k}">${r}</button>`).join('')}</div>` : ''}
      <div id="pCorpo"></div>`);
    SN.$$('[data-aba]').forEach(b => b.onclick = () => { e.aba = b.dataset.aba; if (e.aba === 'NOVA' && !e.form) e.form = nova(); pintar(); });
    SN.$('#pAtualizar').onclick = () => recarregar().catch(err => SN.toast(err.message, 'erro'));
    if (vista === 'REV') return pintarRevisao();
    if (vista === 'DASH') return pintarDash();
    (e.aba === 'NOVA' ? pintarForm : pintarLista)();
  };

  // ═══════════════════════════ Atividades ═══════════════════════════
  const producaoTxt = r => {
    const p = VR.producaoProg(r, aps());
    if (!p.apontamentos) return '<span class="muted">sem apontamento</span>';
    const t = p.totais, ap = VR.producaoProg(r, aps(), { soAprovados: true }).totais;
    const txt = retirada() ? `${SN.num(t.metros)} m · ${SN.num(t.ceo)} CEO/CTO${r.metros_previstos ? ` <span class="muted">(de ${SN.num(r.metros_previstos)} m)</span>` : ''}`
      : `${Object.keys(t.itens).length} serviço(s) · ${SN.num(VR.caboLancado(t.itens))} m de cabo`;
    const aguard = aps().filter(a => a.id_rota === r.id_rota && a.status_revisao === 'AGUARDANDO_REVISAO').length;
    return `${txt}<div class="muted">${p.apontamentos} apontamento(s)${p.finalizada ? ' · finalizado' : ''}${aguard ? ` · <b>${aguard} em revisão</b>` : ''}${retirada() ? ` · aprovado ${SN.num(ap.metros)} m` : ''}</div>`;
  };
  const pintarLista = () => {
    const e = E(), f = e.filtro, gestorTotal = ((SN.usuario() || {}).telas || []).includes('*');
    const todas = f.status === 'CANCELADA' ? (d.prog_canceladas || []).filter(r => r.segmento === seg) : rotas();
    const iv = SN.intervaloMat(e.periodo.per, e.periodo.ref || hoje());
    const andamentoFora = f.status === 'CANCELADA' ? [] : todas.filter(r => ['DESPACHADA', 'EM_CAMPO'].includes(r.status) && !noIv(iv, r.data_planejada));
    const q = SN.normal(f.q);
    const vis = todas.filter(r => noIv(iv, r.data_planejada) && (!f.status || r.status === f.status)
      && (!q || SN.normal([r.id_rota, r.cidade, r.regiao, r.pop, r.endereco, r.servico, r.prestador, r.tecnico, r.id_chamado, r.notificacao].join(' ')).includes(q)))
      .sort((a, b) => String(b.criada_em || b.data_planejada).localeCompare(String(a.criada_em || a.data_planejada)));
    SN.$('#pCorpo').innerHTML = `
      <div class="card card-filtros">${SN.htmlPeriodo(e.periodo)}<div class="filtros" style="margin-top:8px">
        <select class="inp" id="fSt"><option value="">Todos os status</option>${Object.entries(L.status_rota).map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v.rot}</option>`).join('')}</select>
        <input class="inp busca" id="fQ" placeholder="Buscar (cidade, ${retirada() ? 'endereço' : 'POP'}, prestador, chamado…)" value="${esc(f.q)}">
        <button class="btn prim" id="bNova">➕ Nova atividade</button></div></div>
      ${andamentoFora.length ? `<div class="aviso info small" style="margin-bottom:10px">${andamentoFora.length} atividade(s) <b>em andamento</b> com data fora deste período (${andamentoFora.slice(0, 5).map(r => esc(r.id_rota)).join(', ')}). <button class="btn sm" id="bVerAnd">Ver em andamento</button></div>` : ''}
      <div class="card"><div class="card-tit"><h3>Atividades (${vis.length})</h3></div>
        ${vis.length ? `<div class="tabela-wrap"><table class="tab"><thead><tr><th>Atividade</th><th>Onde</th><th>Serviço</th><th>Prestador · técnico</th><th>Data</th><th>Status</th><th>Produção</th><th></th></tr></thead><tbody>
        ${vis.map(r => `<tr><td class="mono">${esc(r.id_rota)}${r.id_chamado ? `<div class="small"><a href="#/chamado/${esc(r.id_chamado)}">${esc(r.id_chamado)}</a></div>` : ''}</td>
          <td>${esc(r.cidade || '')}<div class="small muted">${esc(r.regiao || '')}${r.pop ? ' · ' + esc(popTxt(r.pop)) : ''}</div><div class="small muted">${esc(r.endereco || '')}</div></td>
          <td class="small">${esc(r.servico || '')}${r.notificacao ? `<div class="muted">${esc(r.notificacao)}</div>` : ''}${(r.anexos || []).length ? `<div class="muted">📎 ${r.anexos.length} anexo(s)</div>` : ''}</td>
          <td>${esc(r.prestador || '')}<div class="small muted">${esc(r.tecnico || 'qualquer técnico do prestador')}</div></td>
          <td class="nowrap">${SN.vst.dia(r.data_planejada)}${r.data_limite && r.data_limite !== String(r.data_planejada).slice(0, 10) ? `<div class="small muted">até ${SN.vst.dia(r.data_limite)}</div>` : ''}</td>
          <td>${SN.vst.badgeRota(r.status)}</td>
          <td class="small">${r.status === 'CANCELADA' ? `${esc(r.motivo_cancelamento || '')}<div class="muted">por ${esc(r.cancelada_por || '')} · ${SN.dt(r.cancelada_em)}</div>` : producaoTxt(r)}</td>
          <td><div class="acoes" style="gap:6px;min-width:250px">${['DESPACHADA', 'EM_CAMPO', 'CONCLUIDA'].includes(r.status) && SN.vst.abrirAoVivo ? `<button class="btn sm ${r.status === 'EM_CAMPO' ? 'prim' : ''}" data-vivo="${esc(r.id_rota)}" title="Ver ao vivo o que o técnico está apontando e conversar com ele">${SN.conversa ? SN.conversa.ico('olho') : ''}Acompanhar${r.id_chamado && SN.conversa ? `<span class="conv-selo ${SN.conversa.naoLida(r.id_chamado) ? '' : 'oculto'}" data-conv-selo="${esc(r.id_chamado)}">●</span>` : ''}</button> ` : ''}${r.status === 'PLANEJADA' ? `<button class="btn sm prim" data-desp="${esc(r.id_rota)}">Despachar</button> <button class="btn sm" data-ed="${esc(r.id_rota)}">Editar</button> <button class="btn sm perigo" data-ex="${esc(r.id_rota)}">Excluir</button>`
            : r.status === 'DESPACHADA' ? `<button class="btn sm" data-ret="${esc(r.id_rota)}">Retirar despacho</button>` : ''}${r.status === 'EM_CAMPO' ? ` <button class="btn sm ok" data-concl="${esc(r.id_rota)}" title="A equipe mandou os apontamentos mas não o &quot;Finalizado&quot;">Concluir pela gestão</button>` : ''}${gestorTotal && ['DESPACHADA', 'EM_CAMPO'].includes(r.status) ? ` <button class="btn sm perigo" data-canc="${esc(r.id_rota)}">Cancelar</button>` : ''}${aps().some(a => a.id_rota === r.id_rota) ? ` <button class="btn sm" data-verrev="${esc(r.id_rota)}">Apontamentos</button>` : ''}${!['PLANEJADA', 'CANCELADA'].includes(r.status) ? ` <button class="btn sm" data-pdf="${esc(r.id_rota)}" title="Resumo da atividade em PDF">PDF</button> <button class="btn sm" data-zip="${esc(r.id_rota)}" title="Arquivo .zip com o resumo e a ficha de cada apontamento (com fotos)">Baixar tudo</button>` : ''}</div></td></tr>`).join('')}
        </tbody></table></div>` : `<p class="muted">${todas.length ? 'Nenhuma atividade neste período/filtro.' : 'Nenhuma atividade ainda. Use "Nova atividade".'}</p>`}</div>`;
    SN.ligarPeriodo(pintarLista, e.periodo);
    if (SN.$('#bVerAnd')) SN.$('#bVerAnd').onclick = () => { e.periodo.per = 'tudo'; pintarLista(); };
    SN.$('#fSt').onchange = ev => { f.status = ev.target.value; pintarLista(); };
    SN.$('#fQ').oninput = SN.debounce(ev => { f.q = ev.target.value; pintarLista(); SN.$('#fQ').focus(); }, 300);
    SN.$('#bNova').onclick = () => { e.form = nova(); e.aba = 'NOVA'; pintar(); };
    const acao = (sel, fn) => SN.$$(sel).forEach(b => b.onclick = async () => { b.disabled = true; try { await fn(b); } catch (err) { SN.toast(err.message, 'erro'); b.disabled = false; } });
    acao('[data-desp]', async b => { await SN.vst.exec('VST_ROTA_STATUS', { id_rota: b.dataset.desp, para: 'DESPACHADA' });
      SN.toast(`Atividade despachada: o chamado (conta ${P().conta.slice(-4)}) está na fila do técnico.`, 'ok'); if (SN.sincronizar) SN.sincronizar().catch(() => { }); await recarregar(); });
    acao('[data-ret]', async b => { if (!await SN.confirmar('Retirar despacho', 'A atividade volta a PLANEJADA e o chamado dela é cancelado.', 'Retirar', 'perigo')) { b.disabled = false; return; }
      await SN.vst.exec('VST_ROTA_STATUS', { id_rota: b.dataset.ret, para: 'PLANEJADA' }); SN.toast('Despacho retirado.', 'ok'); if (SN.sincronizar) SN.sincronizar().catch(() => { }); await recarregar(); });
    acao('[data-ex]', async b => { if (!await SN.confirmar('Excluir atividade', 'Excluir esta atividade planejada?', 'Excluir', 'perigo')) { b.disabled = false; return; }
      await SN.vst.exec('VST_ROTA_EXCLUIR', { id_rota: b.dataset.ex }); SN.toast('Atividade excluída.', 'ok'); await recarregar(); });
    acao('[data-concl]', async b => {
      const r = rotas().find(x => x.id_rota === b.dataset.concl), pc = VR.podeConcluirProg(r, aps());
      if (!pc.ok) { b.disabled = false; return SN.modal({ titulo: 'Ainda não dá para concluir ' + r.id_rota, corpo: `<p>${pc.erros.map(esc).join('<br>')}</p>` }); }
      const p = VR.producaoProg(r, aps()), feito = retirada() ? `${SN.num(p.totais.metros)} m de cabo · ${SN.num(p.totais.ceo)} CEO/CTO` : `${Object.keys(p.totais.itens).length} serviço(s) · ${SN.num(VR.caboLancado(p.totais.itens))} m de cabo`;
      const mot = await SN.modal({ titulo: 'Concluir ' + r.id_rota + ' pela gestão',
        corpo: `<p>A equipe enviou <b>${p.apontamentos}</b> apontamento(s) (${feito}) mas não o "Finalizado". A atividade fica <b>Concluída</b> como se o técnico tivesse enviado o "Finalizado"; ele não aponta mais nesta atividade.</p>
          <p class="small">${pc.aguardando ? `<b>${pc.aguardando} apontamento(s) ainda aguardam revisão:</b> o chamado conclui (e a LPU libera) quando forem aprovados.` : 'Todos os apontamentos já estão aprovados: o chamado conclui agora e a LPU libera.'}</p>
          <div class="campo"><label>Motivo *</label><textarea class="inp" id="mTxt" placeholder="ex.: equipe terminou e não enviou o Finalizado"></textarea></div>`,
        botoes: [{ rot: 'Voltar', valor: null }, { rot: 'Concluir pela gestão', cls: 'ok', acao: m => { const v = SN.$('#mTxt', m).value.trim(); if (!v) { SN.toast('Informe o motivo.', 'erro'); return false; } return v; } }],
        aoAbrir: m => SN.$('#mTxt', m).focus() });
      if (!mot) { b.disabled = false; return; }
      const res = await SN.vst.exec('VST_ROTA_CONCLUIR_GESTAO', { id_rota: r.id_rota, motivo: mot });
      SN.toast(res.chamado_concluido ? `Atividade ${r.id_rota} concluída: o chamado concluiu e a LPU liberou.` : `Atividade ${r.id_rota} concluída. O chamado conclui quando todos os apontamentos forem aprovados na Revisão.`, 'ok');
      if (SN.sincronizar) SN.sincronizar().catch(() => { }); await recarregar(); });
    acao('[data-canc]', async b => {
      const mot = await SN.pedirTexto('Cancelar atividade ' + b.dataset.canc, 'Ela sai do app do técnico e o chamado é cancelado. Motivo do cancelamento *');
      if (!mot) { b.disabled = false; return; }
      await SN.vst.exec('VST_ROTA_CANCELAR', { id_rota: b.dataset.canc, motivo: mot });
      SN.toast('Atividade ' + b.dataset.canc + ' cancelada.', 'ok'); if (SN.sincronizar) SN.sincronizar().catch(() => { }); await recarregar(); });
    SN.$$('[data-ed]').forEach(b => b.onclick = () => { e.form = JSON.parse(JSON.stringify(rotas().find(r => r.id_rota === b.dataset.ed))); e.aba = 'NOVA'; pintar(); });
    SN.$$('[data-verrev]').forEach(b => b.onclick = () => { e.revQ = b.dataset.verrev; SN.navegar(hrefVista('REV')); });
    // PDF da atividade: o gestor decide se a conversa entra (completa / resumo / não), como na Preventiva.
    SN.$$('[data-pdf]').forEach(b => b.onclick = () => { const r = rotas().find(x => x.id_rota === b.dataset.pdf); if (!r) return;
      if (SN.conversa && r.id_chamado) SN.conversa.pdfComConversa(r.id_chamado, cv => SN.vst.pdfResumoProg(r, aps(), cv));
      else SN.abrirPdfDepois(() => SN.vst.pdfResumoProg(r, aps())); });
    SN.$$('[data-zip]').forEach(b => b.onclick = () => { const r = rotas().find(x => x.id_rota === b.dataset.zip); if (r) baixarTudo(r, b); });
    SN.$$('[data-vivo]').forEach(b => b.onclick = () => { const h = location.hash; SN.vst.abrirAoVivo(b.dataset.vivo).then(() => { if (location.hash === h) return recarregar(); }).catch(() => { }); });
  };

  // ═══════════════════════════ Baixar tudo (.zip) ═══════════════════════════
  // Resumo da atividade + ficha de cada apontamento com as fotos, um PDF por apontamento
  // (como na Preventiva). Opcional: as fotos originais em JPG. As fotos vêm do Drive pelo servidor.
  const carregarJsZip = () => window.JSZip ? Promise.resolve() : new Promise((ok, falha) => {
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload = ok; s.onerror = () => falha(new Error('Não foi possível carregar o compactador (sem internet?).')); document.head.appendChild(s); });
  const nomeArq = t => String(t || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 90);
  const bytesDe = dataUrl => { const bin = atob(String(dataUrl).split(',')[1] || ''), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const baixarTudo = async (r, bt) => {
    const todos = aps().filter(a => a.id_rota === r.id_rota);
    const itens = todos.filter(a => a.status_revisao && a.status_revisao !== 'RASCUNHO').sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.enviado_em || '').localeCompare(String(b.enviado_em || '')));
    const nFotos = itens.reduce((s, x) => s + (x.fotos || []).filter(f => f.tipo_foto !== 'ficha_pdf').length, 0);
    const op = await SN.modal({ titulo: 'Baixar tudo · ' + r.id_rota,
      corpo: `<p>Vai gerar um arquivo <b>.zip</b> com:</p><ul class="small"><li>o resumo da atividade (PDF);</li><li>a ficha de cada apontamento com as fotos: <b>${itens.length}</b> PDF(s), ${nFotos} foto(s).</li></ul>
        <label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="zFotos"> Incluir também as fotos originais em JPG (arquivo maior)</label>
        <p class="small muted">Leva alguns segundos por apontamento. Não feche a página até o download começar.</p>`,
      botoes: [{ rot: 'Voltar', valor: null }, { rot: 'Gerar .zip', cls: 'prim', acao: m => ({ fotos: SN.$('#zFotos', m).checked }) }] });
    if (!op) return;
    const rotulo = bt.textContent; bt.disabled = true;
    const passo = t => { bt.textContent = t; };
    try {
      passo('Preparando…'); await carregarJsZip();
      if (!window.jspdf) throw new Error('Gerador de PDF indisponível (sem internet?).');
      const zip = new JSZip(), pasta = zip.folder(nomeArq(`${r.id_rota} - ${r.cidade || ''} ${r.pop || ''}`));
      const resumo = await SN.vst.pdfResumoProg(r, todos);
      if (resumo) pasta.file('00 - Resumo da atividade.pdf', resumo.output('arraybuffer'));
      const acumulado = VR.producaoProg(r, todos).totais;
      let feitos = 0, semFoto = 0;
      for (const x of itens) {
        feitos++; passo(`Gerando ${feitos}/${itens.length}…`);
        const fotos = (x.fotos || []).filter(f => f.tipo_foto !== 'ficha_pdf'), b64 = {};
        for (let i = 0; i < fotos.length; i += 20) {
          try { (await SN.vst.exec('VST_FOTOS_B64', { ids: fotos.slice(i, i + 20).map(f => f.id_foto) })).fotos.forEach(f => { if (f.dataUrl) b64[f.id_foto] = f.dataUrl; }); } catch (e) { }
        }
        semFoto += fotos.filter(f => !b64[f.id_foto]).length;
        const locais = {}; Object.entries(b64).forEach(([id, u]) => { locais[id] = { thumb: u }; });
        const nome = `${String(feitos).padStart(2, '0')} - ${SN.vst.dia(x.data).replace(/\//g, '-')} ${x.tipo === 'final' ? 'final' : 'parcial'}${x.status_revisao === 'REJEITADA' ? ' (rejeitado)' : ''}`;
        const url = await SN.vst.pdfApontamentoProg(x, r, acumulado, locais);
        if (url) pasta.file(nomeArq(nome) + '.pdf', bytesDe(url));
        if (op.fotos) fotos.forEach((f, i) => { if (b64[f.id_foto]) pasta.file(`fotos/${nomeArq(nome)}/${String(i + 1).padStart(2, '0')} - ${nomeArq(f.tipo_foto)}.jpg`, bytesDe(b64[f.id_foto])); });
      }
      passo('Compactando…');
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nomeArq(`${r.id_rota} - completo`) + '.zip';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      SN.toast(`${r.id_rota}: ${itens.length + 1} PDF(s) no .zip (${(blob.size / 1048576).toFixed(1)} MB)${semFoto ? ` · ${semFoto} foto(s) não vieram do Drive` : ''}.`, semFoto ? 'alerta' : 'ok');
    } catch (e) { SN.toast(e.message || String(e), 'erro'); }
    finally { bt.disabled = false; bt.textContent = rotulo; }
  };

  // ═══════════════════════════ Nova / editar ═══════════════════════════
  const nova = () => ({ segmento: seg, cidade: '', endereco: '', pop: '', local_url: '', servico: '', solicitante: '', notificacao: '', metros_previstos: '',
    prestador: '', tecnico: '', data_planejada: hoje(), data_limite: '', observacao: '' });
  const conhecidos = k => [...new Set(rotas().map(r => r[k]).filter(Boolean))].sort();
  const pintarForm = () => {
    const e = E(), f = e.form || (e.form = nova()), c = cfg(), editando = !!f.id_rota;
    const cidades = [...new Set(Object.values(c.regioes).flat().concat(conhecidos('cidade')))].sort();
    SN.$('#pCorpo').innerHTML = `<div class="card">
      <div class="aviso info small" style="margin-bottom:10px">Conta contábil do chamado: <b>${esc(SN.contaTxt(P().conta))}</b> · classificação ${esc([VR.CHAMADO_PROG[seg].tipo, VR.CHAMADO_PROG[seg].cat1, VR.CHAMADO_PROG[seg].cat2].join(' › '))} · prazo pela data (atividade planejada).</div>
      <div class="linha-form">
        <div class="campo"><label>Cidade *</label><input class="inp" data-f="cidade" list="lCid" value="${esc(f.cidade)}"><datalist id="lCid">${cidades.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
          ${f.cidade ? `<div class="small muted">Região: <b>${esc(VR.regiaoDaCidade(f.cidade, c))}</b></div>` : '<div class="small muted">A região sai da cidade (Preventiva → Configurações).</div>'}</div>
        ${retirada() ? '' : `<div class="campo"><label>POP *</label><input class="inp" data-f="pop" list="lPop" value="${esc(f.pop)}" placeholder="ex.: POP CENTRO"><datalist id="lPop">${conhecidos('pop').map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>`}
        <div class="campo" style="flex:2"><label>Endereço / local *</label><input class="inp" data-f="endereco" value="${esc(f.endereco)}" placeholder="rua, número, referência ou trecho"></div>
      </div>
      <div class="campo"><label>${retirada() ? 'O que retirar *' : 'Serviço de melhoria *'}</label><textarea class="inp" data-f="servico" placeholder="${retirada() ? 'ex.: retirar cabo 12FO desativado entre a CEO 15 e a CEO 18 (operadora X)' : 'ex.: lançar 800 m de cabo 36FO para desafogar o anel do POP'}">${esc(f.servico)}</textarea></div>
      <div class="linha-form">
        <div class="campo"><label>${retirada() ? 'Metros previstos' : 'Metros de cabo previstos'}</label><input class="inp" type="number" min="0" data-f="metros_previstos" data-num="1" value="${esc(f.metros_previstos)}"></div>
        <div class="campo" style="flex:2"><label>Link do local (Google Maps, KMZ no Drive…) — ou anexe o KMZ</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><input class="inp" style="flex:1;min-width:220px" data-f="local_url" placeholder="https://…" value="${esc(f.local_url)}">
            <label class="btn">📎 Anexar .kmz/.kml<input type="file" id="fKmz" accept=".kmz,.kml" hidden></label></div>
          ${f.local_url ? `<div class="small"><a href="${esc(f.local_url)}" target="_blank" rel="noopener">abrir ${f.kmz_nome ? esc(f.kmz_nome) : 'link'}</a>${f.kmz_metros ? ` · ${SN.num(f.kmz_metros)} m de linhas no KMZ` : ''}</div>` : ''}</div>
      </div>
      <div class="linha-form">
        <div class="campo"><label>Solicitante / área</label><input class="inp" data-f="solicitante" list="lSol" value="${esc(f.solicitante)}"><datalist id="lSol">${c.solicitantes.concat(conhecidos('solicitante')).filter((x, i, a) => a.indexOf(x) === i).map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
        <div class="campo"><label>Notificação / Protocolo</label><input class="inp" data-f="notificacao" value="${esc(f.notificacao)}"></div>
      </div>
      <div class="linha-form">
        <div class="campo"><label>Prestador (equipe) *</label><select class="inp" data-f="prestador">${opcoes(empresas(), f.prestador, 'Escolha…')}</select></div>
        <div class="campo"><label>Técnico</label><select class="inp" data-f="tecnico">${opcoes(tecnicosDe(f.prestador), f.tecnico, f.prestador ? 'Qualquer técnico do prestador' : 'Escolha o prestador')}</select></div>
        <div class="campo"><label>Data *</label><input class="inp" type="date" data-f="data_planejada" value="${esc(String(f.data_planejada || '').slice(0, 10))}"></div>
        <div class="campo"><label>Data-limite</label><input class="inp" type="date" data-f="data_limite" min="${esc(String(f.data_planejada || '').slice(0, 10))}" value="${esc(String(f.data_limite || '').slice(0, 10))}">
          <div class="small muted">Prazo do chamado. Em branco = o próprio dia.</div></div>
      </div>
      <div class="campo"><label>Observação <span class="muted">— cole uma imagem (Ctrl+V) aqui ou anexe imagem/PDF</span></label><textarea class="inp" data-f="observacao" id="fObs" placeholder="Texto livre. Print copiado? Clique aqui e cole (Ctrl+V).">${esc(f.observacao || '')}</textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px">
          <label class="btn sm">📎 Anexar imagem ou PDF<input type="file" id="fAnexo" accept="image/*,application/pdf" multiple hidden></label>
          <span class="small muted" id="fAnexoInfo">${(f.anexos || []).length ? (f.anexos || []).length + ' anexo(s)' : 'Os anexos vão junto no chamado e aparecem para o técnico.'}</span></div>
        <div id="fAnexos" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">${(f.anexos || []).map((a, i) => `<span class="chip" style="gap:6px;align-items:center">${a.tipo === 'imagem' && SN.driveId(a.id) ? `<img src="https://drive.google.com/thumbnail?id=${encodeURIComponent(SN.driveId(a.id))}&sz=w120" alt="" style="height:34px;border-radius:4px;cursor:pointer" data-verax="${i}">` : `<a href="javascript:void 0" data-verax="${i}">📄</a>`}
          <a href="javascript:void 0" data-verax="${i}" class="small">${esc(a.nome)}</a><button type="button" class="btn sm" data-tiraax="${i}" title="Remover anexo">×</button></span>`).join('')}</div></div>
      <div id="fErros"></div>
      <div class="acoes"><button class="btn prim" id="bSalvar">💾 Salvar${editando ? '' : ' (planejada)'}</button><button class="btn ok" id="bSalvarDesp">🚀 Salvar e despachar</button><button class="btn" id="bCancelar">Cancelar</button></div></div>`;
    const erros = () => { const v = VR.validarRota(f); SN.$('#fErros').innerHTML = v.ok ? '' : `<div class="aviso alerta small">${v.erros.map(esc).join('<br>')}</div>`; return v; };
    erros();
    SN.$$('[data-f]').forEach(i => {
      const k = i.dataset.f, ler = () => i.dataset.num ? (i.value === '' ? '' : Number(i.value)) : i.value;
      i.oninput = () => { f[k] = ler(); erros(); };
      i.onchange = () => { f[k] = ler(); if (k === 'prestador') f.tecnico = ''; if (['prestador', 'cidade'].includes(k)) setTimeout(pintarForm, 0); else erros(); }; // depois do blur: redesenhar dentro dele quebra o DOM
    });
    // Anexos da observação: colar imagem (Ctrl+V) ou escolher imagem/PDF. Sobem para o Drive (pasta
    // "atividades-<programa>") e vão no chamado (c.fotos) e na tela do técnico.
    const anexar = async files => {
      const ok = files.filter(x => /^image\//.test(x.type) || x.type === 'application/pdf');
      if (!ok.length) return SN.toast('Só imagem ou PDF.', 'erro');
      if (ok.some(x => x.type === 'application/pdf' && x.size > 15 * 1024 * 1024)) return SN.toast('PDF acima de 15 MB: reduza o arquivo.', 'erro');
      f.anexos = f.anexos || [];
      if (f.anexos.length + ok.length > 20) return SN.toast('No máximo 20 anexos por atividade.', 'erro');
      SN.toast(`Enviando ${ok.length} anexo(s)…`);
      try {
        for (const x of ok) f.anexos.push(await SN.guardarArquivo(x, 'atividades-' + seg.toLowerCase()));
        SN.toast('Anexo(s) guardado(s).', 'ok');
      } catch (err) { SN.toast('Não foi possível anexar: ' + (err.message || err), 'erro'); }
      pintarForm();
    };
    SN.$('#fAnexo').onchange = ev => anexar([...(ev.target.files || [])]);
    SN.$('#fObs').addEventListener('paste', ev => {
      const imgs = [...((ev.clipboardData || {}).items || [])].filter(it => it.kind === 'file' && /^image\//.test(it.type)).map(it => it.getAsFile()).filter(Boolean);
      if (!imgs.length) return; // texto: cola normal
      ev.preventDefault();
      const ts = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
      anexar(imgs.map((x, i) => new File([x], `print-${ts}${imgs.length > 1 ? '-' + (i + 1) : ''}.${(x.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: x.type })));
    });
    SN.$$('[data-verax]').forEach(el => el.onclick = () => SN.abrirAnexo(f.anexos[+el.dataset.verax].id));
    SN.$$('[data-tiraax]').forEach(b => b.onclick = () => { f.anexos.splice(+b.dataset.tiraax, 1); pintarForm(); });
    // KMZ anexado: vai para o Drive (pasta da cidade) e o link entra no campo; os metros das linhas preenchem o previsto vazio.
    SN.$('#fKmz').onchange = async ev => {
      const file = ev.target.files && ev.target.files[0]; if (!file) return;
      if (!f.cidade) { ev.target.value = ''; return SN.toast('Informe a cidade antes de anexar o KMZ (ele é guardado na pasta da cidade).', 'erro'); }
      SN.toast('Enviando KMZ para o Drive…');
      try {
        const dataUrl = await new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = falha; r.readAsDataURL(file); });
        const r = await SN.vst.exec('VST_KMZ_UPLOAD', { nome: file.name, cidade: f.cidade, segmento: seg, dataUrl });
        f.local_url = r.url; f.kmz_nome = file.name; f.kmz_metros = r.medicao && r.medicao.metros ? Math.round(r.medicao.metros) : '';
        if (f.kmz_metros && (f.metros_previstos === '' || f.metros_previstos == null)) f.metros_previstos = f.kmz_metros;
        SN.toast('KMZ anexado' + (f.kmz_metros ? `: ${SN.num(f.kmz_metros)} m de linhas.` : '.'), 'ok'); pintarForm();
      } catch (err) { ev.target.value = ''; SN.toast(err.message, 'erro'); }
    };
    const salvar = async despachar => {
      const v = erros(); if (!v.ok) return SN.toast(v.erros[0], 'erro');
      if (!f.id_rota && !f.chave_cliente) f.chave_cliente = SN.uid() + SN.uid(); // reenvio não duplica
      const r = await SN.vst.exec('VST_ROTA_SALVAR', { rota: f });
      if (despachar) await SN.vst.exec('VST_ROTA_STATUS', { id_rota: r.rota.id_rota, para: 'DESPACHADA' });
      SN.toast(despachar ? `${r.rota.id_rota} despachada: o chamado está na fila do técnico.` : `${r.rota.id_rota} salva (planejada).`, 'ok');
      if (despachar && SN.sincronizar) SN.sincronizar().catch(() => { });
      E().form = null; E().aba = 'LISTA'; await recarregar();
    };
    SN.$('#bSalvar').onclick = () => salvar(false).catch(err => SN.toast(err.message, 'erro'));
    SN.$('#bSalvarDesp').onclick = () => salvar(true).catch(err => SN.toast(err.message, 'erro'));
    SN.$('#bCancelar').onclick = () => { e.form = null; e.aba = 'LISTA'; pintar(); };
  };

  // ═══════════════════════════ Revisão ═══════════════════════════
  const fotoUrl = (f, w) => f.drive_id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(f.drive_id)}&sz=w${w}` : '';
  const htmlFotos = a => (L.fotos_prog[seg] || []).map(c => {
    const fs = (a.fotos || []).filter(f => f.tipo_foto === c.tipo); if (!fs.length) return '';
    return `<div class="small" style="margin-top:6px"><b>${esc((L.foto(c.tipo) || {}).rot || c.tipo)}</b> (${fs.length})${fs.some(f => f.origem === 'galeria') ? ' <span class="badge">da galeria</span>' : ''}</div>
      <div class="vst-thumbs">${fs.map(f => `<div class="vst-thumb"><img src="${fotoUrl(f, 240)}" alt="" data-ver="${esc(fotoUrl(f, 1600))}"></div>`).join('')}</div>`;
  }).join('');
  const htmlProducao = a => retirada()
    ? `<b>${SN.num(a.metros)} m</b> de cabo retirados · <b>${SN.num(a.ceo || 0)}</b> CEO/CTO`
    : (VR.itensProg(a).length ? `<table class="tab small" style="margin-top:4px"><tbody>${VR.itensProg(a).map(i => { const it = SN.itemLpu(i.cod) || {};
      return `<tr><td class="mono">${esc(i.cod)}</td><td>${esc(it.desc || '')}</td><td class="num nowrap">${SN.num(i.qtd)} ${esc(it.medida || '')}</td></tr>`; }).join('')}</tbody></table>` : '<span class="muted">sem serviço (fechamento)</span>');
  const cartao = (a, revisada) => { const r = rotas().find(x => x.id_rota === a.id_rota) || {};
    return `<div class="card" style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b class="mono">${esc(a.id_rota)}</b> · ${SN.vst.dia(a.data)} · ${a.tipo === 'final' ? '<span class="badge verde">Finalizado</span>' : '<span class="badge">Parcial</span>'}
        ${a.refeitas ? '<span class="badge alerta">Refeito após rejeição</span>' : ''}
        <div class="small muted">${esc(r.cidade || a.cidade || '')}${r.pop ? ' · ' + esc(popTxt(r.pop)) : ''} · ${esc(r.endereco || '')} · ${esc(a.tecnico || '')} (${esc(a.prestador || '')}) · enviado ${SN.dt(a.enviado_em)}</div>
        <div class="small">${esc(r.servico || '')}${(r.anexos || []).length ? ` · 📎 ${r.anexos.map((x, i) => `<a href="javascript:void 0" data-axrev="${esc(r.id_rota)}|${i}">${esc(x.nome)}</a>`).join(', ')}` : ''}</div></div>
        <div>${SN.vst.badgeVistoria(a.status_revisao)}</div></div>
      <div style="margin-top:6px">${htmlProducao(a)}</div>
      ${a.observacao ? `<div class="small" style="margin-top:4px">Obs.: ${esc(a.observacao)}</div>` : ''}
      ${htmlFotos(a)}
      ${a.status_revisao === 'REJEITADA' ? `<div class="aviso erro small" style="margin-top:6px">Rejeitado por ${esc(a.revisor || '')}: ${(a.motivo_rejeicao || []).map(m => esc(L.rotulo('motivos_rejeicao', m))).join(', ')}${a.motivo_rejeicao_texto ? ' — ' + esc(a.motivo_rejeicao_texto) : ''}</div>` : ''}
      <div class="acoes" style="margin-top:8px">${revisada ? `<span class="small muted">${esc(a.revisor || '')} · ${SN.dt(a.data_revisao)}</span> <button class="btn sm" data-reabrir="${esc(a.id_apontamento)}">↺ Reabrir</button>`
        : `<button class="btn ok" data-aprovar="${esc(a.id_apontamento)}">✔ Aprovar</button><button class="btn perigo" data-rejeitar="${esc(a.id_apontamento)}">✖ Rejeitar</button>`}</div></div>`; };
  const pintarRevisao = () => {
    const e = E(), q = SN.normal(e.revQ), todos = aps();
    const filtra = a => { const r = rotas().find(x => x.id_rota === a.id_rota) || {}; return !q || SN.normal([a.id_rota, a.tecnico, a.prestador, r.cidade, r.pop, r.endereco, r.id_chamado].join(' ')).includes(q); };
    const fila = todos.filter(a => a.status_revisao === 'AGUARDANDO_REVISAO' && filtra(a)).sort((a, b) => String(a.enviado_em).localeCompare(String(b.enviado_em)));
    const revis = todos.filter(a => ['APROVADA', 'REJEITADA'].includes(a.status_revisao) && filtra(a)).sort((a, b) => String(b.data_revisao).localeCompare(String(a.data_revisao))).slice(0, 30);
    SN.$('#pCorpo').innerHTML = `<div class="card card-filtros"><div class="filtros"><input class="inp busca" id="rQ" placeholder="Buscar (atividade, técnico, cidade…)" value="${esc(e.revQ)}"></div></div>
      <h3 style="margin:12px 0 8px">Aguardando revisão (${fila.length})</h3>
      ${fila.length ? fila.map(a => cartao(a, false)).join('') : '<p class="muted">Nada aguardando revisão.</p>'}
      <details style="margin-top:12px"><summary><b>Revisados (últimos ${revis.length})</b></summary><div style="margin-top:8px">${revis.map(a => cartao(a, true)).join('') || '<p class="muted">Nenhum.</p>'}</div></details>`;
    SN.$$('[data-axrev]').forEach(el => el.onclick = () => { const [id, i] = el.dataset.axrev.split('|'); const r = rotas().find(x => x.id_rota === id); if (r) SN.abrirAnexo(r.anexos[+i].id); });
    SN.$('#rQ').oninput = SN.debounce(ev => { e.revQ = ev.target.value; pintarRevisao(); SN.$('#rQ').focus(); }, 300);
    SN.$$('[data-aprovar]').forEach(b => b.onclick = async () => { b.disabled = true;
      try { await SN.vst.exec('VST_REVISAR', { id_apontamento: b.dataset.aprovar, decisao: 'APROVADA' }); SN.toast('Apontamento aprovado.', 'ok'); if (SN.sincronizar) SN.sincronizar().catch(() => { }); await recarregar(); }
      catch (err) { b.disabled = false; SN.toast(err.message, 'erro'); } });
    SN.$$('[data-rejeitar]').forEach(b => b.onclick = async () => {
      const res = await SN.modal({ titulo: 'Rejeitar apontamento', corpo: `<p class="small">O técnico vê o motivo e refaz o apontamento.</p>
        <div class="chips" id="mMot">${L.motivos_rejeicao.map(([k, r]) => `<label class="chip"><input type="checkbox" value="${k}"> ${esc(r)}</label>`).join('')}</div>
        <div class="campo" style="margin-top:8px"><label>Explique (obrigatório em "Outro")</label><textarea class="inp" id="mTxt"></textarea></div>`,
        botoes: [{ rot: 'Voltar', valor: null }, { rot: 'Rejeitar', cls: 'perigo', acao: m => {
          const motivos = SN.$$('#mMot input:checked', m).map(i => i.value), texto = SN.$('#mTxt', m).value.trim();
          const v = VR.validarRevisao({ decisao: 'REJEITADA', motivos, motivo_texto: texto }); if (!v.ok) { SN.toast(v.erros[0], 'erro'); return false; }
          return { motivos, texto }; } }] });
      if (!res) return;
      try { await SN.vst.exec('VST_REVISAR', { id_apontamento: b.dataset.rejeitar, decisao: 'REJEITADA', motivos: res.motivos, motivo_texto: res.texto }); SN.toast('Apontamento rejeitado.', 'ok'); await recarregar(); }
      catch (err) { SN.toast(err.message, 'erro'); } });
    SN.$$('[data-reabrir]').forEach(b => b.onclick = async () => {
      const mot = await SN.pedirTexto('Reabrir revisão', 'Motivo (volta para "aguardando revisão"; se o chamado já tinha concluído, volta para em campo) *');
      if (!mot) return;
      try { await SN.vst.exec('VST_REABRIR', { id_apontamento: b.dataset.reabrir, motivo: mot }); SN.toast('Revisão reaberta.', 'ok'); if (SN.sincronizar) SN.sincronizar().catch(() => { }); await recarregar(); }
      catch (err) { SN.toast(err.message, 'erro'); } });
  };

  // ═══════════════════════════ Dashboard ═══════════════════════════
  // Produção: apontamentos APROVADOS com data no período (base do pagamento).
  // Valor atingido: LPUs da conta do programa no período (lançado = tudo menos reprovada;
  // aprovado = contabilizada / em pagamento / paga), pela data de conclusão do chamado,
  // como no Portal. Por região/cidade/POP só entra a LPU dos chamados destas atividades.
  const APROV = ['CONTABILIZADA', 'EM_PAGAMENTO', 'PAGA'];
  const dataLpu = l => { const c = SN.db.chamados.find(x => x.id === l.chamadoId); return (c && c.tempos && c.tempos.conclusaoTecnica) || l.enviadoEm || l.criadoEm; };
  const tabela = (cab, linhas) => linhas.length ? `<div class="tabela-wrap"><table class="tab"><thead><tr>${cab.map(([t, num]) => `<th class="${num ? 'num' : ''}">${t}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>` : '<p class="muted small">Sem dados no período.</p>';
  const pintarDash = () => {
    const e = E(), iv = SN.intervaloMat(e.dash.per, e.dash.ref || hoje()), conta = SN.conta(P().conta) || { codigo: P().conta, nome: '', budget: 0 };
    const rm = {}; rotas().forEach(r => { rm[r.id_rota] = r; });
    const aprov = aps().filter(a => a.status_revisao === 'APROVADA' && rm[a.id_rota] && noIv(iv, a.data));
    const emRev = aps().filter(a => a.status_revisao === 'AGUARDANDO_REVISAO' && rm[a.id_rota] && noIv(iv, a.data)).length;
    const chRota = {}; rotas().forEach(r => { if (r.id_chamado) chRota[r.id_chamado] = r; });
    const lpus = SN.db.lpus.filter(l => l.cab && l.cab.conta === conta.codigo && l.status !== 'REPROVADA' && noIv(iv, dataLpu(l)));
    const lanc = lpus.reduce((s, l) => s + SN.valorLpu(l), 0), aprovado = lpus.filter(l => APROV.includes(l.status)).reduce((s, l) => s + SN.valorLpu(l), 0);
    const doProg = lpus.filter(l => chRota[l.chamadoId]), outros = lanc - doProg.reduce((s, l) => s + SN.valorLpu(l), 0);
    const budget = Number(conta.budget) || 0, pctMes = budget && e.dash.per === 'mes' ? Math.round(1000 * lanc / budget) / 10 : null;
    // Estimado pelo aprovado na revisão (quantidade × valor de referência da LPU), útil antes de a LPU ser lançada.
    const estimar = itens => Object.entries(itens).reduce((s, [cod, q]) => s + (Number(q) || 0) * ((SN.itemLpu(cod) || {}).valor || 0), 0);
    const grupos = chave => { const g = {};
      const novo = () => ({ ativ: new Set(), concl: new Set(), metros: 0, ceo: 0, itens: {}, cidades: new Set(), regioes: new Set(), valor: 0 });
      aprov.forEach(a => { const r = rm[a.id_rota], k = chave(r) || '(sem)', o = g[k] = g[k] || novo();
        o.ativ.add(r.id_rota); if (r.status === 'CONCLUIDA') o.concl.add(r.id_rota); o.cidades.add(r.cidade); o.regioes.add(r.regiao || '');
        if (retirada()) { o.metros += Number(a.metros) || 0; o.ceo += Number(a.ceo) || 0; }
        else VR.itensProg(a).forEach(i => { o.itens[i.cod] = (o.itens[i.cod] || 0) + i.qtd; }); });
      doProg.forEach(l => { const r = chRota[l.chamadoId], k = chave(r) || '(sem)', o = g[k] = g[k] || novo(); o.valor += SN.valorLpu(l); o.cidades.add(r.cidade); o.regioes.add(r.regiao || ''); });
      return Object.entries(g).map(([k, o]) => ({ k, ...o, cabo: VR.caboLancado(o.itens), estimado: retirada() ? estimar({ SEV0018: o.metros, SEV0019: o.ceo }) : estimar(o.itens) }))
        .sort((a, b) => (retirada() ? b.metros - a.metros : b.cabo - a.cabo) || b.valor - a.valor); };
    const tot = grupos(() => 'total')[0] || { metros: 0, ceo: 0, cabo: 0, ativ: new Set(), concl: new Set(), estimado: 0, itens: {} };
    const kpi = (rot, val, sub) => `<div class="kpi"><div class="rot">${rot}</div><div class="val">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
    const valorTd = o => `<td class="num nowrap">${SN.brl(o.valor)}</td><td class="num nowrap muted">${SN.brl(o.estimado)}</td>`;
    SN.$('#pCorpo').innerHTML = `
      <div class="card card-filtros">${SN.htmlPeriodo(e.dash)}</div>
      <div class="kpis-fin" style="margin:12px 0">
        ${retirada() ? kpi('Cabo retirado', SN.num(Math.round(tot.metros)) + ' m', 'aprovado na revisão') + kpi('CEO/CTO retiradas', SN.num(tot.ceo), 'aprovadas na revisão')
          : kpi('Cabo lançado', SN.num(Math.round(tot.cabo)) + ' m', 'itens de lançamento aprovados') + kpi('POPs atendidos', SN.num(grupos(r => r.pop).filter(x => x.k !== '(sem)').length), SN.num(grupos(r => r.cidade).length) + ' cidade(s)')}
        ${kpi('Atividades com produção', SN.num(tot.ativ.size), `${SN.num(tot.concl.size)} concluída(s)${emRev ? ' · ' + emRev + ' apontamento(s) em revisão' : ''}`)}
        ${kpi('Valor atingido na conta', SN.brl(lanc), `aprovado ${SN.brl(aprovado)}${budget ? ` · budget ${SN.brl(budget)}${pctMes != null ? ' (' + SN.num(pctMes) + '%)' : ''}` : ''}`)}
      </div>
      <div class="card" style="margin-bottom:12px"><h3>Conta ${esc(SN.contaTxt(conta.codigo))}</h3>
        ${budget && pctMes != null ? `<div class="gauge ${pctMes > 100 ? 'erro' : pctMes > 80 ? 'alerta' : ''}" style="margin:6px 0"><div style="width:${Math.min(100, pctMes)}%"></div></div>` : ''}
        <p class="small">Lançado no período: <b>${SN.brl(lanc)}</b> · aprovado (contabilizado/pago): <b>${SN.brl(aprovado)}</b>${budget ? ` · budget mensal ${SN.brl(budget)}` : ' · conta sem budget cadastrado'}.
          ${outros > 0.005 ? `<br><span class="muted">Desse valor, ${SN.brl(outros)} vem de outros chamados lançados nesta conta (fora das atividades desta tela).</span>` : ''}
          <br><span class="muted">"Estimado" = quantidade aprovada × valor de referência da LPU (vale antes de a LPU ser lançada; o valor real é o da LPU).</span></p></div>
      ${retirada() ? `
      <div class="card" style="margin-bottom:12px"><h3>Por região</h3>
        ${tabela([['Região'], ['Cidades'], ['Atividades', 1], ['Cabo retirado (m)', 1], ['CEO/CTO', 1], ['Valor LPU', 1], ['Estimado', 1]],
          grupos(r => r.regiao).map(o => `<tr><td><b>${esc(o.k)}</b></td><td class="small">${[...o.cidades].filter(Boolean).map(esc).join(', ')}</td><td class="num">${o.ativ.size}</td><td class="num">${SN.num(Math.round(o.metros))}</td><td class="num">${SN.num(o.ceo)}</td>${valorTd(o)}</tr>`))}</div>
      <div class="card"><h3>Por cidade</h3>
        ${tabela([['Cidade'], ['Região'], ['Atividades', 1], ['Cabo retirado (m)', 1], ['CEO/CTO', 1], ['Valor LPU', 1], ['Estimado', 1]],
          grupos(r => r.cidade).map(o => `<tr><td><b>${esc(o.k)}</b></td><td class="small">${[...o.regioes].filter(Boolean).map(esc).join(', ')}</td><td class="num">${o.ativ.size}</td><td class="num">${SN.num(Math.round(o.metros))}</td><td class="num">${SN.num(o.ceo)}</td>${valorTd(o)}</tr>`))}</div>`
      : `
      <div class="card" style="margin-bottom:12px"><h3>Por POP</h3>
        ${tabela([['POP'], ['Cidade'], ['Região'], ['Atividades', 1], ['Cabo lançado (m)', 1], ['Valor LPU', 1], ['Estimado', 1]],
          grupos(r => r.pop).map(o => `<tr><td><b>${esc(o.k)}</b></td><td class="small">${[...o.cidades].filter(Boolean).map(esc).join(', ')}</td><td class="small">${[...o.regioes].filter(Boolean).map(esc).join(', ')}</td><td class="num">${o.ativ.size}</td><td class="num">${SN.num(Math.round(o.cabo))}</td>${valorTd(o)}</tr>`))}</div>
      <div class="card" style="margin-bottom:12px"><h3>Por cidade</h3>
        ${tabela([['Cidade'], ['Região'], ['POPs'], ['Atividades', 1], ['Cabo lançado (m)', 1], ['Valor LPU', 1], ['Estimado', 1]],
          grupos(r => r.cidade).map(o => `<tr><td><b>${esc(o.k)}</b></td><td class="small">${[...o.regioes].filter(Boolean).map(esc).join(', ')}</td><td class="small">${esc([...new Set(aprov.filter(a => rm[a.id_rota].cidade === o.k).map(a => rm[a.id_rota].pop))].filter(Boolean).join(', '))}</td><td class="num">${o.ativ.size}</td><td class="num">${SN.num(Math.round(o.cabo))}</td>${valorTd(o)}</tr>`))}</div>
      <div class="card"><h3>Serviços aprovados</h3>
        ${tabela([['Item'], ['Serviço'], ['Quantidade', 1], ['Estimado', 1]],
          Object.entries(tot.itens).sort((a, b) => b[1] - a[1]).map(([cod, q]) => { const it = SN.itemLpu(cod) || {};
            return `<tr><td class="mono">${esc(cod)}</td><td>${esc(it.desc || '')}${VR.LPU_CABO_LANCADO.includes(cod) ? ' <span class="badge verde">cabo lançado</span>' : ''}</td><td class="num nowrap">${SN.num(q)} ${esc(it.medida || '')}</td><td class="num nowrap">${SN.brl(q * (it.valor || 0))}</td></tr>`; }))}</div>`}`;
    SN.ligarPeriodo(pintarDash, e.dash);
  };

  // Menu lateral: um grupo por programa, com Planejamento, Revisão e Dashboard (como a Preventiva).
  Object.keys(L.programas).forEach(s => { const p = L.programas[s];
    SN.MENU.push({ grupo: p.rot },
      { tela: p.tela, rot: 'Planejamento', ico: '🗺️', href: p.href },
      { id: p.tela.replace('planejamento', 'revisao'), tela: p.tela.replace('planejamento', 'revisao'), rot: 'Revisão', ico: '🔎', href: p.href.replace('planejamento', 'revisao') },
      { id: p.tela.replace('planejamento', 'dashboard'), tela: p.tela, rot: 'Dashboard', ico: '📈', href: p.href.replace('planejamento', 'dashboard') }); });
})();
