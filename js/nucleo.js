// SIGONET V2 — núcleo: utilidades, base de dados, anexos, autenticação,
// auditoria, métricas operacionais, integrações e roteamento.
//
// PRINCÍPIO DA V2: chamado ≠ gestão administrativa. O chamado mede a jornada
// operacional (MTTD/MTTA/MTTR/SLA) e fecha quando a parte técnica termina.
// LPU, Materiais e Cadastro de Fibra nascem a partir do chamado (mesmo ID,
// cabeçalho preenchido automático), mas cada um tem status, fila e
// fechamento próprios — nunca prolongam nem bloqueiam o chamado.
window.SN = window.SN || {};

// ═══════════════════════════ Utilidades ═══════════════════════════
SN.$ = (sel, el) => (el || document).querySelector(sel);
SN.$$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
// Todo botão cuja ação demora mostra que está trabalhando (pedido do usuário em 2026-10-01).
// Vale para qualquer "botao.onclick = async () => …" e para os campos de arquivo (onchange)
// dentro de um <label class="btn">: enquanto a ação não termina, o botão fica com o
// indicador girando e não aceita outro clique; passou de ~1 s sem modal aberto, aparece
// também o foguete "Carregando…" no rodapé. Ação que só abre um modal e espera a pessoa
// não mostra o foguete.
(() => {
  let pendentes = 0, longos = 0, timerAviso = null, aviso = null;
  const temModal = () => !!document.querySelector('.fundo-modal, .carregando-sobre, .ver-foto');
  const pintarAviso = () => {
    const mostrar = longos > 0 && !temModal();
    if (mostrar && !aviso) { aviso = document.createElement('div'); aviso.className = 'aviso-carregando'; aviso.setAttribute('role', 'status'); aviso.innerHTML = (SN.foguete ? SN.foguete() : '') + '<span>Carregando…</span>'; document.body.appendChild(aviso); }
    if (!mostrar && aviso) { aviso.remove(); aviso = null; }
  };
  const acompanhar = (alvo, r) => {
    if (!r || typeof r.then !== 'function' || !alvo) return r;
    pendentes++;
    const t = setTimeout(() => { alvo.classList.add('ocupado'); alvo.setAttribute('aria-busy', 'true'); if (alvo.tagName === 'BUTTON' && !alvo.disabled) { alvo.disabled = true; alvo._snDesab = true; } }, 120);
    let longo = false; const t2 = setTimeout(() => { longo = true; longos++; pintarAviso(); }, 900);
    if (!timerAviso) timerAviso = setInterval(pintarAviso, 300); // modal abriu/fechou no meio
    const fim = () => {
      clearTimeout(t); clearTimeout(t2); if (longo) longos--; alvo.classList.remove('ocupado'); alvo.removeAttribute('aria-busy'); if (alvo._snDesab) { alvo._snDesab = false; alvo.disabled = false; } // só reabilita o que este código travou
      if (--pendentes <= 0) { pendentes = 0; longos = 0; clearInterval(timerAviso); timerAviso = null; pintarAviso(); }
    };
    r.then(fim, fim);
    return r;
  };
  const envolver = (proto, evento, alvoDe) => {
    const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, evento);
    if (!d || !d.set) return;
    Object.defineProperty(proto, evento, { configurable: true, enumerable: d.enumerable, get() { return this['_sn_' + evento] || null; },
      set(fn) {
        this['_sn_' + evento] = fn;
        d.set.call(this, typeof fn !== 'function' ? fn : function (e) {
          const alvo = alvoDe(this);
          if (alvo && alvo.classList.contains('ocupado')) { e && e.preventDefault && e.preventDefault(); return; } // clique duplo
          return acompanhar(alvo, fn.call(this, e));
        });
      } });
  };
  envolver(HTMLButtonElement.prototype, 'onclick', el => el);
  envolver(HTMLInputElement.prototype, 'onchange', el => el.type === 'file' ? el.closest('label.btn, .btn, .vst-cap') : null);
})();
SN.esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
SN.agora = () => new Date().toISOString();
SN.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
SN.dt = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
SN.data = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
SN.hora = iso => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
SN.brl = v => (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
SN.num = (v, d = 0) => (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d });
SN.min = (a, b) => (a && b) ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)) : null;
SN.dur = m => {
  if (m == null || isNaN(m)) return '—';
  m = Math.round(m);
  if (m < 60) return m + 'min';
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 48) return h + 'h' + (r ? ' ' + String(r).padStart(2, '0') + 'min' : '');
  return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
};
SN.media = arr => { const v = arr.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
SN.mesChave = iso => (iso || '').slice(0, 7);
SN.mesNome = chave => { if (!chave) return ''; const [a, m] = chave.split('-'); return new Date(+a, +m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); };
SN.normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
SN.debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

SN.sha256 = async txt => {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) { // fallback para contexto sem crypto.subtle
    let h = 5381; for (const c of txt) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return 'x' + h.toString(16);
  }
};

// ═══════════════════════════ Base de dados ═══════════════════════════
// Base local (localStorage). Toda a lógica passa por SN.db — para ligar a um
// backend (Apps Script/Sheets, API do ERP), basta trocar carregar()/salvar().
const CHAVE_DB = 'sigonet_v2_db';
const VERSAO_DB = 1;

SN.baseVazia = () => ({
  versao: VERSAO_DB, seq: { CH: 0, LPU: 0, MAT: 0, FIB: 0, PAG: 0 },
  empresas: SEED_EMPRESAS.map(e => ({ ativo: true, razao: '', ...e })),
  tecnicos: SEED_TECNICOS.map(([empresa, nome, equipe, titular, frente]) => ({
    id: SN.uid(), empresa, nome, equipe, titular, frente, pin: PIN_INICIAL, complementoHash: '', ativo: true })),
  lideranca: SEED_LIDERANCA.map(l => ({ id: SN.uid(), nomeCompleto: '', ...l, pin: PIN_INICIAL, complementoHash: '', ativo: true })),
  contas: SEED_CONTAS.map(c => ({ ...c })),
  disponibilidade: [], chamados: [], lpus: [], materiais: [], fibras: [], pagamentos: [], fechamentos: [], estoques: [],
  assinaturas: {}, log: [], integracoes: []
});

SN.db = null;
SN.carregar = () => {
  try { SN.db = JSON.parse(localStorage.getItem(CHAVE_DB)); } catch (e) { SN.db = null; }
  if (!SN.db || SN.db.versao !== VERSAO_DB) { SN.db = SN.baseVazia(); SN.salvar(); }
  if (!SN.db.estoques) SN.db.estoques = []; // coleção nova (06/10/2026): bases locais antigas não tinham
  return SN.db;
};
SN.salvar = () => {
  try { localStorage.setItem(CHAVE_DB, JSON.stringify(SN.db)); }
  catch (e) { SN.toast('Não foi possível salvar: armazenamento do navegador cheio.', 'erro'); throw e; }
};
SN.proxId = pref => { SN.db.seq[pref] = (SN.db.seq[pref] || 0) + 1; return pref + '-' + String(SN.db.seq[pref]).padStart(5, '0'); };
// Número sequencial para registros novos. Com servidor, quem numera é ele (com
// trava), para duas pessoas nunca receberem o mesmo CH-/LPU-/MAT-… ao mesmo tempo.
SN.novoId = async pref => SN.remoto ? (await SN.api('PROX_ID', { prefixo: pref })).id : SN.proxId(pref);

// Recarrega quando outra aba grava (ex.: gestão despacha e o técnico recebe).
window.addEventListener('storage', ev => {
  if (ev.key === CHAVE_DB) { SN.carregar(); SN.aoMudarBase && SN.aoMudarBase(); }
});

// ═══════════════════════════ Anexos (IndexedDB) ═══════════════════════════
// Fotos e PDFs ficam no IndexedDB (não cabem no localStorage); o registro
// guarda só {id, nome, tipo}.
SN.anexos = (() => {
  let dbp = null;
  const abrir = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('sigonet_v2_anexos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('arq');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (modo, fn) => { const db = await abrir(); return new Promise((res, rej) => {
    const t = db.transaction('arq', modo); const req = fn(t.objectStore('arq'));
    t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); }); };
  return {
    put: (id, dataUrl) => tx('readwrite', s => s.put(dataUrl, id)),
    get: id => tx('readonly', s => s.get(id)),
    del: id => tx('readwrite', s => s.delete(id)),
    limpar: () => tx('readwrite', s => s.clear())
  };
})();

// Reduz a foto (máx. 1280px, JPEG 0,7) antes de guardar.
SN.comprimirImagem = file => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => {
    if (!file.type.startsWith('image/')) return res(fr.result);
    const img = new Image();
    img.onload = () => {
      const max = 1280, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = rej; img.src = fr.result;
  };
  fr.onerror = rej; fr.readAsDataURL(file);
});

// Guarda um anexo. Com servidor vai para o Google Drive (pasta do chamado);
// sem servidor fica no IndexedDB deste navegador.
SN.guardarDataUrl = async (dataUrl, nome, tipo, pasta) => {
  if (SN.remoto) {
    const r = await SN.api('ANEXO', { dataUrl, nome, pasta: pasta || 'geral' });
    return { id: r.id, url: r.url, nome, tipo, ts: SN.agora() };
  }
  const id = 'ax_' + SN.uid(); await SN.anexos.put(id, dataUrl);
  return { id, nome, tipo, ts: SN.agora() };
};
SN.guardarArquivo = async (file, pasta) =>
  SN.guardarDataUrl(await SN.comprimirImagem(file), file.name, file.type.startsWith('image/') ? 'imagem' : 'arquivo', pasta);
// Guarda um PDF gerado; se falhar, avisa e segue (o registro principal nunca
// fica pela metade por causa do anexo).
SN.anexarPdf = async (doc, nome, pasta) => {
  if (!doc) return null;
  try { return await SN.anexoLocal(SN.pdfDataUrl(doc), nome, 'arquivo', pasta); } // sobe pela fila (funciona sem sinal)
  catch (e) { SN.toast('PDF gerado, mas não foi possível guardá-lo: ' + (e.message || e), 'erro'); return null; }
};
SN.driveId = id => String(id || '').startsWith('drive:') ? id.slice(6) : null;
// Foto em tela cheia, na própria página (no celular, abrir outra aba com a foto
// costuma falhar). Toque na foto = zoom (arrasta para ver os detalhes da marca
// d'água); ‹ › ou deslizar = próxima; ✕, Esc ou "voltar" do celular = fecha.
// fotos: [src] ou [{ src, legenda }]
SN.verFoto = (fotos, ini = 0) => {
  const lista = (Array.isArray(fotos) ? fotos : [fotos]).map(f => typeof f === 'string' ? { src: f } : f).filter(f => f && f.src);
  if (!lista.length) return;
  SN.$('#verFoto') && SN.$('#verFoto').remove();
  let i = Math.min(Math.max(0, ini), lista.length - 1);
  const ov = document.createElement('div'); ov.id = 'verFoto'; ov.className = 'ver-foto';
  ov.innerHTML = `<div class="vf-area"><img alt=""></div><div class="vf-leg"></div>
    <button type="button" class="vf-x" title="Fechar">✕</button>${lista.length > 1 ? '<button type="button" class="vf-ant" title="Anterior">‹</button><button type="button" class="vf-prox" title="Próxima">›</button>' : ''}`;
  const area = SN.$('.vf-area', ov), img = SN.$('img', ov), leg = SN.$('.vf-leg', ov);
  const mostrar = () => { ov.classList.remove('zoom'); img.src = lista[i].src; leg.textContent = (lista.length > 1 ? (i + 1) + ' de ' + lista.length + (lista[i].legenda ? ' · ' : '') : '') + (lista[i].legenda || ''); };
  const ir = d => { if (lista.length > 1) { i = (i + d + lista.length) % lista.length; mostrar(); } };
  const fechar = () => { ov.remove(); document.removeEventListener('keydown', tecla); window.removeEventListener('popstate', voltar); };
  const tecla = e => { if (e.key === 'Escape') history.back(); else if (e.key === 'ArrowLeft') ir(-1); else if (e.key === 'ArrowRight') ir(1); };
  const voltar = () => fechar();
  img.onclick = e => { e.stopPropagation(); const z = !ov.classList.contains('zoom'), r = img.getBoundingClientRect(); ov.classList.toggle('zoom', z);
    if (z) { requestAnimationFrame(() => { area.scrollLeft = (area.scrollWidth - area.clientWidth) * ((e.clientX - r.left) / r.width); area.scrollTop = (area.scrollHeight - area.clientHeight) * ((e.clientY - r.top) / r.height); }); } };
  area.onclick = e => { if (e.target === area && !ov.classList.contains('zoom')) history.back(); };
  SN.$('.vf-x', ov).onclick = () => history.back();
  if (lista.length > 1) { SN.$('.vf-ant', ov).onclick = () => ir(-1); SN.$('.vf-prox', ov).onclick = () => ir(1); }
  let x0 = null; // deslizar para o lado troca de foto (sem zoom)
  area.addEventListener('touchstart', e => { x0 = e.touches.length === 1 && !ov.classList.contains('zoom') ? e.touches[0].clientX : null; }, { passive: true });
  area.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 60) ir(dx < 0 ? 1 : -1); });
  document.addEventListener('keydown', tecla);
  history.pushState({ verFoto: 1 }, ''); window.addEventListener('popstate', voltar);
  document.body.appendChild(ov); mostrar();
};
// Miniaturas com data-ver (Preventiva): toque abre em tela cheia, com as outras do mesmo campo.
// "local:<id_foto>" = foto ainda no aparelho (fila offline): busca a original só no toque.
document.addEventListener('click', async e => {
  const img = e.target.closest && e.target.closest('img[data-ver]'); if (!img) return;
  e.preventDefault();
  const grupo = [...(img.closest('.vst-thumbs') || img.parentNode).querySelectorAll('img[data-ver]')];
  const fotos = await Promise.all(grupo.map(async x => {
    let src = x.dataset.ver;
    if (src.startsWith('local:')) { const f = SN.VL ? await SN.VL.fotos.get(src.slice(6)).catch(() => null) : null; src = (f && (f.dataUrl || (f.drive_id && 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(f.drive_id) + '&sz=w1600'))) || x.src; }
    return { src, legenda: x.dataset.leg || '' };
  }));
  SN.verFoto(fotos, grupo.indexOf(img));
});
SN.fotoGrande = id => { const fid = SN.driveId(id); return SN._fotoCache[id] || (fid ? `https://drive.google.com/thumbnail?id=${fid}&sz=w1600` : null); };
SN.abrirAnexo = async id => {
  const cache = SN._fotoCache[id];
  if (cache && cache.startsWith('data:image')) return SN.verFoto(cache);
  if (SN.driveId(id)) { window.open('https://drive.google.com/file/d/' + SN.driveId(id) + '/view', '_blank', 'noopener'); return; }
  const d = await SN.anexos.get(id);
  if (!d) return SN.toast('Anexo não encontrado neste navegador.', 'erro');
  const w = window.open(); if (!w) return;
  if (d.startsWith('data:application/pdf')) w.document.write(`<iframe src="${d}" style="border:0;width:100%;height:100vh"></iframe>`);
  else w.document.write(`<img src="${d}" style="max-width:100%">`);
};
// Abre a foto da lista em tela cheia, com as outras fotos da mesma lista.
const verDaLista = async (lista, a) => {
  const fotos = [];
  for (const x of lista.filter(y => y.tipo === 'imagem')) { const src = SN.fotoGrande(x.id) || await SN.anexos.get(x.id).catch(() => null); if (src) fotos.push({ id: x.id, src }); }
  const i = fotos.findIndex(f => f.id === a.id);
  if (i < 0) return SN.abrirAnexo(a.id);
  SN.verFoto(fotos, i);
};
SN.pintarFotos = async (el, lista, opc) => {
  if (!el) return;
  const vez = el._vez = (el._vez || 0) + 1; // duas pinturas seguidas: vale só a última (não duplica nem some)
  const itens = [];
  for (const a of lista) {
    const fid = SN.driveId(a.id);
    const d = SN._fotoCache[a.id] || (fid ? (a.tipo === 'imagem' ? `https://drive.google.com/thumbnail?id=${fid}&sz=w400` : null) : await SN.anexos.get(a.id).catch(() => null));
    itens.push([a, d]);
  }
  if (vez !== el._vez) return;
  el.innerHTML = lista.length ? '' : (opc && opc.vazio != null ? opc.vazio : '<span class="muted small">Nenhum anexo.</span>');
  for (const [a, d] of itens) {
    if (a.pendente && !d) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = '⏳ ' + (a.tipo === 'imagem' ? 'foto' : a.nome) + ' subindo do celular'; el.appendChild(b); continue; }
    if (a.tipo === 'imagem' && d) {
      const img = document.createElement('img'); img.src = d; img.title = a.nome + (a.pendente ? ' (ainda subindo)' : ''); img.onclick = () => verDaLista(lista, a);
      if (opc && opc.remover) {
        const w = document.createElement('span'); w.className = 'foto-rm';
        const x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.title = 'Remover foto';
        x.onclick = ev => { ev.stopPropagation(); opc.remover(a); };
        w.append(img, x); el.appendChild(w);
      } else el.appendChild(img);
    } else {
      const b = document.createElement('button'); b.className = 'btn sm'; b.textContent = '📄 ' + a.nome; b.onclick = () => SN.abrirAnexo(a.id); el.appendChild(b);
    }
  }
};

// ═══════════════════════════ Fotos com fila (celular) ═══════════════════════════
// A foto é guardada NESTE aparelho na hora: aparece na tela e não se perde se o
// celular recarregar a página ao abrir a câmera (comum no Android). Sobe para o
// Drive em segundo plano e, sem sinal, sobe quando o sinal voltar. Enquanto isso
// o item fica { id: 'ax_…', pendente: true, pasta } e quem vê de outro aparelho
// enxerga "subindo do celular". Ao subir, o id vira 'drive:…' no mesmo lugar da
// lista — a ordem das fotos nunca muda.
SN._fotoCache = {}; // id → dataUrl (fotos desta sessão; o PDF usa sem baixar de novo)
SN.anexoLocal = async (dataUrl, nome, tipo, pasta, extra) => {
  const id = 'ax_' + SN.uid();
  SN._fotoCache[id] = dataUrl;
  // Sem armazenamento no aparelho (aba anônima, navegador restrito): segue só em memória e sobe já.
  try { await SN.anexos.put(id, dataUrl); } catch (e) { if (!SN.remoto) throw e; }
  const ax = { id, nome, tipo, ts: SN.agora(), ...(extra || {}) };
  if (SN.remoto) { ax.pendente = true; ax.pasta = pasta || 'geral'; setTimeout(SN.subirAnexos, 400); }
  return ax;
};
// Foto da câmera do SigoNet (carimbo de data/hora/GPS/endereço, como o Timemark).
SN.fotoDaCamera = async (file, legenda, pasta) => {
  const r = await SN.VF.fotoCarimbada(file, legenda);
  const ax = await SN.anexoLocal(r.dataUrl, 'foto_' + r.agora.replace(/[-:T]/g, '').slice(0, 14) + '.jpg', 'imagem', pasta,
    { lat: r.pos ? r.pos.lat : '', lng: r.pos ? r.pos.lng : '', endereco: r.endereco || '', capturadaEm: r.agora });
  return { ax, semGps: !r.pos, endereco: r.endereco };
};
// Foto (ou PDF) da galeria, sem carimbo.
SN.fotoDaGaleria = async (file, pasta) => SN.anexoLocal(await SN.comprimirImagem(file), file.name, file.type.startsWith('image/') ? 'imagem' : 'arquivo', pasta);
const COLS_COM_ANEXO = ['chamados', 'lpus', 'materiais', 'fibras'];
const acharPendentes = (o, out, prof = 0) => {
  if (!o || typeof o !== 'object' || prof > 6) return;
  if (Array.isArray(o)) { o.forEach(x => acharPendentes(x, out, prof + 1)); return; }
  if (o.pendente === true && typeof o.id === 'string' && o.id.startsWith('ax_')) out.push(o);
  else Object.keys(o).forEach(k => { if (k !== 'historico') acharPendentes(o[k], out, prof + 1); });
};
SN.anexosPendentes = () => { const out = []; COLS_COM_ANEXO.forEach(c => acharPendentes(SN.db[c], out)); return out; };
SN._subindoAnexos = 0; // hora em que a volta de envio começou (0 = parada)
SN.subirAnexos = async () => {
  if (!SN.remoto || !SN.sessao() || (SN._subindoAnexos && Date.now() - SN._subindoAnexos < 300000)) return; // trava com prazo: nunca fica presa
  SN._subindoAnexos = Date.now(); SN._subindoPasso = "inicio";
  try {
    for (const it of SN.anexosPendentes()) {
      if (!it.pendente) continue; // já trocado nesta volta
      SN._subindoPasso = 'ler ' + it.id;
      const dados = SN._fotoCache[it.id] || await SN.anexos.get(it.id).catch(() => null);
      SN._subindoPasso = 'enviar ' + it.id;
      if (!dados) continue; // de outro aparelho: quem tirou é que sobe
      let r;
      try { r = await SN.api('ANEXO', { dataUrl: dados, nome: it.nome, pasta: it.pasta || 'geral' }); }
      catch (e) { if (e.rede) break; continue; } // sem sinal: tenta depois
      const local = it.id;
      SN._fotoCache[r.id] = dados;
      // Troca em todo lugar onde o id local aparece (a sincronização pode ter trocado o objeto do registro).
      SN.anexosPendentes().filter(x => x.id === local).forEach(x => { x.id = r.id; x.url = r.url; delete x.pendente; delete x.pasta; });
      SN.anexos.del(local).catch(() => { });
      SN.salvar();
    }
  } finally { SN._subindoAnexos = 0; }
};
// dataUrl de cada anexo da lista (para o PDF), na mesma ordem. Busca no servidor o que não está no aparelho.
SN.dadosDasFotos = async lista => {
  const faltam = lista.filter(a => SN.driveId(a.id) && !SN._fotoCache[a.id]).map(a => a.id);
  for (let i = 0; i < faltam.length && SN.remoto; i += 8) {
    try { (await SN.api('ANEXO_B64', { ids: faltam.slice(i, i + 8) })).anexos.forEach(x => { if (x.dataUrl) SN._fotoCache[x.id] = x.dataUrl; }); }
    catch (e) { break; }
  }
  return Promise.all(lista.map(async a => SN._fotoCache[a.id] || (SN.driveId(a.id) ? null : await SN.anexos.get(a.id).catch(() => null))));
};
// Grade de fotos no PDF (3 por linha), na ordem em que foram adicionadas, com legenda.
SN.pdfFotos = async (doc, lista, titulo) => {
  const fotos = (lista || []).filter(a => a.tipo === 'imagem');
  if (!fotos.length) return;
  if (titulo) doc.secao(titulo + ' (' + fotos.length + ')');
  const dados = await SN.dadosDasFotos(fotos);
  const medir = src => new Promise(ok => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok({ w: i.width, h: i.height }); i.onerror = () => ok(null); i.src = src; });
  const larg = 60, gap = 5, x0 = 12;
  let col = 0, alturaLinha = 0;
  for (let n = 0; n < fotos.length; n++) {
    const a = fotos[n], src = dados[n], dim = await medir(src);
    const h = dim ? Math.min(75, larg * dim.h / dim.w) : 14;
    if (col === 0 && doc._y + h + 12 > 285) { doc.addPage(); doc._y = 18; }
    const x = x0 + col * (larg + gap);
    if (dim) { try { doc.addImage(src, /^data:image\/png/.test(src) ? 'PNG' : 'JPEG', x, doc._y, larg, h); } catch (e) { } }
    else { doc.setDrawColor(200); doc.rect(x, doc._y, larg, h); doc.setFontSize(7); doc.text('Foto no Drive (indisponível agora)', x + 2, doc._y + 8); }
    const leg = [(n + 1) + '. ' + SN.dt(a.capturadaEm || a.ts), a.endereco || (a.lat ? a.lat + ',' + a.lng : '')].filter(Boolean).join(' · ');
    doc.setFontSize(7); doc.setTextColor(70); const t = doc.splitTextToSize(leg, larg); doc.text(t, x, doc._y + h + 3);
    doc.setFontSize(9.5); doc.setTextColor(29, 38, 20);
    alturaLinha = Math.max(alturaLinha, h + 5 + 3 * t.length);
    if (++col === 3) { col = 0; doc._y += alturaLinha; alturaLinha = 0; }
  }
  if (col) doc._y += alturaLinha;
};
// Abre o PDF numa aba. A aba é aberta ANTES de montar o PDF (que busca as fotos):
// aberta depois de esperar, o navegador bloqueia como pop-up.
SN.abrirPdfDepois = async montar => {
  const w = window.open('', '_blank');
  if (w) w.document.write('<p style="font-family:sans-serif;padding:20px">Montando o PDF com as fotos…</p>');
  try {
    const doc = await montar(); if (!doc) { if (w) w.close(); return; }
    const url = doc.output('bloburl'); if (w) w.location.href = url; else window.open(url);
  } catch (e) { if (w) w.close(); SN.toast('Não foi possível gerar o PDF: ' + (e.message || e), 'erro'); }
};

// ═══════════════════════════ Auditoria ═══════════════════════════
// Todo registro/alteração/aprovação grava usuário, data, hora e o que mudou.
SN.log = (acao, ref, detalhe) => {
  const u = SN.usuario();
  SN.db.log.push({ id: SN.uid(), ts: SN.agora(), usuario: u ? u.nome : 'sistema', perfil: u ? (u.cargo || 'Técnico') : '', acao, ref: ref || '', detalhe: detalhe || '' });
  if (SN.db.log.length > 20000) SN.db.log.splice(0, SN.db.log.length - 20000);
};
SN.hist = (obj, acao, detalhe) => {
  const u = SN.usuario();
  (obj.historico = obj.historico || []).push({ ts: SN.agora(), usuario: u ? u.nome : 'sistema', acao, detalhe: detalhe || '' });
};
// Diferença campo a campo (usada nas edições de LPU com log).
SN.diff = (antes, depois) => {
  const out = [];
  const chaves = new Set([...Object.keys(antes || {}), ...Object.keys(depois || {})]);
  chaves.forEach(k => { if (JSON.stringify(antes[k]) !== JSON.stringify(depois[k])) out.push(`${k}: ${JSON.stringify(antes[k])} → ${JSON.stringify(depois[k])}`); });
  return out.join('; ');
};

// Assinatura com contador histórico por pessoa ("Assinatura Nº X").
SN.assinar = papel => {
  const u = SN.usuario();
  SN.db.assinaturas[u.nome] = (SN.db.assinaturas[u.nome] || 0) + 1;
  return { nome: u.nomeCompleto || u.nome, papel, ts: SN.agora(), n: SN.db.assinaturas[u.nome] };
};
SN.txtAssinatura = a => a ? `${a.nome} · ${SN.dt(a.ts)} · Assinatura Nº ${a.n}` : '—';

// ═══════════════════════════ Cadastros (consultas) ═══════════════════════════
SN.empresa = nome => SN.db.empresas.find(e => e.nome === nome) || { nome, cnpj: '', vinculo: 'PRESTADOR', responsavelLpu: '' };
SN.conta = cod => SN.db.contas.find(c => c.codigo === cod);
SN.contaTxt = cod => { const c = SN.conta(cod); return c ? `${c.codigo.slice(-4)} · ${c.nome}` : (cod || '—'); };
SN.itensDaConta = cod => {
  const c = SN.conta(cod); if (!c) return LPU_CATALOGO;
  return LPU_CATALOGO.filter(i => { const n = parseInt(i.cod.replace(/\D/g, ''), 10); return c.faixas.some(([a, b]) => n >= a && n <= b); });
};
SN.itemLpu = cod => LPU_CATALOGO.find(i => i.cod === cod);
// Catálogo = o fixo (catalogos.js) + os códigos que vieram nos relatórios do Elleven (Estoque dos
// técnicos) e não existem nele: descrição e valor do Elleven; com serial (ativo) ou ATN/SMI = patrimônio.
// Recalcula quando a lista de estoques muda (carga/sincronização troca o array; importação zera SN._catExtra).
SN._catFixo = null; SN._catExtra = null; SN._catExtraDe = null;
SN.catalogoExtra = () => {
  const ests = (SN.db && SN.db.estoques) || [];
  if (SN._catExtra && SN._catExtraDe === ests && SN._catExtraN === ests.length) return SN._catExtra;
  if (!SN._catFixo) { SN._catFixo = {}; CATALOGO_MATERIAIS.forEach(m => { SN._catFixo[m.c] = true; }); }
  const ex = {};
  ests.forEach(e => {
    (e.ativos || []).forEach(a => { if (!SN._catFixo[a.cod] && !ex[a.cod]) ex[a.cod] = { t: 'ATN', c: a.cod, d: a.d || a.cod, p: 0, elleven: true }; });
    Object.entries(e.itens || {}).forEach(([c, it]) => { if (SN._catFixo[c]) return; const x = ex[c] || (ex[c] = { t: /^(ATN|SMI)/i.test(c) ? 'ATN' : 'INS', c, d: it.d || c, p: 0, elleven: true }); if (!x.p && it.valor) x.p = Number(it.valor) || 0; });
  });
  SN._catExtra = Object.values(ex); SN._catExtra._idx = ex; SN._catExtraDe = ests; SN._catExtraN = ests.length;
  return SN._catExtra;
};
SN.todosMateriais = () => CATALOGO_MATERIAIS.concat(SN.catalogoExtra());
SN._catIdx = null;
SN.material = cod => {
  if (!SN._catIdx) { SN._catIdx = {}; CATALOGO_MATERIAIS.forEach(m => { SN._catIdx[m.c] = m; }); }
  return SN._catIdx[cod] || SN.catalogoExtra()._idx[cod];
};
// Preço válido no dia (data local) em que o material foi apontado; sem data = hoje.
SN.precoMaterial = (cod, quando) => {
  const m = SN.material(cod); let p = m ? m.p : 0;
  const d = quando ? new Date(quando) : new Date();
  const dia = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  ((typeof PRECOS_VIGENCIA !== 'undefined' && PRECOS_VIGENCIA[cod]) || []).forEach(([desde, v]) => { if (dia >= desde) p = v; });
  return p || 0;
};
SN.tecnico = nome => SN.db.tecnicos.find(t => t.nome === nome);
SN.parceiros = tec => {
  const t = typeof tec === 'string' ? SN.tecnico(tec) : tec;
  if (!t || !t.equipe) return [];
  return SN.db.tecnicos.filter(x => x.ativo && x.empresa === t.empresa && x.equipe === t.equipe && x.nome !== t.nome);
};
SN.nomeExibicao = nome => {
  const t = SN.tecnico(nome); if (!t) return nome;
  const p = SN.parceiros(t); if (!p.length) return nome;
  return [t, ...p].map(x => x.nome.split(' ')[0]).join(' & ');
};
SN.indisponivel = (nome, dia) => {
  const d = (dia || SN.agora()).slice(0, 10);
  return SN.db.disponibilidade.find(x => x.tecnico === nome && x.inicio <= d && x.fim >= d);
};
// Técnicos que podem receber despacho: ativos, titulares (dupla aparece uma vez).
SN.tecnicosDespacho = () => SN.db.tecnicos.filter(t => t.ativo && (t.titular || !t.equipe));
SN.cargaAberta = nome => SN.db.chamados.filter(c => c.tecnico === nome && SN.STATUS[c.status].aberto && c.status !== 'NAO_ATRIBUIDO').length;

// ═══════════════════════════ Chamado: status e métricas ═══════════════════════════
SN.STATUS = {
  NAO_ATRIBUIDO:     { rot: 'Não atribuído',        cls: 'alerta', aberto: true,  col: 0 },
  ATRIBUIDO:         { rot: 'Despachado',           cls: 'info',   aberto: true,  col: 1 },
  ACEITO:            { rot: 'Aceito pelo técnico',  cls: 'info',   aberto: true,  col: 1 },
  EM_DESLOCAMENTO:   { rot: 'Em deslocamento',      cls: 'info',   aberto: true,  col: 1 },
  EM_CAMPO:          { rot: 'Em campo',             cls: 'verde',  aberto: true,  col: 2 },
  DEVOLVIDO:         { rot: 'Devolvido ao técnico', cls: 'erro',   aberto: true,  col: 2 },
  CONCLUIDO_TECNICO: { rot: 'Conclusão técnica',    cls: 'roxo',   aberto: true,  col: 3 },
  FECHADO:           { rot: 'Fechado',              cls: 'ok',     aberto: false, col: 4 },
  CANCELADO:         { rot: 'Cancelado',            cls: '',       aberto: false, col: 4 }
};
SN.badgeStatus = s => `<span class="badge ${SN.STATUS[s] ? SN.STATUS[s].cls : ''}">${SN.esc(SN.STATUS[s] ? SN.STATUS[s].rot : s)}</span>`;

// Etapas da jornada operacional (linha do tempo da tela do chamado).
SN.ETAPAS = [
  ['abertura', 'Abertura'], ['classificacao', 'Classificação'], ['atribuicao', 'Despacho'], ['aceite', 'Aceite'],
  ['deslocamento', 'Deslocamento'], ['chegada', 'Em campo'], ['validacaoPedida', 'Pediu validação'], ['validacao', 'Validado'], ['diagnostico', 'Diagnóstico'],
  ['conclusaoTecnica', 'Conclusão técnica'], ['fechamento', 'Fechamento']
];

// Definições (mostradas no Portal):
//   MTTD = Abertura → Despacho  (tempo até o chamado ser detectado/triado e ir pra equipe)
//   MTTA = Despacho → Chegada em campo  (tempo de atendimento)
//   MTTR = Abertura → Conclusão técnica  (tempo de resolução)
//   Fim do atendimento = pedido de validação ACEITO (com validação) ou conclusão técnica (sem)
//   Tempo em campo = Chegada → fim do atendimento (eficiência do técnico no local)
//   Espera de validação = quanto o NOC/O&M levou para responder (soma dos pedidos)
//   TMC  = Chegada → Conclusão técnica  (tempo médio em campo)
//   SLA  = Conclusão técnica ≤ Prazo limite (Abertura + SLA da matriz)
// Nada administrativo (LPU, materiais, fibra, fechamento pelo NOC) entra nessas contas.
// Atividade PLANEJADA (chamado ligado a rota de Preventiva): o prazo é o fim do dia
// da data-limite da rota e MTTD/MTTA/MTTR ficam vazios (são métricas de corretiva);
// conta só o tempo em campo e se concluiu no prazo.
SN.ehPlanejada = c => !!(c && (c.planejada || (c.preventiva && c.preventiva.id_rota)));
SN.metricas = c => {
  const t = c.tempos || {}, plan = SN.ehPlanejada(c);
  const mttd = plan ? null : SN.min(t.abertura, t.atribuicao), mtta = plan ? null : SN.min(t.atribuicao, t.chegada);
  // Fim do atendimento: hora em que o técnico pediu a validação que foi ACEITA (não a hora em que o
  // NOC/O&M respondeu). Pedido pendente ou "ainda com falha": o tempo segue correndo (fim = null).
  // Sem validação (chamados antigos, Preventiva): a conclusão técnica.
  const v = c.validacao, fim = v ? (v.status === 'VALIDADA' ? t.validacaoPedida : null) : t.conclusaoTecnica;
  const mttr = plan ? null : SN.min(t.abertura, fim), tmc = SN.min(t.chegada, fim);
  let sla = null;
  if (c.prazoLimite && fim) sla = new Date(fim) <= new Date(c.prazoLimite);
  // Espera de validação (tempo ocioso): soma de quanto o NOC/O&M levou para responder cada pedido.
  const espera = v && v.esperaMin != null ? v.esperaMin : null;
  return { mttd, mtta, mttr, tmc, sla, espera, fim };
};
// IRR (Índice de Recursos Repetitivos): um chamado é reincidente quando o mesmo
// circuito (etiqueta) teve outro chamado encerrado nos 30 dias anteriores à sua
// abertura. Só contam GTD e Manutenção; chamado sem etiqueta fica fora da conta.
SN.IRR = { dias: 30, tipos: ['GTD', 'Manutenção'] };
SN.etiquetaIrr = c => String(c.etiqueta || '').trim().toUpperCase();
SN.entraNoIrr = c => !!SN.etiquetaIrr(c) && SN.IRR.tipos.includes(c.tipo) && c.status !== 'CANCELADO' && !!(c.tempos || {}).abertura;
// Devolve o chamado anterior que torna "c" reincidente (o mais recente), ou null.
SN.reincidencia = c => {
  if (!SN.entraNoIrr(c)) return null;
  const et = SN.etiquetaIrr(c), ab = new Date(c.tempos.abertura).getTime(), janela = SN.IRR.dias * 864e5;
  let ant = null, antFim = 0;
  SN.db.chamados.forEach(x => {
    if (x.id === c.id || !SN.entraNoIrr(x) || SN.etiquetaIrr(x) !== et) return;
    const fimIso = x.tempos.conclusaoTecnica || x.tempos.fechamento; if (!fimIso) return;
    const fim = new Date(fimIso).getTime();
    if (fim <= ab && ab - fim <= janela && fim > antFim) { ant = x; antFim = fim; }
  });
  return ant;
};
// Hora-homem da mão de obra própria (CLT/NETTURBO): calculada pelo sistema a
// partir dos mesmos registros de tempo dos KPIs — nunca digitada.
//   deslocamento = início do deslocamento → chegada em campo
//   em campo     = chegada → conclusão técnica
//   h·h          = (deslocamento + em campo) × pessoas da equipe (titular + dupla do cadastro)
// É sempre recalculada do chamado: se o NOC devolver e o técnico concluir de
// novo, a hora-homem acompanha automaticamente.
SN.horaHomem = (c, papel) => {
  const t = c.tempos || {};
  const tec = papel === 'apoio' && c.apoio ? c.apoio.tecnico : c.tecnico;
  const pessoas = 1 + SN.parceiros(tec).length;
  const ini = t.deslocamento || t.aceite || t.chegada;
  const deslocMin = SN.min(ini, t.chegada), campoMin = SN.min(t.chegada, t.conclusaoTecnica);
  if (!t.conclusaoTecnica || deslocMin == null || campoMin == null)
    return { pendente: true, pessoas, inicio: ini || null, fim: null, deslocMin, campoMin, minutos: null, horas: 0 };
  const minutos = deslocMin + campoMin;
  return { pendente: false, pessoas, inicio: ini, fim: t.conclusaoTecnica, deslocMin, campoMin, minutos, horas: minutos / 60 * pessoas };
};
SN.hhDaLpu = l => { const c = SN.db.chamados.find(x => x.id === l.chamadoId); return c ? SN.horaHomem(c, l.papel) : { pendente: true, horas: 0, pessoas: 1 }; };
SN.hhTxt = hh => hh.pendente ? 'calculada na conclusão' : `${SN.num(hh.horas, 1)} h·h`;
// Bloco somente-leitura usado no app do técnico e na gestão.
SN.htmlHoraHomem = hh => `<div class="faixa small"><b>Hora-homem (automática)</b> — calculada pelos horários do chamado, sem edição.
  <table class="tab" style="margin-top:6px;background:#fff"><tbody>
    <tr><td class="muted">Deslocamento</td><td>${SN.dur(hh.deslocMin)}</td></tr>
    <tr><td class="muted">Em campo</td><td>${SN.dur(hh.campoMin)}</td></tr>
    <tr><td class="muted">Pessoas da equipe</td><td>${hh.pessoas}</td></tr>
    <tr><td class="muted"><b>Total</b></td><td><b>${hh.pendente ? 'Calculada automaticamente na conclusão técnica' : SN.num(hh.horas, 1) + ' h·h'}</b></td></tr>
  </tbody></table></div>`;

SN.prazoInfo = c => {
  if (!c.prazoLimite) return { txt: 'Sem SLA (classificar)', cls: '' };
  // Relógio do SLA para no fim do atendimento (pedido de validação aceito; sem validação, a conclusão técnica).
  const fim = c.tempos && (c.validacao ? (c.validacao.status === 'VALIDADA' ? c.tempos.validacaoPedida : null) : c.tempos.conclusaoTecnica);
  const ref = fim ? new Date(fim) : new Date();
  const diff = Math.round((new Date(c.prazoLimite) - ref) / 60000);
  if (SN.ehPlanejada(c)) {
    const ate = SN.data(c.prazoLimite);
    if (fim) return diff >= 0 ? { txt: 'Concluída no prazo', cls: 'ok' } : { txt: 'Concluída com atraso (' + SN.dur(-diff) + ')', cls: 'erro' };
    if (diff < 0) return { txt: 'Atrasada há ' + SN.dur(-diff), cls: 'erro', estourado: true };
    if (diff < 24 * 60) return { txt: 'Prazo hoje (até ' + ate + ')', cls: 'alerta', atencao: true };
    return { txt: 'Planejada · até ' + ate, cls: '' };
  }
  if (fim) return diff >= 0 ? { txt: 'Dentro do SLA', cls: 'ok' } : { txt: 'Fora do SLA (' + SN.dur(-diff) + ')', cls: 'erro' };
  if (diff < 0) return { txt: 'ESTOURADO há ' + SN.dur(-diff), cls: 'erro', estourado: true };
  if (diff < 60) return { txt: 'Vence em ' + SN.dur(diff), cls: 'alerta', atencao: true };
  return { txt: 'Prazo ' + SN.dt(c.prazoLimite), cls: '' };
};
SN.ultimaEtapa = c => { let u = null; SN.ETAPAS.forEach(([k, n]) => { if (c.tempos && c.tempos[k]) u = { k, n, ts: c.tempos[k] }; }); return u; };

// Classificação a partir da matriz oficial.
SN.slaDe = (tipo, c1, c2, c3, c4) => {
  const m = MATRIZ_SLA.find(x => x.tipo === tipo && x.cat1 === c1 && x.cat2 === (c2 || '') && x.cat3 === (c3 || '') && (x.cat4 || '') === (c4 || ''));
  return m ? m.sla : null;
};
SN.opcoesMatriz = (nivel, filtro) => {
  const chaves = ['tipo', 'cat1', 'cat2', 'cat3', 'cat4'];
  const set = new Set();
  MATRIZ_SLA.forEach(m => {
    for (let i = 0; i < nivel; i++) if ((m[chaves[i]] || '') !== (filtro[chaves[i]] || '')) return;
    if (m[chaves[nivel]]) set.add(m[chaves[nivel]]);
  });
  return [...set];
};

// Módulos vinculados ao chamado (cada um com vida própria).
SN.modulosDo = id => ({
  lpus: SN.db.lpus.filter(x => x.chamadoId === id),
  materiais: SN.db.materiais.filter(x => x.chamadoId === id),
  fibras: SN.db.fibras.filter(x => x.chamadoId === id)
});
// Cabeçalho que viaja automaticamente para LPU / Materiais / Fibra.
SN.cabecalhoDe = (c, papel) => {
  const tec = papel === 'apoio' && c.apoio ? c.apoio.tecnico : c.tecnico;
  const emp = papel === 'apoio' && c.apoio ? c.apoio.empresa : c.empresa;
  return { chamadoId: c.id, protocoloNoc: c.protocoloNoc, protocoloOem: c.protocoloOem, cliente: c.cliente, etiqueta: c.etiqueta,
    endereco: c.endereco, cidade: c.cidade, tipo: c.tipo, categoria: [c.cat1, c.cat2, c.cat3, c.cat4].filter(Boolean).join(' › '),
    conta: c.conta, tecnico: tec, empresa: emp, cnpj: SN.empresa(emp).cnpj, papel: papel || 'titular' };
};

// ═══════════════════════════ LPU: status e valores ═══════════════════════════
// Localização atual pelo GPS do celular. A coordenada funciona sem internet; com rede,
// também busca o endereço (OpenStreetMap). Lança erro com mensagem pronta para o técnico.
SN.localAtual = async () => {
  if (!navigator.geolocation) throw new Error('Este aparelho não tem GPS disponível no navegador. Escreva o endereço.');
  let pos;
  try { pos = await new Promise((ok, falha) => navigator.geolocation.getCurrentPosition(ok, falha, { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 })); }
  catch (e) { throw new Error(e.code === 1 ? 'GPS bloqueado: permita a localização para este site nas configurações do navegador.' : 'Não foi possível obter o GPS agora. Escreva o endereço no campo.'); }
  const gps = { lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6), precisao: Math.round(pos.coords.accuracy || 0), em: SN.agora() };
  let endereco = '';
  if (navigator.onLine) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=pt-BR&lat=${gps.lat}&lon=${gps.lng}`, { signal: AbortSignal.timeout(8000) });
      const a = (await r.json()).address || {};
      endereco = [[a.road, a.house_number].filter(Boolean).join(', '), a.suburb || a.neighbourhood, a.city || a.town || a.village, a.state].filter(Boolean).join(' - ');
    } catch (e) { /* sem endereço: fica só a coordenada */ }
  }
  return { gps, endereco };
};
SN.gpsTxt = g => g && g.lat ? `📍 ${SN.esc(g.lat + ',' + g.lng)}${g.precisao ? ' · ±' + g.precisao + ' m' : ''} · <a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${SN.esc(g.lat + ',' + g.lng)}">abrir no mapa</a>` : '';
// RFO: "Trabalhou na CEO?" — se sim, qual caso.
SN.CEO_TIPOS = { NOVA_NOVA: 'CEO nova → CEO nova', NOVA_EXISTENTE: 'CEO nova → CEO existente', EXISTENTE_EXISTENTE: 'CEO existente → CEO existente' };
SN.ceoTxt = rfo => { const x = rfo && rfo.ceo; if (!x || !x.trabalhou) return ''; return x.trabalhou === 'sim' ? 'Sim · ' + (SN.CEO_TIPOS[x.tipo] || 'caso não informado') : 'Não'; };
SN.LPU_STATUS = {
  AGUARDANDO_LIDER:  { rot: 'Aguardando líder',        cls: 'alerta' },
  REPROVADA:         { rot: 'Reprovada (técnico corrige)', cls: 'erro' },
  NO_SERVICE_DESK:   { rot: 'No Service Desk',         cls: 'info' },
  CONTABILIZADA:     { rot: 'Contabilizada',           cls: 'verde' },
  EM_PAGAMENTO:      { rot: 'Em tratativa de pagamento', cls: 'roxo' },
  PAGA:              { rot: 'Paga',                    cls: 'ok' }
};
SN.badgeLpu = s => `<span class="badge ${SN.LPU_STATUS[s] ? SN.LPU_STATUS[s].cls : ''}">${SN.esc(SN.LPU_STATUS[s] ? SN.LPU_STATUS[s].rot : s)}</span>`;
SN.valorItem = it => { const c = SN.itemLpu(it.cod); if (!c) return 0; const u = it.fator === 'critico' && c.valorCritico != null ? c.valorCritico : c.valor; return (u || 0) * (it.qtd || 0); };
SN.valorLpu = l => l.vinculo === 'PRESTADOR' ? (l.itens || []).reduce((s, it) => s + SN.valorItem(it), 0) + (Number(l.reembolso) || 0) : 0;

SN.MAT_STATUS = {
  REGISTRADO:      { rot: 'Registrado', cls: 'alerta' },
  CONFERIDO:       { rot: 'Conferido', cls: 'info' },
  DIVERGENTE:      { rot: 'Divergente', cls: 'erro' },
  BAIXADO_SAP:     { rot: 'Baixa informada (Elleven)', cls: 'verde' }, // chave antiga mantida: registros existentes continuam válidos
  ALOCADO_CLIENTE: { rot: 'Alocado ao cliente', cls: 'ok' },
  SEM_MATERIAL:    { rot: 'Sem material utilizado', cls: 'info' } // técnico informou que nada saiu do estoque
};
SN.FIB_STATUS = {
  AGUARDANDO_VALIDACAO: { rot: 'Aguardando validação do líder', cls: 'alerta' },
  CORRECAO:             { rot: 'Correção solicitada', cls: 'erro' },
  INCORRETO:            { rot: 'Incorreto (arquivado)', cls: 'erro' },
  PENDENTE_CADASTRO:    { rot: 'Correto · pendente GEOGRID', cls: 'info' },
  CADASTRADO:           { rot: 'Cadastrado no GEOGRID', cls: 'ok' },
  SEM_FIBRA:            { rot: 'Sem cadastro de fibra', cls: 'info' } // técnico informou que não houve atividade de fibra
};
SN.badge = (mapa, s) => `<span class="badge ${mapa[s] ? mapa[s].cls : ''}">${SN.esc(mapa[s] ? mapa[s].rot : s)}</span>`;

// ═══════════════════════════ Integrações (camada de adaptação) ═══════════════════════════
// Pontos de integração da arquitetura sistêmica (ERP Elleven, SAP, WFM).
// Hoje registram a chamada no log de integrações; quando as APIs estiverem
// disponíveis, a implementação real entra aqui sem mudar as telas.
SN.int = {
  registrar(sistema, operacao, payload, resposta) {
    SN.db.integracoes.push({ id: SN.uid(), ts: SN.agora(), sistema, operacao, payload, resposta, modo: 'simulado' });
    if (SN.db.integracoes.length > 5000) SN.db.integracoes.splice(0, 1000);
    return resposta;
  },
  ellevenStatus(c, status) { return this.registrar('ERP Elleven', 'Atualizar status OS', { os: c.id, protocolo: c.protocoloOem || c.protocoloNoc, status }, { ok: true }); },
  // ESTOQUE: o Elleven é o sistema oficial (onde está o material e a quem ele está
  // vinculado). Não há integração de estoque ativa: o SigoNet não consulta saldo nem
  // executa baixa. A baixa é feita no Elleven e aqui só se INFORMA a referência dela
  // (Gestão de Materiais). Nada de saldo ou documento inventado.
  estoqueIntegrado: false
};

// ═══════════════════════════ Autenticação ═══════════════════════════
// Duas famílias: liderança (Nome + PIN + Complemento, telas por pessoa) e
// técnico (Empresa + Técnico + PIN + Complemento). Sessão de 12h.
// Cada aba tem a própria sessão (sessionStorage): técnico numa aba e gestão em outra não se
// misturam, e duplicar a aba copia a sessão dela. O localStorage guarda só o último login,
// que uma aba nova (ou o app reaberto no celular) adota. '' = saiu nesta aba: não adota.
const CHAVE_SESSAO = 'sigonet_v2_sessao';
const sessaoDaAba = () => {
  let t = null;
  try { t = sessionStorage.getItem(CHAVE_SESSAO); } catch (e) { }
  if (t == null) { try { t = localStorage.getItem(CHAVE_SESSAO); if (t) sessionStorage.setItem(CHAVE_SESSAO, t); } catch (e) { } }
  return t;
};
SN.sessao = () => {
  try { const s = JSON.parse(sessaoDaAba()); if (s && s.expira > Date.now()) return s; } catch (e) { }
  return null;
};
SN.gravarSessao = s => {
  const t = JSON.stringify(s);
  try { sessionStorage.setItem(CHAVE_SESSAO, t); } catch (e) { }
  localStorage.setItem(CHAVE_SESSAO, t);
};
// Encerra a sessão desta aba. O "último login" só é apagado se for o desta aba
// (quem saiu aqui não derruba quem entrou em outra aba).
SN.encerrarSessao = () => {
  let minha = null; try { minha = sessionStorage.getItem(CHAVE_SESSAO); } catch (e) { }
  try { sessionStorage.setItem(CHAVE_SESSAO, ''); } catch (e) { }
  try { const ult = localStorage.getItem(CHAVE_SESSAO); if (ult && (minha == null || ult === minha)) localStorage.removeItem(CHAVE_SESSAO); } catch (e) { }
};
SN.usuario = () => {
  const s = SN.sessao(); if (!s || !SN.db) return null;
  if (s.tipo === 'lideranca') { const l = SN.db.lideranca.find(x => x.nome === s.nome && x.ativo); return l ? { ...l, tipo: 'lideranca' } : null; }
  const t = SN.db.tecnicos.find(x => x.nome === s.nome && x.empresa === s.empresa && x.ativo);
  return t ? { ...t, tipo: 'tecnico', cargo: 'Técnico' } : null;
};
SN.temTela = tela => { const u = SN.usuario(); return !!u && u.tipo === 'lideranca' && (u.telas.includes('*') || u.telas.includes(tela)); };
SN.podeAprovar = () => { const u = SN.usuario(); return !!u && ['Gerente', 'Gestor', 'Encarregado'].includes(u.cargo); };
SN.ehGestor = () => { const u = SN.usuario(); return !!u && ['Gerente', 'Gestor'].includes(u.cargo); };

const tentativas = {};
SN.login = async ({ tipo, nome, empresa, pin, complemento, novoComplemento }) => {
  const chave = tipo + '|' + empresa + '|' + nome;
  const tt = tentativas[chave] || { n: 0, ate: 0 };
  if (tt.ate > Date.now()) throw new Error('Muitas tentativas. Aguarde 15 minutos.');
  const lista = tipo === 'lideranca' ? SN.db.lideranca : SN.db.tecnicos;
  const reg = lista.find(x => x.nome === nome && x.ativo && (tipo === 'lideranca' || x.empresa === empresa));
  const falha = msg => { tt.n++; if (tt.n >= 5) { tt.ate = Date.now() + 15 * 60000; tt.n = 0; } tentativas[chave] = tt; throw new Error(msg); };
  if (!reg) falha('Usuário não encontrado ou inativo.');
  if (String(reg.pin).trim().toUpperCase() !== String(pin).trim().toUpperCase()) falha('PIN incorreto.');
  if (!reg.complementoHash) {
    if (!novoComplemento) return { primeiroAcesso: true };
    if (novoComplemento.length < 4) throw new Error('O complemento precisa ter pelo menos 4 caracteres.');
    reg.complementoHash = await SN.sha256(reg.nome + '|' + novoComplemento);
  } else if (reg.complementoHash !== await SN.sha256(reg.nome + '|' + complemento)) falha('Complemento incorreto.');
  delete tentativas[chave];
  SN.gravarSessao({ tipo, nome, empresa: empresa || '', expira: Date.now() + 16 * 3600e3 });
  reg.ultimoAcesso = SN.agora();
  SN.log('LOGIN', tipo, reg.nome); SN.salvar();
  return { ok: true };
};
SN.sair = () => { SN.log('LOGOUT', '', ''); SN.salvar(); SN.encerrarSessao(); location.hash = '#/login'; SN.render(); };

// ═══════════════════════════ UI: toast, modal ═══════════════════════════
SN.toast = (msg, tipo) => {
  let area = SN.$('.toast-area'); if (!area) { area = document.createElement('div'); area.className = 'toast-area'; document.body.appendChild(area); }
  const t = document.createElement('div'); t.className = 'toast ' + (tipo || ''); t.textContent = msg; area.appendChild(t);
  setTimeout(() => t.remove(), 3800);
};
// Modal próprio (nunca alert/confirm do navegador).
SN.modal = ({ titulo, corpo, botoes, largo, aoAbrir }) => new Promise(resolve => {
  const f = document.createElement('div'); f.className = 'fundo-modal';
  f.innerHTML = `<div class="modal ${largo ? 'largo' : ''}"><div class="modal-cab"><h3>${SN.esc(titulo)}</h3><button class="x" data-x>×</button></div>
    <div class="modal-corpo">${corpo}</div><div class="modal-rod"></div></div>`;
  const rod = SN.$('.modal-rod', f);
  const fechar = v => { f.remove(); resolve(v); };
  (botoes || [{ rot: 'Fechar', valor: null }]).forEach(b => {
    const el = document.createElement('button'); el.className = 'btn ' + (b.cls || ''); el.textContent = b.rot;
    el.onclick = async () => { if (b.acao) { const r = await b.acao(f); if (r === false) return; fechar(r === undefined ? b.valor : r); } else fechar(b.valor); };
    rod.appendChild(el);
  });
  SN.$('[data-x]', f).onclick = () => fechar(null);
  f.addEventListener('mousedown', e => { if (e.target === f) fechar(null); });
  document.body.appendChild(f);
  aoAbrir && aoAbrir(f);
});
SN.confirmar = (titulo, texto, rotOk = 'Confirmar', cls = 'prim') => SN.modal({
  titulo, corpo: `<p>${texto}</p>`, botoes: [{ rot: 'Cancelar', valor: false }, { rot: rotOk, cls, valor: true }] });
SN.pedirTexto = (titulo, rotulo, obrig = true) => SN.modal({
  titulo, corpo: `<div class="campo"><label>${SN.esc(rotulo)}</label><textarea class="inp" id="mTxt"></textarea></div>`,
  botoes: [{ rot: 'Cancelar', valor: null }, { rot: 'Confirmar', cls: 'prim', acao: f => {
    const v = SN.$('#mTxt', f).value.trim(); if (obrig && !v) { SN.toast('Preencha o campo.', 'erro'); return false; } return v; } }],
  aoAbrir: f => SN.$('#mTxt', f).focus()
});

// ═══════════════════════════ Carregando: foguete SigoNet ═══════════════════════════
// Foguete desenhado em SVG (nítido em qualquer tela, ~2 KB) com as cores da marca;
// a animação é CSS (.foguete em sigonet.css). Só aparece se a espera passar de ~¼ s,
// e fica parado para quem pede "reduzir movimento" no aparelho.
let seqFoguete = 0;
SN.foguete = () => { const n = ++seqFoguete;
  return `<svg class="foguete" viewBox="0 0 120 120" role="img" aria-label="Carregando">
  <defs><linearGradient id="fgC${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f9dc"/><stop offset=".45" stop-color="#a8c93c"/><stop offset="1" stop-color="#5c7d1a" stop-opacity="0"/></linearGradient>
    <linearGradient id="fgB${n}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f6f8f3"/><stop offset=".55" stop-color="#e3e8de"/><stop offset="1" stop-color="#b9c2b1"/></linearGradient></defs>
  <g class="fg-rastros"><line x1="28" y1="30" x2="28" y2="46"/><line x1="92" y1="18" x2="92" y2="30" style="animation-delay:.3s"/><line x1="20" y1="70" x2="20" y2="80" style="animation-delay:.55s"/><line x1="100" y1="58" x2="100" y2="72" style="animation-delay:.15s"/></g>
  <g class="fg-nave">
    <path class="fg-chama" d="M51 83 Q60 116 69 83 Z" fill="url(#fgC${n})"/>
    <path d="M48 60 L35 83 L50 78 Z" fill="#5c7d1a"/><path d="M72 60 L85 83 L70 78 Z" fill="#5c7d1a"/>
    <path d="M60 12 C75 25 77 50 72 80 L48 80 C43 50 45 25 60 12 Z" fill="url(#fgB${n})" stroke="#1f241e" stroke-width="1.6"/>
    <path d="M52.5 29 Q60 23.5 67.5 29" fill="none" stroke="#a8c93c" stroke-width="3.2" stroke-linecap="round"/>
    <circle cx="60" cy="48" r="8.5" fill="#1f241e" stroke="#a8c93c" stroke-width="3"/><circle cx="57" cy="45" r="2.2" fill="#e9f7c8" opacity=".85"/>
    <path d="M60 60 L60 76" stroke="#c9d0c3" stroke-width="1.4"/>
    <rect x="51" y="79" width="18" height="5" rx="1.6" fill="#1f241e"/>
  </g></svg>`; };
SN.carregando = msg => `<div class="carregando">${SN.foguete()}<p>${SN.esc(msg || 'Carregando…')}</p></div>`;
// Cobre a tela enquanto uma ação demora (ex.: entrar e carregar a base). Devolve a função que tira.
SN.cobrirCarregando = msg => {
  const el = document.createElement('div'); el.className = 'carregando-sobre'; el.innerHTML = SN.carregando(msg);
  document.body.appendChild(el); return () => el.remove();
};

// ═══════════════════════════ Exportação / PDF ═══════════════════════════
SN.exportar = (nome, linhas) => {
  if (!linhas.length) return SN.toast('Nada para exportar no filtro atual.');
  if (window.XLSX) {
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Dados');
    XLSX.writeFile(wb, nome + '.xlsx'); return;
  }
  const cab = Object.keys(linhas[0]);
  const csv = [cab.join(';'), ...linhas.map(l => cab.map(k => '"' + String(l[k] == null ? '' : l[k]).replace(/"/g, '""') + '"').join(';'))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = nome + '.csv'; a.click();
};
SN.novoPdf = titulo => {
  if (!window.jspdf) { SN.toast('Biblioteca de PDF indisponível (sem internet?).', 'erro'); return null; }
  const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFillColor(61, 79, 17); doc.rect(0, 0, 210, 20, 'F');
  doc.setTextColor(255);
  try { doc.addImage(MARCA.LETRAS, 'PNG', 10, 3.5, 36, 11.2); } catch (e) { doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text('SIGONET', 12, 12.5); }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text('Sistema Integrado de Gestão Operacional da Netturbo', 50, 11.5);
  doc.setTextColor(29, 38, 20); doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text(titulo, 12, 30);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  doc._y = 38;
  doc.linha = (rot, val) => { if (doc._y > 280) { doc.addPage(); doc._y = 18; } doc.setFont('helvetica', 'bold'); doc.text(rot, 12, doc._y);
    doc.setFont('helvetica', 'normal'); const t = doc.splitTextToSize(String(val == null || val === '' ? '—' : val), 140); doc.text(t, 58, doc._y); doc._y += 5.2 * t.length; };
  doc.secao = t => { doc._y += 3; if (doc._y > 275) { doc.addPage(); doc._y = 18; } doc.setFillColor(242, 247, 232); doc.rect(10, doc._y - 4.5, 190, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.text(t, 12, doc._y); doc.setFont('helvetica', 'normal'); doc._y += 7; };
  return doc;
};
SN.pdfDataUrl = doc => doc.output('datauristring').replace(/^data:([^;,]+)(;[^,]*)?;base64,/, 'data:$1;base64,'); // sem ";filename=…" (o servidor recusava)

// ═══════════════════════════ Roteamento ═══════════════════════════
SN.rotas = {};
SN.rota = (padrao, fn, opts) => { SN.rotas[padrao] = { fn, ...(opts || {}) }; };
SN.navegar = h => { if (location.hash === h) SN.render(); else location.hash = h; };
SN.render = () => {
  const hash = location.hash.replace(/^#/, '') || '/inicio';
  const partes = hash.split('/').filter(Boolean);
  const u = SN.usuario();
  if (!u && partes[0] !== 'login') { location.hash = '#/login'; return; }
  let achou = null, params = [];
  Object.keys(SN.rotas).forEach(p => {
    const pp = p.split('/').filter(Boolean);
    if (pp.length !== partes.length) return;
    const ps = [];
    if (pp.every((seg, i) => seg.startsWith(':') ? (ps.push(decodeURIComponent(partes[i])), true) : seg === partes[i])) { achou = SN.rotas[p]; params = ps; }
  });
  if (!achou) { location.hash = u && u.tipo === 'tecnico' ? '#/tec' : '#/inicio'; return; }
  if (u && achou.familia && achou.familia !== u.tipo) { location.hash = u.tipo === 'tecnico' ? '#/tec' : '#/inicio'; return; }
  if (u && achou.tela && !SN.temTela(achou.tela)) { SN.toast('Seu acesso não inclui esta tela.', 'erro'); location.hash = '#/inicio'; return; }
  SN.rotaAtual = { hash, fn: achou.fn, params };
  achou.fn(...params);
  window.scrollTo(0, 0);
};
SN.aoMudarBase = () => { // re-render leve quando outra aba altera a base
  const f = SN.$('.fundo-modal'); if (f) return; // não atrapalha quem está digitando num modal
  const ativo = document.activeElement; if (ativo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ativo.tagName)) return;
  SN.rotaAtual && SN.rotaAtual.fn(...SN.rotaAtual.params);
};
window.addEventListener('hashchange', () => SN.render());

// ═══════════════════════════ Casca da liderança ═══════════════════════════
SN.MENU = [
  { grupo: 'Operação' },
  { tela: 'inicio', rot: 'Início', ico: '🏠', href: '#/inicio' },
  { tela: 'chamados', rot: 'Chamados (NOC)', ico: '📞', href: '#/chamados' },
  { grupo: 'Gestões vinculadas' },
  { tela: 'lpu', rot: 'Gestão de LPU', ico: '📄', href: '#/lpu' },
  { tela: 'servicedesk', rot: 'Service Desk', ico: '🎧', href: '#/servicedesk' },
  { tela: 'materiais', rot: 'Controle de Materiais', ico: '📦', href: '#/materiais' },
  { id: 'estoque', tela: 'materiais', rot: 'Estoque dos técnicos', ico: '📦', href: '#/estoque' },
  { tela: 'fibra', rot: 'Cadastro de Fibra', ico: '🧵', href: '#/fibra' },
  { grupo: 'Gestão' },
  { tela: 'base', rot: 'Base OEM', ico: '🗂️', href: '#/base' },
  { tela: 'portal', rot: 'Portal de Gestão', ico: '📊', href: '#/portal' },
  { tela: 'cadastros', rot: 'Cadastros e Acessos', ico: '👥', href: '#/cadastros' },
  { tela: 'auditoria', rot: 'Auditoria', ico: '🕑', href: '#/auditoria' }
];
SN.casca = (ativo, html) => {
  const u = SN.usuario();
  const itens = SN.MENU.filter(m => m.grupo || m.tela === 'inicio' || SN.temTela(m.tela));
  const menu = itens.map((m, i) => m.grupo
    ? (itens[i + 1] && !itens[i + 1].grupo ? `<div class="grupo">${m.grupo}</div>` : '')
    : `<a href="${m.href}" class="${(m.id || m.tela) === ativo ? 'ativo' : ''}"><span class="ico">${m.ico}</span>${m.rot}</a>`).join('');
  document.getElementById('app').innerHTML = `
    <header class="topbar">
      <button class="btn-menu" id="btnMenu">☰</button>
      <div class="marca"><img class="topbar-logo" src="${MARCA.LETRAS}" alt="SigoNet"><span class="marca-sub">Sistema Integrado de Gestão Operacional da Netturbo · Field Desk</span></div>
      <div class="espaco"></div>
      ${SN.remoto ? '<span class="chip-user small" id="sync">● online</span>' : '<span class="chip-user small" title="Dados só neste navegador — configure o servidor em js/config.js">modo teste (local)</span>'}
      <div class="chip-user">Olá, ${SN.esc(u.nome.split(' ')[0])} · ${SN.esc(u.cargo)} <button id="btnSair">Sair</button></div>
    </header>
    <div class="layout"><nav class="sidebar" id="sidebar">${menu}</nav><main class="conteudo">${html}</main></div>`;
  SN.$('#btnSair').onclick = SN.sair;
  SN.$('#btnMenu').onclick = () => SN.$('#sidebar').classList.toggle('aberta');
};
