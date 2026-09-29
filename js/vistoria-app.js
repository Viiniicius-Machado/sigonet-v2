// SIGONET V2 — Preventiva (vistoria de rede subterrânea): base do módulo no app.
//
// Módulo isolado: NÃO usa SN.db nem a sincronização geral (servidor.js). Fala
// com o servidor pelas ações VST_* (servidor/Vistoria.gs) e guarda o que precisa
// para trabalhar sem sinal no IndexedDB próprio (vistoria-local.js).
//
// Aqui: registro das telas liberáveis e do menu, chamada ao servidor que devolve
// a resposta inteira (erros de validação, fotos pendentes), cache da última
// carga e a aba "Vistorias" do app do técnico.
SN.vst = {};

// Telas liberáveis em Cadastros e Acessos (quem tem "Todas" já vê).
Object.assign(SN.TELAS || (SN.TELAS = {}), {
  vst_planejamento: 'Preventiva · Planejamento', vst_revisao: 'Preventiva · Revisão', vst_dashboard: 'Preventiva · Dashboard'
});
SN.vst.MENU = [
  { grupo: 'Preventiva' },
  { tela: 'vst_planejamento', rot: 'Planejamento', ico: '🗺️', href: '#/vst/planejamento' },
  { tela: 'vst_revisao', rot: 'Revisão', ico: '🔎', href: '#/vst/revisao' },
  { tela: 'vst_dashboard', rot: 'Dashboard', ico: '📈', href: '#/vst/dashboard' }
];
// Entra no menu só o que já tem tela registrada (as fases seguintes registram as suas).
SN.vst.registrarMenu = () => {
  // Reconstrói o grupo a cada chamada (cada tela registra a sua, em qualquer ordem).
  const itens = SN.vst.MENU.filter(m => m.grupo || SN.rotas[m.href.slice(1)]);
  if (itens.length < 2) return;
  for (let i = SN.MENU.length - 1; i >= 0; i--) if (SN.MENU[i] === SN.vst.MENU[0] || SN.vst.MENU.some(m => m.tela && m.tela === SN.MENU[i].tela)) SN.MENU.splice(i, 1);
  SN.MENU.push(...itens);
};

SN.vst.disponivel = () => !!SN.remoto;
SN.vst.semServidorHtml = '<div class="aviso alerta">A Preventiva precisa do servidor (Apps Script) configurado em <span class="mono">js/config.js</span>. No modo teste local ela não funciona.</div>';

// Chamada ao servidor. Diferente de SN.api: devolve a resposta inteira quando o
// servidor recusa (ok:false com erros/fotos_pendentes). Só lança erro quando
// não houve resposta (sem sinal, servidor ocupado) — err.rede = true.
SN.vst.api = async (acao, dados, timeoutMs = 60000) => {
  const s = SN.sessao(), grava = !/^VST_(CARREGAR|CS_BASE|LER_KMZ|FOTOS_B64)$/.test(acao);
  // Ninguém logado (ex.: saiu enquanto uma busca estava agendada): nem vai ao servidor.
  if (!s || !s.token) { const e = new Error('Sem sessão.'); e.sessao = true; throw e; }
  if (grava) { SN.vst.cargaTs = 0; SN.vst.gravacoes++; }
  let j;
  try {
    const r = await fetch(SIGONET_SERVIDOR, { method: 'POST', body: JSON.stringify({ acao, token: s && s.token, ...(dados || {}) }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined });
    const txt = await r.text();
    try { j = JSON.parse(txt); } catch (e) { throw new Error('Servidor ocupado no momento.'); }
    if (j && j.sistema && j.hora && !j.erro) throw new Error('Resposta do servidor se perdeu.'); // página de status no lugar da resposta (Google instável)
  } catch (e) {
    const err = new Error(e.name === 'TypeError' || e.name === 'TimeoutError' || e.name === 'AbortError' ? 'Sem conexão com o servidor.' : e.message);
    err.rede = true; throw err;
  }
  if (grava) SN.vst.cargaTs = 0; // gravou algo: a próxima tela busca de novo
  if (!j.ok && j.sessao) {
    // Só derruba a sessão que fez o pedido: se outra pessoa já entrou neste aparelho, não mexe nela.
    const atual = SN.sessao();
    if (atual && atual.token === s.token) {
      localStorage.removeItem('sigonet_v2_sessao');
      setTimeout(() => { SN.toast(j.erro, 'erro'); SN.prepararLogin().then(() => SN.navegar('#/login')); }, 0);
    }
    const err = new Error(j.erro); err.sessao = true; throw err;
  }
  return j;
};
// Igual, mas lança erro quando o servidor recusa (para ações simples de tela).
// Sem resposta (sinal caiu, Google devolveu página de erro): tenta de novo até 3
// vezes — as ações VST_* do servidor são seguras para repetir (não duplicam).
SN.vst.exec = async (acao, dados) => {
  let r;
  for (let t = 1; ; t++) {
    try { r = await SN.vst.api(acao, dados); break; }
    catch (e) { if (!e.rede || t >= 3) throw e; await new Promise(ok => setTimeout(ok, 2000 * t + Math.random() * 2000)); }
  }
  if (!r.ok) { const e = new Error(r.erro || 'Erro no servidor'); e.resp = r; throw e; }
  return r;
};

// Carga da tela (rotas, CS, vistorias, config). Guarda a última no aparelho:
// sem sinal, a tela abre com ela.
// Reaproveita a carga por 60 s: trocar de tela (Planejamento → Revisão → Dashboard)
// e os re-renders da sincronização geral não vão ao servidor de novo. Qualquer
// ação que grava (SN.vst.api) invalida; "⟳ Atualizar" força (forcar = true).
SN.vst.dados = null;
SN.vst.cargaTs = 0; SN.vst.gravacoes = 0;
const VST_VALIDADE_CARGA = 60000;
let cargaEmAndamento = null;
SN.vst.carregar = async forcar => {
  const u = SN.usuario(), chave = 'carga|' + (u ? u.tipo + '|' + u.empresa + '|' + u.nome : '');
  if (!forcar && SN.vst.dados && !SN.vst.dados.offline && SN.vst.dados.chave === chave && Date.now() - SN.vst.cargaTs < VST_VALIDADE_CARGA) return SN.vst.dados;
  if (cargaEmAndamento && !forcar) return cargaEmAndamento; // duas telas pedindo juntas: uma ida só
  const p = cargaEmAndamento = carregarDoServidor(u, chave);
  try { return await p; } finally { if (cargaEmAndamento === p) cargaEmAndamento = null; }
};
const carregarDoServidor = async (u, chave) => {
  const gravAntes = SN.vst.gravacoes;
  try {
    const r = await SN.vst.exec('VST_CARREGAR');
    r.offline = false; r.carregadoEm = SN.agora(); r.chave = chave;
    SN.vst.dados = r; SN.vst.cargaTs = SN.vst.gravacoes === gravAntes ? Date.now() : 0; // gravou no meio: não reaproveita
    SN.VL.meta.set(chave, r).catch(() => { });
    if (u && u.tipo === 'tecnico') SN.vst.marcarTemRotas(r.rotas.length > 0);
    return r;
  } catch (e) {
    if (!e.rede) throw e;
    const c = await SN.VL.meta.get(chave).catch(() => null);
    if (!c) throw e;
    c.offline = true; SN.vst.dados = c; return c;
  }
};

// Liderança com tela da Preventiva: já busca a carga em segundo plano logo depois de
// entrar, para o primeiro clique no menu abrir sem esperar o servidor.
SN.vst.preaquecer = () => {
  if (!SN.vst.disponivel() || !SN.vst.MENU.some(m => m.tela && SN.temTela(m.tela))) return;
  const quem = (SN.sessao() || {}).token;
  setTimeout(() => { // só se a mesma pessoa ainda estiver logada (saiu ou trocou de usuário: não busca)
    if (!quem || (SN.sessao() || {}).token !== quem) return;
    if (Date.now() - SN.vst.cargaTs >= VST_VALIDADE_CARGA) SN.vst.carregar().catch(() => { });
  }, 2500);
};

// Resumo do que foi APROVADO na revisão (c.preventiva do chamado), com o item de
// LPU de cada quantidade. Usado na OS, na LPU, no chamado do NOC e na Gestão de LPU.
SN.vst.resumoAprovado = (prev, comItens) => {
  if (!prev || !prev.lpu_sugerida) return '';
  const it = cod => comItens ? ` (${cod})` : '';
  if (prev.segmento === 'AEREA') {
    const t = prev.producao || {};
    return `${SN.num(t.metros)} m percorridos${it('SEV0083')} · ${SN.num(t.postes)} postes equipados · ${SN.num(t.cordoalha)} m de cordoalha${it('SEV0009')} · `
      + `${SN.num(t.plaquetas)} plaquetas${it('SEV0005')} · ${SN.num(t.caixas)} caixas/CEO regularizadas${it('SEV0084')} · sobra técnica ${SN.num(t.sobra)}`;
  }
  return `${prev.cs_abertas} CS abertas${it('SEV0022b')} · ${prev.cs_nao_abertas} não abertas${it('SEV0076')} · ${SN.num(prev.metros)} m${it('SEV0083')}`;
};

// Data de um dia ('AAAA-MM-DD') sem fuso: SN.data leria como meia-noite UTC e,
// no Brasil, mostraria o dia anterior.
SN.vst.dia = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v).split('-').reverse().join('/') : SN.data(v);

// ─────────── Status (rótulos e cores vêm das listas) ───────────
SN.vst.badgeRota = s => SN.badge(VR_LISTAS.status_rota, s);
SN.vst.badgeVistoria = s => SN.badge(VR_LISTAS.status_vistoria, s);
SN.vst.STATUS_LOCAL = {
  rascunho: { rot: 'Rascunho', cls: '' }, fila: { rot: 'Enviando…', cls: 'info' }, enviando: { rot: 'Enviando…', cls: 'info' },
  enviada: { rot: 'Enviada', cls: 'ok' }, erro: { rot: 'Erro no envio', cls: 'erro' }
};
SN.vst.badgeLocal = s => SN.badge(SN.vst.STATUS_LOCAL, s);

// ─────────── Aba "Vistorias" no app do técnico ───────────
// Aparece só para quem tem rota de vistoria. O resultado da última consulta fica
// no aparelho e é renovado em segundo plano (no máximo a cada 5 min).
const CHAVE_TEM = () => { const u = SN.usuario(); return 'sigonet_v2_vst_tem|' + (u ? u.empresa + '|' + u.nome : ''); };
SN.vst.temRotas = () => { try { return localStorage.getItem(CHAVE_TEM()) === '1'; } catch (e) { return false; } };
SN.vst.marcarTemRotas = sim => {
  try {
    const antes = SN.vst.temRotas();
    localStorage.setItem(CHAVE_TEM(), sim ? '1' : '0'); localStorage.setItem(CHAVE_TEM() + '|ts', String(Date.now()));
    if (antes !== sim && SN.rotaAtual && SN.rotaAtual.hash.startsWith('/tec')) SN.aoMudarBase();
  } catch (e) { }
};
SN.vst.conferirRotas = () => {
  if (!SN.vst.disponivel()) return;
  let ts = 0; try { ts = Number(localStorage.getItem(CHAVE_TEM() + '|ts') || 0); } catch (e) { }
  if (Date.now() - ts < 5 * 60000) return;
  try { localStorage.setItem(CHAVE_TEM() + '|ts', String(Date.now())); } catch (e) { }
  SN.vst.exec('VST_CARREGAR').then(r => SN.vst.marcarTemRotas(r.rotas.length > 0)).catch(() => { });
};
// Chamado pela tabbar do técnico (telas-tecnico.js).
SN.vst.abaTec = ativo => {
  SN.vst.conferirRotas();
  return SN.vst.temRotas() || ativo === 'vst'
    ? `<a href="#/tec/vistorias" class="${ativo === 'vst' ? 'ativo' : ''}"><span class="ico">🧭</span>Preventiva</a>` : '';
};
// Técnico com rota de vistoria e nenhum chamado: abre direto nas vistorias.
SN.vst.abrirDireto = chamadosDoTecnico => {
  if (chamadosDoTecnico.length || !SN.vst.temRotas()) return false;
  if (sessionStorage.getItem('sigonet_v2_vst_direto')) return false; // só na 1ª vez da sessão (dá para voltar à fila)
  sessionStorage.setItem('sigonet_v2_vst_direto', '1');
  SN.navegar('#/tec/vistorias'); return true;
};
