// SIGONET V2 — Preventiva: Planejamento (tela vst_planejamento).
//
// Abas:
//   Rotas         — lista, despachar / retirar despacho / editar / excluir.
//   Nova rota     — AÉREA (cidade, motivo, solicitante, notificação, KMZ, metros)
//                   ou SUBTERRÂNEA (cluster e CS da base). Despachar cria o
//                   chamado Preventiva sozinho (servidor).
//   Base de CS    — importar a base (CSV/XLSX pelo SheetJS; KMZ pelo servidor).
//   Histórico     — importar a planilha de KPIs da preventiva aérea.
//   Configurações — listas, regiões, meta e parâmetros (sem mexer em código).
// Também: SN.vst.transformarChamado(c) — chamado Preventiva aberto pelo NOC vira
// rota ligada a ele (sem abrir outro chamado).
(() => {
  const L = VR_LISTAS, esc = SN.esc;
  let aba = 'ROTAS', form = null, d = null, filtro = { seg: '', status: '', q: '' }, previa = null, previaHist = null;
  const csCache = {};
  const hoje = () => { const x = new Date(); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const empresas = () => SN.db.empresas.filter(e => e.ativo !== false).map(e => e.nome).sort();
  const tecnicosDe = emp => SN.db.tecnicos.filter(t => t.ativo !== false && t.empresa === emp).map(t => t.nome).sort();
  const opcoes = (lista, sel, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '') + lista.map(v => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const lerArquivo = (file, comoDataUrl) => new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = falha; comoDataUrl ? r.readAsDataURL(file) : r.readAsArrayBuffer(file); });

  SN.rota('/vst/planejamento', async () => {
    if (!SN.vst.disponivel()) return SN.casca('vst_planejamento', SN.vst.semServidorHtml);
    SN.casca('vst_planejamento', '<p class="muted">Carregando…</p>');
    try { d = await SN.vst.carregar(); } catch (e) { return SN.casca('vst_planejamento', `<div class="aviso erro">${esc(e.message)}</div>`); }
    if (location.hash !== '#/vst/planejamento') return;
    pintar();
  }, { tela: 'vst_planejamento' });

  const cfg = () => VR.normalizarConfig(d.config);
  const pintar = () => {
    const abas = [['ROTAS', '🗺️ Rotas'], ['NOVA', form && form.id_rota ? '✏️ Editar rota' : '➕ Nova rota'], ['BASE', '🕳️ Base de CS'], ['HIST', '📚 Histórico'], ['CFG', '⚙️ Configurações']];
    SN.casca('vst_planejamento', `
      <div class="cab-pagina"><div><h1>Preventiva · Planejamento</h1><p>Crie e despache rotas aéreas e subterrâneas. Ao despachar, o chamado Preventiva é criado sozinho e aparece na fila do técnico.</p></div></div>
      <div class="abas">${abas.map(([k, r]) => `<button class="aba ${aba === k ? 'ativa' : ''}" data-aba="${k}">${r}</button>`).join('')}</div>
      <div id="pCorpo"></div>`);
    SN.$$('[data-aba]').forEach(b => b.onclick = () => { aba = b.dataset.aba; if (aba === 'NOVA' && !form) form = novaRota('AEREA'); pintar(); });
    ({ ROTAS: pintarRotas, NOVA: pintarForm, BASE: pintarBase, HIST: pintarHist, CFG: pintarCfg })[aba]();
  };
  const recarregar = async () => { d = await SN.vst.carregar(); pintar(); };

  // ═══════════════════════════ Rotas ═══════════════════════════
  const progresso = r => {
    if (r.segmento === 'AEREA') { const p = VR.producaoRota(r, d.producao || []); return `${SN.num(p.totais.metros)} / ${SN.num(r.metros_previstos)} m`; }
    const vs = d.vistorias.filter(v => v.id_rota === r.id_rota);
    return `${vs.length} / ${(r.cs_planejadas || []).length} CS · ${vs.filter(v => v.status_revisao === 'APROVADA').length} aprovadas`;
  };
  const pintarRotas = () => {
    const todas = d.rotas.filter(r => !r.importado_planilha);
    const vis = todas.filter(r => (!filtro.seg || r.segmento === filtro.seg || (!r.segmento && filtro.seg === 'SUBTERRANEA')) && (!filtro.status || r.status === filtro.status)
      && (!filtro.q || SN.normal([r.id_rota, r.cidade, r.cluster, r.motivo, r.prestador, r.tecnico, r.id_chamado, r.notificacao].join(' ')).includes(SN.normal(filtro.q))))
      .sort((a, b) => String(b.criada_em || b.data_planejada).localeCompare(String(a.criada_em || a.data_planejada)));
    SN.$('#pCorpo').innerHTML = `
      <div class="card card-filtros"><div class="filtros">
        <select class="inp" id="fSeg"><option value="">Todos os segmentos</option>${L.segmentos.map(([k, r]) => `<option value="${k}" ${filtro.seg === k ? 'selected' : ''}>${r}</option>`).join('')}</select>
        <select class="inp" id="fSt"><option value="">Todos os status</option>${Object.entries(L.status_rota).map(([k, v]) => `<option value="${k}" ${filtro.status === k ? 'selected' : ''}>${v.rot}</option>`).join('')}</select>
        <input class="inp busca" id="fQ" placeholder="Buscar (rota, cidade, prestador, chamado…)" value="${esc(filtro.q)}">
        <button class="btn prim" id="bNova">➕ Nova rota</button></div></div>
      <div class="card"><div class="card-tit"><h3>Rotas (${vis.length})</h3><span class="small muted">${d.rotas.filter(r => r.importado_planilha).length} rotas do histórico da planilha ficam só no Dashboard</span></div>
        ${vis.length ? `<div class="tabela-wrap"><table class="tab"><thead><tr><th>Rota</th><th>Segmento</th><th>Onde / o quê</th><th>Prestador · técnico</th><th>Data</th><th>Status</th><th>Andamento</th><th></th></tr></thead><tbody>
        ${vis.map(r => `<tr><td class="mono">${esc(r.id_rota)}${r.id_chamado ? `<div class="small"><a href="#/chamado/${esc(r.id_chamado)}">${esc(r.id_chamado)}</a></div>` : ''}</td>
          <td>${r.segmento === 'AEREA' ? '<span class="badge verde">🗼 Aérea</span>' : '<span class="badge">🕳️ Subterrânea</span>'}</td>
          <td>${esc(r.cidade || '')}<div class="small muted">${r.segmento === 'AEREA' ? esc(r.motivo || '') + (r.notificacao ? ' · ' + esc(r.notificacao) : '') : 'Cluster ' + esc(r.cluster || '')}</div></td>
          <td>${esc(r.prestador || '')}<div class="small muted">${esc(r.tecnico || 'qualquer técnico do prestador')}</div></td>
          <td class="nowrap">${SN.vst.dia(r.data_planejada)}</td><td>${SN.vst.badgeRota(r.status)}</td><td class="small">${progresso(r)}</td>
          <td class="nowrap">${r.status === 'PLANEJADA' ? `<button class="btn sm prim" data-desp="${esc(r.id_rota)}">Despachar</button> <button class="btn sm" data-ed="${esc(r.id_rota)}">Editar</button> <button class="btn sm perigo" data-ex="${esc(r.id_rota)}">Excluir</button>`
            : r.status === 'DESPACHADA' ? `<button class="btn sm" data-ret="${esc(r.id_rota)}">Retirar despacho</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">Nenhuma rota. Use "Nova rota".</p>'}</div>`;
    SN.$('#fSeg').onchange = e => { filtro.seg = e.target.value; pintarRotas(); };
    SN.$('#fSt').onchange = e => { filtro.status = e.target.value; pintarRotas(); };
    SN.$('#fQ').oninput = SN.debounce(e => { filtro.q = e.target.value; pintarRotas(); SN.$('#fQ').focus(); }, 300);
    SN.$('#bNova').onclick = () => { form = novaRota('AEREA'); aba = 'NOVA'; pintar(); };
    const acao = async (sel, fn) => SN.$$(sel).forEach(b => b.onclick = async () => { b.disabled = true; try { await fn(b); } catch (e) { SN.toast(e.message, 'erro'); b.disabled = false; } });
    acao('[data-desp]', async b => { await SN.vst.exec('VST_ROTA_STATUS', { id_rota: b.dataset.desp, para: 'DESPACHADA' }); SN.toast('Rota despachada: o chamado Preventiva foi criado e está na fila do técnico.', 'ok'); await recarregar(); });
    acao('[data-ret]', async b => { if (!await SN.confirmar('Retirar despacho', 'A rota volta a PLANEJADA e o chamado Preventiva dela é cancelado.', 'Retirar', 'perigo')) { b.disabled = false; return; }
      await SN.vst.exec('VST_ROTA_STATUS', { id_rota: b.dataset.ret, para: 'PLANEJADA' }); SN.toast('Despacho retirado.', 'ok'); await recarregar(); });
    acao('[data-ex]', async b => { if (!await SN.confirmar('Excluir rota', 'Excluir esta rota planejada?', 'Excluir', 'perigo')) { b.disabled = false; return; }
      await SN.vst.exec('VST_ROTA_EXCLUIR', { id_rota: b.dataset.ex }); SN.toast('Rota excluída.', 'ok'); await recarregar(); });
    SN.$$('[data-ed]').forEach(b => b.onclick = () => { form = JSON.parse(JSON.stringify(d.rotas.find(r => r.id_rota === b.dataset.ed))); form.segmento = form.segmento || 'SUBTERRANEA'; aba = 'NOVA'; pintar(); });
  };

  // ═══════════════════════════ Nova / editar rota ═══════════════════════════
  const novaRota = seg => ({ segmento: seg, cidade: '', prestador: '', tecnico: '', data_planejada: hoje(), observacao: '',
    motivo: '', solicitante: '', notificacao: '', kmz_url: '', metros_previstos: '', cluster: '', cs_planejadas: [], extensao_km: '', cenario_esperado: { dono_duto: '', operadoras: [] } });
  const cidadesConhecidas = () => [...new Set(Object.values(cfg().regioes).flat().concat(d.rotas.map(r => VR.normCidade(r.cidade))).filter(Boolean))].sort();

  const pintarForm = () => {
    const f = form || (form = novaRota('AEREA')), c = cfg(), editando = !!f.id_rota, aerea = f.segmento === 'AEREA';
    const clusters = Object.keys((d.base || {}).clusters || {}).sort();
    SN.$('#pCorpo').innerHTML = `<div class="card">
      ${f.vincular_chamado ? `<div class="aviso info" style="margin-bottom:10px">Esta rota será <b>ligada ao chamado ${esc(f.vincular_chamado)}</b> aberto pelo NOC (não abre outro chamado).</div>` : ''}
      <div class="campo"><label>Segmento *</label><div class="chips">${L.segmentos.map(([k, r]) => `<button type="button" class="chip ${f.segmento === k ? 'sel' : ''}" data-seg="${k}" ${editando || f.vincular_chamado ? 'disabled' : ''}>${k === 'AEREA' ? '🗼' : '🕳️'} ${r}</button>`).join('')}</div></div>
      <div class="linha-form">
        <div class="campo"><label>Cidade *</label><input class="inp" data-f="cidade" list="lCid" value="${esc(f.cidade)}"><datalist id="lCid">${cidadesConhecidas().map(x => `<option value="${esc(x)}">`).join('')}</datalist>
          ${aerea && f.cidade ? `<div class="small muted">Região: <b>${esc(VR.regiaoDaCidade(f.cidade, c))}</b></div>` : ''}</div>
        <div class="campo"><label>Prestador (equipe) *</label><select class="inp" data-f="prestador">${opcoes(empresas(), f.prestador, 'Escolha…')}</select></div>
        <div class="campo"><label>Técnico</label><select class="inp" data-f="tecnico">${opcoes(tecnicosDe(f.prestador), f.tecnico, f.prestador ? 'Qualquer técnico do prestador' : 'Escolha o prestador')}</select></div>
        <div class="campo"><label>Data *</label><input class="inp" type="date" data-f="data_planejada" value="${esc(String(f.data_planejada || '').slice(0, 10))}"></div>
      </div>
      ${aerea ? `
      <div class="linha-form">
        <div class="campo"><label>Motivo da preventiva *</label><select class="inp" data-f="motivo">${opcoes(c.motivos_aerea, f.motivo, 'Escolha…')}</select></div>
        <div class="campo"><label>Solicitante / área *</label><select class="inp" data-f="solicitante">${opcoes(c.solicitantes, f.solicitante, 'Escolha…')}</select></div>
        <div class="campo"><label>Notificação / referência</label><input class="inp" data-f="notificacao" placeholder="ex.: notificação 189783-2026" value="${esc(f.notificacao)}"></div>
        <div class="campo"><label>Metros previstos *</label><input class="inp" type="number" min="0" data-f="metros_previstos" data-num="1" value="${esc(f.metros_previstos)}"></div>
      </div>
      <div class="campo"><label>KMZ da rota (link) — ou envie o arquivo</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><input class="inp" style="flex:1;min-width:240px" data-f="kmz_url" placeholder="https://… (Google Drive, My Maps…)" value="${esc(f.kmz_url)}">
          <label class="btn">📎 Enviar .kmz/.kml<input type="file" id="fKmz" accept=".kmz,.kml" hidden></label></div>
        ${f.kmz_url ? `<div class="small"><a href="${esc(f.kmz_url)}" target="_blank" rel="noopener">abrir KMZ</a></div>` : ''}</div>`
      : `
      <div class="linha-form">
        <div class="campo"><label>Cluster *</label><select class="inp" data-f="cluster">${opcoes(clusters, f.cluster, clusters.length ? 'Escolha…' : 'Importe a base de CS primeiro')}</select></div>
        <div class="campo"><label>Extensão da rota (km) *</label><input class="inp" type="number" min="0" step="any" data-f="extensao_km" data-num="1" value="${esc(f.extensao_km)}"></div>
        <div class="campo"><label>Dono do duto (cenário esperado)</label><input class="inp" data-cen="dono_duto" value="${esc((f.cenario_esperado || {}).dono_duto || '')}"></div>
      </div>
      ${c.operadoras.length ? `<div class="campo"><label>Operadoras esperadas nos cabos</label><div class="chips">${c.operadoras.map(o => `<button type="button" class="chip ${((f.cenario_esperado || {}).operadoras || []).includes(o) ? 'sel' : ''}" data-op="${esc(o)}">${esc(o)}</button>`).join('')}</div></div>` : ''}
      <div class="campo"><label>CS da rota * <span class="muted">(${(f.cs_planejadas || []).length} selecionada(s), na ordem de clique)</span></label><div id="fCs" class="small muted">${f.cluster ? 'Carregando CS…' : 'Escolha o cluster.'}</div></div>`}
      <div class="campo"><label>Observação</label><textarea class="inp" data-f="observacao">${esc(f.observacao || '')}</textarea></div>
      <div id="fErros"></div>
      <div class="acoes">
        ${f.vincular_chamado ? '<button class="btn prim" id="bVinc">🔗 Criar rota ligada ao chamado</button>'
          : `<button class="btn prim" id="bSalvar">💾 Salvar${editando ? '' : ' (planejada)'}</button><button class="btn ok" id="bSalvarDesp">🚀 Salvar e despachar</button>`}
        <button class="btn" id="bCancelar">Cancelar</button></div></div>`;
    const errosNaTela = () => { const v = VR.validarRota(f); SN.$('#fErros').innerHTML = v.ok ? '' : `<div class="aviso alerta small">${v.erros.map(esc).join('<br>')}</div>`; return v; };
    errosNaTela();
    SN.$$('[data-seg]').forEach(b => b.onclick = () => { form = Object.assign(novaRota(b.dataset.seg), { cidade: f.cidade, prestador: f.prestador, tecnico: f.tecnico, data_planejada: f.data_planejada, observacao: f.observacao }); pintarForm(); });
    SN.$$('[data-f]').forEach(i => {
      const k = i.dataset.f, ler = () => i.dataset.num ? (i.value === '' ? '' : Number(i.value)) : i.value;
      i.oninput = () => { f[k] = ler(); errosNaTela(); };
      i.onchange = () => { f[k] = ler(); if (k === 'prestador') f.tecnico = ''; if (k === 'cluster') f.cs_planejadas = []; if (['prestador', 'cluster', 'cidade', 'kmz_url'].includes(k)) pintarForm(); else errosNaTela(); };
    });
    SN.$$('[data-cen]').forEach(i => i.oninput = () => { f.cenario_esperado = f.cenario_esperado || {}; f.cenario_esperado[i.dataset.cen] = i.value; });
    SN.$$('[data-op]').forEach(b => b.onclick = () => { const ops = (f.cenario_esperado = f.cenario_esperado || {}).operadoras = f.cenario_esperado.operadoras || [];
      const i = ops.indexOf(b.dataset.op); if (i >= 0) ops.splice(i, 1); else ops.push(b.dataset.op); b.classList.toggle('sel'); });
    const kmz = SN.$('#fKmz');
    if (kmz) kmz.onchange = async () => {
      const file = kmz.files && kmz.files[0]; if (!file) return;
      if (!f.cidade) return SN.toast('Informe a cidade antes de enviar o KMZ (ele é guardado na pasta da cidade).', 'erro');
      SN.toast('Enviando KMZ para o Drive…');
      try { const r = await SN.vst.exec('VST_KMZ_UPLOAD', { nome: file.name, cidade: f.cidade, dataUrl: await lerArquivo(file, true) }); f.kmz_url = r.url; f.kmz_drive_id = r.drive_id; SN.toast('KMZ enviado.', 'ok'); pintarForm(); }
      catch (e) { SN.toast(e.message, 'erro'); }
    };
    if (!aerea && f.cluster) carregarCs(f);
    const salvar = async despachar => {
      const v = errosNaTela(); if (!v.ok) return SN.toast(v.erros[0], 'erro');
      try {
        if (!f.id_rota && !f.chave_cliente) f.chave_cliente = SN.vst.uid ? SN.vst.uid() : Date.now().toString(36) + Math.random().toString(36).slice(2); // reenvio não duplica a rota
        const r = await SN.vst.exec('VST_ROTA_SALVAR', { rota: f });
        if (despachar) await SN.vst.exec('VST_ROTA_STATUS', { id_rota: r.rota.id_rota, para: 'DESPACHADA' });
        SN.toast(despachar ? `Rota ${r.rota.id_rota} despachada: o chamado Preventiva está na fila do técnico.` : `Rota ${r.rota.id_rota} salva (planejada).`, 'ok');
        form = null; aba = 'ROTAS'; await recarregar();
      } catch (e) { SN.toast(e.message, 'erro'); }
    };
    if (SN.$('#bSalvar')) SN.$('#bSalvar').onclick = () => salvar(false);
    if (SN.$('#bSalvarDesp')) SN.$('#bSalvarDesp').onclick = () => salvar(true);
    if (SN.$('#bVinc')) SN.$('#bVinc').onclick = async () => {
      const v = errosNaTela(); if (!v.ok) return SN.toast(v.erros[0], 'erro');
      const bt = SN.$('#bVinc'); bt.disabled = true; bt.textContent = 'Enviando…';
      try { const r = await vincular(f.vincular_chamado, f);
        SN.toast(`Chamado ${f.vincular_chamado} ligado à rota ${r.rota.id_rota}.`, 'ok'); if (SN.sincronizar) SN.sincronizar().catch(() => { });
        form = null; aba = 'ROTAS'; await recarregar(); } catch (e) { bt.disabled = false; bt.textContent = '🔗 Criar rota ligada ao chamado'; SN.toast(e.message, 'erro'); }
    };
    SN.$('#bCancelar').onclick = () => { form = null; aba = 'ROTAS'; pintar(); };
  };
  // CS do cluster para escolher (ordem de clique = ordem da rota).
  const carregarCs = async f => {
    const el = SN.$('#fCs'); if (!el) return;
    try {
      const lista = csCache[f.cluster] || (csCache[f.cluster] = (await SN.vst.exec('VST_CS_BASE', { cluster: f.cluster })).cs);
      if (form !== f || !SN.$('#fCs')) return;
      el.className = '';
      el.innerHTML = `<div class="acoes" style="margin-bottom:6px"><input class="inp" id="fCsQ" placeholder="Filtrar CS (ID ou endereço)" style="max-width:320px"><button type="button" class="btn sm" id="fCsTodas">Selecionar todas</button><button type="button" class="btn sm" id="fCsNenhuma">Limpar</button></div>
        <div class="tabela-wrap" style="max-height:320px"><table class="tab small"><thead><tr><th></th><th>Ordem</th><th>CS</th><th>Endereço</th><th>Lat, Lng</th></tr></thead><tbody id="fCsLinhas"></tbody></table></div>`;
      const linhas = () => {
        const q = SN.normal(SN.$('#fCsQ').value);
        SN.$('#fCsLinhas').innerHTML = lista.filter(cs => !q || SN.normal(cs.id_cs + ' ' + (cs.endereco || '')).includes(q)).map(cs => {
          const i = f.cs_planejadas.indexOf(cs.id_cs);
          return `<tr><td><input type="checkbox" data-cs="${esc(cs.id_cs)}" ${i >= 0 ? 'checked' : ''}></td><td>${i >= 0 ? i + 1 : ''}</td><td class="mono">${esc(cs.id_cs)}</td><td>${esc(cs.endereco || '')}</td>
            <td class="nowrap"><a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${cs.lat},${cs.lng}">${cs.lat}, ${cs.lng}</a></td></tr>`;
        }).join('') || '<tr><td colspan="5" class="muted">Nenhuma CS.</td></tr>';
        SN.$$('[data-cs]').forEach(cb => cb.onchange = () => { const id = cb.dataset.cs, i = f.cs_planejadas.indexOf(id); if (cb.checked && i < 0) f.cs_planejadas.push(id); if (!cb.checked && i >= 0) f.cs_planejadas.splice(i, 1); linhas(); atualizarContagem(); });
      };
      const atualizarContagem = () => { const lb = SN.$('#fCs').previousElementSibling; if (lb) lb.innerHTML = `CS da rota * <span class="muted">(${f.cs_planejadas.length} selecionada(s), na ordem de clique)</span>`;
        const v = VR.validarRota(f); SN.$('#fErros').innerHTML = v.ok ? '' : `<div class="aviso alerta small">${v.erros.map(esc).join('<br>')}</div>`; };
      SN.$('#fCsQ').oninput = SN.debounce(linhas, 200);
      SN.$('#fCsTodas').onclick = () => { lista.forEach(cs => { if (!f.cs_planejadas.includes(cs.id_cs)) f.cs_planejadas.push(cs.id_cs); }); linhas(); atualizarContagem(); };
      SN.$('#fCsNenhuma').onclick = () => { f.cs_planejadas = []; linhas(); atualizarContagem(); };
      linhas();
    } catch (e) { el.innerHTML = `<span style="color:var(--erro)">${esc(e.message)}</span>`; }
  };

  // ═══════════════════════════ Base de CS ═══════════════════════════
  const pintarBase = () => {
    const b = d.base || { total: 0, clusters: {} }, imp = (d.importacoes || []).slice().reverse();
    SN.$('#pCorpo').innerHTML = `<div class="grid g2">
      <div class="card"><h3>Importar base de CS</h3>
        <p class="small muted">CSV ou XLSX com colunas de ID da CS, cluster, latitude e longitude (cidade e endereço opcionais). Os nomes das colunas são reconhecidos sozinhos ou pelo mapeamento em Configurações. KMZ/KML: o nome do ponto vira o ID e a pasta vira o cluster.</p>
        <div class="linha-form"><div class="campo"><label>Versão da base *</label><input class="inp" id="bVer" placeholder="ex.: Tom v1 (out/2026)"></div>
          <div class="campo"><label>Cidade (se o arquivo não tiver)</label><input class="inp" id="bCid" list="lCid2"><datalist id="lCid2">${cidadesConhecidas().map(x => `<option value="${esc(x)}">`).join('')}</datalist></div></div>
        <label class="btn">📂 Escolher arquivo (CSV, XLSX, KMZ, KML)<input type="file" id="bArq" accept=".csv,.xlsx,.xls,.kmz,.kml" hidden></label>
        <div id="bPrevia" style="margin-top:10px"></div></div>
      <div class="card"><h3>Base atual</h3><p><b>${SN.num(b.total)}</b> CS em <b>${Object.keys(b.clusters).length}</b> cluster(s)</p>
        ${Object.keys(b.clusters).length ? `<table class="tab small"><tbody>${Object.entries(b.clusters).sort().map(([k, n]) => `<tr><td>${esc(k)}</td><td class="num">${SN.num(n)}</td></tr>`).join('')}</tbody></table>` : ''}
        <h4 style="margin-top:12px">Importações</h4>${imp.length ? `<table class="tab small"><thead><tr><th>Quando</th><th>Versão</th><th>Arquivo</th><th class="num">CS</th><th>Por</th></tr></thead><tbody>
          ${imp.map(x => `<tr><td class="nowrap">${SN.dt(x.data)}</td><td>${esc(x.versao)}</td><td>${esc(x.arquivo || '')}</td><td class="num">${SN.num(x.qtd)}</td><td>${esc(x.por)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Nenhuma ainda.</p>'}</div></div>`;
    SN.$('#bArq').onchange = async e => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      const el = SN.$('#bPrevia'); el.innerHTML = '<span class="muted small">Lendo arquivo…</span>';
      try {
        let linhas, imp;
        if (/\.(kmz|kml)$/i.test(file.name)) {
          const r = await SN.vst.exec('VST_LER_KMZ', { nome: file.name, dataUrl: await lerArquivo(file, true) });
          linhas = r.linhas; imp = { col_id: 'id_cs', col_cluster: 'cluster', col_lat: 'lat', col_lng: 'lng', col_endereco: 'endereco' };
        } else {
          if (!window.XLSX) throw new Error('Leitor de planilhas indisponível (sem internet?).');
          const wb = XLSX.read(await lerArquivo(file), { type: 'array' });
          linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }); imp = cfg().importacao;
        }
        previa = { arquivo: file.name, r: VR.normalizarBase(linhas, imp, SN.$('#bCid').value), linhas, imp };
        pintarPrevia();
      } catch (err) { el.innerHTML = `<div class="aviso erro small">${esc(err.message)}</div>`; }
    };
    SN.$('#bCid').onchange = () => { if (previa) { previa.r = VR.normalizarBase(previa.linhas, previa.imp, SN.$('#bCid').value); pintarPrevia(); } };
    if (previa) pintarPrevia();
  };
  const pintarPrevia = () => {
    const el = SN.$('#bPrevia'); if (!el || !previa) return;
    const r = previa.r, cl = {}; r.validas.forEach(c => { cl[c.cluster || '(sem cluster)'] = (cl[c.cluster || '(sem cluster)'] || 0) + 1; });
    el.innerHTML = `<div class="faixa small"><b>${esc(previa.arquivo)}</b>: ${SN.num(r.validas.length)} CS válidas em ${Object.keys(cl).length} cluster(s) · ${r.erros.length} problema(s)
      ${r.erros.length ? `<ul style="margin:6px 0 0;padding-left:18px">${r.erros.slice(0, 8).map(x => `<li>${x.linha ? 'linha ' + x.linha + ': ' : ''}${esc(x.msg)}</li>`).join('')}${r.erros.length > 8 ? `<li>… e mais ${r.erros.length - 8}</li>` : ''}</ul>` : ''}</div>
      ${r.validas.length ? '<button class="btn prim" id="bImp" style="margin-top:8px">⬆ Importar para a base</button>' : ''}`;
    const bt = SN.$('#bImp');
    if (bt) bt.onclick = async () => {
      const versao = SN.$('#bVer').value.trim(); if (!versao) return SN.toast('Informe a versão da base.', 'erro');
      bt.disabled = true; const lotes = [], v = r.validas; for (let i = 0; i < v.length; i += 500) lotes.push(v.slice(i, i + 500));
      try {
        for (let i = 0; i < lotes.length; i++) { bt.textContent = `Importando ${i + 1}/${lotes.length}…`;
          await SN.vst.exec('VST_IMPORTAR_BASE', { versao, cidade: SN.$('#bCid').value, arquivo: previa.arquivo, linhas: lotes[i], ultimo: i === lotes.length - 1, total: v.length }); }
        SN.toast(`${SN.num(v.length)} CS importadas (versão ${versao}).`, 'ok'); previa = null; Object.keys(csCache).forEach(k => delete csCache[k]); await recarregar();
      } catch (e) { SN.toast(e.message, 'erro'); bt.disabled = false; bt.textContent = '⬆ Importar para a base'; }
    };
  };

  // ═══════════════════════════ Histórico da planilha ═══════════════════════════
  const pintarHist = () => {
    const ja = d.rotas.filter(r => r.importado_planilha);
    const anos = {}; (d.producao || []).filter(a => a.importado_planilha).forEach(a => { const y = String(a.data).slice(0, 4); anos[y] = (anos[y] || 0) + (Number(a.metros) || 0); });
    SN.$('#pCorpo').innerHTML = `<div class="grid g2">
      <div class="card"><h3>Importar a planilha de KPIs da preventiva aérea</h3>
        <p class="small muted">Arquivo "KPIs MANUTENÇÃO PREVENTIVA REDE.xlsx" (aba "Banco de dados Preventiva"). As rotas entram como concluídas e aprovadas, <b>sem gerar chamado nem LPU</b>, e aparecem só no Dashboard. Reimportar não duplica (atualiza as mesmas linhas).</p>
        <label class="btn">📂 Escolher a planilha<input type="file" id="hArq" accept=".xlsx,.xls" hidden></label><div id="hPrevia" style="margin-top:10px"></div></div>
      <div class="card"><h3>Histórico no SigoNet</h3><p><b>${SN.num(ja.length)}</b> rotas importadas</p>
        ${Object.keys(anos).length ? `<table class="tab small"><thead><tr><th>Ano</th><th class="num">Metros percorridos</th></tr></thead><tbody>${Object.entries(anos).sort().map(([y, m]) => `<tr><td>${y}</td><td class="num">${SN.num(m)}</td></tr>`).join('')}</tbody></table>` : ''}
        <p class="small"><a href="#/vst/dashboard">Ver no Dashboard →</a></p></div></div>`;
    SN.$('#hArq').onchange = async e => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      const el = SN.$('#hPrevia');
      try {
        if (!window.XLSX) throw new Error('Leitor de planilhas indisponível (sem internet?).');
        const wb = XLSX.read(await lerArquivo(file), { type: 'array' });
        const nome = wb.SheetNames.find(n => SN.normal(n).includes('banco de dados')) || wb.SheetNames[0];
        const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nome], { defval: '' });
        const itens = linhas.map((l, i) => VR.historicoDaLinha(l, i, d.config)).filter(Boolean);
        previaHist = { arquivo: file.name, itens };
        const m = itens.reduce((s, x) => s + (Number(x.apontamento.metros) || 0), 0);
        el.innerHTML = `<div class="faixa small"><b>${esc(file.name)}</b> (aba "${esc(nome)}"): ${SN.num(itens.length)} rotas · ${SN.num(m)} m percorridos</div>
          <button class="btn prim" id="hImp" style="margin-top:8px">⬆ Importar histórico</button>`;
        SN.$('#hImp').onclick = async () => {
          const bt = SN.$('#hImp'); bt.disabled = true;
          try { for (let i = 0; i < itens.length; i += 200) { bt.textContent = `Importando ${Math.min(i + 200, itens.length)}/${itens.length}…`; await SN.vst.exec('VST_IMPORTAR_HISTORICO', { itens: itens.slice(i, i + 200) }); }
            SN.toast(`${SN.num(itens.length)} rotas do histórico importadas.`, 'ok'); await recarregar(); }
          catch (err) { SN.toast(err.message, 'erro'); bt.disabled = false; }
        };
      } catch (err) { el.innerHTML = `<div class="aviso erro small">${esc(err.message)}</div>`; }
    };
  };

  // ═══════════════════════════ Configurações ═══════════════════════════
  const pintarCfg = () => {
    const c = cfg(), pend = VR.pendenciasConfig(c), linhas = a => (a || []).join('\n');
    const regioes = Object.entries(c.regioes).map(([k, v]) => k + ': ' + v.join(', ')).join('\n');
    const metasMes = Object.entries(c.metas_aerea_mes).map(([k, v]) => k + ' = ' + v).join('\n');
    const num = (k, rot, dica) => `<div class="campo"><label>${rot}</label><input class="inp" type="number" step="any" data-c="${k}" value="${esc(c[k] == null ? '' : c[k])}" placeholder="a definir">${dica ? `<div class="small muted">${dica}</div>` : ''}</div>`;
    const area = (k, rot, val, dica) => `<div class="campo"><label>${rot}</label><textarea class="inp" data-c="${k}" style="min-height:110px">${esc(val)}</textarea>${dica ? `<div class="small muted">${dica}</div>` : ''}</div>`;
    SN.$('#pCorpo').innerHTML = `
      ${pend.length ? `<div class="aviso alerta small" style="margin-bottom:12px">${pend.map(esc).join('<br>')}</div>` : ''}
      <div class="grid g2">
        <div class="card"><h3>🗼 Aérea</h3>
          ${num('meta_aerea_m', 'Meta mensal de metros percorridos', 'padrão da planilha: 78.000')}
          ${area('metas_aerea_mes', 'Meta diferente em algum mês', metasMes, 'uma por linha: AAAA-MM = metros (ex.: 2026-12 = 60000)')}
          ${area('motivos_aerea', 'Motivos da preventiva', linhas(c.motivos_aerea), 'um por linha')}
          ${area('solicitantes', 'Solicitantes / áreas', linhas(c.solicitantes), 'um por linha')}
          ${area('regioes', 'Regiões (cidade → região)', regioes, 'uma região por linha: NOME: CIDADE, CIDADE…')}
          <div class="campo"><label>Região para cidades fora da lista</label><input class="inp" data-c="regiao_padrao" value="${esc(c.regiao_padrao)}"></div></div>
        <div class="card"><h3>🕳️ Subterrânea</h3>
          ${num('profundidade_min_cm', 'Profundidade mínima aceitável (cm)', 'abaixo disso = fora do critério')}
          ${num('gps_max_m', 'Distância máxima do GPS ao cadastro (m)', 'acima disso exige justificativa ou "posição divergente"')}
          ${num('foto_tolerancia_min', 'Tolerância da foto suspeita (min)', 'diferença entre a data do arquivo e a captura')}
          ${area('operadoras', 'Operadoras dos cabos', linhas(c.operadoras), 'uma por linha ("não identificado" existe sempre)')}
          ${area('tampa_tipos', 'Tipos e materiais de tampa', linhas(c.tampa_tipos), 'um por linha (vazio = campo fora do formulário)')}
          <h4>Importação da base</h4><div class="linha-form">
          ${['col_id', 'col_cluster', 'col_cidade', 'col_lat', 'col_lng', 'col_endereco'].map(k => `<div class="campo"><label>Coluna ${k.slice(4)}</label><input class="inp" data-imp="${k}" value="${esc(c.importacao[k])}" placeholder="automático"></div>`).join('')}
          <div class="campo"><label>KMZ: ID vem de</label><input class="inp" data-imp="kml_id" value="${esc(c.importacao.kml_id)}"></div>
          <div class="campo"><label>KMZ: cluster vem de</label><input class="inp" data-imp="kml_cluster" value="${esc(c.importacao.kml_cluster)}"></div></div>
          <div class="small muted">KMZ: "nome" ou "pasta", ou "campo:NOME" para um campo do ponto.</div></div>
      </div>
      <button class="btn prim lg" id="cSalvar" style="margin-top:12px">💾 Salvar configurações</button>`;
    SN.$('#cSalvar').onclick = async () => {
      const v = k => { const e = SN.$(`[data-c="${k}"]`); return e ? e.value : ''; };
      const nova = { ...c, importacao: { ...c.importacao } };
      ['meta_aerea_m', 'profundidade_min_cm', 'gps_max_m', 'foto_tolerancia_min', 'regiao_padrao'].forEach(k => { nova[k] = v(k); });
      ['motivos_aerea', 'solicitantes', 'operadoras', 'tampa_tipos'].forEach(k => { nova[k] = v(k); });
      nova.regioes = {}; v('regioes').split('\n').forEach(l => { const i = l.indexOf(':'); if (i > 0) nova.regioes[l.slice(0, i).trim()] = l.slice(i + 1).split(','); });
      nova.metas_aerea_mes = {}; v('metas_aerea_mes').split('\n').forEach(l => { const m = /^\s*(\d{4}-\d{2})\s*=\s*([\d.,]+)/.exec(l); if (m) nova.metas_aerea_mes[m[1]] = m[2].replace(/\./g, ''); });
      SN.$$('[data-imp]').forEach(e => { nova.importacao[e.dataset.imp] = e.value; });
      try { const r = await SN.vst.exec('VST_CONFIG_SALVAR', { config: nova }); d.config = r.config; SN.toast('Configurações salvas.', 'ok'); pintar(); } catch (e) { SN.toast(e.message, 'erro'); }
    };
  };

  // ═══════════════════════════ Chamado do NOC → rota ═══════════════════════════
  // Liga a rota ao chamado. O servidor é idempotente (chamado já ligado devolve a
  // rota existente), então, se a resposta se perde no caminho (Google devolve
  // página em vez de JSON, sinal cai), tenta de novo sem risco de duplicar.
  const vincular = async (idChamado, rota) => {
    for (let t = 1; ; t++) {
      try {
        const r = await SN.vst.api('VST_VINCULAR_CHAMADO', { id_chamado: idChamado, rota }, 120000);
        if (!r.ok) throw new Error(r.erro || 'Erro no servidor');
        return r;
      } catch (e) {
        if (!e.rede || t >= 3) throw e;
        SN.toast('Sem resposta do servidor. Tentando de novo…');
        await new Promise(ok => setTimeout(ok, 2500 * t));
      }
    }
  };
  const ocupado = (f, sim, texto) => SN.$$('.modal-rod .btn', f).forEach(b => { b.disabled = sim; if (b.classList.contains('prim')) { b.dataset.rot = b.dataset.rot || b.textContent; b.textContent = sim ? texto : b.dataset.rot; } });
  let abrindo = false;
  SN.vst.transformarChamado = async c => {
    if (abrindo) return; // evita abrir duas janelas com clique duplo
    abrindo = true;
    let dd;
    try { if (!(SN.vst.dados && !SN.vst.dados.offline)) SN.toast('Abrindo a Preventiva…'); dd = SN.vst.dados && !SN.vst.dados.offline ? SN.vst.dados : await SN.vst.carregar(); }
    catch (e) { abrindo = false; return SN.toast(e.message, 'erro'); }
    abrindo = false;
    const cf = VR.normalizarConfig(dd.config);
    let seg = 'AEREA';
    const r = { segmento: 'AEREA', cidade: c.cidade || '', prestador: c.empresa || '', tecnico: c.tecnico || '', data_planejada: String(c.tempos.abertura || hoje()).slice(0, 10),
      motivo: '', solicitante: '', notificacao: c.protocoloOem || '', kmz_url: '', metros_previstos: '', observacao: c.motivo || '' };
    const corpo = () => `<p class="small">Chamado <b>${esc(c.id)}</b> · ${esc(c.cliente || '')} · ${esc(c.empresa || 'sem prestador')}${c.tecnico ? ' · ' + esc(c.tecnico) : ''}</p>
      <div class="campo"><label>Esta preventiva é…</label><div class="chips">${L.segmentos.map(([k, t]) => `<button type="button" class="chip ${seg === k ? 'sel' : ''}" data-tseg="${k}">${k === 'AEREA' ? '🗼' : '🕳️'} ${t}</button>`).join('')}</div></div>
      <div id="tCampos"></div>`;
    const campos = f => {
      const el = SN.$('#tCampos', f);
      if (seg === 'SUBTERRANEA') { el.innerHTML = `<div class="aviso info small">Na subterrânea é preciso escolher as CS da base. Vou abrir o Planejamento já com este chamado para você escolher o cluster e as CS; a rota fica ligada a este chamado.</div>`; return; }
      el.innerHTML = `<div class="linha-form">
        <div class="campo"><label>Cidade *</label><input class="inp" data-t="cidade" value="${esc(r.cidade)}"></div>
        <div class="campo"><label>Motivo *</label><select class="inp" data-t="motivo">${opcoes(cf.motivos_aerea, r.motivo, 'Escolha…')}</select></div>
        <div class="campo"><label>Solicitante *</label><select class="inp" data-t="solicitante">${opcoes(cf.solicitantes, r.solicitante, 'Escolha…')}</select></div>
        <div class="campo"><label>Metros previstos *</label><input class="inp" type="number" min="0" data-t="metros_previstos" value="${esc(r.metros_previstos)}"></div></div>
        <div class="campo"><label>Notificação / referência</label><input class="inp" data-t="notificacao" value="${esc(r.notificacao)}"></div>
        <div class="campo"><label>Link do KMZ</label><div style="display:flex;gap:8px"><input class="inp" style="flex:1" data-t="kmz_url" placeholder="https://…" value="${esc(r.kmz_url)}">
          <label class="btn">📎 Arquivo<input type="file" id="tKmz" accept=".kmz,.kml" hidden></label></div></div>`;
      SN.$$('[data-t]', f).forEach(i => i.oninput = i.onchange = () => { r[i.dataset.t] = i.type === 'number' ? (i.value === '' ? '' : Number(i.value)) : i.value; });
      SN.$('#tKmz', f).onchange = async ev => {
        const file = ev.target.files && ev.target.files[0]; if (!file) return;
        if (!r.cidade) return SN.toast('Informe a cidade antes.', 'erro');
        try { const x = await SN.vst.exec('VST_KMZ_UPLOAD', { nome: file.name, cidade: r.cidade, dataUrl: await lerArquivo(file, true) }); r.kmz_url = x.url; r.kmz_drive_id = x.drive_id; SN.$('[data-t="kmz_url"]', f).value = x.url; SN.toast('KMZ enviado.', 'ok'); }
        catch (e) { SN.toast(e.message, 'erro'); }
      };
    };
    await SN.modal({ titulo: 'Transformar em rota de Preventiva', corpo: corpo(), botoes: [{ rot: 'Cancelar', valor: null }, { rot: 'Continuar', cls: 'prim', acao: async f => {
      if (seg === 'SUBTERRANEA') {
        if (!SN.temTela('vst_planejamento')) { SN.toast('Seu acesso não inclui o Planejamento da Preventiva.', 'erro'); return false; }
        form = Object.assign(novaRota('SUBTERRANEA'), { cidade: r.cidade, prestador: r.prestador, tecnico: r.tecnico, data_planejada: r.data_planejada, observacao: r.observacao, vincular_chamado: c.id });
        aba = 'NOVA'; setTimeout(() => SN.navegar('#/vst/planejamento'), 0); return null;
      }
      r.segmento = 'AEREA';
      const v = VR.validarRota(r); if (!v.ok) { SN.toast(v.erros[0], 'erro'); return false; }
      ocupado(f, true, 'Enviando…');
      try { const x = await vincular(c.id, r);
        SN.toast(`Chamado ligado à rota aérea ${x.rota.id_rota}. O técnico já vê a rota com o KMZ.`, 'ok');
        if (SN.sincronizar) await SN.sincronizar().catch(() => { }); setTimeout(() => SN.render(), 50); return null;
      } catch (e) { ocupado(f, false); SN.toast(e.message, 'erro'); return false; }
    } }],
      aoAbrir: f => { const liga = () => { SN.$$('[data-tseg]', f).forEach(b => b.onclick = () => { seg = b.dataset.tseg; SN.$$('[data-tseg]', f).forEach(x => x.classList.toggle('sel', x === b)); campos(f); }); campos(f); }; liga(); } });
  };

  SN.vst.registrarMenu();
})();
