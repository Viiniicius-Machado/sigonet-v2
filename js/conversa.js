// SIGONET V2 — Conversa da atividade (técnico ↔ gestão, no lugar do WhatsApp).
//
// Uma conversa por atividade (ref = ID do chamado; a rota da Preventiva usa a do
// chamado dela). Texto, imagem (câmera ou arquivo, ex.: print do projeto) e
// coordenada (digitada ou colada no texto, ou link do Google Maps: vira "abrir no mapa"). O gestor
// chama outras pessoas do cadastro. Tudo fica gravado (servidor/Conversa.gs); na
// hora do PDF o gestor decide se a conversa entra completa, em resumo ou não entra.
//
// Onde aparece: OS do técnico, rota da Preventiva (sub e aérea), tela do chamado,
// janela de acompanhamento ao vivo. O aviso de mensagem nova chega em qualquer tela.
SN.conversa = (() => {
  const C = {}, esc = SN.esc;
  C.disponivel = () => !!SN.remoto;
  const api = (acao, dados, ms) => SN.vst.api(acao, dados, ms || 45000);
  const eu = () => SN.usuario() || {};
  const souGestao = () => eu().tipo === 'lideranca';
  // Ícone de traço do tema (o tema tira os emojis decorativos; data-svg = não mexer).
  const ico = n => SN.iconeSvg ? `<span class="conv-ico" data-svg="1">${SN.iconeSvg(n)}</span>` : '';
  C.ico = ico;

  // ─────────── Lidas (por pessoa, neste aparelho) ───────────
  const chaveLidas = () => 'sigonet_v2_conv_lidas|' + eu().tipo + '|' + eu().nome;
  let lidas = null;
  const lerLidas = () => { if (lidas && lidas._k === chaveLidas()) return lidas; try { lidas = JSON.parse(localStorage.getItem(chaveLidas()) || '{}'); } catch (e) { lidas = {}; } lidas._k = chaveLidas(); return lidas; };
  C.marcarLida = (ref, ts) => {
    const l = lerLidas(); if (!ts || String(l[ref] || '') >= String(ts)) return;
    l[ref] = ts; try { const o = { ...l }; delete o._k; localStorage.setItem(chaveLidas(), JSON.stringify(o)); } catch (e) { }
    pintarSelos();
  };
  // Avisos (última mensagem de outra pessoa por conversa) que ainda não foram lidos.
  C.avisos = {};
  C.naoLida = ref => { const a = C.avisos[ref]; return !!a && String(a.ts) > String(lerLidas()[ref] || ''); };
  C.naoLidas = () => Object.keys(C.avisos).filter(C.naoLida);

  // ─────────── Botão (com selo de não lida) ───────────
  C.botao = (ref, rot = 'Conversa', cls = '') => !ref || !C.disponivel() ? '' :
    `<button type="button" class="btn ${cls}" data-conversa="${esc(ref)}">${ico('conversa')}${esc(rot)}<span class="conv-selo ${C.naoLida(ref) ? '' : 'oculto'}" data-conv-selo="${esc(ref)}">●</span></button>`;
  const pintarSelos = () => SN.$$('[data-conv-selo]').forEach(el => el.classList.toggle('oculto', !C.naoLida(el.dataset.convSelo)));
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-conversa]');
    if (b) { e.preventDefault(); C.abrir(b.dataset.conversa); }
  });

  // Botão flutuante (telas do técnico longas: rota da Preventiva, OS). Some ao trocar de tela.
  C.flutuante = ref => {
    SN.$('#convFab') && SN.$('#convFab').remove();
    if (!ref || !C.disponivel()) return;
    const b = document.createElement('div'); b.id = 'convFab'; b.className = 'conv-fab'; b.dataset.hash = location.hash;
    b.innerHTML = `<button type="button" data-conversa="${esc(ref)}" title="Conversa">${ico('conversa')}<span class="conv-selo ${C.naoLida(ref) ? '' : 'oculto'}" data-conv-selo="${esc(ref)}">●</span></button>`;
    document.body.appendChild(b);
  };
  window.addEventListener('hashchange', () => { const f = SN.$('#convFab'); if (f && f.dataset.hash !== location.hash) f.remove(); });

  // ─────────── Estado de cada conversa aberta ───────────
  const E = {}; // ref → { msgs, ids, desde, conversa, pend: [] }
  const estado = ref => E[ref] || (E[ref] = { msgs: [], ids: new Set(), desde: '', conversa: null, pend: [], carregada: false });
  const juntar = (st, lista) => {
    let novas = 0;
    (lista || []).forEach(m => { if (st.ids.has(m.id_msg)) return; st.ids.add(m.id_msg); st.msgs.push(m); novas++; });
    st.msgs.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    st.pend = st.pend.filter(p => !st.ids.has(p.id_msg));
    if (st.msgs.length) st.desde = st.msgs[st.msgs.length - 1].ts;
    return novas;
  };
  C.ler = async ref => {
    const st = estado(ref);
    const r = await api('CONV_LER', { ref, desde: st.desde || undefined });
    if (!r.ok) throw Object.assign(new Error(r.erro), { resp: r });
    st.conversa = r.conversa; st.carregada = true;
    return { st, novas: juntar(st, r.mensagens) };
  };

  // ─────────── Anexos: imagem, PDF, KMZ/KML ───────────
  C.ACEITA = 'image/*,.pdf,application/pdf,.kmz,.kml';
  C.MAX_BYTES = 15 * 1024 * 1024;
  const tamanho = b => !b ? '' : b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
  const icoAnexo = t => t === 'pdf' ? 'lpu' : t === 'kmz' ? 'planejamento' : 'imagem';
  const lerDataUrl = f => new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => falha(new Error('Não foi possível ler ' + f.name)); r.readAsDataURL(f); });
  // Imagem grande é reduzida (foto do celular); print/projeto até 3 MB vai como está, para não perder detalhe.
  C.lerAnexo = async f => {
    const nome = f.name || 'arquivo', ext = (nome.match(/\.([a-z0-9]+)$/i) || [])[1] || '';
    const tipo = /^image\/(jpeg|png|gif|webp)$/.test(f.type) ? 'imagem' : f.type === 'application/pdf' || /^pdf$/i.test(ext) ? 'pdf' : /^km[lz]$/i.test(ext) ? 'kmz' : '';
    if (!tipo) throw new Error(nome + ': envie imagem, PDF ou KMZ/KML.');
    if (f.size > C.MAX_BYTES) throw new Error(nome + ': arquivo acima de 15 MB.');
    let dataUrl = tipo === 'imagem' && f.size > 3 * 1024 * 1024 ? await SN.comprimirImagem(f) : await lerDataUrl(f);
    const mime = tipo === 'imagem' ? dataUrl.slice(5, dataUrl.indexOf(';')) : tipo === 'pdf' ? 'application/pdf' : /kml$/i.test(ext) ? 'application/vnd.google-earth.kml+xml' : 'application/vnd.google-earth.kmz';
    return { tipo, nome, mime, dataUrl, tamanho: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4) };
  };

  // Respostas rápidas (agilidade em campo: um toque, sem digitar).
  C.RAPIDAS_GESTAO = ['Pode seguir ✅', 'Pule e volte depois', 'Aguarde, vou verificar', 'Mande uma foto', 'Me ligue 📞'];
  C.RAPIDAS_TECNICO = ['Tenho uma dúvida nesta CS', 'Acesso bloqueado', 'Preciso de apoio', 'Ok, entendido 👍'];

  // ─────────── Painel ───────────
  // Monta a conversa dentro de "el". Devolve { parar } para desligar a atualização.
  C._abertas = {}; // conversas na tela agora: não geram aviso
  C._locais = {}; // id_msg → imagem enviada deste aparelho (aparece sem esperar o Drive)
  C.montar = (el, ref) => {
    const st = estado(ref);
    C._abertas[ref] = (C._abertas[ref] || 0) + 1;
    SN.$$(`#convAvisos [data-aviso="${CSS.escape(ref)}"]`).forEach(x => x.remove());
    let vivo = true, timer = null, rolarFim = true;
    el.classList.add('conv');
    el.innerHTML = `
      <div class="conv-topo"><div class="conv-tit"><b>Conversa</b><span class="small muted" data-conv-sub>${esc(ref)}</span></div>
        <button type="button" class="btn sm" data-conv-pessoas>${ico('cadastros')}Pessoas</button></div>
      <div class="conv-lista" data-conv-lista>${SN.carregando('Abrindo a conversa…')}</div>
      <div class="conv-envio">
        <div class="conv-rapidas">${(souGestao() ? C.RAPIDAS_GESTAO : C.RAPIDAS_TECNICO).map(t => `<button type="button" class="chip" data-rapida="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <div class="conv-anexo oculto" data-conv-anexo></div>
        <textarea class="inp" rows="1" placeholder="${'ontouchstart' in window ? 'Escreva uma mensagem…' : 'Escreva, arraste um arquivo ou cole um print (Ctrl+V)…'}" data-conv-txt></textarea>
        <div class="conv-acoes">
          <label class="btn sm" title="Tirar foto"><input type="file" accept="image/*" capture="environment" hidden data-conv-foto>${ico('camera')}</label>
          <label class="btn sm" title="Anexar imagem, PDF ou KMZ (também dá para arrastar para cá ou colar um print)"><input type="file" accept="${C.ACEITA}" multiple hidden data-conv-img>${ico('clipe')}Anexar</label>
          <span style="flex:1"></span>
          <button type="button" class="btn prim" data-conv-enviar>Enviar</button>
        </div>
      </div>
      <div class="conv-soltar">${ico('clipe')}Solte para anexar (imagem, PDF ou KMZ)</div>`;
    const lista = SN.$('[data-conv-lista]', el), txt = SN.$('[data-conv-txt]', el), boxAnexo = SN.$('[data-conv-anexo]', el);
    let anexos = []; // vão junto com o texto (cada anexo a mais vira uma mensagem)
    const pintarAnexo = () => {
      boxAnexo.classList.toggle('oculto', !anexos.length);
      boxAnexo.innerHTML = anexos.map((a, i) => `<span class="conv-chip">${a.tipo === 'imagem' ? `<img src="${a.dataUrl}" alt="">` : ico(icoAnexo(a.tipo))}${esc(a.nome)} <span class="muted">${tamanho(a.tamanho)}</span><button type="button" data-tira="${i}">×</button></span>`).join('')
      SN.$$('[data-tira]', boxAnexo).forEach(b => b.onclick = () => { anexos.splice(Number(b.dataset.tira), 1); pintarAnexo(); });
    };
    lista.addEventListener('scroll', () => { rolarFim = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 60; });

    const pintar = () => {
      if (!vivo) return;
      const me = eu();
      const sub = SN.$('[data-conv-sub]', el);
      if (st.conversa && sub) sub.textContent = st.conversa.titulo || ref;
      const todas = st.msgs.concat(st.pend);
      if (!todas.length) { lista.innerHTML = `<p class="muted small center" style="padding:20px">Nenhuma mensagem ainda. ${souGestao() ? 'Escreva para o técnico ou chame alguém em Pessoas.' : 'Escreva sua dúvida para a gestão.'}</p>`; return; }
      let dia = '';
      lista.innerHTML = todas.map(m => {
        const d = new Date(m.ts || Date.now()).toLocaleDateString('pt-BR'), sep = d !== dia ? `<div class="conv-dia">${esc((dia = d))}</div>` : '';
        if (m.sistema) return sep + `<div class="conv-sis">${esc(m.texto)} · ${SN.hora(m.ts)}</div>`;
        const minha = m.de === me.nome && (m.tipo || 'tecnico') === me.tipo;
        const an = m.anexo || m._anexo || (m.drive_id || m._dataUrl ? { tipo: 'imagem' } : null), ehImg = an && an.tipo === 'imagem';
        // Quem enviou vê a própria imagem na hora (cópia do aparelho); os outros, a miniatura do Drive.
        const local = m._dataUrl || C._locais[m.id_msg];
        const img = !ehImg ? '' : local || (m.drive_id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(m.drive_id)}&sz=w480` : '');
        const grande = !ehImg ? '' : local || (m.drive_id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(m.drive_id)}&sz=w1600` : '');
        const arquivo = an && !ehImg ? `<a class="conv-arq" ${m.url ? `href="${esc(m.url)}" target="_blank" rel="noopener"` : ''}>${ico(icoAnexo(an.tipo))}<span><b>${esc(an.nome || 'arquivo')}</b>
          <small>${an.tipo === 'pdf' ? 'PDF' : 'KMZ/KML'}${an.tamanho ? ' · ' + tamanho(an.tamanho) : ''}${m.url ? ' · abrir' : ''}</small></span></a>` : '';
        const temCoord = m.lat !== '' && m.lat != null && !C.coordNoTexto(m.texto);
        return sep + `<div class="conv-msg ${minha ? 'minha' : ''} ${m.tipo === 'lideranca' ? 'gestao' : ''}">
          ${minha ? '' : `<div class="conv-de">${esc(m.de)}<span>${m.tipo === 'lideranca' ? 'Gestão' : esc(m.empresa || 'Técnico')}</span></div>`}
          ${img ? `<img class="conv-img" src="${img}" alt="" data-conv-ver="${esc(grande)}" data-conv-url="${esc(m.url || '')}" data-conv-nome="${esc((an && an.nome) || 'imagem')}">` : ''}${arquivo}
          ${m.texto ? `<div class="conv-txt">${C.textoComLinks(m.texto)}</div>` : ''}
          ${temCoord ? `<a class="conv-coord" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${m.lat},${m.lng}">${ico('local')}${m.rotulo_coord ? esc(m.rotulo_coord) + ' · ' : ''}${m.lat}, ${m.lng}<span>abrir no mapa</span></a>` : ''}
          <div class="conv-hora">${m._erro ? `<button type="button" class="conv-reenviar" data-reenviar="${esc(m.id_msg)}">⚠ não enviada · tocar para tentar de novo</button>` : m._pend ? '⏳ enviando…' : SN.hora(m.ts)}</div></div>`;
      }).join('');
      SN.$$('[data-conv-ver]', lista).forEach(i => {
        i.onclick = () => SN.verFoto(SN.$$('[data-conv-ver]', lista).map(x => x.dataset.convVer), SN.$$('[data-conv-ver]', lista).indexOf(i));
        // Miniatura não carregou (Drive lento, sem sinal): cartão com o link, nunca um balão vazio.
        const semMiniatura = () => { const a = document.createElement('a'); a.className = 'conv-arq'; if (i.dataset.convUrl) { a.href = i.dataset.convUrl; a.target = '_blank'; a.rel = 'noopener'; }
          a.innerHTML = `${ico('imagem')}<span><b>${esc(i.dataset.convNome)}</b><small>Imagem${i.dataset.convUrl ? ' · abrir' : ' · enviando…'}</small></span>`; i.replaceWith(a); };
        if (i.complete && !i.naturalWidth && i.src) semMiniatura(); else i.onerror = semMiniatura;
      });
      SN.$$('[data-reenviar]', lista).forEach(b => b.onclick = () => { const p = st.pend.find(x => x.id_msg === b.dataset.reenviar); if (p) mandar(p); });
      if (rolarFim) lista.scrollTop = lista.scrollHeight;
      const ultimaOutro = st.msgs.filter(m => !(m.de === me.nome && m.tipo === me.tipo)).pop();
      if (ultimaOutro && document.visibilityState === 'visible') C.marcarLida(ref, ultimaOutro.ts);
    };

    const atualizar = async () => {
      if (!vivo) return;
      clearTimeout(timer);
      try {
        await C.ler(ref);
        pintar();
        st.pend.filter(p => p._erro && !p._tentando).forEach(p => mandar(p)); // sinal voltou: reenvia
      } catch (e) {
        if (!st.carregada) lista.innerHTML = `<div class="aviso ${e.rede ? 'alerta' : 'erro'}">${esc(e.rede ? 'Sem conexão: a conversa abre quando o sinal voltar.' : e.message)}</div>`;
      }
      if (vivo) timer = setTimeout(atualizar, document.visibilityState === 'visible' ? 5000 : 30000);
    };

    const mandar = async p => {
      p._pend = true; p._erro = false; p._tentando = true; pintar();
      try {
        const r = await api('CONV_ENVIAR', { msg: { id_msg: p.id_msg, ref, texto: p.texto, lat: p.lat, lng: p.lng, rotulo_coord: p.rotulo_coord }, dataUrl: p._dataUrl || undefined,
          arquivo: p._anexo ? { nome: p._anexo.nome, tipo: p._anexo.mime } : undefined }, 180000);
        if (!r.ok) { st.pend = st.pend.filter(x => x !== p); SN.toast(r.erro, 'erro'); }
        else { if (p._dataUrl && (!p._anexo || p._anexo.tipo === 'imagem')) C._locais[r.mensagem.id_msg] = p._dataUrl; juntar(st, [r.mensagem]); }
      } catch (e) { p._erro = true; p._pend = false; }
      p._tentando = false; rolarFim = true; pintar();
    };
    const enviar = () => {
      const texto = txt.value.trim();
      if (!texto && !anexos.length) return;
      const coord = C.coordNoTexto(texto); // coordenada digitada/colada: fica gravada na mensagem (PDF e mapa)
      const nova = (extra, an) => ({ id_msg: 'M' + SN.uid() + SN.uid(), ref, ts: SN.agora(), de: eu().nome, tipo: eu().tipo, texto: '', lat: '', lng: '', rotulo_coord: '',
        _dataUrl: an ? an.dataUrl : null, _anexo: an ? { tipo: an.tipo, nome: an.nome, mime: an.mime, tamanho: an.tamanho } : null, _pend: true, ...extra });
      const fila = [nova({ texto, lat: coord ? coord.lat : '', lng: coord ? coord.lng : '' }, anexos[0])]
        .concat(anexos.slice(1).map(a => nova({}, a)));
      st.pend.push(...fila); txt.value = ''; txt.style.height = ''; anexos = []; pintarAnexo();
      (async () => { for (const p of fila) await mandar(p); })(); // na ordem
    };
    SN.$('[data-conv-enviar]', el).onclick = enviar;
    // Resposta rápida: um toque envia (com o anexo, se houver).
    SN.$$('[data-rapida]', el).forEach(b => b.onclick = () => { txt.value = (txt.value.trim() ? txt.value.trim() + ' ' : '') + b.dataset.rapida; enviar(); });
    txt.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); enviar(); } };
    txt.oninput = () => { txt.style.height = ''; txt.style.height = Math.min(140, txt.scrollHeight) + 'px'; };
    const anexar = async files => {
      for (const f of Array.from(files || [])) {
        try { anexos.push(await C.lerAnexo(f)); } catch (e) { SN.toast(e.message, 'erro'); }
      }
      pintarAnexo(); txt.focus();
    };
    SN.$('[data-conv-foto]', el).onchange = e => { const fs = e.target.files; anexar(fs).then(() => { e.target.value = ''; }); };
    SN.$('[data-conv-img]', el).onchange = e => { const fs = e.target.files; anexar(fs).then(() => { e.target.value = ''; }); };
    // Arrastar arquivo para a conversa (computador) e colar print no campo de texto.
    let arrastando = 0;
    const temArquivo = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    el.addEventListener('dragenter', e => { if (!temArquivo(e)) return; e.preventDefault(); arrastando++; el.classList.add('soltando'); });
    el.addEventListener('dragover', e => { if (temArquivo(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    el.addEventListener('dragleave', () => { if (--arrastando <= 0) { arrastando = 0; el.classList.remove('soltando'); } });
    el.addEventListener('drop', e => { if (!temArquivo(e)) return; e.preventDefault(); arrastando = 0; el.classList.remove('soltando'); anexar(e.dataTransfer.files); });
    txt.addEventListener('paste', e => {
      const fs = Array.from((e.clipboardData && e.clipboardData.files) || []);
      if (fs.length) { e.preventDefault(); anexar(fs.map((f, i) => f.name && f.name !== 'image.png' ? f : new File([f], 'print-' + new Date().toTimeString().slice(0, 8).replace(/:/g, '') + (i ? '-' + i : '') + '.png', { type: f.type }))); }
    });
    SN.$('[data-conv-pessoas]', el).onclick = () => pessoas(ref, () => { st.desde = ''; atualizar(); });

    const visivel = () => { if (document.visibilityState === 'visible') atualizar(); };
    document.addEventListener('visibilitychange', visivel);
    if (st.carregada) pintar();
    atualizar();
    return { parar: () => { if (vivo && !--C._abertas[ref]) delete C._abertas[ref]; vivo = false; clearTimeout(timer); document.removeEventListener('visibilitychange', visivel); }, atualizar };
  };

  // Abre a conversa por cima da tela atual (celular: tela cheia; computador: painel lateral).
  C.abrir = ref => {
    if (!C.disponivel()) return SN.toast('A conversa precisa do servidor.', 'erro');
    SN.$('#convPainel') && SN.$('#convPainel').remove();
    const p = document.createElement('div'); p.id = 'convPainel'; p.className = 'conv-painel';
    p.innerHTML = '<div class="conv-caixa"><button type="button" class="conv-x" title="Fechar">✕</button><div data-conv-corpo></div></div>';
    document.body.appendChild(p);
    const m = C.montar(SN.$('[data-conv-corpo]', p), ref);
    const fechar = () => { m.parar(); p.remove(); window.removeEventListener('popstate', voltar); };
    const voltar = () => fechar();
    history.pushState({ conversa: ref }, ''); window.addEventListener('popstate', voltar); // "voltar" do celular fecha
    SN.$('.conv-x', p).onclick = () => history.back();
    p.addEventListener('mousedown', e => { if (e.target === p) history.back(); });
  };

  // ─────────── Coordenada e links no texto ───────────
  // Coordenada digitada ou colada: "-23.5505, -46.6333", "-23,5505 -46,6333" (3+ casas, para não
  // confundir com número comum) ou link do Google Maps (q=, ll=, @lat,lng).
  const RE_URL = /https?:\/\/[^\s<>"']+/g;
  const RE_COORD = /(-?\d{1,2}\.\d{3,})\s*[,;]?\s*(-?\d{1,3}\.\d{3,})|(-?\d{1,2},\d{3,})\s*[;\s]\s*(-?\d{1,3},\d{3,})/g;
  const coordDe = (a, b) => { const lat = Number(String(a).replace(',', '.')), lng = Number(String(b).replace(',', '.'));
    return isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng) ? { lat: +lat.toFixed(6), lng: +lng.toFixed(6) } : null; };
  const coordDeUrl = u => { const m = u.match(/[?&](?:q|ll|query|destination)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) || u.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/); return m ? coordDe(m[1], m[2]) : null; };
  C.coordNoTexto = t => {
    const s = String(t || '');
    for (const u of s.match(RE_URL) || []) { const c = coordDeUrl(u); if (c) return c; }
    RE_COORD.lastIndex = 0;
    const m = RE_COORD.exec(s.replace(RE_URL, ' '));
    return m ? coordDe(m[1] || m[3], m[2] || m[4]) : null;
  };
  // Texto escapado com links: URL clicável e coordenada → "abrir no mapa".
  C.textoComLinks = t => {
    const s = String(t || ''), partes = [];
    let i = 0;
    const achados = [];
    s.replace(RE_URL, (u, pos) => { achados.push({ pos, fim: pos + u.length, url: u }); return u; });
    RE_COORD.lastIndex = 0; let m;
    while ((m = RE_COORD.exec(s))) { const pos = m.index, fim = pos + m[0].length; if (!achados.some(a => pos < a.fim && fim > a.pos)) { const c = coordDe(m[1] || m[3], m[2] || m[4]); if (c) achados.push({ pos, fim, c }); } }
    achados.sort((a, b) => a.pos - b.pos).forEach(a => {
      partes.push(esc(s.slice(i, a.pos)));
      const trecho = s.slice(a.pos, a.fim), c = a.c || (a.url && coordDeUrl(a.url));
      partes.push(c ? `<a class="conv-coord" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${c.lat},${c.lng}">${ico('local')}${a.url ? c.lat + ', ' + c.lng : esc(trecho)}<span>abrir no mapa</span></a>`
        : `<a target="_blank" rel="noopener" href="${esc(a.url)}">${esc(trecho)}</a>`);
      i = a.fim;
    });
    partes.push(esc(s.slice(i)));
    return partes.join('');
  };

  // ─────────── Pessoas e convite ───────────
  const pessoas = async (ref, depois) => {
    const st = estado(ref), cv = st.conversa || {};
    const nomes = new Set((cv.participantes || []).map(p => p.tipo + '|' + p.nome));
    const contatos = !souGestao() ? [] : [
      ...(SN.db.tecnicos || []).filter(t => t.ativo !== false).map(t => ({ nome: t.nome, tipo: 'tecnico', empresa: t.empresa, info: t.empresa })),
      ...(SN.db.lideranca || []).filter(l => l.ativo !== false).map(l => ({ nome: l.nome, tipo: 'lideranca', empresa: '', info: l.cargo || 'Liderança' }))
    ].filter(p => !nomes.has(p.tipo + '|' + p.nome) && !(p.nome === eu().nome && p.tipo === eu().tipo)).sort((a, b) => a.nome.localeCompare(b.nome));
    const linha = p => `<li>${esc(p.nome)} <span class="small muted">${esc(p.info || (p.tipo === 'lideranca' ? 'Gestão' : p.empresa || ''))}</span></li>`;
    const r = await SN.modal({ titulo: 'Pessoas na conversa', largo: false,
      corpo: `<div class="small muted">Também participam os técnicos da atividade e a gestão com acesso a chamados/Preventiva.</div>
        ${(cv.gestores || []).length ? `<h4 style="margin-top:10px">Gestão que já escreveu</h4><ul class="conv-pessoas">${cv.gestores.map(n => linha({ nome: n, tipo: 'lideranca' })).join('')}</ul>` : ''}
        <h4 style="margin-top:10px">Convidados</h4>${(cv.participantes || []).length ? `<ul class="conv-pessoas">${cv.participantes.map(p => linha({ ...p, info: (p.empresa || 'Liderança') + ' · convidado por ' + p.por })).join('')}</ul>` : '<p class="small muted">Ninguém convidado.</p>'}
        ${souGestao() ? `<h4 style="margin-top:14px">Chamar para a conversa</h4><input class="inp" id="pQ" placeholder="Buscar no cadastro (nome, empresa, cargo)…">
          <div class="conv-contatos" id="pLista">${contatos.map((p, i) => `<label data-busca="${esc(SN.normal(p.nome + ' ' + p.info))}"><input type="checkbox" value="${i}"> ${esc(p.nome)} <span class="small muted">${esc(p.info)}</span></label>`).join('') || '<p class="small muted">Todos do cadastro já estão na conversa.</p>'}</div>` : ''}`,
      botoes: souGestao() ? [{ rot: 'Fechar', valor: null }, { rot: 'Chamar selecionados', cls: 'prim', acao: f => {
        const sel = SN.$$('#pLista input:checked', f).map(i => contatos[Number(i.value)]);
        if (!sel.length) { SN.toast('Marque quem chamar.', 'erro'); return false; }
        return sel;
      } }] : [{ rot: 'Fechar', valor: null }],
      aoAbrir: f => { const q = SN.$('#pQ', f); if (q) q.oninput = () => { const t = SN.normal(q.value); SN.$$('#pLista label', f).forEach(l => l.classList.toggle('oculto', !!t && !l.dataset.busca.includes(t))); }; } });
    if (!r) return;
    try {
      const x = await SN.vst.exec('CONV_CONVIDAR', { ref, pessoas: r.map(p => ({ nome: p.nome, tipo: p.tipo, empresa: p.empresa })) });
      st.conversa = x.conversa; SN.toast(r.length === 1 ? r[0].nome + ' foi chamado para a conversa.' : r.length + ' pessoas chamadas para a conversa.', 'ok');
      depois && depois();
    } catch (e) { SN.toast(e.message, 'erro'); }
  };

  // ─────────── Avisos em qualquer tela ───────────
  let timerAvisos = null, avisados = {}, donoAvisos = '';
  const card = (ref, a) => {
    let area = SN.$('#convAvisos'); if (!area) { area = document.createElement('div'); area.id = 'convAvisos'; area.className = 'conv-avisos'; document.body.appendChild(area); }
    SN.$$(`[data-aviso="${CSS.escape(ref)}"]`, area).forEach(x => x.remove());
    const d = document.createElement('div'); d.className = 'conv-aviso'; d.dataset.aviso = ref;
    d.innerHTML = `<div class="small muted">${ico('conversa')}${esc(a.titulo || ref)}</div><div><b>${esc(a.de)}:</b> ${esc(a.texto)}</div>
      <div style="display:flex;gap:6px;margin-top:6px;justify-content:flex-end"><button type="button" class="btn sm" data-x>Depois</button><button type="button" class="btn sm prim" data-abrir>Abrir conversa</button></div>`;
    SN.$('[data-x]', d).onclick = () => d.remove();
    SN.$('[data-abrir]', d).onclick = () => { d.remove(); C.abrir(ref); };
    area.appendChild(d);
    setTimeout(() => d.remove(), 30000);
    try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) { }
  };
  const buscarAvisos = async () => {
    clearTimeout(timerAvisos);
    const s = SN.sessao();
    if (!s || !s.token || !C.disponivel() || s.token !== donoAvisos) return; // saiu ou trocou de pessoa
    if (document.visibilityState === 'visible' && navigator.onLine !== false) {
      try {
        const r = await api('CONV_AVISOS', {}, 20000);
        if (r.ok && (SN.sessao() || {}).token === donoAvisos) {
          C.avisos = r.avisos || {};
          C.naoLidas().forEach(ref => {
            const a = C.avisos[ref];
            if (!C._abertas[ref] && String(avisados[ref] || '') < String(a.ts)) { avisados[ref] = a.ts; card(ref, a); }
          });
          pintarSelos();
          document.dispatchEvent(new CustomEvent('sn-conversa'));
        }
      } catch (e) { }
    }
    timerAvisos = setTimeout(buscarAvisos, souGestao() ? 30000 : 45000);
  };
  // Chamado depois do login/carga. Na 1ª busca não pipoca aviso do que chegou com o app fechado
  // além das não lidas (cada uma uma vez).
  C.iniciarAvisos = () => {
    const s = SN.sessao(); if (!s || !s.token || !C.disponivel()) return;
    if (donoAvisos === s.token) return;
    donoAvisos = s.token; avisados = {}; C.avisos = {};
    setTimeout(buscarAvisos, 4000 + Math.random() * 4000);
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && donoAvisos) buscarAvisos(); });

  // ─────────── PDF: o gestor decide se a conversa entra ───────────
  // montar(conversa|null) devolve o doc. A escolha abre o PDF a partir do clique no
  // botão da janela (o navegador só deixa abrir aba nova a partir de um clique).
  C.pdfComConversa = async (ref, montar) => {
    if (!ref || !souGestao() || !C.disponivel()) return SN.abrirPdfDepois(() => montar(null));
    const st = estado(ref);
    if (st.carregada && !st.msgs.length) return SN.abrirPdfDepois(() => montar(null));
    let res = null;
    await SN.modal({ titulo: 'Conversa no PDF',
      corpo: `<div id="pcCorpo">${SN.carregando('Conferindo a conversa da atividade…')}</div>`,
      botoes: [{ rot: 'Cancelar', valor: null }],
      aoAbrir: async f => {
        try { await C.ler(ref); } catch (e) { }
        const n = st.msgs.filter(m => !m.sistema).length, rod = SN.$('.modal-rod', f), corpo = SN.$('#pcCorpo', f);
        const gerar = async modo => {
          SN.abrirPdfDepois(() => montar(modo === 'nao' || !n ? null : { modo, msgs: st.msgs.slice(), conversa: st.conversa }));
          SN.$('[data-x]', f).click();
          if (n) { try { await api('CONV_REGISTRAR', { ref, modo }); } catch (e) { } }
        };
        rod.innerHTML = '';
        const botao = (rot, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + (cls || ''); b.textContent = rot; b.onclick = fn; rod.appendChild(b); };
        if (!n) { corpo.innerHTML = '<p>Esta atividade não tem conversa registrada.</p>'; botao('Cancelar', '', () => SN.$('[data-x]', f).click()); botao('Gerar PDF', 'prim', () => gerar('nao')); return; }
        const reg = (st.conversa || {}).registro, longa = n > 30, sug = reg ? reg.modo : longa ? 'resumo' : 'completa';
        corpo.innerHTML = `<p>A conversa desta atividade tem <b>${n} mensagens</b>${st.conversa && (st.conversa.participantes || []).length ? ' e ' + st.conversa.participantes.length + ' convidado(s)' : ''}. Ela entra no PDF?</p>
          ${longa ? '<p class="small muted">Conversa longa: o resumo traz as orientações da gestão, as imagens, as coordenadas e o começo e o fim da conversa.</p>' : ''}
          ${reg ? `<p class="small muted">Última decisão: ${{ completa: 'completa', resumo: 'resumo', nao: 'não entrar' }[reg.modo]} (${esc(reg.por)}, ${SN.dt(reg.em)}).</p>` : ''}
          <p class="small muted">A escolha fica registrada no histórico do chamado. A conversa nunca é apagada.</p>`;
        botao('Não incluir', sug === 'nao' ? 'prim' : '', () => gerar('nao'));
        botao('Resumo', sug === 'resumo' ? 'prim' : '', () => gerar('resumo'));
        botao('Completa', sug === 'completa' ? 'prim' : '', () => gerar('completa'));
      } });
    return res;
  };

  // Resumo automático (sem inteligência artificial: regras fixas, sempre igual para a mesma conversa).
  C.resumo = (msgs, max = 25) => {
    const reais = msgs.filter(m => !m.sistema);
    if (reais.length <= max) return { linhas: reais, omitidas: 0 };
    const peso = (m, i) => (i < 2 || i >= reais.length - 3 ? 3 : 0) + (m.tipo === 'lideranca' ? 2 : 0) + (m.url ? 2 : 0) + (m.lat !== '' && m.lat != null ? 2 : 0)
      + (/\?/.test(m.texto || '') ? 1 : 0) + Math.min(1, String(m.texto || '').length / 200);
    const escolhidas = reais.map((m, i) => ({ m, i, p: peso(m, i) })).sort((a, b) => b.p - a.p || a.i - b.i).slice(0, max).sort((a, b) => a.i - b.i).map(x => x.m);
    return { linhas: escolhidas, omitidas: reais.length - escolhidas.length };
  };
  // Seção da conversa no PDF (doc de SN.novoPdf).
  C.pdfSecao = async (doc, cv) => {
    if (!cv || !cv.msgs || !cv.msgs.length) return;
    const reais = cv.msgs.filter(m => !m.sistema), r = cv.modo === 'resumo' ? C.resumo(cv.msgs) : { linhas: cv.msgs, omitidas: 0 };
    const pessoasTxt = [...new Set(reais.map(m => m.de + (m.tipo === 'lideranca' ? ' (gestão)' : m.empresa ? ' (' + m.empresa + ')' : '')))].join(', ');
    doc.secao(cv.modo === 'resumo' ? 'Conversa da atividade · resumo' : 'Conversa da atividade');
    doc.linha('Participantes', pessoasTxt);
    doc.linha('Período', reais.length ? SN.dt(reais[0].ts) + ' a ' + SN.dt(reais[reais.length - 1].ts) : '—');
    doc.linha('Mensagens', `${reais.length} · ${reais.filter(m => m.url).length} anexo(s) · ${reais.filter(m => m.lat !== '' && m.lat != null).length} coordenada(s)` + (r.omitidas ? ` · ${r.omitidas} fora do resumo` : ''));
    doc._y += 2;
    r.linhas.forEach(m => {
      const t = [m.texto, m.anexo ? `[anexo: ${m.anexo.nome}${m.anexo.tipo !== 'imagem' ? ' · ' + m.url : ''}]` : m.url ? '[imagem anexada]' : '', m.lat !== '' && m.lat != null && !C.coordNoTexto(m.texto) ? `[coordenada ${m.rotulo_coord ? m.rotulo_coord + ': ' : ''}${m.lat}, ${m.lng}]` : ''].filter(Boolean).join(' ');
      const cab = `${SN.dt(m.ts)} · ${m.sistema ? 'Sistema' : m.de + (m.tipo === 'lideranca' ? ' (gestão)' : '')}`;
      const linhas = doc.splitTextToSize(t, 186);
      if (doc._y + 4 + 4.4 * linhas.length > 285) { doc.addPage(); doc._y = 18; }
      doc.setFontSize(8); doc.setTextColor(110); doc.setFont('helvetica', 'bold'); doc.text(cab, 12, doc._y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(29, 38, 20); doc.text(linhas, 12, doc._y + 4.2);
      doc._y += 6 + 4.4 * linhas.length;
    });
    doc.setFontSize(9.5);
    const imgs = r.linhas.filter(m => m.drive_id && (!m.anexo || m.anexo.tipo === 'imagem')).map(m => ({ id: 'drive:' + m.drive_id, tipo: 'imagem', ts: m.ts, lat: m.lat, lng: m.lng, endereco: m.de }));
    if (imgs.length) await SN.pdfFotos(doc, imgs, 'Imagens da conversa');
  };
  return C;
})();
