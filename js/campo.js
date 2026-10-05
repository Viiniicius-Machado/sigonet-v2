// SIGONET V2 — jornada em campo do chamado (corretiva):
//   • Previsão de chegada: ao iniciar o deslocamento o app pega o GPS do técnico e
//     calcula a rota de carro até o cliente (OpenStreetMap/OSRM, grátis, sem trânsito).
//     O destino sai do link do mapa do chamado (lat,lng) ou do endereço (Nominatim).
//     O Maps/Waze abrem só para navegar (não devolvem a previsão para o site).
//   • Validação em campo: no local, o técnico pede validação; quem valida é o NOC
//     (ou o O&M, quando a origem do chamado é OEM). Enquanto isso ele preenche a RFO;
//     só conclui depois de validado. "Ainda com falha" volta para ele com o motivo.
//   • MTTR, SLA e Tempo em campo terminam na hora do pedido de validação que foi ACEITO
//     (não na hora da resposta). "Ainda com falha" = o tempo segue até um novo pedido aceito.
//     A espera pela resposta do NOC/O&M vira o indicador "Espera de validação" (tempo ocioso).
//     Chamado sem validação (antigos, Preventiva): termina na conclusão técnica.
(() => {
  // ─────────── Validação ───────────
  SN.VALIDACAO_ST = {
    PEDIDA: { rot: 'Aguardando validação', cls: 'alerta' },
    VALIDADA: { rot: 'Validado', cls: 'ok' },
    FALHA: { rot: 'Ainda com falha', cls: 'erro' }
  };
  SN.validadorDe = c => c && c.origem === 'OEM' ? 'OEM' : 'NOC';
  SN.nomeValidador = c => SN.validadorDe(c) === 'OEM' ? 'O&M' : 'NOC';
  // Chamado de corretiva (não Preventiva) precisa de validação para concluir.
  SN.exigeValidacao = c => !!c && !SN.ehPlanejada(c);
  SN.validado = c => !!(c && c.validacao && c.validacao.status === 'VALIDADA');
  // Quem pode responder: OEM → cargo OEM, Gerente, Gestor ou Encarregado; NOC → quem tem a tela Chamados.
  SN.podeValidar = c => {
    const u = SN.usuario(); if (!u || u.tipo !== 'lideranca') return false;
    if (SN.validadorDe(c) === 'OEM') return u.cargo === 'OEM' || SN.podeAprovar(); // O&M: cargo OEM, Gerente, Gestor ou Encarregado
    return SN.temTela('chamados');
  };
  SN.aguardandoValidacao = c => !!(c && c.validacao && c.validacao.status === 'PEDIDA' && ['EM_CAMPO', 'DEVOLVIDO'].includes(c.status));
  SN.pedirValidacao = (c, obs) => {
    const ag = SN.agora(), v = c.validacao || {};
    c.validacao = { status: 'PEDIDA', pedidaEm: ag, pedidaPor: (SN.usuario() || {}).nome || c.tecnico, obs: obs || '', validador: SN.validadorDe(c),
      pedidos: (v.pedidos || 0) + 1, falhas: v.falhas || 0, esperaMin: v.esperaMin || 0 }; // a espera dos pedidos anteriores continua somando
    c.tempos.validacaoPedida = ag; delete c.tempos.validacao;
    SN.hist(c, 'Pedido de validação', `${SN.nomeValidador(c)}${obs ? ' · ' + obs : ''}${c.validacao.pedidos > 1 ? ' (' + c.validacao.pedidos + 'º pedido)' : ''}`);
  };
  SN.responderValidacao = (c, ok, motivo) => {
    const ag = SN.agora(), u = SN.usuario() || {};
    const v = c.validacao = { ...(c.validacao || {}), status: ok ? 'VALIDADA' : 'FALHA', respondidaEm: ag, respondidaPor: u.nome || '', motivo: ok ? '' : motivo };
    v.esperaMin = (v.esperaMin || 0) + (SN.min(v.pedidaEm, ag) || 0); // tempo ocioso esperando a resposta
    if (ok) c.tempos.validacao = ag; else v.falhas = (v.falhas || 0) + 1;
    SN.hist(c, ok ? 'Validado' : 'Validação: ainda com falha', `${SN.nomeValidador(c)}${ok ? '' : ' · ' + motivo}`);
    SN.log(ok ? 'VALIDAR_CAMPO' : 'VALIDACAO_FALHA', c.id, motivo || '');
  };
  // Fila de pedidos (NOC ou O&M) com os botões de resposta.
  SN.filaValidacao = validador => SN.db.chamados.filter(c => SN.aguardandoValidacao(c) && SN.validadorDe(c) === validador && SN.podeValidar(c))
    .sort((a, b) => String(a.validacao.pedidaEm).localeCompare(String(b.validacao.pedidaEm)));
  SN.htmlFilaValidacao = (validador, comLink) => {
    const l = SN.filaValidacao(validador); if (!l.length) return '';
    return `<div class="card" style="margin-bottom:14px;border-left:4px solid var(--alerta,#d97706)"><div class="card-tit"><h3>🛎 Pedidos de validação em campo (${l.length})</h3>
      <span class="small muted">o técnico está no local aguardando · ${validador === 'OEM' ? 'chamados de origem OEM' : 'validação do NOC'}</span></div>
      <div class="tabela-wrap"><table class="tab"><thead><tr><th>Chamado</th><th>Cliente</th><th>Técnico</th><th>Pediu</th><th>Esperando</th><th></th></tr></thead><tbody>
      ${l.map(c => `<tr><td class="mono">${comLink ? `<a href="#/chamado/${SN.esc(c.id)}">${SN.esc(c.id)}</a>` : SN.esc(c.id)}</td>
        <td>${SN.esc(c.cliente || '')}<div class="small muted">${[c.etiqueta, c.validacao.obs].filter(Boolean).map(SN.esc).join(' · ')}</div></td>
        <td>${SN.esc(SN.nomeExibicao(c.tecnico || ''))}<div class="small muted">${SN.esc(c.empresa || '')}</div></td>
        <td class="nowrap">${SN.hora(c.validacao.pedidaEm)}${c.validacao.pedidos > 1 ? `<div class="small muted">${c.validacao.pedidos}º pedido</div>` : ''}</td>
        <td class="nowrap">${SN.dur(SN.min(c.validacao.pedidaEm, SN.agora()))}</td>
        <td class="nowrap"><button class="btn sm ok" data-val-ok="${SN.esc(c.id)}">✔ Validado</button> <button class="btn sm perigo" data-val-falha="${SN.esc(c.id)}">Ainda com falha</button></td></tr>`).join('')}
      </tbody></table></div></div>`;
  };
  SN.ligarValidacao = raiz => {
    const acao = (sel, ok) => SN.$$(sel, raiz).forEach(b => b.onclick = async ev => {
      ev.stopPropagation();
      const id = b.dataset.valOk || b.dataset.valFalha, c = SN.db.chamados.find(x => x.id === id);
      if (!c || !SN.aguardandoValidacao(c)) { SN.toast('Este pedido já foi respondido.', 'erro'); return SN.render(); }
      let motivo = '';
      if (!ok) { motivo = await SN.pedirTexto('Ainda com falha · ' + c.id, 'O que ainda não está funcionando? (o técnico recebe esta mensagem)'); if (!motivo) return; }
      else if (!await SN.confirmar('Validar ' + c.id, `Confirmar que o serviço de <b>${SN.esc(c.cliente || '')}</b> está normalizado? O técnico fica liberado para concluir.`, 'Validado', 'ok')) return;
      SN.responderValidacao(c, ok, motivo); SN.salvar(); SN.toast(ok ? 'Validado: o técnico pode concluir.' : 'Enviado ao técnico: ainda com falha.', 'ok'); SN.render();
    });
    acao('[data-val-ok]', true); acao('[data-val-falha]', false);
  };

  // ─────────── Previsão de chegada ───────────
  // Coordenada do cliente: lat,lng dentro do link do mapa (q=, @, /place/, ll=, texto) ou do endereço.
  SN.coordsDoLink = txt => {
    const s = decodeURIComponent(String(txt || ''));
    const m = s.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/) || s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (!m) return null;
    const lat = Number(m[1]), lng = Number(m[2]);
    return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  };
  const tempo = (url, ms) => fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined });
  SN.destinoDoChamado = async c => {
    const p = SN.coordsDoLink(c.gps); if (p) return { ...p, fonte: 'link do mapa' };
    const q = [c.endereco, c.cidade, 'Brasil'].filter(Boolean).join(', ');
    if (!c.endereco) return null;
    try {
      const r = await (await tempo('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&accept-language=pt-BR&q=' + encodeURIComponent(q), 8000)).json();
      if (r && r[0]) return { lat: Number(r[0].lat), lng: Number(r[0].lon), fonte: 'endereço' };
    } catch (e) { }
    return null;
  };
  SN.gpsAgora = () => new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(p => res({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) }), () => res(null), { timeout: 12000, enableHighAccuracy: true, maximumAge: 60000 });
  });
  // Rota de carro (OSRM público). Devolve { distancia_m, duracao_s } ou null.
  SN.rotaCarro = async (o, d) => {
    try {
      const r = await (await tempo(`https://router.project-osrm.org/route/v1/driving/${o.lng},${o.lat};${d.lng},${d.lat}?overview=false`, 10000)).json();
      if (r && r.code === 'Ok' && r.routes && r.routes[0]) return { distancia_m: Math.round(r.routes[0].distance), duracao_s: Math.round(r.routes[0].duration) };
    } catch (e) { }
    return null;
  };
  // Calcula e grava c.deslocamento. Nunca bloqueia o deslocamento: sem GPS/rota, fica sem previsão.
  SN.calcularPrevisao = async c => {
    const [origem, destino] = await Promise.all([SN.gpsAgora(), SN.destinoDoChamado(c)]);
    const ag = SN.agora(), d = { calculadoEm: ag, origem, destino, fonte: 'OpenStreetMap (sem trânsito)' };
    if (!origem) d.erro = 'sem GPS do técnico';
    else if (!destino) d.erro = 'sem localização do cliente (link do mapa ou endereço)';
    else {
      const r = await SN.rotaCarro(origem, destino);
      if (!r) d.erro = 'não foi possível calcular a rota agora';
      else Object.assign(d, r, { previsaoChegada: new Date(Date.now() + r.duracao_s * 1000).toISOString() });
    }
    c.deslocamento = d;
    return d;
  };
  SN.linkNavegar = (c, app) => {
    const d = (c.deslocamento && c.deslocamento.destino) || SN.coordsDoLink(c.gps);
    if (app === 'waze') return d ? `https://waze.com/ul?ll=${d.lat},${d.lng}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent([c.endereco, c.cidade].filter(Boolean).join(', '))}&navigate=yes`;
    return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${d ? d.lat + ',' + d.lng : encodeURIComponent([c.endereco, c.cidade].filter(Boolean).join(', '))}`;
  };
  SN.appNavegar = () => { try { return localStorage.getItem('sigonet_v2_nav') || 'maps'; } catch (e) { return 'maps'; } };
  SN.definirAppNavegar = a => { try { localStorage.setItem('sigonet_v2_nav', a); } catch (e) { } };
  // Texto curto da previsão (gestão e técnico). atrasado: passou da hora prevista sem chegar.
  SN.previsaoInfo = c => {
    const d = c.deslocamento; if (!d) return null;
    if (!d.previsaoChegada) return { txt: 'Previsão indisponível' + (d.erro ? ' (' + d.erro + ')' : ''), cls: '', semPrevisao: true };
    const chegou = c.tempos && c.tempos.chegada, atraso = SN.min(d.previsaoChegada, chegou || SN.agora());
    const km = d.distancia_m != null ? SN.num(d.distancia_m / 1000, 1) + ' km' : '';
    if (chegou) return { txt: `previsto ${SN.hora(d.previsaoChegada)} · chegou ${SN.hora(chegou)}${atraso > 0 ? ' (+' + SN.dur(atraso) + ')' : ''}`, cls: atraso > 15 ? 'alerta' : 'ok', km, atraso };
    return { txt: `chega ~${SN.hora(d.previsaoChegada)}`, sub: `${km} · ${SN.dur(Math.round(d.duracao_s / 60))} de carro`, cls: atraso > 0 ? 'erro' : 'info', atrasado: atraso > 0, km, atraso };
  };
})();
