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
  empresas: 'nome', contas: 'codigo', tecnicos: 'id', lideranca: 'id', log: 'id', integracoes: 'id' };

SN.api = async (acao, dados) => {
  const s = SN.sessao();
  let r;
  try {
    r = await fetch(SIGONET_SERVIDOR, { method: 'POST', body: JSON.stringify({ acao, token: s && s.token, ...(dados || {}) }) });
  } catch (e) { const err = new Error('Sem conexão com o servidor.'); err.rede = true; throw err; }
  const j = await r.json();
  if (!j.ok) {
    if (j.sessao) { localStorage.removeItem('sigonet_v2_sessao'); setTimeout(() => { SN.toast(j.erro, 'erro'); SN.prepararLogin().then(() => SN.navegar('#/login')); }, 0); }
    throw new Error(j.erro || 'Erro no servidor');
  }
  return j;
};

// Estado de sincronização
SN._snap = {};   // coleção → chave → JSON do que o servidor já tem
SN._ver = {};    // coleção → chave → versão
SN._ultimaSync = '';
SN._assinEnviadas = {};
const snapDoc = (col, doc) => { const d = { ...doc }; delete d._v; return JSON.stringify(d); };
const fotografar = () => {
  SN._snap = {}; Object.keys(SN.CHAVES).forEach(col => {
    SN._snap[col] = {}; (SN.db[col] || []).forEach(d => { SN._snap[col][d[SN.CHAVES[col]]] = snapDoc(col, d); });
  });
  SN._assinEnviadas = { ...(SN.db.assinaturas || {}) };
};
const tirarVersoes = (col, docs) => docs.map(d => { (SN._ver[col] = SN._ver[col] || {})[d[SN.CHAVES[col]]] = d._v; const x = { ...d }; delete x._v; return x; });

SN.carregarRemoto = async () => {
  const r = await SN.api('CARREGAR');
  const db = SN.baseVazia();
  SN._ver = {};
  Object.keys(SN.CHAVES).forEach(col => { db[col] = tirarVersoes(col, r.db[col] || []); });
  db.seq = (r.db.config && r.db.config.seq) || {};
  db.assinaturas = (r.db.config && r.db.config.assinaturas) || {};
  SN.db = db; SN._ultimaSync = r.db.servidorTs;
  fotografar();
  SN.carregarStatusAcessos();
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

// ─────────── Envio do que mudou ───────────
let filaTimer = null, enviando = false, pendente = false;
SN.salvarRemoto = () => { pendente = true; clearTimeout(filaTimer); filaTimer = setTimeout(SN.enviarMudancas, 350); };
SN.enviarMudancas = async () => {
  if (enviando) { filaTimer = setTimeout(SN.enviarMudancas, 500); return; }
  const ops = [];
  Object.entries(SN.CHAVES).forEach(([col, k]) => {
    const snap = SN._snap[col] = SN._snap[col] || {};
    const vistos = new Set();
    (SN.db[col] || []).forEach(d => {
      const id = d[k]; vistos.add(String(id)); const s = snapDoc(col, d);
      if (snap[id] !== s) ops.push({ colecao: col, id, doc: JSON.parse(s), v: (SN._ver[col] || {})[id], _s: s });
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
    const r = await SN.api('SALVAR', { ops: ops.map(({ _s, ...o }) => o), assinaturas: Object.keys(assin).length ? assin : undefined });
    Object.assign(SN._assinEnviadas, assin);
    let conflitos = 0;
    r.resultados.forEach(x => {
      const ver = SN._ver[x.colecao] = SN._ver[x.colecao] || {};
      if (x.conflito) {
        conflitos++;
        const k = SN.CHAVES[x.colecao], lista = SN.db[x.colecao], i = lista.findIndex(d => String(d[k]) === String(x.id));
        if (i >= 0) lista[i] = x.atual; else lista.push(x.atual);
        ver[x.id] = x.v; SN._snap[x.colecao][x.id] = snapDoc(x.colecao, x.atual);
      } else if (x.erro) { SN.toast(`Não gravado (${x.colecao} ${x.id}): ${x.erro}`, 'erro'); }
      else if (x.excluido) delete ver[x.id];
      else ver[x.id] = x.v;
    });
    if (conflitos) { SN.toast(`${conflitos} registro(s) tinham sido alterados por outra pessoa — a tela foi atualizada com a versão mais nova. Refaça sua alteração se precisar.`, 'erro'); SN.aoMudarBase(); }
  } catch (e) {
    ops.forEach(o => { if (!o.excluir) delete SN._snap[o.colecao][o.id]; }); // volta a ser "pendente"
    pendente = true;
    if (!e.message.includes('Sessão')) SN.toast('Não foi possível salvar agora (' + e.message + '). Vou tentar de novo.', 'erro');
    clearTimeout(filaTimer); filaTimer = setTimeout(SN.enviarMudancas, 8000);
  } finally { enviando = false; SN.indicadorSync(); }
};
// Aguarda tudo ser gravado (usado antes de ações que dependem do registro já existir no servidor).
SN.salvarAgora = async () => { clearTimeout(filaTimer); await SN.enviarMudancas(); while (enviando) await new Promise(r => setTimeout(r, 150)); };

// ─────────── Receber o que outros alteraram ───────────
SN.sincronizar = async () => {
  if (!SN.sessao() || enviando || pendente || !SN._ultimaSync) return;
  try {
    const r = await SN.api('SINCRONIZAR', { desde: SN._ultimaSync });
    let mudou = false;
    Object.entries(r.mudancas || {}).forEach(([col, docs]) => {
      const k = SN.CHAVES[col]; if (!k) return;
      const lista = SN.db[col] = SN.db[col] || [];
      tirarVersoes(col, docs).forEach(d => {
        const id = d[k], i = lista.findIndex(x => String(x[k]) === String(id));
        if (i >= 0 && snapDoc(col, lista[i]) !== SN._snap[col][id]) return; // tem edição local ainda não enviada
        if (i >= 0 && snapDoc(col, lista[i]) === snapDoc(col, d)) return;
        if (i >= 0) lista[i] = d; else lista.push(d);
        SN._snap[col][id] = snapDoc(col, d); mudou = true;
      });
    });
    if (r.config && r.config.assinaturas) Object.entries(r.config.assinaturas).forEach(([n, v]) => {
      SN.db.assinaturas[n] = Math.max(SN.db.assinaturas[n] || 0, v); SN._assinEnviadas[n] = Math.max(SN._assinEnviadas[n] || 0, v); });
    SN._ultimaSync = r.servidorTs;
    if (mudou) SN.aoMudarBase();
  } catch (e) { /* tenta no próximo ciclo */ }
};

// Indicador discreto no cabeçalho
SN.indicadorSync = () => {
  const el = document.getElementById('sync'); if (!el) return;
  el.textContent = (enviando || pendente) ? '⟳ salvando…' : '● online';
  el.title = (enviando || pendente) ? 'Enviando alterações para o servidor' : 'Tudo salvo no servidor';
};
window.addEventListener('beforeunload', ev => { if (SN.remoto && (enviando || pendente)) { ev.preventDefault(); ev.returnValue = ''; } });

// ─────────── Substitui o armazenamento local quando há servidor ───────────
if (SN.remoto) {
  SN.salvar = () => { if (SN.sessao()) { SN.salvarRemoto(); SN.indicadorSync(); } }; // sem sessão não há o que gravar
  SN.login = async dados => {
    const r = await SN.api('LOGIN', dados);
    if (r.primeiroAcesso) return { primeiroAcesso: true };
    localStorage.setItem('sigonet_v2_sessao', JSON.stringify({ tipo: dados.tipo, nome: dados.nome, empresa: dados.empresa || '', token: r.token, expira: Date.now() + 12 * 3600e3 }));
    await SN.carregarRemoto();
    SN.log('LOGIN', dados.tipo, dados.nome); SN.salvar();
    return { ok: true };
  };
  SN.sair = async () => {
    SN.log('LOGOUT', '', ''); await SN.salvarAgora().catch(() => { });
    const s = SN.sessao(); if (s) SN.api('LOGOUT').catch(() => { });
    localStorage.removeItem('sigonet_v2_sessao');
    await SN.prepararLogin().catch(() => { }); location.hash = '#/login'; SN.render();
  };
  setInterval(SN.sincronizar, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) SN.sincronizar(); });
}

// Inicialização (chamada pelo index.html)
SN.iniciar = async () => {
  if (!SN.remoto) { SN.carregar(); SN.render(); return; }
  document.getElementById('app').innerHTML = '<div class="login-wrap"><div class="center"><img src="' + MARCA.LOGO + '" alt="SigoNet" style="max-width:260px"><p class="muted">Conectando ao servidor…</p></div></div>';
  try {
    // Login antigo do modo teste (sem token do servidor) não vale aqui: descarta e pede login.
    if (SN.sessao() && !SN.sessao().token) localStorage.removeItem('sigonet_v2_sessao');
    if (SN.sessao() && SN.sessao().token) {
      try { await SN.carregarRemoto(); } catch (e) { localStorage.removeItem('sigonet_v2_sessao'); }
    }
    if (!SN.sessao()) await SN.prepararLogin();
    SN.render();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="login-wrap"><div class="card" style="max-width:520px"><h2>Sem conexão com o servidor</h2>
      <p>${SN.esc(e.message)}</p><p class="small muted">Confira a internet e o endereço em <span class="mono">js/config.js</span>.</p>
      <button class="btn prim" onclick="location.reload()">Tentar de novo</button></div></div>`;
  }
};
