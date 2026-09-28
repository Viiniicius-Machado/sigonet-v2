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
    doc.linha('Rota', `${rota.id_rota} · ${rota.cidade || ''} · Cluster ${rota.cluster} · ${rota.extensao_km} km`);
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
