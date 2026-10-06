// SIGONET V2 — sincronização com o servidor (Apps Script + planilha do V2).
//
// Com SIGONET_SERVIDOR preenchido (config.js), todos veem a mesma base:
//  • login validado no servidor (PIN e complemento nunca descem para o navegador);
//  • cada alteração vira um envio só do que mudou, com controle de versão por
//    registro (se duas pessoas mexerem no mesmo, a segunda é avisada);
//  • a cada 20s as telas puxam o que outras pessoas alteraram;
//  • fotos, PDFs e NFs vão para o Google Drive.
// Sem servidor configurado, nada aqui é usado (modo de testes local).

SN.remoto = typeof SIGONET_SERVIDOR === 'string' && /^https?:\/\//.test(SIGONET_SERVIDOR);
// Chave de cada coleção (igual à do servidor).
SN.CHAVES = { chamados: 'id', lpus: 'id', materiais: 'id', fibras: 'id', pagamentos: 'id', fechamentos: 'mes', disponibilidade: 'id',
  empresas: 'nome', contas: 'codigo', tecnicos: 'id', lideranca: 'id', log: 'id', integracoes: 'id', estoques: 'id' };

// Ações só de leitura podem ser repetidas com segurança quando o Google falha.
// Pedidos que podem ser repetidos sem efeito colateral (PROX_ID pode pular um número;
// ANEXO pode deixar um arquivo a mais no Drive — nada que quebre).
const REPETIVEIS = ['USUARIOS', 'LOGIN', 'CARREGAR', 'SINCRONIZAR', 'STATUS_ACESSOS', 'PROX_ID', 'ANEXO'];
// Espera antes de tentar de novo, com sorteio: com 30 pessoas, ninguém insiste no mesmo segundo.
const espera = (base, faixa) => new Promise(ok => setTimeout(ok, base + Math.random() * faixa));
SN.api = async (acao, dados, tentativa = 1) => {
  const s = SN.sessao();
  let j;
  try {
    // Tempo limite: um pedido pendurado não pode travar a fila de envio para sempre.
    const r = await fetch(SIGONET_SERVIDOR, { method: 'POST', body: JSON.stringify({ acao, token: s && s.token, ...(dados || {}) }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(acao === 'CARREGAR' || acao === 'ANEXO' ? 180000 : 90000) : undefined });
    const txt = await r.text();
    // Com o servidor ocupado o Google devolve uma página HTML de erro em vez de JSON.
    try { j = JSON.parse(txt); } catch (e) { throw new Error('Servidor ocupado no momento. Tente de novo em alguns segundos.'); }
    // Google instável às vezes entrega a página de status (doGet) no lugar da resposta do pedido
    // (visto no teste de carga). A resposta se perdeu: trata como "sem resposta" e tenta de novo.
    if (j && j.sistema && j.hora && !j.erro) throw new Error('Resposta do servidor se perdeu.');
  } catch (e) {
    if (tentativa < 3 && REPETIVEIS.includes(acao)) { await espera(1500 * tentativa, 2000); return SN.api(acao, dados, tentativa + 1); }
    const err = new Error(e instanceof TypeError || e.name === 'TimeoutError' || e.name === 'AbortError' ? 'Sem conexão com o servidor.' : e.message); err.rede = true; throw err;
  }
  // Servidor sobrecarregado por um instante (muitos acessos simultâneos à planilha):
  // leituras tentam de novo sozinhas, com espera sorteada.
  if (!j.ok && !j.sessao && tentativa < 3 && REPETIVEIS.includes(acao) && /ocupado|simult|too many/i.test(j.erro || '')) {
    await espera(2000 * tentativa, 3000); return SN.api(acao, dados, tentativa + 1);
  }
  if (!j.ok) {
    const err = new Error(j.erro || 'Erro no servidor');
    if (j.sessao) {
      err.sessao = true;
      // Só derruba a sessão que fez o pedido (resposta atrasada de quem já saiu não derruba quem entrou depois).
      const atual = SN.sessao();
      if (atual && s && atual.token === s.token) { SN.encerrarSessao(); setTimeout(() => { SN.toast(j.erro, 'erro'); SN.prepararLogin().then(() => SN.navegar('#/login')); }, 0); }
    }
    throw err;
  }
  return j;
};

// Estado de sincronização
SN._snap = {};   // coleção → chave → JSON do que o servidor já tem
SN._ver = {};    // coleção → chave → versão
SN._ultimaSync = '';
SN._assinEnviadas = {};
// Enviado sem resposta (coleção → id → JSON enviado). No reenvio vai junto como "alt":
// se o servidor tiver exatamente isso, foi este aparelho que gravou e não é conflito.
SN._semResposta = {};
const snapDoc = (col, doc) => { const d = { ...doc }; delete d._v; return JSON.stringify(d); };
const fotografar = () => {
  SN._snap = {}; Object.keys(SN.CHAVES).forEach(col => {
    SN._snap[col] = {}; (SN.db[col] || []).forEach(d => { SN._snap[col][d[SN.CHAVES[col]]] = snapDoc(col, d); });
  });
  SN._assinEnviadas = { ...(SN.db.assinaturas || {}) };
};
const tirarVersoes = (col, docs) => docs.map(d => { (SN._ver[col] = SN._ver[col] || {})[d[SN.CHAVES[col]]] = d._v; const x = { ...d }; delete x._v; return x; });

// Limpeza dos dados de teste (feita em 2026-10-01; a ação LIMPAR_OPERACIONAL foi retirada depois):
// a configuração do servidor guarda config.limpeza.
// O aparelho que ainda não viu essa marca descarta o que guardou daquela época:
// números reservados (iam repetir com a numeração recomeçada), rascunhos, fotos e
// apontamentos da Preventiva na fila e a carga da Preventiva em memória.
const CHAVE_LIMPEZA = 'sigonet_v2_limpeza';
SN.conferirLimpeza = async ts => {
  if (!ts) return false;
  let vista = ''; try { vista = localStorage.getItem(CHAVE_LIMPEZA) || ''; } catch (e) { }
  if (vista === ts) return false;
  try { Object.keys(localStorage).filter(k => k.startsWith('sigonet_v2_ids|')).forEach(k => localStorage.removeItem(k)); } catch (e) { }
  if (SN.VL) for (const loja of ['rascunhos', 'fotos', 'apontamentos']) {
    const todos = await SN.VL[loja].todos().catch(() => []);
    for (const x of todos) await SN.VL[loja].del(x.id_vistoria || x.id_foto || x.id_apontamento).catch(() => { });
  }
  if (SN.vst) SN.vst.dados = null;
  try { localStorage.setItem(CHAVE_LIMPEZA, ts); } catch (e) { }
  return true;
};
SN.carregarRemoto = async () => {
  const r = await SN.api('CARREGAR');
  await SN.conferirLimpeza(r.db.config && r.db.config.limpeza);
  const db = SN.baseVazia();
  SN._ver = {};
  Object.keys(SN.CHAVES).forEach(col => { db[col] = tirarVersoes(col, r.db[col] || []); });
  db.seq = (r.db.config && r.db.config.seq) || {};
  db.assinaturas = (r.db.config && r.db.config.assinaturas) || {};
  db.janela = r.db.janela || null; db.periodos = {}; // liderança: meses antes da janela vêm sob demanda
  SN.db = db; SN._ultimaSync = r.db.servidorTs; SN.offline = false;
  fotografar();
  SN.guardarLocal();
  SN.carregarStatusAcessos();
  if (SN.vst && SN.vst.preaquecer) SN.vst.preaquecer();
  if (SN.conversa) SN.conversa.iniciarAvisos(); // aviso de mensagem nova da conversa, em qualquer tela
  // Técnico: números para criar registro sem sinal. Horário sorteado (1 a 6 min): no começo do
  // turno todos entram juntos e o pedido usa a trava do servidor (teste de carga).
  if (SN.reabastecerIds) setTimeout(SN.reabastecerIds, 60000 + Math.random() * 300000);
  setTimeout(SN.subirAnexos, 2500); // fotos que ficaram no aparelho (ex.: página recarregou ao abrir a câmera)
};

// Lista de nomes para a tela de login (sem PIN). Se a base estiver vazia, é o
// primeiro uso: envia os cadastros iniciais (dados.js) para o servidor.
SN.prepararLogin = async () => {
  let r = await SN.api('USUARIOS');
  if (r.vazio) {
    SN.toast('Primeiro uso: enviando cadastros iniciais para o servidor…');
    const b = SN.baseVazia();
    await SN.api('SEMEAR', { dados: { empresas: b.empresas, contas: b.contas, tecnicos: b.tecnicos, lideranca: b.lideranca, seq: {} } });
    r = await SN.api('USUARIOS');
  }
  const db = SN.baseVazia();
  db.lideranca = r.lideranca.map(l => ({ nome: l.nome, cargo: l.cargo, ativo: true, telas: [] }));
  db.tecnicos = Object.entries(r.empresas).flatMap(([empresa, nomes]) => nomes.map(nome => ({ empresa, nome, ativo: true })));
  SN.db = db;
};

// Status de acesso (quem já criou o complemento) para a tela Cadastros.
SN._acessos = {}; SN._acessosTs = 0;
SN.carregarStatusAcessos = async () => {
  if (!SN.temTela('cadastros')) return;
  try { SN._acessos = (await SN.api('STATUS_ACESSOS')).acessos || {}; SN._acessosTs = Date.now(); } catch (e) { }
};

// ─────────── Cópia no aparelho (IndexedDB) ───────────
// Guarda a base, o que o servidor já tem (snap/versões) e a marca da última
// sincronização, por pessoa. Serve para:
//  - abrir o app SEM SINAL com a última cópia (as alterações sobem quando o sinal volta);
//  - não perder o que foi feito sem sinal se o celular fechar a aba: ao abrir de novo,
//    o que ainda não tinha subido é reaplicado sobre a base nova do servidor.
const LOCAL_BD = 'sigonet_v2_local';
const bdLocal = () => new Promise((ok, falha) => {
  if (!window.indexedDB) return falha(new Error('sem IndexedDB'));
  const r = indexedDB.open(LOCAL_BD, 1);
  r.onupgradeneeded = () => r.result.createObjectStore('estado');
  r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error);
});
const chaveLocal = () => { const s = SN.sessao(); return s ? ['estado', s.tipo, s.empresa || '', s.nome].join('|') : null; };
SN.lerLocal = async () => {
  const k = chaveLocal(); if (!k) return null;
  try { const bd = await bdLocal(); return await new Promise((ok, falha) => { const q = bd.transaction('estado').objectStore('estado').get(k); q.onsuccess = () => ok(q.result || null); q.onerror = () => falha(q.error); }); }
  catch (e) { return null; }
};
SN.apagarLocal = async () => {
  clearTimeout(timerLocal);
  const k = chaveLocal(); if (!k) return;
  try { const bd = await bdLocal(); bd.transaction('estado', 'readwrite').objectStore('estado').delete(k); } catch (e) { }
};
let timerLocal = null;
// ja = true: grava já (ex.: foto nova — o celular pode recarregar a página ao abrir a câmera).
SN.guardarLocal = ja => { clearTimeout(timerLocal); timerLocal = setTimeout(async () => {
  const k = chaveLocal(); if (!k || !SN.db || !SN._ultimaSync) return;
  try {
    const bd = await bdLocal();
    bd.transaction('estado', 'readwrite').objectStore('estado').put({ db: SN.db, snap: SN._snap, ver: SN._ver, ultimaSync: SN._ultimaSync,
      assin: SN._assinEnviadas, semResposta: SN._semResposta, ts: Date.now() }, k);
  } catch (e) { /* aparelho sem espaço ou modo privado: segue só em memória */ }
}, ja === true ? 0 : 1200); };
// Depois de carregar do servidor: reaplica o que foi feito neste aparelho e não subiu.
SN.recuperarPendentes = async () => {
  const L = await SN.lerLocal(); if (!L || !L.db || !L.snap) return 0;
  let recuperados = 0, conflitos = 0;
  Object.entries(SN.CHAVES).forEach(([col, k]) => {
    if (col === 'log' || col === 'integracoes') {
      (L.db[col] || []).forEach(d => { if (!(L.snap[col] || {})[d[k]] && !(SN.db[col] || []).some(x => x[k] === d[k])) { (SN.db[col] = SN.db[col] || []).push(d); recuperados++; } });
      return;
    }
    (L.db[col] || []).forEach(d => {
      const id = d[k], local = snapDoc(col, d);
      if ((L.snap[col] || {})[id] === local) return; // nada pendente neste registro
      const lista = SN.db[col] = SN.db[col] || [], i = lista.findIndex(x => String(x[k]) === String(id));
      const noServidor = i >= 0 ? snapDoc(col, lista[i]) : null;
      if (noServidor === local) return; // já tinha subido (a resposta é que se perdeu)
      const verAntes = (L.ver[col] || {})[id], verAgora = (SN._ver[col] || {})[id];
      const meuEnvio = (L.semResposta && L.semResposta[col] || {})[id];
      if (i < 0 || verAntes == null || verAntes === verAgora || (meuEnvio && meuEnvio === noServidor)) {
        if (i >= 0) lista[i] = d; else lista.push(d);
        if (meuEnvio) (SN._semResposta[col] = SN._semResposta[col] || {})[id] = meuEnvio;
        recuperados++;
      } else conflitos++; // outra pessoa mudou no servidor: vale a versão do servidor
    });
  });
  if (recuperados) { SN.salvarRemoto(); SN.toast(recuperados + ' alteração(ões) feita(s) sem sinal recuperada(s) e enviada(s).', 'ok'); }
  if (conflitos) SN.toast(conflitos + ' alteração(ões) feita(s) sem sinal não foram aplicadas: outra pessoa mudou o mesmo registro antes. Confira e refaça se precisar.', 'erro');
  return recuperados;
};
// Sem sinal ao abrir: usa a última cópia do aparelho.
SN.abrirOffline = async () => {
  const L = await SN.lerLocal(); if (!L || !L.db) return false;
  SN.db = L.db; SN._snap = L.snap || {}; SN._ver = L.ver || {}; SN._ultimaSync = L.ultimaSync; SN._assinEnviadas = L.assin || {}; SN._semResposta = L.semResposta || {};
  SN.offline = true; pendente = true; // o que difere do servidor sobe quando o sinal voltar
  return true;
};

// ─────────── Envio do que mudou ───────────
let filaTimer = null, enviando = false, pendente = false, avisoSemSinal = 0;
SN.salvarRemoto = () => { pendente = true; clearTimeout(filaTimer); filaTimer = setTimeout(SN.enviarMudancas, 350); };
SN.enviarMudancas = async () => {
  if (enviando) { filaTimer = setTimeout(SN.enviarMudancas, 500); return; }
  const ops = [];
  Object.entries(SN.CHAVES).forEach(([col, k]) => {
    const snap = SN._snap[col] = SN._snap[col] || {};
    const vistos = new Set();
    (SN.db[col] || []).forEach(d => {
      const id = d[k]; vistos.add(String(id)); const s = snapDoc(col, d);
      if (snap[id] !== s) { const alt = (SN._semResposta[col] || {})[id]; ops.push({ colecao: col, id, doc: JSON.parse(s), v: (SN._ver[col] || {})[id], alt, _s: s, _ant: snap[id] }); }
    });
    // Auditoria e integrações nunca são apagadas no servidor (no navegador só guardamos as mais recentes).
    if (col === 'log' || col === 'integracoes') { Object.keys(snap).forEach(id => { if (!vistos.has(String(id))) delete snap[id]; }); return; }
    Object.keys(snap).forEach(id => { if (!vistos.has(String(id))) ops.push({ colecao: col, id, excluir: true, v: (SN._ver[col] || {})[id] }); });
  });
  const assin = {}; Object.entries(SN.db.assinaturas || {}).forEach(([n, v]) => { if ((SN._assinEnviadas[n] || 0) < v) assin[n] = v; });
  pendente = false;
  if (!ops.length && !Object.keys(assin).length) return;
  enviando = true;
  // marca como enviado já (se falhar, desfaz e tenta de novo)
  ops.forEach(o => { if (o.excluir) delete SN._snap[o.colecao][o.id]; else SN._snap[o.colecao][o.id] = o._s; });
  try {
    // Chamado vai com a base (o que este aparelho tinha do servidor) para o servidor juntar mudanças em partes diferentes.
    const r = await SN.api('SALVAR', { ops: ops.map(({ _s, _ant, ...o }) => o.colecao === 'chamados' && _ant && !o.excluir ? { ...o, base: _ant } : o), assinaturas: Object.keys(assin).length ? assin : undefined });
    Object.assign(SN._assinEnviadas, assin); SN.offline = false;
    let conflitos = 0, mesclados = 0;
    r.resultados.forEach(x => {
      if (SN._semResposta[x.colecao]) delete SN._semResposta[x.colecao][x.id]; // teve resposta
      SN._errosEnvio[x.colecao + '|' + x.id] = x.erro || '';
      const ver = SN._ver[x.colecao] = SN._ver[x.colecao] || {};
      if (x.conflito) {
        conflitos++;
        const k = SN.CHAVES[x.colecao], lista = SN.db[x.colecao], i = lista.findIndex(d => String(d[k]) === String(x.id));
        if (i >= 0) lista[i] = x.atual; else lista.push(x.atual);
        ver[x.id] = x.v; SN._snap[x.colecao][x.id] = snapDoc(x.colecao, x.atual);
      } else if (x.erro) {
        SN.toast(`Não gravado (${x.colecao} ${x.id}): ${x.erro}`, 'erro');
        // Recusado por permissão: a tela volta ao que está no servidor (não fica parecendo gravado).
        const op = ops.find(o => o.colecao === x.colecao && String(o.id) === String(x.id));
        if (/permiss/i.test(x.erro) && op && op._ant) {
          const k = SN.CHAVES[x.colecao], lista = SN.db[x.colecao], i = lista.findIndex(d => String(d[k]) === String(x.id));
          if (i >= 0) lista[i] = JSON.parse(op._ant);
          SN._snap[x.colecao][x.id] = op._ant; SN.aoMudarBase && SN.aoMudarBase();
        }
      }
      else if (x.excluido) delete ver[x.id];
      else if (x.mesclado) { // o servidor juntou com a mudança de outra pessoa: a tela passa a mostrar o resultado
        const k = SN.CHAVES[x.colecao], lista = SN.db[x.colecao], i = lista.findIndex(d => String(d[k]) === String(x.id));
        if (i >= 0) lista[i] = x.mesclado; else lista.push(x.mesclado);
        ver[x.id] = x.v; SN._snap[x.colecao][x.id] = snapDoc(x.colecao, x.mesclado); mesclados++;
      }
      else ver[x.id] = x.v;
    });
    if (conflitos) { SN.toast(`${conflitos} registro(s) tinham sido alterados por outra pessoa — a tela foi atualizada com a versão mais nova. Refaça sua alteração se precisar.`, 'erro'); SN.aoMudarBase(); }
    else if (mesclados) SN.aoMudarBase();
  } catch (e) {
    ops.forEach(o => { if (!o.excluir) { delete SN._snap[o.colecao][o.id]; (SN._semResposta[o.colecao] = SN._semResposta[o.colecao] || {})[o.id] = o._s; } }); // volta a ser "pendente"
    pendente = true;
    if (!e.message.includes('Sessão') && (!e.rede || Date.now() - avisoSemSinal > 120000)) {
      if (e.rede) avisoSemSinal = Date.now();
      SN.toast(e.rede ? 'Sem sinal: as alterações ficam guardadas neste aparelho e sobem sozinhas quando o sinal voltar.' : 'Não foi possível salvar agora (' + e.message + '). Vou tentar de novo.', e.rede ? '' : 'erro');
    }
    SN.offline = !!e.rede;
    clearTimeout(filaTimer); filaTimer = setTimeout(SN.enviarMudancas, 5000 + Math.random() * 7000);
  } finally { enviando = false; SN.indicadorSync(); SN.guardarLocal(); }
};
// Resultado do último envio de um registro: erro do servidor ('' = gravou) e se ainda falta subir.
SN._errosEnvio = {};
SN.erroEnvio = (col, id) => SN._errosEnvio[col + '|' + id] || '';
SN.pendenteEnvio = (col, id) => {
  const k = SN.CHAVES[col], d = (SN.db[col] || []).find(x => String(x[k]) === String(id));
  return !!d && (SN._snap[col] || {})[id] !== snapDoc(col, d);
};
// Aguarda tudo ser gravado (usado antes de ações que dependem do registro já existir no servidor).
SN.salvarAgora = async () => { clearTimeout(filaTimer); await SN.enviarMudancas(); while (enviando) await new Promise(r => setTimeout(r, 150)); };

// ─────────── Receber o que outros alteraram ───────────
// Junta registros vindos do servidor sem passar por cima de edição local ainda não enviada.
const mesclar = mudancas => {
  let mudou = false;
  Object.entries(mudancas || {}).forEach(([col, docs]) => {
    const k = SN.CHAVES[col]; if (!k) return;
    const lista = SN.db[col] = SN.db[col] || [], snap = SN._snap[col] = SN._snap[col] || {};
    tirarVersoes(col, docs).forEach(d => {
      const id = d[k], i = lista.findIndex(x => String(x[k]) === String(id));
      if (i >= 0 && snapDoc(col, lista[i]) !== snap[id]) return; // tem edição local ainda não enviada
      if (i >= 0 && snapDoc(col, lista[i]) === snapDoc(col, d)) return;
      if (i >= 0) lista[i] = d; else lista.push(d);
      snap[id] = snapDoc(col, d); mudou = true;
    });
  });
  return mudou;
};

// Liderança: a carga traz o mês atual e os JANELA anteriores (e tudo que está em
// andamento). Um mês mais antigo (Portal) ou um chamado antigo (link) é buscado aqui,
// uma vez por sessão. Devolve true se precisou buscar.
SN.foraDaJanela = mes => !!(SN.remoto && SN.db.janela && mes && mes < SN.db.janela.desde);
SN.garantirMes = async mes => {
  if (!SN.foraDaJanela(mes) || (SN.db.periodos || {})[mes]) return false;
  const r = await SN.api('CARREGAR_PERIODO', { mes });
  mesclar(r.db); (SN.db.periodos = SN.db.periodos || {})[mes] = true; SN.guardarLocal();
  return true;
};
SN.buscarChamado = async id => {
  if (!SN.remoto || !SN.db.janela || SN.offline) return null;
  const r = await SN.api('CARREGAR_PERIODO', { id });
  mesclar(r.db); SN.guardarLocal();
  return SN.db.chamados.find(x => x.id === id) || null;
};
let sincronizando = false;
SN.sincronizar = async () => {
  if (!SN.sessao() || enviando || pendente || !SN._ultimaSync || sincronizando) return;
  sincronizando = true;
  try {
    const r = await SN.api('SINCRONIZAR', { desde: SN._ultimaSync });
    if (r.config && await SN.conferirLimpeza(r.config.limpeza)) { // dados de teste apagados: recarrega tudo
      await SN.carregarRemoto(); SN.aoMudarBase(); return;
    }
    let mudou = mesclar(r.mudancas);
    // Saiu do recorte desta pessoa (ex.: chamado reatribuído a outra empresa): tira da
    // tela e do "que o servidor tem" — senão o envio entenderia como exclusão.
    Object.entries(r.fora || {}).forEach(([col, ids]) => {
      const k = SN.CHAVES[col]; if (!k || !SN.db[col]) return;
      ids.forEach(id => {
        const i = SN.db[col].findIndex(x => String(x[k]) === String(id));
        if (i >= 0 && snapDoc(col, SN.db[col][i]) !== (SN._snap[col] || {})[id]) return; // edição local pendente: deixa subir primeiro
        if (i >= 0) { SN.db[col].splice(i, 1); mudou = true; }
        if (SN._snap[col]) delete SN._snap[col][id]; if (SN._ver[col]) delete SN._ver[col][id];
      });
    });
    if (r.config && r.config.assinaturas) Object.entries(r.config.assinaturas).forEach(([n, v]) => {
      SN.db.assinaturas[n] = Math.max(SN.db.assinaturas[n] || 0, v); SN._assinEnviadas[n] = Math.max(SN._assinEnviadas[n] || 0, v); });
    SN._ultimaSync = r.servidorTs; SN.offline = false;
    if (mudou) SN.aoMudarBase();
    SN.guardarLocal();
  } catch (e) { if (e.rede) SN.offline = true; /* tenta no próximo ciclo */ } finally { sincronizando = false; SN.indicadorSync(); }
};

// Indicador discreto no cabeçalho
SN.indicadorSync = () => {
  const el = document.getElementById('sync'); if (!el) return;
  el.textContent = SN.offline ? ((enviando || pendente) ? '○ sem sinal · guardado no aparelho' : '○ sem sinal') : (enviando || pendente) ? '⟳ salvando…' : '● online';
  el.title = SN.offline ? 'Sem conexão com o servidor. O que você fizer fica guardado neste aparelho e sobe quando o sinal voltar.'
    : (enviando || pendente) ? 'Enviando alterações para o servidor' : 'Tudo salvo no servidor';
};
window.addEventListener('beforeunload', ev => { if (SN.remoto && (enviando || pendente)) { ev.preventDefault(); ev.returnValue = ''; } });

// ─────────── Substitui o armazenamento local quando há servidor ───────────
if (SN.remoto) {
  SN.salvar = () => { if (SN.sessao()) { SN.salvarRemoto(); SN.indicadorSync(); SN.guardarLocal(); } }; // sem sessão não há o que gravar
  SN.login = async dados => {
    const r = await SN.api('LOGIN', dados);
    if (r.primeiroAcesso) return { primeiroAcesso: true };
    SN.gravarSessao({ tipo: dados.tipo, nome: dados.nome, empresa: dados.empresa || '', token: r.token, expira: Date.now() + 16 * 3600e3 });
    // Se a base não carregar, não deixa a pessoa "meio logada": desfaz e mostra o erro.
    try { await SN.carregarRemoto(); } catch (e) { SN.encerrarSessao(); throw e; }
    await SN.recuperarPendentes(); // o que ficou sem subir na sessão anterior neste aparelho
    SN.log('LOGIN', dados.tipo, dados.nome); SN.salvar();
    return { ok: true };
  };
  SN.sair = async () => {
    SN.log('LOGOUT', '', ''); await SN.salvarAgora().catch(() => { });
    const s = SN.sessao(); if (s) SN.api('LOGOUT').catch(() => { });
    if (!pendente) await SN.apagarLocal(); // com algo ainda sem subir, a cópia fica para o próximo login
    SN.encerrarSessao();
    await SN.prepararLogin().catch(() => { }); location.hash = '#/login'; SN.render();
  };
  // Números sem sinal: o aparelho do técnico guarda alguns IDs reservados no servidor
  // (LPU, MAT, FIB) e usa um deles quando está sem sinal. Os reservados já são únicos
  // (o contador do servidor andou); os que não forem usados viram só um pulo na numeração.
  const RESERVA_PREFIXOS = ['LPU', 'MAT', 'FIB'], RESERVA_QTD = 5;
  const chaveReserva = () => { const s = SN.sessao(); return s ? 'sigonet_v2_ids|' + s.tipo + '|' + (s.empresa || '') + '|' + s.nome : null; };
  const lerReserva = () => { try { return JSON.parse(localStorage.getItem(chaveReserva()) || '{}'); } catch (e) { return {}; } };
  const gravarReserva = r => { try { localStorage.setItem(chaveReserva(), JSON.stringify(r)); } catch (e) { } };
  let reabastecendo = false;
  SN.reabastecerIds = async () => {
    const s = SN.sessao(); if (!s || s.tipo !== 'tecnico' || reabastecendo || SN.offline) return;
    reabastecendo = true;
    try {
      const faltam = RESERVA_PREFIXOS.filter(p => (lerReserva()[p] || []).length < 2);
      if (faltam.length) { // um pedido só para todos os tipos (uma trava no servidor)
        const r = await SN.api('PROX_ID', { prefixo: faltam[0], prefixos: faltam, qtd: RESERVA_QTD });
        const res = lerReserva(), por = r.porPrefixo || { [faltam[0]]: r.ids || [r.id] };
        Object.keys(por).forEach(p => { res[p] = (res[p] || []).concat(por[p]); });
        gravarReserva(res);
      }
    } catch (e) { /* sem sinal: tenta na próxima */ } finally { reabastecendo = false; }
  };
  const usarReserva = pref => { const res = lerReserva(), id = (res[pref] || []).shift(); if (id) gravarReserva(res); return id || null; };
  SN.novoId = async pref => {
    const semSinal = SN.offline || navigator.onLine === false;
    if (semSinal) { const id = usarReserva(pref); if (id) return id; }
    try { const r = await SN.api('PROX_ID', { prefixo: pref }); setTimeout(SN.reabastecerIds, 5000 + Math.random() * 20000); return r.id; }
    catch (e) {
      if (!e.rede) throw e;
      SN.offline = true; SN.indicadorSync();
      const id = usarReserva(pref); if (id) return id;
      throw new Error('Sem sinal e sem número reservado neste aparelho para criar o registro. Tente de novo quando o sinal voltar.');
    }
  };
  setInterval(SN.sincronizar, 30000);
  setInterval(() => { if (SN.anexosPendentes().length) SN.subirAnexos(); }, 45000); // fotos que ficaram no aparelho
  document.addEventListener('visibilitychange', () => { if (!document.hidden) SN.sincronizar(); });
  // Sinal voltou: envia o que ficou guardado e busca as novidades na hora.
  window.addEventListener('online', () => { if (SN.sessao()) { SN.salvarRemoto(); setTimeout(SN.sincronizar, 3000); setTimeout(SN.subirAnexos, 4000); } });
}

// Inicialização (chamada pelo index.html)
SN.iniciar = async () => {
  if (!SN.remoto) { SN.carregar(); SN.render(); return; }
  document.getElementById('app').innerHTML = '<div class="abertura">' + SN.foguete() + '<img class="abertura-letras" src="' + MARCA.LETRAS + '" alt="SigoNet"><p>Conectando ao servidor…</p></div>';
  try {
    // Login antigo do modo teste (sem token do servidor) não vale aqui: descarta e pede login.
    if (SN.sessao() && !SN.sessao().token) SN.encerrarSessao();
    if (SN.sessao() && SN.sessao().token) {
      // Só descarta o login se o servidor disse que a sessão venceu; falha passageira mostra "Tentar de novo".
      // Aparelho já sabe que está sem rede: abre na hora com a cópia (sem esperar as tentativas).
      if (navigator.onLine === false && await SN.abrirOffline()) { SN.render(); SN.salvarRemoto(); SN.toast('Sem sinal: abrindo a última cópia guardada neste aparelho. O que você fizer sobe quando o sinal voltar.'); SN.indicadorSync(); return; }
      try { await SN.carregarRemoto(); await SN.recuperarPendentes(); }
      catch (e) {
        if (e.sessao) { /* sessão vencida: vai para o login */ }
        else if (e.rede && await SN.abrirOffline()) { SN.render(); SN.salvarRemoto(); SN.toast('Sem sinal: abrindo a última cópia guardada neste aparelho. O que você fizer sobe quando o sinal voltar.'); SN.indicadorSync(); return; }
        else throw e;
      }
    }
    if (!SN.sessao()) await SN.prepararLogin();
    SN.render();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="login-wrap"><div class="card" style="max-width:520px"><h2>Sem conexão com o servidor</h2>
      <p>${SN.esc(e.message)}</p><p class="small muted">Confira a internet e o endereço em <span class="mono">js/config.js</span>.</p>
      <button class="btn prim" onclick="location.reload()">Tentar de novo</button></div></div>`;
  }
};
