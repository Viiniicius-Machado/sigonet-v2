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
  // Quem pode responder: OEM → cargo OEM, Gerente, Gestor ou Encarregado; NOC → quem tem a tela Esteira ou é Gerente/Gestor/Encarregado.
  SN.podeValidar = c => {
    const u = SN.usuario(); if (!u || u.tipo !== 'lideranca') return false;
    if (SN.validadorDe(c) === 'OEM') return u.cargo === 'OEM' || SN.podeAprovar(); // O&M: cargo OEM, Gerente, Gestor ou Encarregado
    return SN.temTela('chamados') || SN.podeAprovar();
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
  // Endereço do jeito que vem do O&M/Elleven ("RUA MARIO OLIVO, 411,PQ FLORENCE,VALINHOS - VALINHOS")
  // em partes: rua, número, bairro e cidade (a busca do OpenStreetMap não acha o texto inteiro).
  const ABREV = [[/^R\.?\s+/i, 'Rua '], [/^AV\.?\s+/i, 'Avenida '], [/^AL\.?\s+/i, 'Alameda '], [/^ESTR?\.?\s+/i, 'Estrada '], [/^ROD\.?\s+/i, 'Rodovia '],
    [/^TV\.?\s+/i, 'Travessa '], [/^PC\.?\s+|^PCA\.?\s+/i, 'Praça '], [/^PQ\.?\s+/i, 'Parque '], [/^JD\.?\s+/i, 'Jardim '], [/^VL\.?\s+/i, 'Vila '], [/^CH\.?\s+/i, 'Chácara '], [/^RES\.?\s+/i, 'Residencial ']];
  const expandir = s => ABREV.reduce((t, [re, por]) => t.replace(re, por), String(s || '').trim());
  SN.partesEndereco = (endereco, cidade) => {
    const partes = String(endereco || '').split(/\s*,\s*|\s+-\s+/).map(s => s.trim()).filter(Boolean);
    const norm = s => SN.normal ? SN.normal(s) : String(s).toLowerCase();
    const cid = cidade || (partes.length > 1 ? partes[partes.length - 1] : '');
    let rua = '', num = '', bairro = '';
    partes.forEach(p => {
      if (cid && norm(p) === norm(cid)) return;
      if (!num && /^(n[º°o.]?\s*)?\d+[a-z]?$/i.test(p)) { num = p.replace(/\D+$/, '').replace(/^\D+/, ''); return; }
      if (!rua) { const m = p.match(/^(.*\D)\s+(\d+)$/); if (m && !num) { rua = m[1]; num = m[2]; } else rua = p; return; }
      if (!bairro && !/^(sp|brasil)$/i.test(p)) bairro = p;
    });
    return { rua: expandir(rua), num, bairro: expandir(bairro), cidade: String(cid || '').trim() };
  };
  // Tentativas da mais precisa para a mais aproximada.
  SN.buscasEndereco = (endereco, cidade) => {
    const e = SN.partesEndereco(endereco, cidade), c = e.cidade, out = [];
    if (e.rua && c) { if (e.num) out.push({ p: { street: e.num + ' ' + e.rua, city: c }, fonte: 'endereço' }); out.push({ p: { street: e.rua, city: c }, fonte: e.num ? 'endereço (rua, sem o número)' : 'endereço' }); }
    if (e.rua) out.push({ p: { q: [e.rua, e.num, e.bairro, c].filter(Boolean).join(', ') }, fonte: 'endereço' });
    if (e.bairro && c) out.push({ p: { q: e.bairro + ', ' + c }, fonte: 'aproximada (bairro)' });
    if (c) out.push({ p: { city: c, state: 'São Paulo' }, fonte: 'aproximada (centro da cidade)' }, { p: { city: c }, fonte: 'aproximada (centro da cidade)' });
    return out;
  };
  const geoCache = () => { try { return JSON.parse(localStorage.getItem('sigonet_v2_geo_end') || '{}'); } catch (e) { return {}; } };
  SN.destinoDoChamado = async c => {
    const p = SN.coordsDoLink(c.gps); if (p) return { ...p, fonte: 'link do mapa' };
    if (!c.endereco && !c.cidade) return null;
    const chave = (c.endereco || '') + '|' + (c.cidade || ''), cache = geoCache();
    if (cache[chave]) return cache[chave];
    for (const b of SN.buscasEndereco(c.endereco, c.cidade)) {
      try {
        const qs = Object.entries(b.p).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
        const r = await (await tempo('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&countrycodes=br&accept-language=pt-BR&' + qs, 8000)).json();
        // Só vale resultado na cidade do chamado (bairro com o mesmo nome existe em outras cidades).
        const n = s => SN.normal ? SN.normal(s || '') : String(s || '').toLowerCase(), cid = n(SN.partesEndereco(c.endereco, c.cidade).cidade);
        const achou = (r || []).find(x => { const a = x.address || {}; return !cid || [a.city, a.town, a.village, a.municipality, a.city_district].some(v => v && n(v) === cid); });
        if (achou) {
          const d = { lat: Number(achou.lat), lng: Number(achou.lon), fonte: b.fonte };
          try { const k = Object.keys(cache); if (k.length > 300) delete cache[k[0]]; cache[chave] = d; localStorage.setItem('sigonet_v2_geo_end', JSON.stringify(cache)); } catch (e) { }
          return d;
        }
      } catch (e) { if (e && e.name === 'TimeoutError') break; }
      await new Promise(ok => setTimeout(ok, 1000)); // regra do OpenStreetMap: 1 busca por segundo
    }
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
