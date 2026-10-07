// SIGONET V2 — Preventiva AÉREA: tela do técnico.
//
// A equipe abre o KMZ da rota, percorre e aponta a produção: metros, postes
// equipados, cordoalha, plaquetas, caixas/CEO regularizadas e sobra técnica.
// Pode mandar parciais (dias diferentes) e um "Finalizado", que conclui a rota.
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
    if (SN.conversa && A.rota.id_chamado) SN.conversa.flutuante(A.rota.id_chamado);
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
  const sair = () => { if (A && A.desligar) { A.desligar(); A.desligar = null; } if (A) clearInterval(A.timerEu); SN.VF.desligarGps(); };
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
          <tr><td class="muted">Solicitante</td><td>${esc(r.solicitante || '—')}</td></tr>
          ${r.notificacao ? `<tr><td class="muted">Notificação / Protocolo</td><td>${esc(r.notificacao)}</td></tr>` : ''}
          <tr><td class="muted">Prestador</td><td>${esc(r.prestador)}${r.tecnico ? ' · ' + esc(r.tecnico) : ''}</td></tr>
          <tr><td class="muted">Previsto</td><td>${SN.num(r.metros_previstos)} m</td></tr>
          ${r.observacao ? `<tr><td class="muted">Obs.</td><td>${esc(r.observacao)}</td></tr>` : ''}
        </tbody></table>
        ${r.kmz_url ? `<a class="btn prim bloco" style="margin-top:10px" href="${esc(r.kmz_url)}" target="_blank" rel="noopener">🗺️ Abrir rota (KMZ)</a>`
          : '<div class="aviso alerta small" style="margin-top:10px">Esta rota não tem KMZ. Peça o link ao planejamento.</div>'}
      </div>
      ${(r.pontos_base || []).length ? `<div class="card" style="margin-bottom:10px"><details ${r.pontos_base.length <= 15 ? 'open' : ''}><summary><b>CEO e pontos no caminho (${r.pontos_base.length})</b></summary>
        <div class="small muted" style="margin:4px 0 6px">Pontos da base a até 30 m da rota. Confira cada um ao passar.</div>
        ${r.pontos_base.map(p => `<div class="item-lpu" style="grid-template-columns:1fr auto"><div><div class="d"><span class="badge ${p.tipo_ponto === 'CEO' ? 'info' : ''}">${esc(p.tipo_ponto)}</span> ${esc(p.id_cs)}</div>
          <div class="c">${esc(p.endereco || '')}${p.descricao ? `<div class="muted" style="white-space:pre-line">${esc(p.descricao.slice(0, 200))}</div>` : ''}</div></div>
          <a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${p.lat},${p.lng}">Mapa</a></div>`).join('')}</details></div>` : ''}
      <div id="aMapaCard"></div>
      ${A.dados.offline ? '<div class="aviso alerta" style="margin-bottom:8px">Sem sinal: trabalhando com os dados salvos no aparelho. O apontamento fica guardado e sobe quando a conexão voltar.</div>' : ''}
      <div id="aProg"></div>
      ${SN.vst.cartaoOs ? SN.vst.cartaoOs(r, {}) : ''}
      <div class="card" style="margin-bottom:10px"><h3>Apontamentos</h3><div id="aLista"></div></div>
      <div id="aForm"></div>`);
    SN.$$('[data-os]').forEach(el => el.onclick = () => SN.navegar(el.dataset.os));
    pintarProgresso(); pintarLista(); pintarForm(); pintarMapa();
  };

  // ─────────── Mapa da rota: traçado do KMZ, CEO/pontos da base no caminho e fotos com GPS ───────────
  // Rota antiga sem traçado guardado: pede ao servidor (ele lê o KMZ do Drive). "Minha posição" usa o GPS
  // que a tela já acompanha (SN.VF.posicao). Sem internet o fundo não carrega, mas o traçado aparece.
  const pintarMapa = async () => {
    const el = SN.$('#aMapaCard'); if (!el || !A) return;
    const r = A.rota;
    if (!(r.tracado || []).length && r.kmz_url && !A.pediuTracado && navigator.onLine) {
      A.pediuTracado = true;
      try { const x = await SN.vst.exec('VST_TRACADOS', { ids: [r.id_rota] }); if ((x.tracados || {})[r.id_rota]) r.tracado = x.tracados[r.id_rota]; else A.semTracado = (x.falhas || {})[r.id_rota] || ''; } catch (e) { }
      if (!aberta() || SN.$('#aMapaCard') !== el) return;
    }
    const tr = r.tracado || [], pb = r.pontos_base || [];
    const fotos = []; lista().forEach(x => (x.dados.fotos || []).forEach(f => { const l = A.fotosLocais[f.id_foto], m = (l && l.meta) || f; const lat = Number(m.lat), lng = Number(m.lng);
      if (f.tipo_foto !== 'ficha_pdf' && m.lat !== '' && m.lat != null && isFinite(lat) && isFinite(lng)) fotos.push({ lat, lng, tipo: f.tipo_foto }); }));
    if (!tr.length && !pb.length && !fotos.length) { el.innerHTML = r.kmz_url ? `<div class="aviso info small" style="margin-bottom:10px">O mapa da rota aparece quando o KMZ é um arquivo (o planejamento pode reenviar). Use "Abrir rota (KMZ)" acima.</div>` : ''; return; }
    el.innerHTML = `<div class="card" style="margin-bottom:10px;padding:10px" id="aMapaBox"><div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px">
        <b>Mapa da rota</b><span><button class="btn sm" id="aMinha">Minha posição</button> <button class="btn sm" id="aCheia">Tela cheia</button></span></div>
      <div id="aMapa" style="height:300px;border-radius:8px;overflow:hidden;background:#eef0ea"></div>
      <div class="small muted" style="margin-top:6px"><span style="color:#3d4f11">━</span> rota${pb.length ? ` · <span style="color:#1f5fd1">●</span> CEO/ponto da base (${pb.length})` : ''}${fotos.length ? ` · <span style="color:#e08a00">●</span> fotos (${fotos.length})` : ''} · <span style="color:#2a7de1">●</span> você</div></div>`;
    try { await SN.vst.carregarLeaflet(); } catch (e) { SN.$('#aMapa').innerHTML = '<div class="small muted" style="padding:12px">Sem internet para carregar o mapa agora.</div>'; return; }
    if (!aberta() || !document.body.contains(el)) return;
    const LF = window.L; // aqui "L" são as listas da Preventiva (VR_LISTAS)
    if (A.mapa) { try { A.mapa.remove(); } catch (e) { } }
    const mapa = A.mapa = LF.map('aMapa', { preferCanvas: true, zoomControl: true });
    LF.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);
    const lim = [];
    tr.forEach(l => { LF.polyline(l, { color: '#3d4f11', weight: 5, opacity: 0.85 }).addTo(mapa); l.forEach(p => lim.push(p)); });
    pb.forEach(p => { LF.circleMarker([p.lat, p.lng], { radius: 7, weight: 2, color: '#fff', fillColor: '#1f5fd1', fillOpacity: 0.95 })
      .bindPopup(`<b>${esc(p.tipo_ponto)} ${esc(p.id_cs)}</b>${p.descricao ? '<br>' + esc(p.descricao.slice(0, 160)) : ''}<br><a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}">Ir até aqui</a>`).addTo(mapa); lim.push([p.lat, p.lng]); });
    fotos.forEach(f => { LF.circleMarker([f.lat, f.lng], { radius: 4, weight: 1, color: '#fff', fillColor: '#e08a00', fillOpacity: 0.9 }).addTo(mapa); lim.push([f.lat, f.lng]); });
    if (lim.length) mapa.fitBounds(LF.latLngBounds(lim).pad(0.12), { maxZoom: 17 }); else mapa.setView([-22.9, -47.06], 12);
    // Minha posição: ponto azul atualizado a cada 5 s enquanto a tela está aberta.
    let eu = null;
    const atualizarEu = centrar => { const p = SN.VF.posicao; if (!p || !A || A.mapa !== mapa) return false;
      if (!eu) eu = LF.circleMarker([p.lat, p.lng], { radius: 7, weight: 3, color: '#fff', fillColor: '#2a7de1', fillOpacity: 1 }).addTo(mapa); else eu.setLatLng([p.lat, p.lng]);
      if (centrar) mapa.setView([p.lat, p.lng], Math.max(mapa.getZoom(), 17)); return true; };
    atualizarEu(false); clearInterval(A.timerEu); A.timerEu = setInterval(() => { if (!aberta()) return clearInterval(A.timerEu); atualizarEu(false); }, 5000);
    SN.$('#aMinha').onclick = () => { if (!atualizarEu(true)) SN.toast('Aguardando o GPS do celular… permita a localização para o SigoNet.', 'erro'); };
    SN.$('#aCheia').onclick = () => { const c = SN.$('#aMapaBox'); (c.requestFullscreen || c.webkitRequestFullscreen || (() => { })).call(c); };
    document.onfullscreenchange = () => { const m = SN.$('#aMapa'); if (!m) return; m.style.height = document.fullscreenElement ? 'calc(100vh - 70px)' : '300px'; setTimeout(() => A && A.mapa && A.mapa.invalidateSize(), 150); };
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
      SN.VL.salvarApontamento({ id_apontamento: f.id_apontamento, id_rota: A.rota.id_rota, status_local: 'rascunho', dados: f }).then(() => SN.vst.publicarVivo(A.rota.id_rota)); }, 300);
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
    // Cada item da produção tem o seu quadro de fotos; a quantidade exigida acompanha o número digitado.
    const item = c => `<div class="vst-foto" data-item="${c.k}"><div class="campo" style="margin-bottom:6px"><label>${c.rot}${c.k === 'metros' ? ' *' : ''}</label>
        <input class="inp" type="number" inputmode="decimal" min="0" step="any" data-a="${c.k}" value="${esc(f[c.k] ?? '')}"></div>
      <div class="rot"><span data-cont="${c.k}"></span> <span class="muted">· ${esc(c.regra)}</span></div>
      <div class="vst-thumbs" data-fotos="${c.k}"></div></div>`;
    el.innerHTML = `<div class="card vst-bloco"><h3>${f.refazendo ? '✏️ Refazer apontamento' : '➕ Apontar produção'}</h3>
      <div class="campo"><label>Tipo *</label><div class="chips">${L.tipo_apontamento.map(([v, r]) => `<button type="button" class="chip ${f.tipo === v ? 'sel' : ''}" data-tipo="${v}">${r}</button>`).join('')}</div>
        <div class="small muted">"Finalizado" conclui a rota. Use "Parcial" quando a equipe volta outro dia.</div></div>
      <div class="campo"><label>Data *</label><input class="inp" type="date" data-a="data" value="${esc(String(f.data || '').slice(0, 10))}"></div>
      <div class="small muted" style="margin-bottom:6px">📷 Fotos obrigatórias em cada item com quantidade (saem com data, hora, endereço e logo).</div>
      ${L.producao_aerea.map(item).join('')}
      <div class="vst-foto" id="aOutras" style="display:none"><div class="rot">Fotos do envio anterior (sem item)</div><div class="vst-thumbs" data-fotos="_outras"></div></div>
      <div class="campo"><label>Observação</label><textarea class="inp" data-a="observacao">${esc(f.observacao || '')}</textarea></div>
      <div id="aErros"></div>
      <button class="btn prim lg bloco" id="aEnviar" style="margin-top:8px">📤 Enviar apontamento</button>
      ${f.refazendo ? '<button class="btn bloco" id="aCancelar" style="margin-top:6px">Cancelar</button>' : ''}</div>`;
    pintarThumbs(); validarNaTela();
    SN.$$('[data-tipo]', el).forEach(b => b.onclick = () => { f.tipo = f.tipo === b.dataset.tipo ? '' : b.dataset.tipo; salvarRascunho(); pintarForm(); });
    SN.$$('[data-a]', el).forEach(i => { i.oninput = () => { const k = i.dataset.a; f[k] = i.type === 'number' ? (i.value === '' ? '' : Number(i.value)) : i.value; salvarRascunho(); validarNaTela(); contarFotos(); }; });
    SN.$('#aEnviar').onclick = enviar;
    if (SN.$('#aCancelar')) SN.$('#aCancelar').onclick = () => { A.form = null; pintarForm(); };
  };
  const thumb = f => {
    const l = A.fotosLocais[f.id_foto], src = l && l.thumb ? l.thumb : (f.drive_id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(f.drive_id)}&sz=w240` : '');
    return `<div class="vst-thumb st-${l ? l.status : 'enviada'}">${src ? `<img src="${src}" alt="" data-ver="${esc(f.drive_id ? 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(f.drive_id) + '&sz=w1600' : 'local:' + f.id_foto)}">` : '<div class="vazio">📷</div>'}<button type="button" class="del" data-del="${esc(f.id_foto)}">×</button></div>`;
  };
  // Contagem "2 de 5 fotos" de cada item (muda junto com o número digitado).
  const contarFotos = () => {
    const vf = VR.validarFotosApontamento(A.form);
    vf.itens.forEach(x => { const el = SN.$(`[data-cont="${x.k}"]`); if (!el) return;
      el.innerHTML = x.exigidas ? `<b style="color:${x.tem >= x.exigidas ? 'var(--ok)' : 'var(--erro)'}">📷 ${x.tem} de ${x.exigidas} foto(s)</b>` : `📷 ${x.tem} foto(s) <span class="muted">(sem quantidade, não exige)</span>`; });
  };
  const pintarThumbs = () => {
    if (!SN.$('[data-fotos]')) return;
    const tiposItem = L.producao_aerea.map(c => c.foto);
    L.producao_aerea.forEach(c => {
      const el = SN.$(`[data-fotos="${c.k}"]`); if (!el) return;
      el.innerHTML = (A.form.fotos || []).filter(f => f.tipo_foto === c.foto).map(thumb).join('')
        + `<label class="vst-cap"><input type="file" accept="image/*" capture="environment" data-cam="${c.foto}" hidden><span>＋<br>Tirar foto</span></label>`
        + `<label class="vst-cap" title="Escolher uma ou várias fotos já tiradas"><input type="file" accept="image/*" multiple data-cam="${c.foto}" data-galeria="1" hidden><span>＋<br>Galeria</span></label>`;
    });
    // Fotos genéricas de um envio anterior (tipo "producao"): continuam no apontamento, mas não contam para nenhum item.
    const outras = (A.form.fotos || []).filter(f => !tiposItem.includes(f.tipo_foto));
    SN.$('#aOutras').style.display = outras.length ? '' : 'none';
    SN.$('[data-fotos="_outras"]').innerHTML = outras.map(thumb).join('');
    SN.$$('#aForm [data-del]').forEach(b => b.onclick = () => { A.form.fotos = A.form.fotos.filter(f => f.id_foto !== b.dataset.del); salvarRascunho(); pintarThumbs(); validarNaTela(); });
    // Câmera (uma foto, carimbo com GPS e endereço de agora) ou galeria (várias; carimbo com a data original e "da galeria").
    SN.$$('#aForm [data-cam]').forEach(inp => inp.onchange = async ev => {
      const files = [...(ev.target.files || [])], tipo = inp.dataset.cam, galeria = !!inp.dataset.galeria; if (!files.length) return;
      const form = A.form, info = L.foto(tipo) || {}; fotosProcessando++;
      SN.toast(galeria ? `Processando ${files.length} foto(s) da galeria…` : 'Processando foto (GPS e endereço)…');
      try {
        for (const file of files) {
          const r = A.rota, ctx = `${r.id_rota} · ${r.cidade} · ${info.rot || ''} · Preventiva aérea`;
          const img = galeria ? await SN.VF.fotoGaleria(file, ctx) : await SN.VF.fotoCarimbada(file, ctx);
          if (A.form !== form || form._enviado) { SN.toast('O apontamento já foi enviado; a foto não entrou nele.', 'erro'); return; }
          const id_foto = 'F' + SN.uid() + SN.uid(), origem = img.origem || 'camera';
          const meta = { id_foto, id_apontamento: A.form.id_apontamento, id_rota: r.id_rota, tipo_foto: tipo, ref: '', lat: img.pos ? img.pos.lat : '', lng: img.pos ? img.pos.lng : '',
            data_hora_captura: img.agora, data_hora_arquivo: img.dataArquivo, endereco: img.endereco || '', origem };
          A.form.fotos.push({ id_foto, tipo_foto: tipo, data_hora_captura: img.agora, data_hora_arquivo: img.dataArquivo, endereco: img.endereco || '', origem });
          const reg = { id_foto, id_vistoria: '', id_rota: r.id_rota, meta, dataUrl: img.dataUrl, thumb: img.thumb, criadaEm: img.agora, status: 'pendente' };
          A.fotosLocais[id_foto] = reg; salvarRascunho(); await SN.VL.guardarFoto(reg); pintarThumbs(); validarNaTela();
        }
      } catch (e) { SN.toast('Não foi possível processar a foto: ' + (e.message || e), 'erro'); }
      finally { fotosProcessando--; }
    });
    contarFotos();
  };
  const validarNaTela = () => {
    const el = SN.$('#aErros'); if (!el) return { ok: false };
    const r = VR.validarApontamento(A.form), vf = VR.validarFotosApontamento(A.form), erros = r.erros.concat(vf.erros);
    el.innerHTML = erros.length ? `<div class="aviso alerta small">${erros.map(esc).join('<br>')}</div>` : '';
    SN.$('#aEnviar').disabled = !!erros.length;
    return { ok: !erros.length, erros };
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
