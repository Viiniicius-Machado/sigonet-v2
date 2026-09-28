// SIGONET V2 — Preventiva: rascunho local e fila de envio (IndexedDB próprio).
//
// Nada do técnico se perde sem sinal:
//  • cada CS tem um RASCUNHO no aparelho, salvo a cada alteração;
//  • cada foto fica guardada no aparelho até o servidor confirmar o recebimento;
//  • a fila sobe as fotos e depois as CS marcadas para envio, e tenta de novo
//    sozinha quando a conexão volta (evento "online", ao voltar para o app e
//    com espera crescente de 5 s até 2 min).
// Os IDs (id_vistoria, id_foto) nascem aqui; o servidor é idempotente por eles,
// então repetir um envio nunca duplica.
//
// Status local da CS: rascunho → fila → enviando → enviada | erro.
SN.VL = (() => {
  let dbp = null;
  const abrir = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('sigonet_v2_vistoria', 2); // v2: apontamentos da aérea
    r.onupgradeneeded = () => {
      const db = r.result, tem = n => db.objectStoreNames.contains(n);
      if (!tem('rascunhos')) db.createObjectStore('rascunhos', { keyPath: 'id_vistoria' }).createIndex('rota', 'id_rota');
      if (!tem('fotos')) db.createObjectStore('fotos', { keyPath: 'id_foto' }).createIndex('vistoria', 'id_vistoria');
      if (!tem('meta')) db.createObjectStore('meta');
      if (!tem('apontamentos')) db.createObjectStore('apontamentos', { keyPath: 'id_apontamento' }).createIndex('rota', 'id_rota');
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (loja, modo, fn) => {
    const db = await abrir();
    return new Promise((res, rej) => {
      const t = db.transaction(loja, modo), req = fn(t.objectStore(loja));
      t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  };
  const loja = nome => ({
    get: k => tx(nome, 'readonly', s => s.get(k)),
    put: v => tx(nome, 'readwrite', s => s.put(v)),
    del: k => tx(nome, 'readwrite', s => s.delete(k)),
    todos: () => tx(nome, 'readonly', s => s.getAll()),
    porIndice: (ind, v) => tx(nome, 'readonly', s => s.index(ind).getAll(v))
  });
  const VL = { rascunhos: loja('rascunhos'), fotos: loja('fotos'), apontamentos: loja('apontamentos'),
    meta: { get: k => tx('meta', 'readonly', s => s.get(k)), set: (k, v) => tx('meta', 'readwrite', s => s.put(v, k)) } };

  // ─────────── Ouvintes (telas atualizam os status) ───────────
  const ouvintes = new Set();
  VL.aoMudar = fn => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
  const avisar = () => ouvintes.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

  // ─────────── Fotos ───────────
  // registro: { id_foto, id_vistoria, id_rota, meta (vai ao servidor), dataUrl, thumb, status, erro, url }
  VL.guardarFoto = async reg => { await VL.fotos.put({ status: 'pendente', ...reg }); avisar(); VL.processar(); };

  // ─────────── CS ───────────
  // registro: { id_vistoria, id_rota, ordem, status_local, dados (a vistoria), erro, erros, servidor }
  VL.salvarRascunho = async reg => { reg.atualizado = SN.agora(); await VL.rascunhos.put(reg); };
  VL.enfileirar = async reg => { reg.status_local = 'fila'; reg.erro = ''; reg.erros = []; await VL.salvarRascunho(reg); avisar(); VL.processar(); };

  // ─────────── Apontamentos da aérea ───────────
  // registro: { id_apontamento, id_rota, status_local, dados (o apontamento), erro, erros, servidor }
  VL.salvarApontamento = async reg => { reg.atualizado = SN.agora(); await VL.apontamentos.put(reg); };
  VL.enfileirarApontamento = async reg => { reg.status_local = 'fila'; reg.erro = ''; reg.erros = []; await VL.salvarApontamento(reg); avisar(); VL.processar(); };

  // Situação das fotos de uma vistoria: foto sem registro local = já está no servidor.
  VL.fotosPendentes = async v => {
    const out = { pendentes: 0, erros: [] };
    for (const f of v.fotos || []) {
      const l = await VL.fotos.get(f.id_foto);
      if (!l || l.status === 'enviada') continue;
      if (l.status === 'erro') out.erros.push(l); else out.pendentes++;
    }
    return out;
  };

  // ─────────── Processamento da fila ───────────
  let rodando = false, espera = 5000, timer = null;
  VL.estado = { rodando: false, semRede: false, ultimaTentativa: null };
  const agendar = ms => { clearTimeout(timer); timer = setTimeout(VL.processar, ms); };
  VL.processar = async () => {
    if (rodando || !SN.vst.disponivel() || !SN.sessao()) return;
    rodando = true; VL.estado.rodando = true; VL.estado.ultimaTentativa = SN.agora();
    let semRede = false, restam = false;
    try {
      // 1) Fotos — uma de cada vez (cada uma já comprimida, ~200–500 KB).
      const fotos = (await VL.fotos.todos()).filter(f => f.status === 'pendente' || f.status === 'enviando');
      for (const f of fotos) {
        f.status = 'enviando'; await VL.fotos.put(f); avisar();
        try {
          const r = await SN.vst.api('VST_FOTO', { dataUrl: f.dataUrl, foto: f.meta }, 120000);
          if (r.ok) Object.assign(f, { status: 'enviada', url: r.foto.url, drive_id: r.foto.drive_id, flag_suspeita: r.foto.flag_suspeita, dataUrl: null, erro: '' });
          else Object.assign(f, { status: 'erro', erro: r.erro });
        } catch (e) {
          f.status = 'pendente'; await VL.fotos.put(f);
          if (e.rede) { semRede = true; break; }
          throw e;
        }
        await VL.fotos.put(f); avisar();
      }
      // 2) CS (subterrânea) e 3) apontamentos (aérea) marcados para envio, com
      //    todas as fotos/fichas já no servidor.
      const enviarLoja = async (lj, salvar, acao, campo, retorno) => {
        const fila = (await lj.todos()).filter(r => r.status_local === 'fila' || r.status_local === 'enviando');
        for (const reg of fila) {
          const fp = await VL.fotosPendentes(reg.dados);
          if (fp.erros.length) { Object.assign(reg, { status_local: 'erro', erro: 'Arquivo não aceito pelo servidor: ' + fp.erros[0].erro, erros: [] }); await salvar(reg); continue; }
          if (fp.pendentes) { restam = true; continue; }
          reg.status_local = 'enviando'; await salvar(reg); avisar();
          try {
            const r = await SN.vst.api(acao, { [campo]: reg.dados }, 90000);
            if (r.ok) Object.assign(reg, { status_local: 'enviada', servidor: r[retorno], erro: '', erros: [], avisos: r.avisos || [], enviadaEm: SN.agora() });
            else if (r.fotos_pendentes) { reg.status_local = 'fila'; restam = true; }
            else Object.assign(reg, { status_local: 'erro', erro: r.erro, erros: r.erros || [] });
          } catch (e) {
            reg.status_local = 'fila';
            if (e.rede) { semRede = true; await salvar(reg); return; }
            throw e;
          }
          await salvar(reg); avisar();
        }
      };
      if (!semRede) await enviarLoja(VL.rascunhos, VL.salvarRascunho, 'VST_ENVIAR_CS', 'vistoria', 'vistoria');
      if (!semRede) await enviarLoja(VL.apontamentos, VL.salvarApontamento, 'VST_APONTAR', 'apontamento', 'apontamento');
    } catch (e) {
      if (!e.sessao) console.error('[Vistoria] fila:', e);
    } finally {
      rodando = false; VL.estado.rodando = false; VL.estado.semRede = semRede; avisar();
    }
    const naFila = r => r.status_local === 'fila' || r.status_local === 'enviando';
    const pend = (await VL.fotos.todos()).some(f => f.status === 'pendente')
      || (await VL.rascunhos.todos()).some(naFila) || (await VL.apontamentos.todos()).some(naFila);
    if (pend || restam) { agendar(semRede ? espera : 3000); espera = semRede ? Math.min(espera * 2, 120000) : 5000; }
    else espera = 5000;
  };
  // Contagem para o indicador do cabeçalho.
  VL.resumoPendente = async () => {
    const fotos = (await VL.fotos.todos()).filter(f => f.status !== 'enviada' && f.status !== 'erro').length;
    const naFila = r => r.status_local === 'fila' || r.status_local === 'enviando';
    const cs = (await VL.rascunhos.todos()).filter(naFila).length + (await VL.apontamentos.todos()).filter(naFila).length;
    return { fotos, cs };
  };
  // Limpa fotos já enviadas há mais de 7 dias (a miniatura fica até lá).
  VL.limpar = async () => {
    const lim = Date.now() - 7 * 864e5;
    for (const f of await VL.fotos.todos()) if (f.status === 'enviada' && new Date(f.criadaEm || 0).getTime() < lim) await VL.fotos.del(f.id_foto);
  };

  window.addEventListener('online', () => { espera = 5000; VL.processar(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) VL.processar(); });
  setTimeout(() => { VL.processar(); VL.limpar().catch(() => { }); }, 1500);
  return VL;
})();
