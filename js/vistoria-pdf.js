// SIGONET V2 — Preventiva: PDFs de controle.
//
// Toda atividade da Preventiva gera um PDF que fica anexado no Drive, junto do
// registro:
//   • ficha de cada CS (subterrânea), gerada no aparelho ao enviar;
//   • ficha de cada apontamento de produção (aérea);
//   • resumo da rota (gerado na revisão, quando a rota é aprovada).
// O PDF entra na mesma fila offline das fotos (tipo_foto "ficha_pdf"): sem sinal,
// fica guardado e sobe junto com o resto. Usa o padrão de PDF do V2 (SN.novoPdf).
SN.vst = SN.vst || {};
(() => {
  const L = VR_LISTAS;
  const rot = (lista, v) => (v == null || v === '') ? '—' : L.rotulo(lista, v);
  const sn = v => v === 'sim' ? 'Sim' : v === 'nao' ? 'Não' : v === 'parcial' ? 'Parcial' : (v || '—');

  // Carrega as miniaturas para saber a proporção de cada foto.
  const medir = src => new Promise(ok => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok({ src, w: i.width, h: i.height }); i.onerror = () => ok(null); i.src = src; });
  // Grade de fotos (3 por linha) com legenda; quebra página quando precisa.
  const gradeFotos = async (doc, fotos, legenda) => {
    const itens = (await Promise.all(fotos.map(async f => ({ f, img: await medir(f.src) })))).filter(x => x.img);
    if (!itens.length) { doc.linha('Fotos', 'Miniaturas indisponíveis neste aparelho (as fotos estão no Drive).'); return; }
    const larg = 60, gap = 4, x0 = 12;
    let col = 0, alturaLinha = 0;
    for (const { f, img } of itens) {
      const h = Math.min(60, larg * img.h / img.w);
      if (col === 0 && doc._y + h + 10 > 285) { doc.addPage(); doc._y = 18; }
      const x = x0 + col * (larg + gap);
      try { doc.addImage(img.src, 'JPEG', x, doc._y, larg, h); } catch (e) { }
      doc.setFontSize(7); doc.setTextColor(70); doc.text(doc.splitTextToSize(legenda(f), larg), x, doc._y + h + 3); doc.setFontSize(9.5); doc.setTextColor(29, 38, 20);
      alturaLinha = Math.max(alturaLinha, h + 8);
      col++;
      if (col === 3) { col = 0; doc._y += alturaLinha; alturaLinha = 0; }
    }
    if (col) doc._y += alturaLinha;
  };

  // Ficha da CS. fotosLocais: id_foto → { thumb } (miniaturas guardadas no aparelho).
  // Devolve o dataUrl do PDF (ou null se a biblioteca de PDF não carregou).
  SN.vst.pdfFichaCs = async (v, rota, fotosLocais) => {
    const nomeCs = v.cs_nova ? 'CS fora do cadastro' : v.id_cs;
    const doc = SN.novoPdf(`Preventiva · Ficha da CS ${nomeCs}`); if (!doc) return null;
    const cen = rota.cenario_esperado || {}, fl = v.flags || {};
    doc.secao('Rota');
    doc.linha('Rota', `${rota.id_rota} · ${rota.cidade || ''} · Cluster ${rota.cluster} · previsto ${SN.num(Math.round((Number(rota.extensao_km) || 0) * 1000))} m`);
    doc.linha('Prestador / técnico', `${rota.prestador} · ${v.tecnico || ''}`);
    if (rota.id_chamado) doc.linha('Chamado', rota.id_chamado);
    doc.linha('CS nº / horário', `${v.ordem} · início ${SN.dt(v.inicio)} · fim ${SN.dt(v.fim)}`);
    doc.linha('Cenário esperado', `Dono do duto: ${cen.dono_duto || '—'} · Operadoras: ${(cen.operadoras || []).join(', ') || '—'}`);
    if (Number(v.ordem) > 1 && v.trecho) {
      doc.secao(`Trecho ${v.trecho.cs_origem || 'CS anterior'} → ${nomeCs}`);
      doc.linha('Superfície percorrida', sn(v.trecho.superficie_percorrida));
      (v.trecho.anomalias || []).forEach((a, i) => doc.linha('Anomalia ' + (i + 1), `${rot('anomalia_trecho', a.tipo)}${a.texto ? ' — ' + a.texto : ''} · ${a.lat}, ${a.lng}`));
      if (!(v.trecho.anomalias || []).length) doc.linha('Anomalias', 'Nenhuma');
    }
    doc.secao('Identificação e acesso');
    doc.linha('CS', nomeCs); doc.linha('Endereço', v.endereco);
    doc.linha('Posição', `${v.lat}, ${v.lng}${v.gps_precisao ? ' ±' + v.gps_precisao + ' m' : ''}${fl.gps_distancia_m != null ? ' · ' + fl.gps_distancia_m + ' m do cadastro' : ''}`);
    doc.linha('Situação no cadastro', rot('situacao_cadastro', v.situacao_cadastro));
    if (v.gps_justificativa) doc.linha('Justificativa GPS', v.gps_justificativa);
    doc.linha('Conseguiu abrir', sn(v.abriu));
    if (v.abriu === 'nao') doc.linha('Motivo', `${rot('motivo_nao_abriu', v.motivo_nao_abriu)}${v.motivo_nao_abriu_texto ? ' — ' + v.motivo_nao_abriu_texto : ''}`);
    doc.secao('Solo e tampa');
    doc.linha('Solo no entorno', rot('solo_entorno', v.solo_entorno));
    doc.linha('Tampa', `${v.tampa_tipo || '—'} · ${rot('tampa_estado', v.tampa_estado)} · identificação ${rot('tampa_identificacao', v.tampa_identificacao)}`);
    if (v.abriu === 'sim') {
      doc.secao('Interior e dutos');
      doc.linha('Água / limpeza', `${rot('agua', v.agua)} · ${rot('limpeza', v.limpeza)}`);
      doc.linha('Assoreamento', `${rot('assoreamento', v.assoreamento)} · terra pelos dutos: ${sn(v.terra_dutos)} · infiltração: ${sn(v.infiltracao)}`);
      doc.linha('Estrutura', rot('estrutura', v.estrutura));
      doc.linha('Dutos', `${v.dutos_entradas} entradas · ${v.dutos_ocupadas} ocupadas · ${v.dutos_vagas} vagas · tamponamento ${sn(v.tamponamento)}`);
      doc.linha('Profundidade', `${v.profundidade_cm} cm${fl.fora_criterio === true ? ' — FORA DO CRITÉRIO' : fl.fora_criterio === false ? ' — dentro do critério' : ''}`);
      doc.secao('Cabos, organização e emenda');
      doc.linha('Cabos', `${v.cabos_qtd}: ${(v.cabos || []).map(c => c.operadora === 'nao_identificado' ? 'não identificado' : c.operadora).join(', ') || '—'}`);
      doc.linha('Bate com o cenário', `${sn(v.cabos_batem)}${(v.cabos_divergencias || []).length ? ' — ' + v.cabos_divergencias.map(x => rot('cabos_divergencia', x)).join(', ') : ''}`);
      doc.linha('Organização', `fixação ${sn(v.fixacao)} · reserva ${rot('reserva', v.reserva)} · ${rot('organizacao', v.organizacao)}`);
      doc.linha('Emenda', sn(v.emenda_existe));
      if (v.emenda_existe === 'sim') {
        doc.linha('Caixa de emenda', `${rot('emenda_caixa', v.emenda_caixa)} · ${rot('emenda_fixacao', v.emenda_fixacao)} · ${rot('emenda_submersa', v.emenda_submersa)} · vedação ${rot('emenda_vedacao', v.emenda_vedacao)}`);
        doc.linha('Emenda aberta', `${sn(v.emenda_aberta)}${v.emenda_aberta === 'sim' ? ' · autorizado por ' + v.emenda_autorizado_por + ' · técnico ' + v.emenda_tecnico : ''}`);
      }
    }
    doc.secao('Conclusão');
    doc.linha('Conclusão', rot('conclusao', v.conclusao)); doc.linha('Prioridade', rot('prioridade', v.prioridade));
    if (v.observacao) doc.linha('Observação', v.observacao);
    const fotos = (v.fotos || []).filter(f => f.tipo_foto !== 'ficha_pdf');
    doc.secao(`Fotos (${fotos.length})`);
    await gradeFotos(doc, fotos.map(f => ({ ...f, src: (fotosLocais[f.id_foto] || {}).thumb })), f => {
      const i = L.foto(f.tipo_foto) || {};
      return `${i.n || ''}. ${i.rot || f.tipo_foto}${f.flag_suspeita ? ' (SUSPEITA)' : ''} · ${SN.dt(f.data_hora_captura)}`;
    });
    rodape(doc, `Ficha gerada no aparelho em ${SN.dt(SN.agora())} · vistoria ${v.id_vistoria}`);
    return SN.pdfDataUrl(doc);
  };

  // Ficha do apontamento de produção (aérea): rota, produção do dia, acumulado e fotos.
  SN.vst.pdfApontamento = async (a, rota, acumulado, fotosLocais) => {
    const doc = SN.novoPdf(`Preventiva aérea · ${a.tipo === 'final' ? 'Apontamento final' : 'Apontamento parcial'} · ${rota.id_rota}`); if (!doc) return null;
    doc.secao('Rota');
    doc.linha('Rota', `${rota.id_rota} · ${rota.cidade} · ${rota.regiao || ''}`);
    doc.linha('Motivo / solicitante', `${rota.motivo} · ${rota.solicitante}`);
    if (rota.notificacao) doc.linha('Notificação', rota.notificacao);
    doc.linha('Prestador / técnico', `${rota.prestador} · ${a.tecnico || ''}`);
    if (rota.id_chamado) doc.linha('Chamado', rota.id_chamado);
    doc.linha('Metros previstos', SN.num(rota.metros_previstos) + ' m');
    if (rota.kmz_url) doc.linha('KMZ', rota.kmz_url);
    doc.secao(`Produção do apontamento (${a.tipo === 'final' ? 'FINALIZADO' : 'parcial'}) · ${SN.vst.dia(a.data)}`);
    L.producao_aerea.forEach(c => doc.linha(c.rot, SN.num(Number(a[c.k]) || 0, c.k === 'cordoalha' ? 1 : 0)));
    if (a.observacao) doc.linha('Observação', a.observacao);
    if (acumulado) {
      doc.secao('Acumulado da rota (com este apontamento)');
      L.producao_aerea.forEach(c => doc.linha(c.rot, SN.num(Number(acumulado[c.k]) || 0, c.k === 'cordoalha' ? 1 : 0)));
      if (Number(rota.metros_previstos)) doc.linha('% da rota', Math.round(1000 * (Number(acumulado.metros) || 0) / Number(rota.metros_previstos)) / 10 + '%');
    }
    const fotos = (a.fotos || []).filter(f => f.tipo_foto !== 'ficha_pdf');
    if (fotos.length) {
      doc.secao(`Fotos (${fotos.length})`);
      await gradeFotos(doc, fotos.map(f => ({ ...f, src: (fotosLocais[f.id_foto] || {}).thumb })), f => `${SN.dt(f.data_hora_captura)}${f.endereco ? ' · ' + f.endereco : ''}`);
    }
    rodape(doc, `Ficha gerada no aparelho em ${SN.dt(SN.agora())} · apontamento ${a.id_apontamento}`);
    return SN.pdfDataUrl(doc);
  };

  const rodape = (doc, txt) => {
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) { doc.setPage(p); doc.setFontSize(7); doc.setTextColor(120); doc.text(`${txt} · página ${p}/${n}`, 12, 292); }
    doc.setFontSize(9.5); doc.setTextColor(29, 38, 20);
  };
  SN.vst.pdfRodape = rodape;
  SN.vst.pdfGradeFotos = gradeFotos;
})();

// ═══════════════ Resumo da rota e relatório da diretoria (PDF sob demanda) ═══════════════
// Mesmas contas das telas (vistoria-regras.js): o resumo conta tudo o que a rota
// tem (com o status de cada item); a diretoria conta só o APROVADO na subterrânea,
// como o Dashboard. Sem fotos: elas estão nas fichas de cada CS/apontamento.
(() => {
  const L = VR_LISTAS;
  const rot = (lista, v) => (v == null || v === '') ? '—' : L.rotulo(lista, v);
  const stRota = s => (L.status_rota[s] || {}).rot || s || '—';
  const stRev = s => ({ APROVADA: 'Aprovada', REJEITADA: 'Rejeitada', AGUARDANDO_REVISAO: 'Aguardando revisão', RASCUNHO: 'Rascunho' })[s] || s || '—';
  // Tabela simples: colunas com largura em mm; quebra página e repete o cabeçalho.
  const tabela = (doc, cab, linhas, larg) => {
    const x0 = 12, alt = 5.2;
    const desenharCab = () => { doc.setFillColor(242, 247, 232); doc.rect(10, doc._y - 4, 190, 6, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      let x = x0; cab.forEach((c, i) => { doc.text(String(c), x, doc._y); x += larg[i]; }); doc.setFont('helvetica', 'normal'); doc._y += alt + .6; };
    if (doc._y > 270) { doc.addPage(); doc._y = 18; }
    desenharCab();
    linhas.forEach(l => {
      const partes = l.map((v, i) => doc.splitTextToSize(String(v == null || v === '' ? '—' : v), larg[i] - 2));
      const h = Math.max(...partes.map(p => p.length)) * 4.2;
      if (doc._y + h > 284) { doc.addPage(); doc._y = 18; desenharCab(); }
      let x = x0; partes.forEach((p, i) => { doc.text(p, x, doc._y); x += larg[i]; }); doc._y += h + 1;
    });
    if (!linhas.length) { doc.text('Nenhum registro.', x0, doc._y); doc._y += alt; }
    doc.setFontSize(9.5); doc._y += 2;
  };
  const lpuTxt = lpu => Object.entries(lpu || {}).filter(([, q]) => Number(q))
    .map(([cod, q]) => `${cod} × ${SN.num(q, cod === 'SEV0009' ? 1 : 0)}${(SN.itemLpu && SN.itemLpu(cod)) ? ' (' + SN.itemLpu(cod).desc + ')' : ''}`).join('; ') || '—';

  // Resumo de UMA rota: dados, andamento, o que foi aprovado e a LPU que a rota gera.
  SN.vst.pdfResumoRota = async (rota, d, config, conversa) => {
    const aerea = rota.segmento === 'AEREA';
    const doc = SN.novoPdf(`Preventiva ${aerea ? 'aérea' : 'subterrânea'} · Resumo da rota ${rota.id_rota}`); if (!doc) return null;
    doc.secao('Rota');
    doc.linha('Rota / status', `${rota.id_rota} · ${stRota(rota.status)}`);
    doc.linha('Onde', aerea ? `${rota.cidade || ''}${rota.regiao ? ' · ' + rota.regiao : ''}` : `${rota.cidade || ''} · Cluster ${rota.cluster || '—'} · previsto ${SN.num(Math.round((Number(rota.extensao_km) || 0) * 1000))} m`);
    if (aerea) {
      doc.linha('Motivo / solicitante', `${rota.motivo || '—'} · ${rota.solicitante || '—'}`);
      if (rota.notificacao) doc.linha('Notificação', rota.notificacao);
      doc.linha('Metros previstos', SN.num(rota.metros_previstos) + ' m');
    }
    doc.linha('Prestador / técnico', `${rota.prestador || '—'} · ${rota.tecnico || 'qualquer técnico do prestador'}`);
    doc.linha('Data planejada', SN.vst.dia(rota.data_planejada));
    if (rota.id_chamado) doc.linha('Chamado', rota.id_chamado);
    if (aerea) {
      const aps = (d.producao || []).filter(a => a.id_rota === rota.id_rota).sort((a, b) => String(a.data).localeCompare(String(b.data)));
      const r = VR.resumoChamadoAereo(rota, d.producao || []), tudo = VR.producaoRota(rota, d.producao || []);
      doc.secao('Andamento');
      doc.linha('Apontamentos', `${aps.length} (${aps.filter(a => a.status_revisao === 'APROVADA').length} aprovados · ${r.pendentes} aguardando revisão · ${aps.filter(a => a.status_revisao === 'REJEITADA').length} rejeitados)`);
      doc.linha('Finalizada pela equipe', tudo.finalizada ? 'Sim' : 'Não');
      doc.linha('% dos metros previstos', tudo.pct != null ? tudo.pct + '%' : '—');
      doc.linha('Pronta para concluir', r.pronto ? 'Sim — tudo aprovado' : 'Não');
      doc.secao('Produção aprovada (base de pagamento)');
      L.producao_aerea.forEach(c => doc.linha(c.rot, SN.num(Number(r.totais[c.k]) || 0, c.k === 'cordoalha' ? 1 : 0)));
      doc.linha('LPU gerada', lpuTxt(r.lpu_sugerida));
      doc.secao('Apontamentos');
      tabela(doc, ['Data', 'Tipo', 'Metros', 'Postes', 'Cordoalha', 'Plaquetas', 'Caixas', 'Revisão'],
        aps.map(a => [SN.vst.dia(a.data), a.tipo === 'final' ? 'Final' : 'Parcial', SN.num(a.metros), SN.num(a.postes), SN.num(a.cordoalha, 1), SN.num(a.plaquetas), SN.num(a.caixas), stRev(a.status_revisao)]),
        [22, 18, 20, 18, 22, 22, 18, 50]);
    } else {
      const vs = (d.vistorias || []).filter(v => v.id_rota === rota.id_rota && v.status_revisao && v.status_revisao !== 'RASCUNHO');
      const r = VR.resumoChamado(rota, d.vistorias || []), c = VR.conformidade(vs).total, p = VR.passivos(vs, config), dv = VR.divergencias(vs).total;
      doc.secao('Andamento');
      doc.linha('CS', `${(rota.cs_planejadas || []).length} planejadas · ${vs.length} enviadas · ${r.cs_aprovadas} aprovadas · ${r.pendentes} pendentes de revisão`);
      doc.linha('Aprovadas', `${r.cs_abertas} abertas · ${r.cs_nao_abertas} não abertas`);
      doc.linha('Pronta para concluir', r.pronto ? 'Sim — todas as CS aprovadas' : 'Não');
      const mc = VR.metrosCampoRota(rota, d.vistorias || [], { todas: true });
      doc.linha('Metragem previsto (base/KMZ)', SN.num(mc.previsto_m) + ' m');
      doc.linha('Metragem de campo (GPS do técnico)', `${SN.num(mc.metros)} m${mc.origem === 'previsto' ? ' (sem GPS: rateio do previsto)' : ''}${mc.sem_gps.length ? ' · sem GPS: ' + mc.sem_gps.join(', ') : ''} · aprovado: ${SN.num(r.metros)} m`);
      doc.linha('LPU gerada', lpuTxt(r.lpu_sugerida));
      doc.secao('Conformidade (só aprovadas)');
      doc.linha('Conforme', `${c.conforme} (${c.pct_conforme}%)`);
      doc.linha('Com ressalva', `${c.ressalva} (${c.pct_ressalva}%)`);
      doc.linha('Não conforme', `${c.nao_conforme} (${c.pct_nao_conforme}%)`);
      doc.secao('Passivos e divergências (só aprovadas)');
      [['Tampas a trocar', p.total.tampas_trocar], ['CS alagadas', p.total.cs_alagadas], ['CS assoreadas', p.total.cs_assoreadas],
        ['Dutos rasos', p.profundidade_definida ? p.total.dutos_rasos : 'profundidade mínima a definir'], ['Cabos não identificados', p.total.cabos_nao_identificados],
        ['CS com cabo excedente', p.total.cs_cabo_excedente], ['CS fora do cadastro', p.total.cs_fora_cadastro], ['Posição divergente', dv.posicao_divergente],
        ['Não consta no cadastro', dv.nao_consta], ['Cabos divergentes', dv.cabos_divergentes]]
        .forEach(([k, v]) => doc.linha(k, typeof v === 'number' ? SN.num(v) : v));
      doc.secao('CS da rota');
      // Distância da CS anterior: GPS do técnico, na sequência contínua da rota (a mesma da medição),
      // não na ordem das abas. CS sem GPS vão para o fim.
      const seqCampo = VR.metrosCampoRota(rota, vs, { todas: true }), dist = {}, pos = {};
      (seqCampo.trechos || []).forEach(t => { dist[t.id_vistoria] = t.metros; });
      (seqCampo.sequencia || []).forEach((id, i) => { pos[id] = i; });
      vs.sort((a, b) => (pos[a.id_vistoria] != null ? pos[a.id_vistoria] : 1e9) - (pos[b.id_vistoria] != null ? pos[b.id_vistoria] : 1e9) || (Number(a.ordem) || 0) - (Number(b.ordem) || 0));
      tabela(doc, ['Aba', 'CS', 'Da anterior', 'Abriu', 'Conclusão', 'Prioridade', 'Revisão', 'Revisor'],
        vs.map(v => [v.ordem, v.cs_nova ? 'fora do cadastro' : v.id_cs, dist[v.id_vistoria] != null ? SN.num(dist[v.id_vistoria]) + ' m' : (v.lat == null || v.lat === '' ? 'sem GPS' : '—'),
          v.abriu === 'sim' ? 'Sim' : v.abriu === 'nao' ? 'Não' : '—', rot('conclusao', v.conclusao), rot('prioridade', v.prioridade), stRev(v.status_revisao), v.revisor || '']),
        [10, 32, 20, 12, 34, 22, 28, 32]);
    }
    if (conversa && SN.conversa) await SN.conversa.pdfSecao(doc, conversa);
    SN.vst.pdfRodape(doc, `Resumo gerado em ${SN.dt(SN.agora())} · rota ${rota.id_rota}`);
    return doc;
  };

  // Relatório da diretoria: aérea do mês escolhido + diligência subterrânea (acumulado, só aprovadas).
  SN.vst.pdfDiretoria = async (d, config, mes, hojeIso) => {
    const doc = SN.novoPdf(`Preventiva · Relatório da diretoria · ${SN.mesNome(mes)}`); if (!doc) return null;
    const cfg = VR.normalizarConfig(config);
    // Aérea
    const rotasA = d.rotas.filter(r => r.segmento === 'AEREA'), aps = d.producao || [], dm = VR.diasAereaMes(mes, cfg, hojeIso);
    const k = VR.kpiAereo(rotasA, aps, mes, cfg, { diasTrabalhados: dm.dias }), t = k.total;
    doc.secao(`Preventiva aérea · ${SN.mesNome(mes)}`);
    doc.linha('Percorrido no mês', `${SN.num(t.metros)} m de ${SN.num(k.meta_m)} m (${k.pct_meta ?? 0}% da meta)`);
    doc.linha('Aprovado (pagamento)', SN.num(k.aprovado.metros) + ' m');
    doc.linha('Dias trabalhados', `${k.dias_trabalhados}${dm.salvo != null ? ' (informado)' : ' (dias corridos do calendário)'}`);
    doc.linha('Média por dia / projeção', `${SN.num(k.media_dia_m)} m/dia · projeção ${SN.num(k.projecao_m)} m (${k.projecao_m >= k.meta_m ? 'no ritmo da meta' : 'abaixo da meta'})`);
    doc.linha('Falta para a meta', SN.num(k.falta_m) + ' m');
    doc.linha('Produção', `${t.rotas} rotas · ${SN.num(t.postes)} postes · ${SN.num(t.cordoalha)} m de cordoalha · ${SN.num(t.plaquetas)} plaquetas · ${SN.num(t.caixas)} caixas/CEO · sobra ${SN.num(t.sobra)}`);
    const ord = o => Object.keys(o).map(n => [n, o[n]]).sort((a, b) => b[1].metros - a[1].metros);
    doc.secao('Aérea · por equipe');
    tabela(doc, ['Equipe', 'Rotas', 'Metros', '% do mês', 'Postes', 'Plaquetas'],
      ord(k.por.equipe).map(([n, o]) => [n, o.rotas, SN.num(o.metros), (t.metros ? Math.round(1000 * o.metros / t.metros) / 10 : 0) + '%', SN.num(o.postes), SN.num(o.plaquetas)]), [60, 20, 30, 26, 24, 26]);
    doc.secao('Aérea · por região');
    tabela(doc, ['Região', 'Rotas', 'Metros'], ord(k.por.regiao).map(([n, o]) => [n, o.rotas, SN.num(o.metros)]), [100, 30, 40]);
    // Subterrânea
    const rotasS = d.rotas.filter(r => r.segmento !== 'AEREA'), vs = d.vistorias || [];
    const c = VR.conformidade(vs), p = VR.passivos(vs, cfg), dv = VR.divergencias(vs), med = VR.medicao(vs, rotasS), km = VR.kmPorCluster(rotasS, vs, cfg);
    doc.secao('Diligência subterrânea · acumulado (só CS aprovadas)');
    doc.linha('CS aprovadas', `${SN.num(c.total.total)} · ${vs.filter(v => v.status_revisao === 'AGUARDANDO_REVISAO').length} aguardando revisão`);
    doc.linha('Conformidade', `conforme ${c.total.pct_conforme}% · com ressalva ${c.total.pct_ressalva}% · não conforme ${c.total.pct_nao_conforme}%`);
    doc.secao('Passivos quantificados');
    [['Tampas a trocar', p.total.tampas_trocar], ['CS alagadas', p.total.cs_alagadas], ['CS assoreadas', p.total.cs_assoreadas],
      ['Dutos rasos', p.profundidade_definida ? p.total.dutos_rasos : 'profundidade mínima a definir'], ['Cabos não identificados', p.total.cabos_nao_identificados],
      ['CS com cabo excedente', p.total.cs_cabo_excedente], ['CS fora do cadastro', p.total.cs_fora_cadastro]].forEach(([k2, v]) => doc.linha(k2, typeof v === 'number' ? SN.num(v) : v));
    doc.secao('Divergências cadastro × campo');
    [['Posição divergente', dv.total.posicao_divergente], ['Não consta no cadastro', dv.total.nao_consta], ['Cabos divergentes', dv.total.cabos_divergentes],
      ['Caixa não cadastrada', dv.total.caixa_no_trecho]].forEach(([k2, v]) => doc.linha(k2, SN.num(v)));
    doc.secao('Conformidade e km por cluster');
    tabela(doc, ['Cluster', 'CS', 'Conforme', 'Ressalva', 'Não conf.', 'km vistoriado', 'Meta km', '% meta'],
      Object.keys({ ...c.por_cluster, ...km }).sort().map(n => { const x = c.por_cluster[n] || {}, y = km[n] || {};
        return [n, x.total || 0, (x.pct_conforme || 0) + '%', (x.pct_ressalva || 0) + '%', (x.pct_nao_conforme || 0) + '%', SN.num(y.km_vistoriado || 0, 3),
          y.meta_km != null ? SN.num(y.meta_km, 3) : '—', y.pct_meta != null ? y.pct_meta + '%' : '—']; }),
      [34, 14, 22, 20, 20, 28, 24, 20]);
    doc.secao('Medição por prestador (só aprovadas)');
    tabela(doc, ['Prestador', 'CS aprovadas', 'Previsto (m)', 'Campo (m)'], med.linhas.map(x => [x.prestador, x.cs_aprovadas, SN.num(x.previsto_m), SN.num(x.metros)]).concat([['Total', med.total_cs, SN.num(med.total_previsto_m), SN.num(med.total_metros)]]), [80, 34, 34, 34]);
    SN.vst.pdfRodape(doc, `Relatório gerado em ${SN.dt(SN.agora())} · SigoNet · Preventiva`);
    return doc;
  };
})();
