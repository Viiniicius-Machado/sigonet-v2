// SIGONET V2 — Preventiva AÉREA: tela do técnico.
//
// A equipe abre o KMZ da rota, percorre e aponta a produção: metros, postes
// equipados, cordoalha, plaquetas, caixas/CEO regularizadas e sobra técnica.
// Pode mandar parciais (dias diferentes) e um "Finalizado", que conclui a rota.
// "Colar relato" lê o texto que a equipe já manda hoje e preenche os campos.
// Cada apontamento gera a ficha PDF de controle e vai pela fila offline.
(() => {
  const L = VR_LISTAS, esc = SN.esc;
  let A = null; // estado da tela
  SN.vst.estadoAerea = () => A; // diagnóstico/testes
  const aberta = () => A && location.hash === '#/tec/aerea/' + encodeURIComponent(A.rota.id_rota);
  const hoje = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

  SN.rota('/tec/aerea/:id', async id => {
    if (!SN.vst.disponivel()) return SN.cascaTec('vst', SN.vst.semServidorHtml, 'Preventiva');
    if (A && A.rota.id_rota === id) { ligarOuvinte(); return pintar(); }
    SN.cascaTec('vst', '<p class="muted">Abrindo rota…</p>');
    let d;
    try { d = SN.vst.dados && SN.vst.dados.rotas.some(r => r.id_rota === id) ? SN.vst.dados : await SN.vst.carregar(); }
    catch (e) { return SN.cascaTec('vst', `<div class="aviso erro">${esc(e.message)}</div>`); }
    const rota = d.rotas.find(r => r.id_rota === id);
    if (!rota) { SN.toast('Rota não encontrada nas suas rotas.', 'erro'); return SN.navegar('#/tec/vistorias'); }
    A = { rota, dados: d, cfg: VR.normalizarConfig(d.config), locais: [], fotosLocais: {}, form: null };
    try { await recarregarLocais(true); }
    catch (e) { A = null; return SN.cascaTec('vst', `<div class="aviso erro">Não foi possível usar o armazenamento deste aparelho (${esc(e.message || e)}).</div>`); }
    SN.VF.ligarGps(); ligarOuvinte(); pintar();
    if (!d.offline) SN.vst.carregar().then(nd => { if (!aberta()) return; A.dados = nd; const r = nd.rotas.find(x => x.id_rota === id); if (r) A.rota = r; pintar(); }).catch(() => { });
  }, { familia: 'tecnico' });

  // inicial: só ao abrir a tela o rascunho salvo é recuperado (app fechado no meio
  // do preenchimento). Nas atualizações seguintes não: uma leitura antiga, que
  // termina depois de um envio, não pode ressuscitar o formulário já enviado.
  const recarregarLocais = async inicial => {
    const locais = await SN.VL.apontamentos.porIndice('rota', A.rota.id_rota);
    A.locais = locais;
    for (const f of await SN.VL.fotos.todos()) if (f.id_rota === A.rota.id_rota) A.fotosLocais[f.id_foto] = f;
    if (inicial && !A.form) { const rasc = locais.find(l => l.status_local === 'rascunho'); A.form = rasc ? rasc.dados : null; }
  };
  const ligarOuvinte = () => { if (!A.desligar) A.desligar = SN.VL.aoMudar(aoMudar); };
  const sair = () => { if (A && A.desligar) { A.desligar(); A.desligar = null; } SN.VF.desligarGps(); };
  window.addEventListener('hashchange', () => { if (A && !aberta()) sair(); });
  const aoMudar = async () => {
    if (!aberta()) return sair();
    const antes = A.locais.filter(l => l.status_local === 'enviada').length;
    await recarregarLocais();
    const depois = A.locais.filter(l => l.status_local === 'enviada').length;
    pintarLista(); pintarProgresso();
    if (depois > antes) { // apontamento confirmado: rota/chamado mudaram no servidor
      Promise.all([SN.vst.carregar(), SN.sincronizar ? SN.sincronizar().catch(() => { }) : null]).then(([nd]) => {
        if (!aberta()) return; A.dados = nd; const r = nd.rotas.find(x => x.id_rota === A.rota.id_rota); if (r) A.rota = r;
        const at = document.activeElement; if (!(at && ['INPUT', 'TEXTAREA', 'SELECT'].includes(at.tagName))) pintar();
      }).catch(() => { });
    }
  };

  // Apontamentos da rota: servidor + aparelho (o do aparelho vence enquanto não foi confirmado).
  const lista = () => {
    const m = {};
    (A.dados.producao || []).filter(a => a.id_rota === A.rota.id_rota).forEach(a => { m[a.id_apontamento] = { dados: a, status_local: 'enviada', servidor: a }; });
    A.locais.filter(l => l.status_local !== 'rascunho').forEach(l => { if (l.status_local !== 'enviada' || !m[l.id_apontamento]) m[l.id_apontamento] = { ...l, servidor: (m[l.id_apontamento] || {}).servidor || l.servidor }; });
    return Object.values(m).sort((a, b) => String(a.dados.data).localeCompare(String(b.dados.data)) || String(a.dados.enviado_em || '').localeCompare(String(b.dados.enviado_em || '')));
  };
  const producaoAtual = extra => VR.producaoRota(A.rota, lista().map(x => ({ ...x.dados, status_revisao: (x.servidor || {}).status_revisao || 'AGUARDANDO_REVISAO' })).concat(extra ? [extra] : []));
  const statusDe = x => { const st = (x.servidor || {}).status_revisao; return x.status_local === 'enviada' && st ? SN.vst.badgeVistoria(st) : SN.vst.badgeLocal(x.status_local); };
  const podeApontar = () => ['DESPACHADA', 'EM_CAMPO'].includes(A.rota.status);

  // ─────────── Pintura ───────────
  const pintar = () => {
    const r = A.rota;
    SN.cascaTec('vst', `
      <a href="#/tec/vistorias" class="small">← Minhas rotas</a>
      <div class="tec-os" style="margin-top:8px">
        <div class="small muted" style="display:flex;justify-content:space-between"><span class="mono">${esc(r.id_rota)} · 🗼 Aérea</span>${SN.vst.badgeRota(r.status)}</div>
        <div class="cli">${esc(r.cidade)} · ${esc(r.motivo)}</div>
        <table class="tab" style="margin-top:6px"><tbody>
          <tr><td class="muted">Data</td><td>${SN.vst.dia(r.data_planejada)}</td></tr>
          <tr><td class="muted">Região</td><td>${esc(r.regiao || '—')}</td></tr>
          <tr><td class="muted">Solicitante</td><td>${esc(r.solicitante || '—')}${r.notificacao ? '<br>' + esc(r.notificacao) : ''}</td></tr>
          <tr><td class="muted">Prestador</td><td>${esc(r.prestador)}${r.tecnico ? ' · ' + esc(r.tecnico) : ''}</td></tr>
          <tr><td class="muted">Previsto</td><td>${SN.num(r.metros_previstos)} m</td></tr>
          ${r.observacao ? `<tr><td class="muted">Obs.</td><td>${esc(r.observacao)}</td></tr>` : ''}
        </tbody></table>
        ${r.kmz_url ? `<a class="btn prim bloco" style="margin-top:10px" href="${esc(r.kmz_url)}" target="_blank" rel="noopener">🗺️ Abrir rota (KMZ)</a>`
          : '<div class="aviso alerta small" style="margin-top:10px">Esta rota não tem KMZ. Peça o link ao planejamento.</div>'}
      </div>
      ${A.dados.offline ? '<div class="aviso alerta" style="margin-bottom:8px">Sem sinal: trabalhando com os dados salvos no aparelho. O apontamento fica guardado e sobe quando a conexão voltar.</div>' : ''}
      <div id="aProg"></div>
      ${SN.vst.cartaoOs ? SN.vst.cartaoOs(r, {}) : ''}
      <div class="card" style="margin-bottom:10px"><h3>Apontamentos</h3><div id="aLista"></div></div>
      <div id="aForm"></div>`);
    SN.$$('[data-os]').forEach(el => el.onclick = () => SN.navegar(el.dataset.os));
    pintarProgresso(); pintarLista(); pintarForm();
  };

  const pintarProgresso = () => {
    const el = SN.$('#aProg'); if (!el) return;
    const p = producaoAtual(), prev = Number(A.rota.metros_previstos) || 0, pct = prev ? Math.min(100, Math.round(100 * p.totais.metros / prev)) : 0;
    el.innerHTML = `<div class="card" style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:baseline"><b>${SN.num(p.totais.metros)} m</b><span class="small muted">de ${SN.num(prev)} m previstos${prev ? ' · ' + pct + '%' : ''}</span></div>
      <div class="gauge ${pct >= 100 ? '' : pct >= 50 ? 'alerta' : 'erro'}"><div style="width:${prev ? pct : 0}%"></div></div>
      <div class="small muted">${L.producao_aerea.slice(1).map(c => `${c.rot}: <b>${SN.num(p.totais[c.k])}</b>`).join(' · ')}</div></div>`;
  };

  const pintarLista = () => {
    const el = SN.$('#aLista'); if (!el) return;
    const itens = lista();
    el.innerHTML = itens.length ? itens.map(x => {
      const a = x.dados, srv = x.servidor || {};
      const rej = x.status_local === 'enviada' && srv.status_revisao === 'REJEITADA';
      return `<div class="vst-anomalia" style="background:#fff">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px"><b>${SN.vst.dia(a.data)} · ${a.tipo === 'final' ? 'Finalizado' : 'Parcial'}</b>${statusDe(x)}</div>
        <div class="small">${SN.num(a.metros)} m · ${SN.num(a.postes)} postes · ${SN.num(a.cordoalha)} m cordoalha · ${SN.num(a.plaquetas)} plaquetas · ${SN.num(a.caixas)} caixas/CEO · sobra ${SN.num(a.sobra)}</div>
        ${x.status_local === 'erro' ? `<div class="aviso erro small" style="margin-top:6px">Não aceito: ${esc(x.erro || '')}<br><button class="btn sm" data-corrigir="${esc(a.id_apontamento)}">Corrigir</button></div>` : ''}
        ${rej ? `<div class="aviso erro small" style="margin-top:6px">Rejeitado por ${esc(srv.revisor || '')}: ${(srv.motivo_rejeicao || []).map(m => esc(L.rotulo('motivos_rejeicao', m))).join(', ')}${srv.motivo_rejeicao_texto ? ' — ' + esc(srv.motivo_rejeicao_texto) : ''}
          <br><button class="btn sm prim" data-refazer="${esc(a.id_apontamento)}" style="margin-top:6px">✏️ Refazer este apontamento</button></div>` : ''}
      </div>`;
    }).join('') : '<p class="muted small">Nenhum apontamento ainda.</p>';
    SN.$$('[data-refazer],[data-corrigir]', el).forEach(b => b.onclick = () => {
      const idA = b.dataset.refazer || b.dataset.corrigir, x = lista().find(i => i.dados.id_apontamento === idA);
      const base = JSON.parse(JSON.stringify(x.dados));
      ['status_revisao', 'revisor', 'data_revisao', 'motivo_rejeicao', 'motivo_rejeicao_texto', 'enviado_em', 'envios', 'historico', 'tecnico', 'prestador', 'cidade', 'regiao', 'motivo'].forEach(k => delete base[k]);
      A.form = { ...base, fotos: (base.fotos || []).filter(f => f.tipo_foto !== 'ficha_pdf'), refazendo: true };
      pintarForm(); SN.$('#aForm').scrollIntoView({ behavior: 'smooth' });
    });
  };

  // ─────────── Formulário de apontamento ───────────
  const novoForm = () => ({ id_apontamento: 'A' + SN.uid() + SN.uid(), id_rota: A.rota.id_rota, tipo: '', data: hoje(),
    metros: '', postes: '', cordoalha: '', plaquetas: '', caixas: '', sobra: '', observacao: '', fotos: [] });
  let timer = null, fotosProcessando = 0;
  // Rascunho do formulário. Um apontamento já enviado nunca volta a rascunho
  // (a foto ou a digitação que terminar depois do envio não sobrescreve a fila).
  const salvarRascunho = () => {
    const f = A.form; clearTimeout(timer);
    timer = setTimeout(() => { if (!f || f._enviado || A.form !== f) return;
      SN.VL.salvarApontamento({ id_apontamento: f.id_apontamento, id_rota: A.rota.id_rota, status_local: 'rascunho', dados: f }); }, 300);
  };

  const pintarForm = () => {
    const el = SN.$('#aForm'); if (!el) return;
    const rejeitadoEmAberto = lista().some(x => (x.servidor || {}).status_revisao === 'REJEITADA');
    const temFinal = lista().some(x => x.dados.tipo === 'final' && (x.servidor || {}).status_revisao !== 'REJEITADA'); // mesmo ainda na fila
    if ((!podeApontar() || temFinal) && !(A.form && A.form.refazendo)) {
      el.innerHTML = A.rota.status === 'CONCLUIDA' || temFinal
        ? `<div class="aviso ok">✓ Rota finalizada.${rejeitadoEmAberto ? ' Há apontamento rejeitado: toque em "Refazer" acima.' : ' Aguardando a revisão da produção; depois a LPU libera na OS.'}</div>` : '';
      return;
    }
    const f = A.form || (A.form = novoForm());
    const num = (k, rot) => `<div class="campo"><label>${rot}</label><input class="inp" type="number" inputmode="decimal" min="0" step="any" data-a="${k}" value="${esc(f[k] ?? '')}"></div>`;
    el.innerHTML = `<div class="card vst-bloco"><h3>${f.refazendo ? '✏️ Refazer apontamento' : '➕ Apontar produção'}</h3>
      <details ${f.metros === '' ? 'open' : ''} style="margin-bottom:10px"><summary class="small"><b>📋 Colar relato da equipe</b> (preenche os campos sozinho)</summary>
        <textarea class="inp" id="aRelato" placeholder="Rota percorrido 2,134&#10;Poste equipado 13&#10;Cordoalha 120&#10;Plaquetas 15&#10;Caixa regularizadas 3&#10;Finalizado" style="margin-top:6px;min-height:120px"></textarea>
        <button type="button" class="btn bloco" id="aLer" style="margin-top:6px">Ler relato</button><div class="small" id="aLido"></div></details>
      <div class="campo"><label>Tipo *</label><div class="chips">${L.tipo_apontamento.map(([v, r]) => `<button type="button" class="chip ${f.tipo === v ? 'sel' : ''}" data-tipo="${v}">${r}</button>`).join('')}</div>
        <div class="small muted">"Finalizado" conclui a rota. Use "Parcial" quando a equipe volta outro dia.</div></div>
      <div class="campo"><label>Data *</label><input class="inp" type="date" data-a="data" value="${esc(String(f.data || '').slice(0, 10))}"></div>
      <div class="grid g2" style="gap:0 10px">${L.producao_aerea.map(c => num(c.k, c.rot + (c.k === 'metros' ? ' *' : ''))).join('')}</div>
      <div class="campo"><label>Observação</label><textarea class="inp" data-a="observacao">${esc(f.observacao || '')}</textarea></div>
      <div class="vst-foto"><div class="rot">📷 Fotos da produção (opcional) — saem com data, hora, endereço e logo</div>
        <div class="vst-thumbs" id="aThumbs"></div></div>
      <div id="aErros"></div>
      <button class="btn prim lg bloco" id="aEnviar" style="margin-top:8px">📤 Enviar apontamento</button>
      ${f.refazendo ? '<button class="btn bloco" id="aCancelar" style="margin-top:6px">Cancelar</button>' : ''}</div>`;
    pintarThumbs(); validarNaTela();
    SN.$('#aLer').onclick = () => {
      const r = VR.lerRelato(SN.$('#aRelato').value);
      ['metros', 'postes', 'cordoalha', 'plaquetas', 'caixas', 'sobra'].forEach(k => { if (r[k] != null) f[k] = r[k]; });
      if (r.tipo) f.tipo = r.tipo;
      salvarRascunho(); pintarForm();
      SN.$('#aLido').innerHTML = r.reconhecidos.length ? `<span style="color:var(--ok)">✓ ${r.reconhecidos.length} linha(s) lida(s).</span>${r.ignorados.length ? ` <span class="muted">Não entendi: ${r.ignorados.map(esc).join(' · ')}</span>` : ''} Confira os números antes de enviar.`
        : '<span style="color:var(--erro)">Não reconheci nenhuma linha. Preencha os campos à mão.</span>';
    };
    SN.$$('[data-tipo]', el).forEach(b => b.onclick = () => { f.tipo = f.tipo === b.dataset.tipo ? '' : b.dataset.tipo; salvarRascunho(); pintarForm(); });
    SN.$$('[data-a]', el).forEach(i => { i.oninput = () => { const k = i.dataset.a; f[k] = i.type === 'number' ? (i.value === '' ? '' : Number(i.value)) : i.value; salvarRascunho(); validarNaTela(); }; });
    SN.$('#aEnviar').onclick = enviar;
    if (SN.$('#aCancelar')) SN.$('#aCancelar').onclick = () => { A.form = null; pintarForm(); };
  };
  const pintarThumbs = () => {
    const el = SN.$('#aThumbs'); if (!el) return;
    el.innerHTML = (A.form.fotos || []).map(f => {
      const l = A.fotosLocais[f.id_foto], src = l && l.thumb ? l.thumb : (f.drive_id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(f.drive_id)}&sz=w240` : '');
      return `<div class="vst-thumb st-${l ? l.status : 'enviada'}">${src ? `<img src="${src}" alt="">` : '<div class="vazio">📷</div>'}<button type="button" class="del" data-del="${esc(f.id_foto)}">×</button></div>`;
    }).join('') + `<label class="vst-cap"><input type="file" accept="image/*" capture="environment" id="aCam" hidden><span>＋<br>Tirar foto</span></label>`;
    SN.$$('[data-del]', el).forEach(b => b.onclick = () => { A.form.fotos = A.form.fotos.filter(f => f.id_foto !== b.dataset.del); salvarRascunho(); pintarThumbs(); });
    SN.$('#aCam').onchange = async ev => {
      const file = ev.target.files && ev.target.files[0]; if (!file) return;
      const form = A.form; fotosProcessando++;
      SN.toast('Processando foto (GPS e endereço)…');
      try {
        const r = A.rota, img = await SN.VF.fotoCarimbada(file, `${r.id_rota} · ${r.cidade} · ${r.motivo} · Preventiva aérea`);
        if (A.form !== form || form._enviado) { SN.toast('O apontamento já foi enviado; a foto não entrou nele.', 'erro'); return; }
        const id_foto = 'F' + SN.uid() + SN.uid();
        const meta = { id_foto, id_apontamento: A.form.id_apontamento, id_rota: r.id_rota, tipo_foto: 'producao', ref: '', lat: img.pos ? img.pos.lat : '', lng: img.pos ? img.pos.lng : '',
          data_hora_captura: img.agora, data_hora_arquivo: img.dataArquivo, endereco: img.endereco || '' };
        A.form.fotos.push({ id_foto, tipo_foto: 'producao', data_hora_captura: img.agora, endereco: img.endereco || '' });
        const reg = { id_foto, id_vistoria: '', id_rota: r.id_rota, meta, dataUrl: img.dataUrl, thumb: img.thumb, criadaEm: img.agora, status: 'pendente' };
        A.fotosLocais[id_foto] = reg; salvarRascunho(); await SN.VL.guardarFoto(reg); pintarThumbs();
      } catch (e) { SN.toast('Não foi possível processar a foto: ' + (e.message || e), 'erro'); }
      finally { fotosProcessando--; }
    };
  };
  const validarNaTela = () => {
    const el = SN.$('#aErros'); if (!el) return { ok: false };
    const r = VR.validarApontamento(A.form);
    el.innerHTML = r.ok ? '' : `<div class="aviso alerta small">${r.erros.map(esc).join('<br>')}</div>`;
    SN.$('#aEnviar').disabled = !r.ok;
    return r;
  };

  const enviar = async () => {
    const f = A.form, r = validarNaTela();
    if (!r.ok) return SN.toast(r.erros[0], 'erro');
    if (fotosProcessando) return SN.toast('Aguarde a foto terminar de processar (GPS e endereço) antes de enviar.', 'erro');
    const final = f.tipo === 'final';
    if (!await SN.confirmar(final ? 'Finalizar rota' : 'Enviar apontamento parcial',
      `${SN.num(f.metros)} m · ${SN.num(f.postes || 0)} postes · ${SN.num(f.cordoalha || 0)} m cordoalha · ${SN.num(f.plaquetas || 0)} plaquetas · ${SN.num(f.caixas || 0)} caixas/CEO · sobra ${SN.num(f.sobra || 0)}.<br>`
      + (final ? '<b>Isto conclui a rota.</b> A produção vai para a revisão e, aprovada, libera a LPU.' : 'A rota continua aberta para os próximos dias.'), final ? 'Finalizar' : 'Enviar', 'prim')) return;
    f._enviado = true; clearTimeout(timer);
    const a = { ...f }; delete a.refazendo; delete a._enviado;
    // Ficha PDF de controle do apontamento (vai pela fila, antes do apontamento).
    try {
      const acum = producaoAtual({ ...a, status_revisao: 'AGUARDANDO_REVISAO', id_apontamento: a.id_apontamento + '_novo' }).totais;
      const pdf = await SN.vst.pdfApontamento({ ...a, tecnico: SN.usuario().nome }, A.rota, acum, A.fotosLocais);
      if (pdf) {
        const id_foto = 'P' + SN.uid() + SN.uid(), agora = SN.agora();
        a.fotos = (a.fotos || []).filter(x => x.tipo_foto !== 'ficha_pdf').concat([{ id_foto, tipo_foto: 'ficha_pdf', data_hora_captura: agora }]);
        const reg = { id_foto, id_vistoria: '', id_rota: A.rota.id_rota, dataUrl: pdf, thumb: null, criadaEm: agora, status: 'pendente',
          meta: { id_foto, id_apontamento: a.id_apontamento, id_rota: A.rota.id_rota, tipo_foto: 'ficha_pdf', ref: '', data_hora_captura: agora, data_hora_arquivo: agora } };
        await SN.VL.guardarFoto(reg);
      }
    } catch (e) { console.error('[Preventiva] ficha PDF:', e); SN.toast('O apontamento vai sem a ficha PDF: ' + (e.message || e), 'erro'); }
    clearTimeout(timer);
    await SN.VL.enfileirarApontamento({ id_apontamento: a.id_apontamento, id_rota: A.rota.id_rota, dados: a });
    A.form = null;
    await recarregarLocais();
    SN.toast(final ? 'Rota finalizada: apontamento na fila de envio.' : 'Apontamento na fila de envio.', 'ok');
    pintar();
  };
})();
