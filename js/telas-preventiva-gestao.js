// SIGONET V2 — Preventiva: telas da gestão (liderança).
//
//  • Revisão (tela vst_revisao): fila única das CS subterrâneas e dos
//    apontamentos aéreos aguardando revisão; campos ao lado das fotos, foto
//    suspeita em destaque, aprovar ou rejeitar com motivo em lista fechada.
//    Aprovar tudo da rota conclui o chamado e libera a LPU (servidor).
//  • Dashboard (tela vst_dashboard):
//      Aérea — metros do mês × meta, plano de voo (média/dia × 30), por equipe,
//              região, motivo, solicitante e série mensal (a planilha de KPIs).
//      Subterrânea — conformidade, passivos, divergências, produção e medição.
// As contas são as de vistoria-regras.js (VR), testadas em testes/vistoria.
(() => {
  const L = VR_LISTAS, esc = SN.esc;
  const rot = (lista, v) => (v == null || v === '') ? '—' : L.rotulo(lista, v);
  const sn = v => v === 'sim' ? 'Sim' : v === 'nao' ? 'Não' : v === 'parcial' ? 'Parcial' : (v || '—');
  const carregar = async () => { try { return await SN.vst.carregar(); } catch (e) { SN.casca(SN.rotaAtual && SN.rotaAtual.hash.includes('dashboard') ? 'vst_dashboard' : 'vst_revisao', `<div class="aviso erro">${esc(e.message)}</div>`); return null; } };

  // Fotos para a revisão: vêm do Drive em base64 (20 por vez), com cache.
  const cacheFotos = {};
  const buscarFotos = async ids => {
    const faltam = ids.filter(id => !(id in cacheFotos));
    for (let i = 0; i < faltam.length; i += 20) {
      try { (await SN.vst.exec('VST_FOTOS_B64', { ids: faltam.slice(i, i + 20) })).fotos.forEach(f => { cacheFotos[f.id_foto] = f.dataUrl || null; }); }
      catch (e) { faltam.slice(i, i + 20).forEach(id => { cacheFotos[id] = null; }); }
    }
  };
  const abrirImagem = src => { const w = window.open(); if (w) w.document.write(`<body style="margin:0;background:#111"><img src="${src}" style="max-width:100%;display:block;margin:auto"></body>`); };

  // ═══════════════════════════ REVISÃO ═══════════════════════════
  let filtroSeg = 'TODOS';
  SN.rota('/vst/revisao', async () => {
    if (!SN.vst.disponivel()) return SN.casca('vst_revisao', SN.vst.semServidorHtml);
    SN.casca('vst_revisao', SN.carregando('Carregando fila de revisão…'));
    const d = await carregar(); if (!d || location.hash !== '#/vst/revisao') return;
    const rm = {}; d.rotas.forEach(r => { rm[r.id_rota] = r; });
    const itens = [
      ...d.vistorias.filter(v => v.status_revisao === 'AGUARDANDO_REVISAO').map(v => ({ seg: 'SUBTERRANEA', id: v.id_vistoria, doc: v, rota: rm[v.id_rota] || {} })),
      ...(d.producao || []).filter(a => a.status_revisao === 'AGUARDANDO_REVISAO' && !a.importado_planilha).map(a => ({ seg: 'AEREA', id: a.id_apontamento, doc: a, rota: rm[a.id_rota] || {} }))
    ].sort((a, b) => String(a.doc.enviado_em).localeCompare(String(b.doc.enviado_em)));
    const recentes = [
      ...d.vistorias.filter(v => v.data_revisao).map(v => ({ seg: 'SUBTERRANEA', doc: v, rota: rm[v.id_rota] || {} })),
      ...(d.producao || []).filter(a => a.data_revisao && !a.importado_planilha).map(a => ({ seg: 'AEREA', doc: a, rota: rm[a.id_rota] || {} }))
    ].sort((a, b) => String(b.doc.data_revisao).localeCompare(String(a.doc.data_revisao))).slice(0, 15);
    const vis = itens.filter(x => filtroSeg === 'TODOS' || x.seg === filtroSeg);
    const n = s => itens.filter(x => x.seg === s).length;
    const linha = x => {
      const a = x.doc, r = x.rota, sus = (a.fotos || []).filter(f => f.flag_suspeita).length, fl = a.flags || {};
      const alertas = [sus ? `<span class="badge alerta">⚠ ${sus} foto(s) suspeita(s)</span>` : '', fl.fora_criterio ? '<span class="badge erro">Fora do critério</span>' : '',
        fl.gps_divergente ? '<span class="badge alerta">GPS divergente</span>' : '', (a.envios || 1) > 1 ? `<span class="badge info">Reenvio nº ${a.envios}</span>` : ''].join(' ');
      const oque = x.seg === 'AEREA'
        ? `${a.tipo === 'final' ? '<b>Finalizado</b>' : 'Parcial'} · ${SN.num(a.metros)} m · ${SN.num(a.postes)} postes · ${SN.num(a.plaquetas)} plaquetas`
        : `CS <b>${esc(a.cs_nova ? 'fora do cadastro' : a.id_cs)}</b> · ${rot('conclusao', a.conclusao)}${a.abriu === 'nao' ? ' · não abriu' : ''}`;
      return `<tr class="clic" data-rev="${esc(x.id)}" data-seg="${x.seg}">
        <td>${x.seg === 'AEREA' ? '<span class="badge verde">🗼 Aérea</span>' : '<span class="badge">🕳️ Subterrânea</span>'}</td>
        <td><span class="mono">${esc(r.id_rota || a.id_rota)}</span><div class="small muted">${esc(r.cidade || '')}${r.segmento === 'AEREA' ? ' · ' + esc(r.motivo || '') : r.cluster ? ' · ' + esc(r.cluster) : ''}</div></td>
        <td>${oque}<div>${alertas}</div></td>
        <td>${esc(r.prestador || a.prestador || '')}<div class="small muted">${esc(a.tecnico || '')}</div></td>
        <td class="nowrap">${SN.dt(a.enviado_em)}</td></tr>`;
    };
    SN.casca('vst_revisao', `
      <div class="cab-pagina"><div><h1>Preventiva · Revisão</h1><p>Aprovar libera a medição; com tudo da rota aprovado, o chamado conclui sozinho e a LPU do prestador libera já preenchida.</p></div>
        <div class="acoes"><button class="btn" id="rAtualizar">⟳ Atualizar</button></div></div>
      <div class="abas">
        ${[['TODOS', 'Todos', itens.length], ['SUBTERRANEA', '🕳️ Subterrânea', n('SUBTERRANEA')], ['AEREA', '🗼 Aérea', n('AEREA')]].map(([k, r, q]) =>
          `<button class="aba ${filtroSeg === k ? 'ativa' : ''}" data-f="${k}">${r}<span class="n">${q}</span></button>`).join('')}</div>
      <div class="card"><div class="card-tit"><h3>Aguardando revisão (${vis.length})</h3><span class="small muted">mais antigas primeiro</span></div>
        ${vis.length ? `<div class="tabela-wrap"><table class="tab"><thead><tr><th>Segmento</th><th>Rota</th><th>O que revisar</th><th>Prestador / técnico</th><th>Enviado</th></tr></thead>
          <tbody>${vis.map(linha).join('')}</tbody></table></div>` : '<p class="muted">Nada aguardando revisão. 🎉</p>'}</div>
      <div class="card"><h3>Revisadas recentemente</h3>
        ${recentes.length ? `<div class="tabela-wrap"><table class="tab small"><thead><tr><th>Quando</th><th>Rota</th><th>Item</th><th>Decisão</th><th>Revisor</th></tr></thead><tbody>
          ${recentes.map(x => `<tr><td class="nowrap">${SN.dt(x.doc.data_revisao)}</td><td class="mono">${esc(x.doc.id_rota)}</td>
            <td>${x.seg === 'AEREA' ? (x.doc.tipo === 'final' ? 'Apontamento final' : 'Apontamento parcial') + ' · ' + SN.num(x.doc.metros) + ' m' : 'CS ' + esc(x.doc.cs_nova ? 'fora do cadastro' : x.doc.id_cs)}</td>
            <td>${SN.vst.badgeVistoria(x.doc.status_revisao)}${x.doc.status_revisao === 'REJEITADA' ? '<div class="small muted">' + (x.doc.motivo_rejeicao || []).map(m => esc(L.rotulo('motivos_rejeicao', m))).join(', ') + '</div>' : ''}</td>
            <td>${esc(x.doc.revisor || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Nenhuma revisão ainda.</p>'}</div>`);
    SN.$('#rAtualizar').onclick = async () => { // espera o servidor (o botão mostra que está carregando)
      try { await SN.vst.carregar(true); } catch (e) { SN.toast(e.message, 'erro'); }
      SN.render();
    };
    SN.$$('[data-f]').forEach(b => b.onclick = () => { filtroSeg = b.dataset.f; SN.render(); });
    SN.$$('[data-rev]').forEach(tr => tr.onclick = () => { const x = itens.find(i => i.id === tr.dataset.rev); if (x) abrirRevisao(x, d); });
  }, { tela: 'vst_revisao' });

  // Seção da revisão: campos à esquerda, as fotos daquela parte à direita.
  const secao = (titulo, campos, fotos) => `<div class="vst-rev-sec"><div><h4>${titulo}</h4><table class="tab small"><tbody>
      ${campos.filter(c => c).map(([k, v, destaque]) => `<tr><td class="muted" style="width:44%">${esc(k)}</td><td>${destaque ? `<b style="color:var(--erro)">${esc(v)}</b>` : esc(v == null || v === '' ? '—' : v)}</td></tr>`).join('')}</tbody></table></div>
    <div class="vst-rev-fotos">${fotos.length ? fotos.map(f => {
      const i = L.foto(f.tipo_foto) || {};
      return `<figure class="${f.flag_suspeita ? 'suspeita' : ''}"><div class="img" data-foto="${esc(f.id_foto)}"><span class="muted small">carregando…</span></div>
        <figcaption>${i.n ? i.n + '. ' : ''}${esc(i.rot || f.tipo_foto)}${f.flag_suspeita ? `<br><b style="color:var(--alerta)">⚠ SUSPEITA: data do arquivo difere ${esc(f.diferenca_min)} min da captura</b>` : ''}</figcaption></figure>`;
    }).join('') : '<span class="muted small">Sem fotos nesta parte.</span>'}</div></div>`;

  const htmlCs = (v, r) => {
    const fl = v.flags || {}, fotos = (v.fotos || []).filter(f => f.tipo_foto !== 'ficha_pdf');
    const de = (...tipos) => fotos.filter(f => tipos.includes(f.tipo_foto));
    const cen = v.cenario_esperado || r.cenario_esperado || {};
    const anterior = (v.historico || []).filter(h => h.acao === 'MOTIVO_ANTERIOR').pop();
    let ant = ''; try { if (anterior) { const x = JSON.parse(anterior.detalhe); ant = `<div class="aviso info small">Reenvio após rejeição (${esc(x.revisor || '')}): ${(x.motivos || []).map(m => esc(L.rotulo('motivos_rejeicao', m))).join(', ')}${x.texto ? ' — ' + esc(x.texto) : ''}</div>`; } } catch (e) { }
    return ant + secao('Identificação', [
        ['Rota', `${r.id_rota} · ${r.cidade || ''} · Cluster ${r.cluster || ''}`], ['CS', v.cs_nova ? 'Fora do cadastro (gera CS nova)' : v.id_cs], ['Endereço', v.endereco],
        ['Posição', `${v.lat}, ${v.lng}${v.gps_precisao ? ' ±' + v.gps_precisao + ' m' : ''}`], ['Situação no cadastro', rot('situacao_cadastro', v.situacao_cadastro)],
        ['Distância do cadastro', fl.gps_distancia_m != null ? fl.gps_distancia_m + ' m' + (fl.gps_divergente ? ' (acima da tolerância)' : '') : '—', fl.gps_divergente],
        v.gps_justificativa ? ['Justificativa GPS', v.gps_justificativa] : null,
        ['Técnico', `${v.tecnico} · ${v.prestador}`], ['Horário', `${SN.dt(v.inicio)} → ${SN.dt(v.fim)}`]], [])
      + (Number(v.ordem) > 1 && v.trecho ? secao(`Trecho ${v.trecho.cs_origem || ''} → esta CS`, [['Superfície percorrida', sn(v.trecho.superficie_percorrida)],
          ...(v.trecho.anomalias || []).map((a, i) => ['Anomalia ' + (i + 1), `${rot('anomalia_trecho', a.tipo)}${a.texto ? ' — ' + a.texto : ''} · ${a.lat}, ${a.lng}`])], de('anomalia')) : '')
      + secao('Acesso, solo e tampa', [['Conseguiu abrir', sn(v.abriu)], v.abriu === 'nao' ? ['Motivo', `${rot('motivo_nao_abriu', v.motivo_nao_abriu)}${v.motivo_nao_abriu_texto ? ' — ' + v.motivo_nao_abriu_texto : ''}`] : null,
          ['Solo no entorno', rot('solo_entorno', v.solo_entorno)], ['Tampa', `${v.tampa_tipo || '—'} · ${rot('tampa_estado', v.tampa_estado)}`], ['Identificação na tampa', rot('tampa_identificacao', v.tampa_identificacao)]],
          de('contexto', 'tampa_perto', 'anomalia_solo'))
      + (v.abriu === 'sim' ? secao('Interior', [['Água', rot('agua', v.agua)], ['Limpeza', rot('limpeza', v.limpeza)], ['Assoreamento', rot('assoreamento', v.assoreamento)],
            ['Terra pelos dutos', sn(v.terra_dutos)], ['Infiltração', sn(v.infiltracao)], ['Estrutura', rot('estrutura', v.estrutura)]], de('tampa_aberta'))
        + secao('Dutos', [['Entradas / ocupadas / vagas', `${v.dutos_entradas} / ${v.dutos_ocupadas} / ${v.dutos_vagas}`], ['Tamponamento', sn(v.tamponamento)],
            ['Profundidade', `${v.profundidade_cm} cm${fl.fora_criterio === true ? ' — FORA DO CRITÉRIO' : ''}`, fl.fora_criterio === true]], de('profundidade', 'parede'))
        + secao('Cabos', [['Quantidade', v.cabos_qtd], ['Operadoras (plaquetas)', (v.cabos || []).map(c => c.operadora === 'nao_identificado' ? 'não identificado' : c.operadora).join(', ')],
            ['Cenário esperado', `${(cen.operadoras || []).join(', ') || '—'} (dono do duto: ${cen.dono_duto || '—'})`],
            ['Bate com o cenário', `${sn(v.cabos_batem)}${(v.cabos_divergencias || []).length ? ' — ' + v.cabos_divergencias.map(x => rot('cabos_divergencia', x)).join(', ') : ''}`, v.cabos_batem === 'nao']], de('plaquetas'))
        + secao('Organização e emenda', [['Fixação', sn(v.fixacao)], ['Reserva técnica', rot('reserva', v.reserva)], ['Estado geral', rot('organizacao', v.organizacao)], ['Emenda', sn(v.emenda_existe)],
            v.emenda_existe === 'sim' ? ['Caixa de emenda', `${rot('emenda_caixa', v.emenda_caixa)} · ${rot('emenda_fixacao', v.emenda_fixacao)} · ${rot('emenda_submersa', v.emenda_submersa)} · vedação ${rot('emenda_vedacao', v.emenda_vedacao)}`] : null,
            v.emenda_aberta === 'sim' ? ['Emenda aberta', `autorizado por ${v.emenda_autorizado_por} · técnico ${v.emenda_tecnico}`] : null],
            de('organizacao', 'emenda_externa', 'emenda_antes', 'emenda_depois')) : '')
      + secao('Conclusão', [['Conclusão', rot('conclusao', v.conclusao)], ['Prioridade', rot('prioridade', v.prioridade)], ['Observação', v.observacao]], de('tampa_final'));
  };
  const htmlApontamento = (a, r, d) => {
    const doRota = (d.producao || []).filter(x => x.id_rota === a.id_rota && x.status_revisao !== 'REJEITADA');
    const p = VR.producaoRota(r, doRota), fotos = (a.fotos || []).filter(f => f.tipo_foto !== 'ficha_pdf');
    return secao('Rota aérea', [['Rota', `${r.id_rota} · ${r.cidade} · ${r.regiao || ''}`], ['Motivo', r.motivo], ['Solicitante', r.solicitante], r.notificacao ? ['Notificação', r.notificacao] : null,
        ['Prestador / técnico', `${r.prestador} · ${a.tecnico || ''}`], ['Previsto', SN.num(r.metros_previstos) + ' m'], ['KMZ', r.kmz_url || '—']], [])
      + secao(`Apontamento ${a.tipo === 'final' ? 'FINALIZADO' : 'parcial'} · ${SN.vst.dia(a.data)}`, [
        ...L.producao_aerea.map(c => [c.rot, SN.num(Number(a[c.k]) || 0)]), a.observacao ? ['Observação', a.observacao] : null], fotos)
      + secao('Acumulado da rota (não rejeitados)', [...L.producao_aerea.map(c => [c.rot, SN.num(p.totais[c.k])]),
        ['% do previsto', p.pct != null ? p.pct + '%' : '—', p.pct != null && (p.pct < 80 || p.pct > 120)], ['Apontamentos', p.apontamentos]], []);
  };

  const abrirRevisao = (x, d) => {
    const a = x.doc, r = x.rota, ficha = (a.fotos || []).find(f => f.tipo_foto === 'ficha_pdf');
    const corpo = `<div class="small muted" style="margin-bottom:8px">${x.seg === 'AEREA' ? '🗼 Preventiva aérea' : '🕳️ Preventiva subterrânea'} · enviado em ${SN.dt(a.enviado_em)}${ficha && ficha.url ? ` · <a href="${esc(ficha.url)}" target="_blank" rel="noopener">📄 Ficha PDF de controle</a>` : ''}</div>
      ${x.seg === 'AEREA' ? htmlApontamento(a, r, d) : htmlCs(a, r)}
      <div class="card" id="rDecisao" style="margin-top:12px;display:none"><h4>Motivo da rejeição (pode marcar mais de um)</h4>
        <div class="chips">${L.motivos_rejeicao.map(([v, t]) => `<button type="button" class="chip" data-mot="${v}">${esc(t)}</button>`).join('')}</div>
        <div class="campo" style="margin-top:8px"><label>Detalhe (obrigatório em "Outro")</label><textarea class="inp" id="rTexto"></textarea></div></div>`;
    // PDF do que está na tela (dados + fotos), na mesma ficha de controle do aparelho.
    const baixarPdf = () => SN.abrirPdfDepois(async () => {
      const fotos = (a.fotos || []).filter(f => f.tipo_foto !== 'ficha_pdf');
      await buscarFotos(fotos.map(f => f.id_foto));
      const locais = {}; fotos.forEach(f => { if (cacheFotos[f.id_foto]) locais[f.id_foto] = { thumb: cacheFotos[f.id_foto] }; });
      let url;
      if (x.seg === 'AEREA') {
        const doRota = (d.producao || []).filter(p => p.id_rota === a.id_rota && p.status_revisao !== 'REJEITADA');
        url = await SN.vst.pdfApontamento(a, r, VR.producaoRota(r, doRota).totais, locais);
      } else url = await SN.vst.pdfFichaCs(a, r, locais);
      if (!url) return null;
      const bin = atob(url.split(',')[1]), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      return { output: () => blobUrl }; // formato que SN.abrirPdfDepois espera
    });
    let rejeitando = false; const motivos = new Set();
    const decidir = async (decisao, f) => {
      const dados = { decisao, motivos: [...motivos], motivo_texto: (SN.$('#rTexto', f) || {}).value || '', [x.seg === 'AEREA' ? 'id_apontamento' : 'id_vistoria']: x.id };
      const val = VR.validarRevisao(dados);
      if (!val.ok) { SN.toast(val.erros[0], 'erro'); return false; }
      try { await SN.vst.exec('VST_REVISAR', dados); } catch (e) { SN.toast(e.message, 'erro'); return false; }
      SN.toast(decisao === 'APROVADA' ? 'Aprovado.' : 'Rejeitado: o prestador vai ver o motivo e refazer.', 'ok');
      setTimeout(() => SN.render(), 50); return true;
    };
    SN.modal({ titulo: x.seg === 'AEREA' ? `Revisar apontamento · ${r.id_rota}` : `Revisar CS ${a.cs_nova ? '(fora do cadastro)' : a.id_cs} · ${r.id_rota}`, largo: true, corpo,
      botoes: [{ rot: 'Fechar', valor: null },
        { rot: '📄 PDF', acao: () => { baixarPdf(); return false; } },
        { rot: '✖ Rejeitar', cls: 'perigo', acao: async f => { if (!rejeitando) { rejeitando = true; SN.$('#rDecisao', f).style.display = ''; SN.$('#rDecisao', f).scrollIntoView({ behavior: 'smooth' }); SN.toast('Marque o motivo e toque em Rejeitar de novo.'); return false; } return (await decidir('REJEITADA', f)) ? null : false; } },
        { rot: '✔ Aprovar', cls: 'ok', acao: async f => (await decidir('APROVADA', f)) ? null : false }],
      aoAbrir: async f => {
        SN.$$('[data-mot]', f).forEach(b => b.onclick = () => { const k = b.dataset.mot; motivos.has(k) ? motivos.delete(k) : motivos.add(k); b.classList.toggle('sel'); });
        const ids = SN.$$('[data-foto]', f).map(e => e.dataset.foto);
        await buscarFotos(ids);
        SN.$$('[data-foto]', f).forEach(e => { const src = cacheFotos[e.dataset.foto]; e.innerHTML = src ? `<img src="${src}" alt="">` : '<span class="muted small">foto indisponível</span>'; if (src) e.onclick = () => abrirImagem(src); });
      } });
  };

  // ═══════════════════════════ DASHBOARD ═══════════════════════════
  let aba = 'AEREA', mesSel = null;
  const mesAtual = () => new Date().toISOString().slice(0, 7);
  const nomeMes = m => SN.mesNome(m);
  // Barras horizontais de UMA série (cor da marca); valor e dica por barra.
  const barras = (pares, fmt, un) => {
    const max = Math.max(1, ...pares.map(p => p[1]));
    return `<div class="barras">${pares.map(([nome, v, extra]) => `<div class="barra" title="${esc(nome)}: ${esc(fmt(v))}${un || ''}${extra ? ' · ' + esc(extra) : ''}">
      <span class="nm">${esc(nome)}</span><span class="trilho" style="display:block"><span class="fill" style="display:block;width:${Math.max(0.5, 100 * v / max)}%"></span></span><span class="v">${fmt(v)}${un || ''}</span></div>`).join('')}</div>`;
  };
  const kpi = (rotulo, valor, sub, destaque) => `<div class="kpi ${destaque ? 'destaque' : ''}"><div class="rot">${rotulo}</div><div class="val">${valor}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  const ordenar = (obj, k) => Object.keys(obj).map(n => [n, obj[n][k], obj[n]]).sort((a, b) => b[1] - a[1]);

  SN.rota('/vst/dashboard', async () => {
    if (!SN.vst.disponivel()) return SN.casca('vst_dashboard', SN.vst.semServidorHtml);
    SN.casca('vst_dashboard', SN.carregando('Carregando indicadores…'));
    const d = await carregar(); if (!d || location.hash !== '#/vst/dashboard') return;
    const cfg = VR.normalizarConfig(d.config);
    SN.casca('vst_dashboard', `
      <div class="cab-pagina"><div><h1>Preventiva · Dashboard</h1><p>Indicadores da preventiva aérea (meta de metros percorridos) e da diligência subterrânea.</p></div>
        <div class="acoes"><button class="btn" id="dRelatorio" title="Aérea do mês escolhido + diligência subterrânea (só aprovadas)">Relatório PDF (diretoria)</button><button class="btn" id="dExportar">⬇ Exportar Excel</button></div></div>
      <div class="abas"><button class="aba ${aba === 'AEREA' ? 'ativa' : ''}" data-aba="AEREA">🗼 Aérea</button><button class="aba ${aba === 'SUB' ? 'ativa' : ''}" data-aba="SUB">🕳️ Subterrânea</button></div>
      <div id="dCorpo"></div>`);
    SN.$$('[data-aba]').forEach(b => b.onclick = () => { aba = b.dataset.aba; SN.render(); });
    SN.$('#dRelatorio').onclick = () => { // usa a configuração mais recente (dias trabalhados podem ter sido editados na tela)
      const hojeIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      SN.abrirPdfDepois(() => SN.vst.pdfDiretoria(d, d.config, mesSel || mesAtual(), hojeIso));
    };
    if (aba === 'AEREA') pintarAerea(d, cfg); else pintarSub(d, cfg);
  }, { tela: 'vst_dashboard' });

  const pintarAerea = (d, cfg) => {
    const rotas = d.rotas.filter(r => r.segmento === 'AEREA'), aps = d.producao || [];
    const meses = [...new Set(aps.map(a => String(a.data).slice(0, 7)).filter(Boolean).concat([mesAtual()]))].sort().reverse();
    mesSel = mesSel && meses.includes(mesSel) ? mesSel : meses[0];
    const hojeIso = SN.vst.dia ? new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) : SN.agora().slice(0, 10);
    // Dias trabalhados: automático = dias corridos do calendário já passados no mês; editado fica salvo
    // na configuração (vale para todos) e o cálculo refaz em cima dele. Só o planejamento edita.
    const dm = VR.diasAereaMes(mesSel, cfg, hojeIso), podeEditarDias = SN.temTela('vst_planejamento');
    const k = VR.kpiAereo(rotas, aps, mesSel, cfg, { diasTrabalhados: dm.dias });
    const serie = VR.serieAerea(aps, mesSel, 12, cfg);
    const t = k.total, noRitmo = k.projecao_m >= k.meta_m;
    const maxSerie = Math.max(k.meta_m, ...serie.map(s => s.metros), 1);
    SN.$('#dCorpo').innerHTML = `
      <div class="acoes" style="margin-bottom:12px">
        <label class="small">Mês <select class="inp" id="dMes" style="width:auto">${meses.map(m => `<option value="${m}" ${m === mesSel ? 'selected' : ''}>${esc(nomeMes(m))}</option>`).join('')}</select></label>
        <label class="small">Dias trabalhados <input class="inp" id="dDias" type="number" min="0" max="31" step="1" style="width:90px" placeholder="${dm.automatico}" value="${dm.salvo != null ? dm.salvo : ''}" ${podeEditarDias ? '' : 'disabled'}></label>
        <span class="small muted">${dm.salvo != null
          ? `editado e salvo para ${esc(nomeMes(mesSel))} (automático seria ${dm.automatico})${podeEditarDias ? ' · apague o campo para voltar ao automático' : ''}`
          : `automático: dias corridos do calendário já passados no mês (${dm.automatico})${podeEditarDias ? ' · digite outro valor para ajustar' : ''}`}${podeEditarDias ? '' : ' · só o planejamento edita'}</span></div>
      <div class="grid g4" style="margin-bottom:14px">
        ${kpi('Percorrido no mês', SN.num(t.metros) + ' m', `meta ${SN.num(k.meta_m)} m · <b>${k.pct_meta ?? 0}%</b>`, true)}
        ${kpi('Projeção (média × 30)', SN.num(k.projecao_m) + ' m', `<span class="badge ${noRitmo ? 'ok' : 'alerta'}">${noRitmo ? '✓ no ritmo da meta' : '⚠ abaixo da meta'}</span>`)}
        ${kpi('Média por dia', SN.num(k.media_dia_m) + ' m', `${k.dias_trabalhados} dia(s) trabalhado(s)`)}
        ${kpi('Falta para a meta', SN.num(k.falta_m) + ' m', `aprovado (base de pagamento): ${SN.num(k.aprovado.metros)} m`)}
      </div>
      <div class="card"><div class="card-tit"><h3>Meta do mês · ${esc(nomeMes(mesSel))}</h3><span class="small muted">${SN.num(t.metros)} de ${SN.num(k.meta_m)} m</span></div>
        <div class="gauge ${k.pct_meta >= 100 ? '' : noRitmo ? '' : 'alerta'}" title="${k.pct_meta}% da meta"><div style="width:${Math.min(100, k.pct_meta || 0)}%"></div></div>
        <div class="grid g6" style="margin-top:12px">${[['Rotas', t.rotas, ''], ['Postes equipados', t.postes, ''], ['Cordoalha', t.cordoalha, ' m'], ['Plaquetas', t.plaquetas, ''], ['Caixas/CEO regularizadas', t.caixas, ''], ['Sobra técnica', t.sobra, '']]
          .map(([r, v, u]) => `<div><div class="small muted">${r}</div><b style="font-size:1.2rem">${SN.num(v)}${u}</b></div>`).join('')}</div></div>
      <div class="card"><div class="card-tit"><h3>Metros percorridos por mês</h3><span class="small muted">linha tracejada = meta</span></div>
        <div class="vst-colunas">${serie.map(s => `<div class="vst-col-wrap" title="${esc(nomeMes(s.mes))}: ${SN.num(s.metros)} m · meta ${SN.num(s.meta_m)} m">
            <div class="vst-col ${s.mes === mesSel ? 'sel' : ''}" style="height:${100 * s.metros / maxSerie}%"></div>
            <div class="vst-col-meta" style="bottom:${100 * s.meta_m / maxSerie}%"></div>
            <span class="vst-col-rot">${s.mes.slice(5)}/${s.mes.slice(2, 4)}</span>${s.mes === mesSel ? `<span class="vst-col-val">${SN.num(Math.round(s.metros / 1000))} km</span>` : ''}</div>`).join('')}</div>
        <details style="margin-top:8px"><summary class="small">Ver tabela</summary><table class="tab small"><thead><tr><th>Mês</th><th class="num">Metros</th><th class="num">Meta</th><th class="num">%</th></tr></thead>
          <tbody>${serie.map(s => `<tr><td>${esc(nomeMes(s.mes))}</td><td class="num">${SN.num(s.metros)}</td><td class="num">${SN.num(s.meta_m)}</td><td class="num">${s.meta_m ? Math.round(100 * s.metros / s.meta_m) : '—'}%</td></tr>`).join('')}</tbody></table></details></div>
      <div class="card"><div class="card-tit"><h3>Por equipe</h3></div>
        ${barras(ordenar(k.por.equipe, 'metros').map(([n, v, o]) => [n, v, o.rotas + ' rotas']), SN.num, ' m')}
        <div class="tabela-wrap" style="margin-top:10px"><table class="tab small"><thead><tr><th>Equipe</th><th class="num">Rotas</th><th class="num">Metros</th><th class="num">% do mês</th><th class="num">Postes</th><th class="num">Cordoalha (m)</th><th class="num">Plaquetas</th><th class="num">Caixas/CEO</th><th class="num">Sobra técnica</th></tr></thead>
          <tbody>${ordenar(k.por.equipe, 'metros').map(([n, v, o]) => `<tr><td>${esc(n)}</td><td class="num">${o.rotas}</td><td class="num">${SN.num(v)}</td><td class="num">${t.metros ? Math.round(1000 * v / t.metros) / 10 : 0}%</td>
            <td class="num">${SN.num(o.postes)}</td><td class="num">${SN.num(o.cordoalha)}</td><td class="num">${SN.num(o.plaquetas)}</td><td class="num">${SN.num(o.caixas)}</td><td class="num">${SN.num(o.sobra)}</td></tr>`).join('')}
          <tr><td><b>Total</b></td><td class="num"><b>${t.rotas}</b></td><td class="num"><b>${SN.num(t.metros)}</b></td><td class="num">100%</td><td class="num"><b>${SN.num(t.postes)}</b></td><td class="num"><b>${SN.num(t.cordoalha)}</b></td><td class="num"><b>${SN.num(t.plaquetas)}</b></td><td class="num"><b>${SN.num(t.caixas)}</b></td><td class="num"><b>${SN.num(t.sobra)}</b></td></tr></tbody></table></div></div>
      <div class="grid g2">
        <div class="card"><h3>Por região</h3>${barras(ordenar(k.por.regiao, 'metros'), SN.num, ' m')}</div>
        <div class="card"><h3>Por motivo</h3>${barras(ordenar(k.por.motivo, 'metros').map(([n, v, o]) => [n, v, o.rotas + ' rotas']), SN.num, ' m')}</div>
        <div class="card"><h3>Por solicitante</h3>${barras(ordenar(k.por.solicitante, 'metros').map(([n, v, o]) => [n, v, o.rotas + ' rotas']), SN.num, ' m')}</div>
        <div class="card"><h3>Por cidade</h3>${barras(ordenar(k.por.cidade, 'metros').slice(0, 12), SN.num, ' m')}</div>
      </div>`;
    SN.$('#dMes').onchange = e => { mesSel = e.target.value; pintarAerea(d, cfg); };
    SN.$('#dDias').onchange = async e => {
      const txt = e.target.value.trim(), n = txt === '' ? null : Number(txt);
      if (n != null && !(Number.isInteger(n) && n >= 0 && n <= 31)) { SN.toast('Informe um número inteiro de 0 a 31.', 'erro'); e.target.value = dm.salvo != null ? dm.salvo : ''; return; }
      const nova = { ...cfg, dias_aerea_mes: { ...cfg.dias_aerea_mes } };
      if (n == null) delete nova.dias_aerea_mes[mesSel]; else nova.dias_aerea_mes[mesSel] = n;
      e.target.disabled = true;
      try {
        const r = await SN.vst.exec('VST_CONFIG_SALVAR', { config: nova });
        d.config = r.config; cfg = VR.normalizarConfig(r.config);
        SN.toast(n == null ? `Dias trabalhados de ${nomeMes(mesSel)} voltaram ao automático.` : `Dias trabalhados de ${nomeMes(mesSel)} salvos: ${n}.`, 'ok');
      } catch (err) { SN.toast('Não foi possível salvar os dias: ' + err.message, 'erro'); }
      pintarAerea(d, cfg);
    };
    SN.$('#dExportar').onclick = () => {
      const rm = {}; rotas.forEach(r => { rm[r.id_rota] = r; });
      SN.exportar('Preventiva aérea ' + mesSel, aps.filter(a => String(a.data).slice(0, 7) === mesSel && a.status_revisao !== 'REJEITADA').map(a => {
        const r = rm[a.id_rota] || {};
        return { Data: SN.vst.dia(a.data), Rota: a.id_rota, Tipo: a.tipo === 'final' ? 'Finalizado' : 'Parcial', Equipe: r.prestador, Cidade: r.cidade, Região: r.regiao, Motivo: r.motivo,
          Solicitante: r.solicitante, Protocolo: r.protocolo || r.id_chamado || '', 'Metros': a.metros, 'Postes equipados': a.postes, 'Cordoalha (m)': a.cordoalha, Plaquetas: a.plaquetas,
          'Caixas/CEO regularizadas': a.caixas, 'Sobra técnica': a.sobra, 'Status revisão': a.status_revisao, 'Da planilha': a.importado_planilha ? 'SIM' : '' };
      }));
    };
  };

  const pintarSub = (d, cfg) => {
    const rotas = d.rotas.filter(r => r.segmento !== 'AEREA'), vs = d.vistorias;
    const c = VR.conformidade(vs), p = VR.passivos(vs, cfg), dv = VR.divergencias(vs), med = VR.medicao(vs, rotas), prod = VR.producao(rotas, vs), mtr = VR.metragemRotas(rotas, vs);
    const difTxt = x => { if (x.diferenca_m == null || !x.previsto_m) return '—'; if (x.cs_enviadas < x.cs_planejadas) return '<span class="muted">parcial</span>'; const p = Math.round(100 * x.diferenca_m / x.previsto_m);
      return `<span class="${Math.abs(p) >= 20 ? 'badge alerta' : ''}">${x.diferenca_m > 0 ? '+' : ''}${SN.num(x.diferenca_m)} m (${p > 0 ? '+' : ''}${p}%)</span>`; };
    const pend = VR.pendenciasConfig(cfg);
    SN.$('#dCorpo').innerHTML = `
      ${pend.length ? `<div class="aviso alerta small" style="margin-bottom:12px"><b>Configurações a definir:</b> ${pend.map(esc).join(' · ')}</div>` : ''}
      <div class="grid g4" style="margin-bottom:14px">
        ${kpi('CS aprovadas', SN.num(c.total.total), `${vs.filter(v => v.status_revisao === 'AGUARDANDO_REVISAO').length} aguardando revisão`, true)}
        ${kpi('Conforme', c.total.pct_conforme + '%', SN.num(c.total.conforme) + ' CS')}
        ${kpi('Conforme com ressalva', c.total.pct_ressalva + '%', SN.num(c.total.ressalva) + ' CS')}
        ${kpi('Não conforme', c.total.pct_nao_conforme + '%', SN.num(c.total.nao_conforme) + ' CS')}
      </div>
      <div class="grid g2">
        <div class="card"><h3>Passivos quantificados</h3><table class="tab"><tbody>
          ${[['Tampas a trocar (trincada/quebrada/ausente)', p.total.tampas_trocar], ['CS alagadas', p.total.cs_alagadas], ['CS assoreadas', p.total.cs_assoreadas],
            ['Dutos rasos (fora do critério)', p.profundidade_definida ? p.total.dutos_rasos : 'profundidade mínima a definir'], ['Cabos não identificados', p.total.cabos_nao_identificados],
            ['CS com cabo excedente', p.total.cs_cabo_excedente], ['CS fora do cadastro', p.total.cs_fora_cadastro]].map(([k, v]) => `<tr><td>${k}</td><td class="num"><b>${typeof v === 'number' ? SN.num(v) : esc(v)}</b></td></tr>`).join('')}</tbody></table></div>
        <div class="card"><h3>Divergências cadastro × campo</h3><table class="tab"><tbody>
          ${[['Posição divergente', dv.total.posicao_divergente], ['CS não consta no cadastro', dv.total.nao_consta], ['Cabos divergentes do cenário', dv.total.cabos_divergentes], ['Caixa não cadastrada no trecho', dv.total.caixa_no_trecho]]
            .map(([k, v]) => `<tr><td>${k}</td><td class="num"><b>${SN.num(v)}</b></td></tr>`).join('')}</tbody></table></div>
      </div>
      <div class="card"><h3>Conformidade por cluster</h3>${Object.keys(c.por_cluster).length ? `<table class="tab small"><thead><tr><th>Cluster</th><th class="num">CS</th><th class="num">Conforme</th><th class="num">Ressalva</th><th class="num">Não conforme</th></tr></thead>
        <tbody>${Object.entries(c.por_cluster).map(([k, x]) => `<tr><td>${esc(k)}</td><td class="num">${x.total}</td><td class="num">${x.pct_conforme}%</td><td class="num">${x.pct_ressalva}%</td><td class="num">${x.pct_nao_conforme}%</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Nenhuma CS aprovada ainda.</p>'}</div>
      <div class="grid g2">
        <div class="card"><h3>Produção do prestador</h3><table class="tab small"><thead><tr><th>Prestador</th><th class="num">Planejadas</th><th class="num">Enviadas</th><th class="num">Aprovadas</th><th class="num">Rejeitadas</th></tr></thead>
          <tbody>${prod.map(x => `<tr><td>${esc(x.prestador)}</td><td class="num">${x.planejadas}</td><td class="num">${x.enviadas}</td><td class="num">${x.aprovadas}</td><td class="num">${x.rejeitadas}${x.rejeicoes_total > x.rejeitadas ? ` <span class="muted">(${x.rejeicoes_total} no total)</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">—</td></tr>'}</tbody></table></div>
        <div class="card"><h3>Medição (só APROVADAS)</h3><p class="small muted" style="margin:-4px 0 8px">Metros de campo = distância entre as posições GPS que o técnico registrou em cada CS, na ordem do relatório.</p>
          <table class="tab small"><thead><tr><th>Prestador</th><th class="num">CS aprovadas</th><th class="num">Previsto (m)</th><th class="num">Campo (m)</th></tr></thead>
          <tbody>${med.linhas.map(x => `<tr><td>${esc(x.prestador)}</td><td class="num">${x.cs_aprovadas}</td><td class="num muted">${SN.num(x.previsto_m)}</td><td class="num"><b>${SN.num(x.metros)}</b></td></tr>`).join('') || '<tr><td colspan="4" class="muted">—</td></tr>'}
          <tr><td><b>Total</b></td><td class="num"><b>${med.total_cs}</b></td><td class="num muted">${SN.num(med.total_previsto_m)}</td><td class="num"><b>${SN.num(med.total_metros)} m</b></td></tr></tbody></table></div>
      </div>
      <div class="card"><div class="card-tit"><h3>Metragem por rota · relatório do técnico</h3><span class="small muted">previsto = base/KMZ · campo = GPS de CS a CS</span></div>
        ${mtr.length ? `<div class="tabela-wrap"><table class="tab small"><thead><tr><th>Rota</th><th>Cluster</th><th>Prestador / técnico</th><th class="num">CS enviadas</th><th class="num">Previsto (m)</th><th class="num">Campo (m)</th><th class="num">Diferença</th><th class="num">Aprovado (m)</th></tr></thead>
          <tbody>${mtr.map(x => `<tr><td>${esc(x.id_rota)}</td><td>${esc(x.cluster || '')}</td><td>${esc(x.prestador || '')}${x.tecnico ? ' · ' + esc(x.tecnico) : ''}</td>
            <td class="num">${x.cs_enviadas}/${x.cs_planejadas}</td><td class="num muted">${SN.num(x.previsto_m)}</td>
            <td class="num"><b>${SN.num(x.metros)}</b>${x.origem === 'previsto' ? ' <span class="badge" title="Nenhuma CS com GPS: rateio do previsto">sem GPS</span>' : x.sem_gps.length ? ` <span class="badge alerta" title="Sem GPS: ${esc(x.sem_gps.join(', '))}">${x.sem_gps.length} sem GPS</span>` : ''}</td>
            <td class="num">${difTxt(x)}</td><td class="num">${SN.num(x.metros_aprovados)}</td></tr>
            ${x.trechos.length ? `<tr><td colspan="8" style="padding-top:0"><details><summary class="small muted">Trechos (${x.trechos.length})</summary>
              <div class="small">${x.trechos.map(t => `${esc(t.de)} → ${esc(t.para)}: <b>${SN.num(t.metros)} m</b>`).join(' · ')}</div></details></td></tr>` : ''}`).join('')}
          <tr><td colspan="4"><b>Total</b></td><td class="num muted">${SN.num(mtr.reduce((s, x) => s + x.previsto_m, 0))}</td><td class="num"><b>${SN.num(mtr.reduce((s, x) => s + x.metros, 0))} m</b></td><td></td><td class="num"><b>${SN.num(mtr.reduce((s, x) => s + x.metros_aprovados, 0))} m</b></td></tr></tbody></table></div>`
          : '<p class="muted small">Nenhuma CS enviada ainda.</p>'}</div>`;
    SN.$('#dExportar').onclick = () => SN.exportar('Preventiva subterrânea', vs.map(v => ({ Rota: v.id_rota, CS: v.cs_nova ? '(fora do cadastro)' : v.id_cs, Cidade: v.cidade, Cluster: v.cluster,
      Prestador: v.prestador, Técnico: v.tecnico, Status: v.status_revisao, Conclusão: rot('conclusao', v.conclusao), Prioridade: rot('prioridade', v.prioridade), Abriu: sn(v.abriu),
      'Tampa': rot('tampa_estado', v.tampa_estado), 'Água': rot('agua', v.agua), 'Profundidade (cm)': v.profundidade_cm, 'Fora do critério': (v.flags || {}).fora_criterio ? 'SIM' : '',
      'Situação cadastro': rot('situacao_cadastro', v.situacao_cadastro), 'Enviada em': SN.dt(v.enviado_em), 'Revisor': v.revisor || '' })));
  };

  SN.vst.registrarMenu(); // entra no menu lateral para quem tem a tela liberada
})();
