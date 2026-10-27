// SIGONET V2 — Portal de Gestão · aba "Desempenho por prestador" (27/10/2026)
// Comparação de todos os prestadores e da NTT (equipe própria) que baixam atividade pelo SigoNet:
// volume, SLA, tempos (MTTA, deslocamento, no local, MTTR), quilometragem da rota, valor da LPU
// (só prestador tem valor; a NTT aparece em hora-homem) e o detalhe por técnico de cada empresa.
// Atividade baixada = chamado com conclusão técnica no mês (corretiva ou planejada), nos filtros do Portal.
//   Deslocamento = toque em "Deslocamento" → "Cheguei" (sem o toque, fica fora da média)
//   No local     = "Cheguei" → conclusão técnica
//   Km           = rota de carro calculada no início do deslocamento (OpenStreetMap)
//   Pontualidade = chegou até 15 min depois da previsão de chegada
SN.DESEMP_FOLGA_MIN = 15;
SN.desempenho = ({ concl, lpusMes }) => {
  const nova = () => ({ tecs: {}, n: 0, corr: 0, plan: 0, improd: 0, d: 0, f: 0, mtta: [], desl: [], local: [], mttr: [], km: [], pont: 0, comPrev: 0,
    hh: 0, lanc: 0, aprov: 0, pago: 0, reprov: 0, obras: new Set() });
  const porEmp = {}, porTec = {};
  const somar = (o, c, m) => {
    const t = c.tempos || {};
    o.n++; if (SN.ehPlanejada(c)) o.plan++; else o.corr++; if (SN.ehImprodutiva(c)) o.improd++;
    if (m.sla === true) o.d++; if (m.sla === false) o.f++;
    o.mtta.push(m.mtta); o.mttr.push(m.mttr);
    o.desl.push(t.deslocamento ? SN.min(t.deslocamento, t.chegada) : null); o.local.push(SN.min(t.chegada, t.conclusaoTecnica));
    const dz = c.deslocamento || {};
    if (dz.distancia_m) o.km.push(dz.distancia_m / 1000);
    if (dz.previsaoChegada && t.chegada) { o.comPrev++; if (new Date(t.chegada) - new Date(dz.previsaoChegada) <= SN.DESEMP_FOLGA_MIN * 60000) o.pont++; }
    if (SN.empresa(c.empresa).vinculo === 'CLT') o.hh += SN.horaHomem(c, 'titular').horas;
  };
  concl.forEach(c => {
    const m = SN.metricas(c), emp = c.empresa || '—', tec = c.tecnico || '—';
    const e = porEmp[emp] = porEmp[emp] || nova(); e.tecs[tec] = true; somar(e, c, m);
    const x = porTec[emp + '|' + tec] = porTec[emp + '|' + tec] || Object.assign(nova(), { emp, tec }); somar(x, c, m);
  });
  // LPU do ciclo (a mesma regra do Financeiro): reprovada não entra no lançado
  const APROV = ['CONTABILIZADA', 'EM_PAGAMENTO', 'PAGA'];
  lpusMes.forEach(l => {
    const emp = l.cab.empresa || '—', tec = l.cab.tecnico || '—', v = SN.valorLpu(l);
    [porEmp[emp] = porEmp[emp] || nova(), porTec[emp + '|' + tec] = porTec[emp + '|' + tec] || Object.assign(nova(), { emp, tec })].forEach(o => {
      if (l.status === 'REPROVADA') { o.reprov++; return; }
      o.lanc += v; if (APROV.includes(l.status)) o.aprov += v; if (l.status === 'PAGA') o.pago += v; o.obras.add(l.chamadoId || l.id);
    });
  });
  const fechar = o => ({ ...o, ntec: Object.keys(o.tecs).length, sla: o.d + o.f ? o.d / (o.d + o.f) : null,
    mMtta: SN.media(o.mtta), mDesl: SN.media(o.desl), mLocal: SN.media(o.local), mMttr: SN.media(o.mttr), mKm: SN.media(o.km), kmTot: o.km.reduce((s, k) => s + k, 0),
    pontPct: o.comPrev ? o.pont / o.comPrev : null, ticket: o.obras.size ? o.lanc / o.obras.size : null });
  const empresas = Object.entries(porEmp).map(([e, o]) => ({ e, vinc: SN.empresa(e).vinculo || '', ...fechar(o) })).sort((a, b) => b.n - a.n || b.lanc - a.lanc);
  const tecnicos = Object.values(porTec).map(fechar).sort((a, b) => b.n - a.n || b.lanc - a.lanc);
  return { empresas, tecnicos };
};

SN.VINCULO_ROT = { CLT: 'NTT · equipe própria', PRESTADOR: 'Prestador', CONTRATO_FIXO: 'Contrato fixo' };
SN.htmlDesempenho = (ctx, sel) => {
  const { empresas, tecnicos } = SN.desempenho(ctx);
  const pct = v => v == null ? '—' : SN.num(v * 100) + '%';
  const selo = v => v == null ? '—' : `<span class="badge ${v >= .9 ? 'ok' : v >= .7 ? 'alerta' : 'erro'}">${pct(v)}</span>`;
  const nomeEmp = e => e === 'NETTURBO' ? 'NETTURBO (NTT)' : e;
  const temValor = x => x.vinc === 'PRESTADOR';
  const tot = k => empresas.reduce((s, x) => s + (x[k] || 0), 0);
  const mediaPond = (k, peso) => { const xs = empresas.filter(x => x[k] != null); const p = xs.reduce((s, x) => s + x[peso].filter(v => v != null).length, 0);
    return p ? xs.reduce((s, x) => s + x[k] * x[peso].filter(v => v != null).length, 0) / p : null; };
  const det = sel && empresas.find(x => x.e === sel);
  const linhaTec = t => `<tr><td>${SN.esc(SN.nomeExibicao(t.tec))}</td><td class="num nowrap">${t.n}</td><td class="num nowrap">${t.improd}</td><td class="num nowrap">${selo(t.sla)}</td>
    <td class="num nowrap">${SN.dur(t.mMtta)}</td><td class="num nowrap">${SN.dur(t.mDesl)}</td><td class="num nowrap">${t.mKm == null ? '—' : SN.num(t.mKm, 1) + ' km'}</td><td class="num nowrap">${pct(t.pontPct)}</td>
    <td class="num nowrap">${SN.dur(t.mLocal)}</td><td class="num nowrap">${SN.dur(t.mMttr)}</td>
    <td class="num nowrap">${temValor(det) ? SN.brl(t.lanc) : SN.num(t.hh, 1) + ' h·h'}</td></tr>`;
  const html = `
    <div class="kpis-fin">
      <div class="kpi destaque"><div class="rot">Empresas com atividade</div><div class="val">${empresas.filter(x => x.n).length}</div><div class="sub">prestadores e NTT que baixaram atividade no mês</div></div>
      <div class="kpi"><div class="rot">Atividades baixadas</div><div class="val">${tot('n')}</div><div class="sub">${tot('corr')} corretivas · ${tot('plan')} planejadas · ${tot('improd')} improdutivas</div></div>
      <div class="kpi"><div class="rot">Deslocamento médio</div><div class="val">${SN.dur(mediaPond('mDesl', 'desl'))}</div><div class="sub">toque em "Deslocamento" → "Cheguei" · ${SN.num(tot('kmTot'))} km de rota no mês</div></div>
      <div class="kpi"><div class="rot">Tempo médio no local</div><div class="val">${SN.dur(mediaPond('mLocal', 'local'))}</div><div class="sub">"Cheguei" → conclusão técnica</div></div>
      <div class="kpi"><div class="rot">LPU dos prestadores</div><div class="val">${SN.brl(empresas.filter(temValor).reduce((s, x) => s + x.lanc, 0))}</div><div class="sub">lançado no ciclo (reprovadas fora) · pago ${SN.brl(empresas.filter(temValor).reduce((s, x) => s + x.pago, 0))}</div></div>
      <div class="kpi"><div class="rot">Hora-homem NTT</div><div class="val">${SN.num(empresas.filter(x => x.vinc === 'CLT').reduce((s, x) => s + x.hh, 0), 1)}</div><div class="sub">equipe própria: (deslocamento + no local) × pessoas</div></div>
    </div>
    <div class="card" style="margin-top:14px"><div class="card-tit"><h3>Desempenho por empresa</h3><span class="muted small">clique numa empresa para ver cada técnico</span><button class="btn sm" id="bRelDesemp">Exportar</button></div>
      <div class="tabela-wrap"><table class="tab small"><thead><tr><th>Empresa</th><th class="num">Técnicos</th><th class="num">Atividades</th><th class="num" title="Atividades ÷ técnicos">Por técnico</th><th class="num">Improdutivas</th><th class="num">SLA</th>
        <th class="num" title="Despacho → chegada (só corretivas)">MTTA</th><th class="num" title="Toque em Deslocamento → Cheguei">Deslocamento</th><th class="num" title="Rota de carro calculada no início do deslocamento">Km médio</th>
        <th class="num" title="Chegou até ${SN.DESEMP_FOLGA_MIN} min depois da previsão">Pontualidade</th><th class="num" title="Cheguei → conclusão técnica">No local</th><th class="num" title="Abertura → fim do atendimento (só corretivas)">MTTR</th>
        <th class="num" title="LPU lançada no ciclo (prestador) · hora-homem (NTT)">LPU / h·h</th><th class="num">Pago</th><th class="num" title="Lançado ÷ obras">Ticket médio</th><th class="num">LPU reprovadas</th></tr></thead><tbody>
      ${empresas.map(x => `<tr class="clic ${x.e === sel ? 'sel' : ''}" data-desemp="${SN.esc(x.e)}"><td><b>${SN.esc(nomeEmp(x.e))}</b><div class="small muted">${SN.esc(SN.VINCULO_ROT[x.vinc] || x.vinc || '—')}</div></td>
        <td class="num nowrap">${x.ntec}</td><td class="num nowrap"><b>${x.n}</b></td><td class="num nowrap">${x.ntec ? SN.num(x.n / x.ntec, 1) : '—'}</td><td class="num nowrap">${x.improd}</td><td class="num nowrap">${selo(x.sla)}</td>
        <td class="num nowrap">${SN.dur(x.mMtta)}</td><td class="num nowrap">${SN.dur(x.mDesl)}</td><td class="num nowrap">${x.mKm == null ? '—' : SN.num(x.mKm, 1) + ' km'}</td><td class="num nowrap">${pct(x.pontPct)}</td>
        <td class="num nowrap">${SN.dur(x.mLocal)}</td><td class="num nowrap">${SN.dur(x.mMttr)}</td>
        <td class="num nowrap">${temValor(x) ? '<b>' + SN.brl(x.lanc) + '</b>' : x.vinc === 'CLT' ? SN.num(x.hh, 1) + ' h·h' : '—'}</td><td class="num nowrap">${temValor(x) ? SN.brl(x.pago) : '—'}</td>
        <td class="num nowrap">${temValor(x) && x.ticket != null ? SN.brl(x.ticket) : '—'}</td><td class="num nowrap">${x.reprov || '0'}</td></tr>`).join('') || '<tr><td colspan="16" class="muted center">Nenhuma atividade baixada no mês com esses filtros.</td></tr>'}
      </tbody></table></div>
      <p class="small muted" style="margin:8px 0 0">Valor só para prestador (LPU lançada no ciclo). A NTT (equipe própria) aparece em hora-homem. MTTA e MTTR contam só corretivas; Preventiva, Melhoria e Retirada entram em atividades, deslocamento, no local e SLA (prazo da rota).</p></div>
    ${det ? `<div class="card" style="margin-top:14px" id="cardDesempDet"><div class="card-tit"><h3>${SN.esc(nomeEmp(det.e))} · por técnico</h3><a href="javascript:void 0" data-desemp="">fechar</a></div>
      <div class="tabela-wrap"><table class="tab small"><thead><tr><th>Técnico</th><th class="num">Atividades</th><th class="num">Improdutivas</th><th class="num">SLA</th><th class="num">MTTA</th><th class="num">Deslocamento</th><th class="num">Km médio</th><th class="num">Pontualidade</th><th class="num">No local</th><th class="num">MTTR</th><th class="num">${temValor(det) ? 'LPU lançada' : 'h·h'}</th></tr></thead><tbody>
      ${tecnicos.filter(t => t.emp === det.e).map(linhaTec).join('') || '<tr><td colspan="11" class="muted center">Sem técnicos.</td></tr>'}
      </tbody></table></div></div>` : ''}
    <div class="grid g3" style="margin-top:14px">
      <div class="card"><h3>Atividades por empresa</h3>${SN.barras(empresas.filter(x => x.n).map(x => [nomeEmp(x.e), x.n]))}</div>
      <div class="card"><h3>LPU lançada por prestador</h3>${SN.barras(empresas.filter(x => temValor(x) && x.lanc).map(x => [x.e, x.lanc]), v => 'R$ ' + SN.num(v))}</div>
      <div class="card"><h3>Deslocamento médio por empresa</h3>${SN.barras(empresas.filter(x => x.mDesl != null).sort((a, b) => b.mDesl - a.mDesl).map(x => [nomeEmp(x.e), Math.round(x.mDesl)]), v => SN.dur(v))}</div>
    </div>`;
  const ligar = (aoEscolher, mes) => {
    SN.$$('[data-desemp]').forEach(el => el.onclick = () => aoEscolher(el.dataset.desemp === sel ? '' : el.dataset.desemp));
    const b = SN.$('#bRelDesemp');
    if (b) b.onclick = () => SN.exportar('desempenho_prestadores_' + mes, empresas.map(x => ({ Empresa: x.e, Vinculo: SN.VINCULO_ROT[x.vinc] || x.vinc, Tecnicos: x.ntec, Atividades: x.n,
      Corretivas: x.corr, Planejadas: x.plan, Improdutivas: x.improd, SLA_pct: x.sla == null ? '' : Math.round(x.sla * 100),
      MTTA_min: x.mMtta == null ? '' : Math.round(x.mMtta), Deslocamento_min: x.mDesl == null ? '' : Math.round(x.mDesl), KmMedio: x.mKm == null ? '' : +x.mKm.toFixed(1), KmTotal: +x.kmTot.toFixed(1),
      Pontualidade_pct: x.pontPct == null ? '' : Math.round(x.pontPct * 100), NoLocal_min: x.mLocal == null ? '' : Math.round(x.mLocal), MTTR_min: x.mMttr == null ? '' : Math.round(x.mMttr),
      LpuLancada: temValor(x) ? +x.lanc.toFixed(2) : '', LpuAprovada: temValor(x) ? +x.aprov.toFixed(2) : '', LpuPaga: temValor(x) ? +x.pago.toFixed(2) : '',
      TicketMedio: temValor(x) && x.ticket != null ? +x.ticket.toFixed(2) : '', LpuReprovadas: x.reprov, HoraHomem: x.vinc === 'CLT' ? +x.hh.toFixed(2) : '' })));
    if (sel) { const c = SN.$('#cardDesempDet'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  };
  return { html, ligar };
};
