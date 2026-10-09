// SIGONET V2 — Melhoria de rede / Retirada de cabo: tela do técnico (#/tec/prog/:id).
//
// Aberta pela OS ("Abrir atividade"). A equipe aponta a produção — parciais (dias
// diferentes) e um "Finalizado", que conclui a atividade:
//   Retirada: metros de cabo retirados (SEV0018) e CEO/CTO retiradas (SEV0019);
//             fotos antes, depois, cabo recolhido/bobina e uma por CEO/CTO.
//   Melhoria: os serviços da LPU da conta 0103 com as quantidades; fotos antes e depois.
// Cada apontamento vai pela fila offline da Preventiva (VST_APONTAR) e as fotos sobem na
// captura. Aprovado na revisão o "Finalizado", a OS conclui e a LPU nasce preenchida.
(() => {
  const L = VR_LISTAS, esc = SN.esc;
  let A = null;
  const aberta = () => A && location.hash === '#/tec/prog/' + encodeURIComponent(A.rota.id_rota);
  const hoje = () => SN.dataIsoLocal(new Date());
  const ret = () => A.rota.segmento === 'RETIRADA';
  const prog = () => L.programas[A.rota.segmento];
  const doServidor = d => (d.prog_producao || []).filter(a => a.id_rota === A.rota.id_rota);

  SN.rota('/tec/prog/:id', async id => {
    if (!SN.vst.disponivel()) return SN.cascaTec('fila', SN.vst.semServidorHtml.replace('A Preventiva precisa', 'Esta tela precisa'));
    if (A && A.rota.id_rota === id) { ligarOuvinte(); return pintar(); }
    SN.cascaTec('fila', SN.carregando('Abrindo atividade…'));
    let d;
    try { d = SN.vst.dados && (SN.vst.dados.prog_rotas || []).some(r => r.id_rota === id) ? SN.vst.dados : await SN.vst.carregar(); }
    catch (e) { return SN.cascaTec('fila', `<div class="aviso erro">${esc(e.message)}</div>`); }
    const rota = (d.prog_rotas || []).find(r => r.id_rota === id);
    if (!rota) { SN.toast('Atividade não encontrada (cancelada ou de outra equipe).', 'erro'); return SN.navegar('#/tec'); }
    A = { rota, dados: d, locais: [], fotosLocais: {}, form: null };
    try { await recarregarLocais(true); }
    catch (e) { A = null; return SN.cascaTec('fila', `<div class="aviso erro">Não foi possível usar o armazenamento deste aparelho (${esc(e.message || e)}).</div>`); }
    SN.VF.ligarGps(); ligarOuvinte(); pintar();
    if (SN.conversa && A.rota.id_chamado) SN.conversa.flutuante(A.rota.id_chamado);
    if (!d.offline) SN.vst.carregar().then(nd => { if (!aberta()) return; A.dados = nd; const r = (nd.prog_rotas || []).find(x => x.id_rota === id); if (r) A.rota = r; pintar(); }).catch(() => { });
  }, { familia: 'tecnico' });

  const recarregarLocais = async inicial => {
    A.locais = await SN.VL.apontamentos.porIndice('rota', A.rota.id_rota);
    for (const f of await SN.VL.fotos.todos()) if (f.id_rota === A.rota.id_rota) A.fotosLocais[f.id_foto] = f;
    if (inicial && !A.form) { const rasc = A.locais.find(l => l.status_local === 'rascunho'); A.form = rasc ? rasc.dados : null; }
  };
  const ligarOuvinte = () => { if (!A.desligar) A.desligar = SN.VL.aoMudar(aoMudar); };
  const sair = () => { if (A && A.desligar) { A.desligar(); A.desligar = null; } SN.VF.desligarGps(); };
  window.addEventListener('hashchange', () => { if (A && !aberta()) sair(); });
  const aoMudar = async () => {
    if (!aberta()) return sair();
    const antes = A.locais.filter(l => l.status_local === 'enviada').length;
    await recarregarLocais();
    pintarLista();
    if (A.locais.filter(l => l.status_local === 'enviada').length > antes) {
      Promise.all([SN.vst.carregar(true), SN.sincronizar ? SN.sincronizar().catch(() => { }) : null]).then(([nd]) => {
        if (!aberta()) return; A.dados = nd; const r = (nd.prog_rotas || []).find(x => x.id_rota === A.rota.id_rota); if (r) A.rota = r;
        const at = document.activeElement; if (!(at && ['INPUT', 'TEXTAREA', 'SELECT'].includes(at.tagName))) pintar();
      }).catch(() => { });
    }
  };

  const lista = () => {
    const m = {};
    doServidor(A.dados).forEach(a => { m[a.id_apontamento] = { dados: a, status_local: 'enviada', servidor: a }; });
    A.locais.filter(l => l.status_local !== 'rascunho').forEach(l => { if (l.status_local !== 'enviada' || !m[l.id_apontamento]) m[l.id_apontamento] = { ...l, servidor: (m[l.id_apontamento] || {}).servidor || l.servidor }; });
    return Object.values(m).sort((a, b) => String(a.dados.data).localeCompare(String(b.dados.data)) || String(a.dados.enviado_em || '').localeCompare(String(b.dados.enviado_em || '')));
  };
  const statusDe = x => { const st = (x.servidor || {}).status_revisao; return x.status_local === 'enviada' && st ? SN.vst.badgeVistoria(st) : SN.vst.badgeLocal(x.status_local); };
  const podeApontar = () => ['DESPACHADA', 'EM_CAMPO'].includes(A.rota.status);
  const resumo = a => ret() ? `${SN.num(a.metros)} m de cabo · ${SN.num(a.ceo || 0)} CEO/CTO`
    : (VR.itensProg(a).map(i => `${SN.num(i.qtd)} × ${esc((SN.itemLpu(i.cod) || {}).desc || i.cod)}`).join(' · ') || 'sem serviço');

  const pintar = () => {
    const r = A.rota;
    SN.cascaTec('fila', `
      <a href="${r.id_chamado ? '#/tec/os/' + esc(r.id_chamado) : '#/tec'}" class="small">← Voltar à OS</a>
      <div class="tec-os" style="margin-top:8px">
        <div class="small muted" style="display:flex;justify-content:space-between"><span class="mono">${esc(r.id_rota)} · ${esc(prog().rot)}</span>${SN.vst.badgeRota(r.status)}</div>
        <div class="cli">${esc(r.cidade)}${r.pop ? ' · POP ' + esc(r.pop) : ''}</div>
        <table class="tab" style="margin-top:6px"><tbody>
          <tr><td class="muted">${ret() ? 'Retirar' : 'Serviço'}</td><td>${esc(r.servico)}</td></tr>
          <tr><td class="muted">Local</td><td>${esc(r.endereco)}${r.local_url ? `<br><a href="${esc(r.local_url)}" target="_blank" rel="noopener">Abrir no mapa</a>` : ''}</td></tr>
          <tr><td class="muted">Data</td><td>${SN.vst.dia(r.data_planejada)}${r.data_limite ? ' · até ' + SN.vst.dia(r.data_limite) : ''}</td></tr>
          ${r.metros_previstos ? `<tr><td class="muted">Previsto</td><td>${SN.num(r.metros_previstos)} m</td></tr>` : ''}
          ${r.notificacao ? `<tr><td class="muted">Notificação</td><td>${esc(r.notificacao)}</td></tr>` : ''}
          <tr><td class="muted">Prestador</td><td>${esc(r.prestador)}${r.tecnico ? ' · ' + esc(r.tecnico) : ''}</td></tr>
          ${r.observacao ? `<tr><td class="muted">Obs.</td><td style="white-space:pre-line">${esc(r.observacao)}</td></tr>` : ''}
        </tbody></table>
        ${(r.anexos || []).length ? `<div class="small muted" style="margin-top:8px">Anexos do planejamento (toque para abrir)</div><div class="fotos" id="aAnexosPlan"></div>` : ''}
      </div>
      ${A.dados.offline ? '<div class="aviso alerta" style="margin-bottom:8px">Sem sinal: o apontamento fica guardado e sobe quando a conexão voltar.</div>' : ''}
      ${SN.vst.cartaoOs ? SN.vst.cartaoOs(r, {}) : ''}
      <div class="card" style="margin-bottom:10px"><h3>Apontamentos</h3><div id="aLista"></div></div>
      <div id="aForm"></div>`);
    SN.$$('[data-os]').forEach(el => el.onclick = () => SN.navegar(el.dataset.os));
    if (SN.$('#aAnexosPlan')) SN.pintarFotos(SN.$('#aAnexosPlan'), r.anexos);
    pintarLista(); pintarForm();
  };

  const pintarLista = () => {
    const el = SN.$('#aLista'); if (!el) return;
    const itens = lista();
    el.innerHTML = itens.length ? itens.map(x => {
      const a = x.dados, srv = x.servidor || {}, rej = x.status_local === 'enviada' && srv.status_revisao === 'REJEITADA';
      return `<div class="vst-anomalia" style="background:#fff">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px"><b>${SN.vst.dia(a.data)} · ${a.tipo === 'final' ? 'Finalizado' : 'Parcial'}</b>${statusDe(x)}</div>
        <div class="small">${resumo(a)}</div>
        ${x.status_local === 'erro' ? `<div class="aviso erro small" style="margin-top:6px">Não aceito: ${esc(x.erro || '')}<br><button class="btn sm" data-corrigir="${esc(a.id_apontamento)}">Corrigir</button></div>` : ''}
        ${rej ? `<div class="aviso erro small" style="margin-top:6px">Rejeitado por ${esc(srv.revisor || '')}: ${(srv.motivo_rejeicao || []).map(m => esc(L.rotulo('motivos_rejeicao', m))).join(', ')}${srv.motivo_rejeicao_texto ? ' — ' + esc(srv.motivo_rejeicao_texto) : ''}
          <br><button class="btn sm prim" data-refazer="${esc(a.id_apontamento)}" style="margin-top:6px">✏️ Refazer este apontamento</button></div>` : ''}</div>`;
    }).join('') : '<p class="muted small">Nenhum apontamento ainda.</p>';
    SN.$$('[data-refazer],[data-corrigir]', el).forEach(b => b.onclick = () => {
      const idA = b.dataset.refazer || b.dataset.corrigir, x = lista().find(i => i.dados.id_apontamento === idA);
      const base = JSON.parse(JSON.stringify(x.dados));
      ['status_revisao', 'revisor', 'data_revisao', 'motivo_rejeicao', 'motivo_rejeicao_texto', 'enviado_em', 'envios', 'historico', 'tecnico', 'prestador', 'cidade', 'regiao', 'motivo', 'segmento', 'pop', 'refeitas'].forEach(k => delete base[k]);
      A.form = { ...base, fotos: (base.fotos || []).filter(f => f.tipo_foto !== 'ficha_pdf'), refazendo: true };
      pintarForm(); SN.$('#aForm').scrollIntoView({ behavior: 'smooth' });
    });
  };

  // ─────────── Formulário ───────────
  const novoForm = () => ({ id_apontamento: 'A' + SN.uid() + SN.uid(), id_rota: A.rota.id_rota, tipo: '', data: hoje(), observacao: '', fotos: [],
    ...(ret() ? { metros: '', ceo: '' } : { itens: [] }) });
  let timer = null, fotosProcessando = 0;
  const salvarRascunho = () => {
    const f = A.form; clearTimeout(timer);
    timer = setTimeout(() => { if (!f || f._enviado || A.form !== f) return;
      SN.VL.salvarApontamento({ id_apontamento: f.id_apontamento, id_rota: A.rota.id_rota, status_local: 'rascunho', dados: f }); }, 300);
  };
  const validar = () => {
    const v = VR.validarApontamentoProg(A.form, A.rota.segmento), vf = VR.validarFotosProg(A.form, A.rota.segmento);
    return { ok: v.ok && vf.ok, erros: v.erros.concat(vf.erros), fotos: vf };
  };
  const pintarForm = () => {
    const el = SN.$('#aForm'); if (!el) return;
    const temFinal = lista().some(x => x.dados.tipo === 'final' && (x.servidor || {}).status_revisao !== 'REJEITADA');
    const rejeitado = lista().some(x => (x.servidor || {}).status_revisao === 'REJEITADA');
    if ((!podeApontar() || temFinal) && !(A.form && A.form.refazendo)) {
      el.innerHTML = A.rota.status === 'CONCLUIDA' || temFinal
        ? `<div class="aviso ok">✓ Atividade finalizada.${rejeitado ? ' Há apontamento rejeitado: toque em "Refazer" acima.' : ' Aguardando a revisão; depois a LPU libera na OS.'}</div>` : '';
      return;
    }
    const f = A.form || (A.form = novoForm());
    const servicos = ret() ? '' : (() => {
      const cat = SN.itensDaConta(prog().conta), its = f.itens || (f.itens = []);
      return `<div class="campo"><label>Serviços realizados (LPU ${esc(prog().conta.slice(-4))})</label>
        ${its.length ? `<div>${its.map((i, n) => { const it = SN.itemLpu(i.cod) || {};
          return `<div class="item-lpu" style="grid-template-columns:1fr 90px auto;align-items:center"><div><div class="d">${esc(it.desc || i.cod)}</div><div class="c mono">${esc(i.cod)} · ${esc(it.medida || '')}</div></div>
            <input class="inp" type="number" inputmode="decimal" min="0" step="any" data-qtd="${n}" value="${esc(i.qtd ?? '')}"><button type="button" class="btn sm" data-tira="${n}">×</button></div>`; }).join('')}</div>` : '<p class="small muted">Nenhum serviço ainda.</p>'}
        <div style="display:flex;gap:6px;margin-top:6px"><select class="inp" id="aNovoItem" style="flex:1;min-width:0"><option value="">Adicionar serviço…</option>${cat.filter(i => !its.some(x => x.cod === i.cod)).map(i => `<option value="${esc(i.cod)}">${esc(i.cod)} · ${esc(i.desc)} (${esc(i.medida)})</option>`).join('')}</select></div></div>`;
    })();
    el.innerHTML = `<div class="card vst-bloco"><h3>${f.refazendo ? '✏️ Refazer apontamento' : '➕ Apontar produção'}</h3>
      <div class="campo"><label>Tipo *</label><div class="chips">${L.tipo_apontamento.map(([v, r]) => `<button type="button" class="chip ${f.tipo === v ? 'sel' : ''}" data-tipo="${v}">${r}</button>`).join('')}</div>
        <div class="small muted">"Finalizado" conclui a atividade. Use "Parcial" quando a equipe volta outro dia.</div></div>
      <div class="campo"><label>Data *</label><input class="inp" type="date" data-a="data" value="${esc(String(f.data || '').slice(0, 10))}"></div>
      ${ret() ? L.producao_retirada.map(c => `<div class="campo"><label>${esc(c.rot)}${c.k === 'metros' ? ' *' : ''}</label><input class="inp" type="number" inputmode="decimal" min="0" step="any" data-a="${c.k}" data-num="1" value="${esc(f[c.k] ?? '')}"></div>`).join('') : servicos}
      <div class="small muted" style="margin:6px 0">📷 Fotos obrigatórias (saem com data, hora, endereço e coordenadas).</div>
      ${(L.fotos_prog[A.rota.segmento] || []).map(c => `<div class="vst-foto"><div class="rot">${esc((L.foto(c.tipo) || {}).rot)} <span data-cont="${c.tipo}"></span> <span class="muted">· ${esc(c.regra)}</span></div><div class="vst-thumbs" data-fotos="${c.tipo}"></div></div>`).join('')}
      <div class="campo"><label>Observação</label><textarea class="inp" data-a="observacao">${esc(f.observacao || '')}</textarea></div>
      <div id="aErros"></div>
      <button class="btn prim lg bloco" id="aEnviar" style="margin-top:8px">📤 Enviar apontamento</button>
      ${f.refazendo ? '<button class="btn bloco" id="aCancelar" style="margin-top:6px">Cancelar</button>' : ''}</div>`;
    pintarThumbs(); validarNaTela();
    SN.$$('[data-tipo]', el).forEach(b => b.onclick = () => { f.tipo = f.tipo === b.dataset.tipo ? '' : b.dataset.tipo; salvarRascunho(); pintarForm(); });
    SN.$$('[data-a]', el).forEach(i => i.oninput = () => { const k = i.dataset.a; f[k] = i.dataset.num ? (i.value === '' ? '' : Number(i.value)) : i.value; salvarRascunho(); validarNaTela(); });
    SN.$$('[data-qtd]', el).forEach(i => i.oninput = () => { f.itens[+i.dataset.qtd].qtd = i.value === '' ? '' : Number(i.value); salvarRascunho(); validarNaTela(); });
    SN.$$('[data-tira]', el).forEach(b => b.onclick = () => { f.itens.splice(+b.dataset.tira, 1); salvarRascunho(); pintarForm(); });
    if (SN.$('#aNovoItem')) SN.$('#aNovoItem').onchange = ev => { if (!ev.target.value) return; f.itens.push({ cod: ev.target.value, qtd: '' }); salvarRascunho(); pintarForm();
      const q = SN.$$('[data-qtd]', el).pop(); if (q) q.focus(); };
    SN.$('#aEnviar').onclick = enviar;
    if (SN.$('#aCancelar')) SN.$('#aCancelar').onclick = () => { A.form = null; pintarForm(); };
  };
  const thumb = f => {
    const l = A.fotosLocais[f.id_foto], src = l && l.thumb ? l.thumb : (f.drive_id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(f.drive_id)}&sz=w240` : '');
    return `<div class="vst-thumb st-${l ? l.status : 'enviada'}">${src ? `<img src="${src}" alt="" data-ver="${esc(f.drive_id ? 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(f.drive_id) + '&sz=w1600' : 'local:' + f.id_foto)}">` : '<div class="vazio">📷</div>'}<button type="button" class="del" data-del="${esc(f.id_foto)}">×</button></div>`;
  };
  const contarFotos = () => {
    validar().fotos.itens.forEach(x => { const el = SN.$(`[data-cont="${x.tipo}"]`); if (!el) return;
      el.innerHTML = x.exigidas ? `<b style="color:${x.tem >= x.exigidas ? 'var(--ok)' : 'var(--erro)'}">📷 ${x.tem} de ${x.exigidas}</b>` : `📷 ${x.tem}`; });
  };
  const pintarThumbs = () => {
    (L.fotos_prog[A.rota.segmento] || []).forEach(c => {
      const el = SN.$(`[data-fotos="${c.tipo}"]`); if (!el) return;
      el.innerHTML = (A.form.fotos || []).filter(f => f.tipo_foto === c.tipo).map(thumb).join('')
        + `<label class="vst-cap"><input type="file" accept="image/*" capture="environment" data-cam="${c.tipo}" hidden><span>＋<br>Tirar foto</span></label>`
        + `<label class="vst-cap" title="Escolher fotos já tiradas"><input type="file" accept="image/*" multiple data-cam="${c.tipo}" data-galeria="1" hidden><span>＋<br>Galeria</span></label>`;
    });
    SN.$$('#aForm [data-del]').forEach(b => b.onclick = () => { A.form.fotos = A.form.fotos.filter(f => f.id_foto !== b.dataset.del); salvarRascunho(); pintarThumbs(); validarNaTela(); });
    SN.$$('#aForm [data-cam]').forEach(inp => inp.onchange = async ev => {
      const files = [...(ev.target.files || [])], tipo = inp.dataset.cam, galeria = !!inp.dataset.galeria; if (!files.length) return;
      const form = A.form, info = L.foto(tipo) || {}; fotosProcessando++;
      SN.toast(galeria ? `Processando ${files.length} foto(s) da galeria…` : 'Processando foto (GPS e endereço)…');
      try {
        for (const file of files) {
          const r = A.rota, ctx = `${r.id_rota} · ${r.cidade} · ${info.rot || ''} · ${prog().rot}`;
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
    const r = validar();
    el.innerHTML = r.erros.length ? `<div class="aviso alerta small">${r.erros.map(esc).join('<br>')}</div>` : '';
    SN.$('#aEnviar').disabled = !r.ok; contarFotos();
    return r;
  };
  const enviar = async () => {
    const f = A.form, r = validarNaTela();
    if (!r.ok) return SN.toast(r.erros[0], 'erro');
    if (fotosProcessando) return SN.toast('Aguarde a foto terminar de processar antes de enviar.', 'erro');
    const final = f.tipo === 'final';
    if (!await SN.confirmar(final ? 'Finalizar atividade' : 'Enviar apontamento parcial', resumo(f) + '<br>'
      + (final ? '<b>Isto conclui a atividade.</b> A produção vai para a revisão e, aprovada, libera a LPU.' : 'A atividade continua aberta para os próximos dias.'), final ? 'Finalizar' : 'Enviar', 'prim')) return;
    f._enviado = true; clearTimeout(timer);
    const a = { ...f }; delete a.refazendo; delete a._enviado;
    if (a.itens) a.itens = VR.itensProg(a);
    await SN.VL.enfileirarApontamento({ id_apontamento: a.id_apontamento, id_rota: A.rota.id_rota, dados: a });
    A.form = null;
    await recarregarLocais();
    SN.toast(final ? 'Atividade finalizada: apontamento na fila de envio.' : 'Apontamento na fila de envio.', 'ok');
    pintar();
  };
})();
