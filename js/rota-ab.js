// SIGONET V2 — "Gerar KMZ pelo ponto A e B" (pedido de 2026-10-15).
//
// Onde o SigoNet pede para anexar KMZ (Retirada, Melhoria, Preventiva aérea, Transformar em rota, Mapa da
// Preventiva) há um botão ao lado do "Anexar": informa-se o ponto A e o ponto B (link do Google Maps ou
// lat/long), o SigoNet segue os cabos lançados do GeoGrid (SN.rede, só liderança) e mostra os metros de rota,
// as caixas no caminho e a previsão de postes. "Usar este KMZ" entrega o arquivo ao campo de anexo da própria
// tela, como se o usuário tivesse escolhido o arquivo: o envio ao Drive e a medição continuam os de sempre.
//
// Uso na tela: SN.rotaAB.botao('#fKmz') ao lado do <input type="file">. O input recebe .rotaAB (o resumo).
(() => {
  const esc = SN.esc, A = window.ROTA_AB, R = window.REDE;
  const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const carregarJsZip = () => window.JSZip ? Promise.resolve() : new Promise((ok, falha) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = ok; s.onerror = () => falha(new Error('Compactador indisponível (sem internet?).')); document.head.appendChild(s); });
  const nomeArq = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w .-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const kpi = (rot, val, sub) => `<div class="kpi"><div class="rot">${rot}</div><div class="val">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;

  // Rede das cidades onde estão os pontos (a cidade do formulário primeiro). Mais de uma: junta.
  const redeDosPontos = async (a, b, cidade) => {
    const ind = await SN.rede.indice();
    if (!ind) throw new Error('A rede do GeoGrid ainda não foi importada (menu Rede GeoGrid).');
    const nomes = A.cidadesDosPontos(ind, [a, b], cidade).slice(0, 6);
    if (!nomes.length) throw new Error('Nenhuma cidade da rede do GeoGrid cobre esses pontos. Confira as coordenadas.');
    const lista = []; for (const n of nomes) { try { lista.push(await SN.rede.cidade(n)); } catch (e) { } }
    if (!lista.length) throw new Error('Não consegui carregar a rede de ' + nomes.join(', ') + '.');
    return { d: lista.length === 1 ? lista[0] : Object.assign(R.juntar(lista), { cidade: lista.map(x => x.cidade).join(' + ') }), nomes: lista.map(x => x.cidade) };
  };

  const kmzBlob = async (nome, a, b, r) => {
    await carregarJsZip(); const z = new JSZip(); z.file('doc.kml', A.kml(nome, a, b, r));
    return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz', compression: 'DEFLATE' });
  };

  const resumoTxt = r => `Rota A→B pela rede: ${SN.num(r.metros)} m · ${r.caixas.length} caixa(s) no caminho · previsão de ${SN.num(r.postes)} poste(s)`;

  SN.rotaAB = {
    botao: (seletorInput, cidade) => `<button type="button" class="btn" data-rotaab="${esc(seletorInput)}"${cidade ? ` data-cidade="${esc(cidade)}"` : ''}>Gerar KMZ pelo ponto A e B</button>`,
    resumoTxt,

    abrir: async ({ cidade, input, nome }) => {
      if (!SN.rede || !A || !R) return SN.toast('Rede do GeoGrid indisponível nesta tela.', 'erro');
      const st = { a: '', b: '', vao: 40, r: null, pa: null, pb: null };
      let mapa = null;
      const corpo = `<p class="small muted" style="margin-top:0">Cole o <b>link do Google Maps</b> ou a <b>lat, long</b> de cada ponta. O SigoNet segue os cabos lançados do GeoGrid de A até B, gera o KMZ do trecho e calcula os metros, as caixas e os postes.</p>
        <div class="linha-form">
          <div class="campo" style="flex:2"><label>Ponto A *</label><input class="inp" id="abA" placeholder="https://www.google.com/maps/… ou -22.9707, -46.9958"></div>
          <div class="campo" style="flex:2"><label>Ponto B *</label><input class="inp" id="abB" placeholder="https://www.google.com/maps/… ou -22.9668, -46.9905"></div>
          <div class="campo" style="flex:0 0 130px"><label>Vão médio (m)</label><input class="inp" id="abVao" type="number" min="10" max="120" value="40"></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button type="button" class="btn prim" id="abCalc">Calcular rota pela rede</button><span class="small muted" id="abInfo"></span></div>
        <div id="abRes" style="margin-top:12px"></div>
        <div id="abMapa" style="height:340px;margin-top:10px;border-radius:10px;display:none"></div>`;

      const desenhar = async m => {
        const el = SN.$('#abMapa', m); el.style.display = '';
        try { await SN.vst.carregarLeaflet(); } catch (e) { el.innerHTML = '<div class="aviso alerta small">Mapa indisponível (sem internet?).</div>'; return; }
        if (mapa) { mapa.remove(); mapa = null; }
        const r = st.r, sat = L.tileLayer(SAT, { maxNativeZoom: 19, maxZoom: 21, attribution: 'Imagens © Esri' }), ruas = L.tileLayer(OSM, { maxNativeZoom: 19, maxZoom: 21, attribution: '© OpenStreetMap' });
        mapa = L.map(el, { layers: [ruas] }); L.control.layers({ Ruas: ruas, 'Satélite': sat }).addTo(mapa);
        const linha = L.polyline(r.pts, { color: '#d32f2f', weight: 5 }).addTo(mapa);
        [[st.pa, 'A'], [st.pb, 'B']].forEach(([p, t]) => L.marker([p.lat, p.lng], { title: 'Ponto ' + t }).bindTooltip('Ponto ' + t, { permanent: true, direction: 'top' }).addTo(mapa));
        r.caixas.forEach(c => L.circleMarker([c.lat, c.lng], { radius: 6, weight: 2, color: '#fff', fillColor: c.cor || '#f5a623', fillOpacity: 1 })
          .bindPopup(`<b>${esc(c.n || 'Caixa')}</b><br>${esc((R.TIPOS_CAIXA[c.tipo] || {}).rot || '')}<br>a ${SN.num(c.em)} m do ponto A`).addTo(mapa));
        mapa.fitBounds(linha.getBounds().pad(0.15));
        setTimeout(() => mapa && mapa.invalidateSize(), 100);
      };

      const pintarRes = m => {
        const r = st.r, el = SN.$('#abRes', m); if (!r) { el.innerHTML = ''; return; }
        const tipos = Object.entries(r.porTipo).map(([t, n]) => `${n} ${esc((R.TIPOS_CAIXA[t] || {}).rot || t)}`).join(' · ');
        const lig = [r.ligA > 20 ? `o ponto A está a ${SN.num(r.ligA)} m do cabo mais perto` : '', r.ligB > 20 ? `o ponto B está a ${SN.num(r.ligB)} m do cabo mais perto` : ''].filter(Boolean);
        el.innerHTML = `<div class="kpis-fin">
            ${kpi('Metros de rota', SN.num(r.metros) + ' m', 'pelos cabos lançados')}
            ${kpi('Caixas no caminho', SN.num(r.caixas.length), 'CEO/CTO do GeoGrid a até 15 m')}
            ${kpi('Previsão de postes', SN.num(r.postes), `vão médio de ${SN.num(r.vao)} m`)}
            ${kpi('Cabos percorridos', SN.num(r.cabos.length), esc(st.nomes.join(', ')))}
          </div>
          ${lig.length ? `<div class="aviso alerta small" style="margin-top:8px">Atenção: ${esc(lig.join(' e '))} — esse pedaço está fora da rede e entra na conta em linha reta.</div>` : ''}
          <div class="small" style="margin-top:8px"><b>Cabos:</b> ${esc(r.cabos.join(' → ')) || '—'}</div>
          ${r.caixas.length ? `<div class="small" style="margin-top:4px"><b>Caixas:</b> ${tipos}</div>
            <div class="small muted" style="margin-top:2px">${r.caixas.map(c => `${esc(c.n || 'caixa')} (${SN.num(c.em)} m)`).join(' · ')}</div>` : ''}
          <div class="small muted" style="margin-top:6px">Postes são previsão pelo vão médio: confira no satélite.</div>`;
      };

      const calcular = async m => {
        const pa = A.lerPonto(SN.$('#abA', m).value), pb = A.lerPonto(SN.$('#abB', m).value), vao = Number(SN.$('#abVao', m).value) || 40;
        if (pa.erro) return SN.toast('Ponto A: ' + (pa.erro === 'vazio' ? 'informe o link ou a lat, long.' : pa.erro), 'erro');
        if (pb.erro) return SN.toast('Ponto B: ' + (pb.erro === 'vazio' ? 'informe o link ou a lat, long.' : pb.erro), 'erro');
        const info = SN.$('#abInfo', m); info.textContent = 'Carregando a rede do GeoGrid…';
        try {
          const { d, nomes } = await redeDosPontos(pa, pb, cidade);
          info.textContent = 'Calculando o caminho…'; await new Promise(ok => setTimeout(ok, 20));
          const r = A.calcular(d, pa, pb, { vao });
          if (r.erro) { st.r = null; pintarRes(m); info.textContent = ''; return SN.toast(r.erro, 'erro'); }
          Object.assign(st, { r, pa, pb, vao, nomes }); info.textContent = `A: ${pa.lat}, ${pa.lng} · B: ${pb.lat}, ${pb.lng}`;
          pintarRes(m); desenhar(m);
        } catch (e) { info.textContent = ''; SN.toast(e.message, 'erro'); }
      };

      const arquivo = async () => {
        const n = nomeArq(`Rota A-B ${nome || cidade || ''} ${st.r.metros}m`) || 'Rota A-B';
        return new File([await kmzBlob(n, st.pa, st.pb, st.r)], n + '.kmz', { type: 'application/vnd.google-earth.kmz' });
      };
      const precisa = () => { if (!st.r) { SN.toast('Calcule a rota primeiro.', 'erro'); return false; } return true; };

      await SN.modal({ titulo: 'Gerar KMZ pelo ponto A e B', largo: true, corpo,
        aoAbrir: m => {
          SN.$('#abCalc', m).onclick = () => calcular(m);
          ['#abA', '#abB'].forEach(s => SN.$(s, m).onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); calcular(m); } });
          SN.$('#abA', m).focus();
        },
        botoes: [{ rot: 'Cancelar', valor: null },
          { rot: 'Baixar KMZ', acao: async () => { if (!precisa()) return false; const f = await arquivo(), a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return false; } },
          { rot: 'Usar este KMZ', cls: 'prim', acao: async () => {
            if (!precisa()) return false;
            let f; try { f = await arquivo(); } catch (e) { SN.toast(e.message, 'erro'); return false; }
            if (input) {
              input.rotaAB = { metros: st.r.metros, caixas: st.r.caixas.length, porTipo: st.r.porTipo, postes: st.r.postes, vao: st.r.vao, cabos: st.r.cabos, a: st.pa, b: st.pb, txt: resumoTxt(st.r) };
              const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files;
              setTimeout(() => input.dispatchEvent(new Event('change', { bubbles: true })), 0);
            }
            return true;
          } }] });
      if (mapa) { mapa.remove(); mapa = null; }
    }
  };

  // Um clique em qualquer botão data-rotaab abre o gerador para o input indicado.
  document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-rotaab]'); if (!b) return;
    ev.preventDefault();
    const input = document.querySelector(b.dataset.rotaab);
    const campoCidade = document.querySelector('[data-f="cidade"], [data-t="cidade"]');
    SN.rotaAB.abrir({ input, cidade: b.dataset.cidade || (campoCidade && campoCidade.value) || '' });
  });
})();
