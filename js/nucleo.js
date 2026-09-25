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
  disponibilidade: [], chamados: [], lpus: [], materiais: [], fibras: [], pagamentos: [], fechamentos: [],
  assinaturas: {}, log: [], integracoes: []
});

SN.db = null;
SN.carregar = () => {
  try { SN.db = JSON.parse(localStorage.getItem(CHAVE_DB)); } catch (e) { SN.db = null; }
  if (!SN.db || SN.db.versao !== VERSAO_DB) { SN.db = SN.baseVazia(); SN.salvar(); }
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
  try { return await SN.guardarDataUrl(SN.pdfDataUrl(doc), nome, 'arquivo', pasta); }
  catch (e) { SN.toast('PDF gerado, mas não foi possível guardá-lo: ' + (e.message || e), 'erro'); return null; }
};
SN.driveId = id => String(id || '').startsWith('drive:') ? id.slice(6) : null;
SN.abrirAnexo = async id => {
  if (SN.driveId(id)) { window.open('https://drive.google.com/file/d/' + SN.driveId(id) + '/view', '_blank', 'noopener'); return; }
  const d = await SN.anexos.get(id);
  if (!d) return SN.toast('Anexo não encontrado neste navegador.', 'erro');
  const w = window.open(); if (!w) return;
  if (d.startsWith('data:application/pdf')) w.document.write(`<iframe src="${d}" style="border:0;width:100%;height:100vh"></iframe>`);
  else w.document.write(`<img src="${d}" style="max-width:100%">`);
};
SN.pintarFotos = async (el, lista) => {
  if (!el) return;
  el.innerHTML = lista.length ? '' : '<span class="muted small">Nenhum anexo.</span>';
  for (const a of lista) {
    const fid = SN.driveId(a.id);
    const d = fid ? (a.tipo === 'imagem' ? `https://drive.google.com/thumbnail?id=${fid}&sz=w400` : null) : await SN.anexos.get(a.id).catch(() => null);
    if (a.tipo === 'imagem' && d) {
      const img = document.createElement('img'); img.src = d; img.title = a.nome; img.onclick = () => SN.abrirAnexo(a.id); el.appendChild(img);
    } else {
      const b = document.createElement('button'); b.className = 'btn sm'; b.textContent = '📄 ' + a.nome; b.onclick = () => SN.abrirAnexo(a.id); el.appendChild(b);
    }
  }
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
SN.material = cod => CATALOGO_MATERIAIS.find(m => m.c === cod);
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
  ['deslocamento', 'Deslocamento'], ['chegada', 'Em campo'], ['diagnostico', 'Diagnóstico'],
  ['conclusaoTecnica', 'Conclusão técnica'], ['fechamento', 'Fechamento']
];

// Definições (mostradas no Portal):
//   MTTD = Abertura → Despacho  (tempo até o chamado ser detectado/triado e ir pra equipe)
//   MTTA = Despacho → Chegada em campo  (tempo de atendimento)
//   MTTR = Abertura → Conclusão técnica  (tempo de resolução)
//   TMC  = Chegada → Conclusão técnica  (tempo médio em campo)
//   SLA  = Conclusão técnica ≤ Prazo limite (Abertura + SLA da matriz)
// Nada administrativo (LPU, materiais, fibra, fechamento pelo NOC) entra nessas contas.
SN.metricas = c => {
  const t = c.tempos || {};
  const mttd = SN.min(t.abertura, t.atribuicao), mtta = SN.min(t.atribuicao, t.chegada);
  const mttr = SN.min(t.abertura, t.conclusaoTecnica), tmc = SN.min(t.chegada, t.conclusaoTecnica);
  let sla = null;
  if (c.prazoLimite && t.conclusaoTecnica) sla = new Date(t.conclusaoTecnica) <= new Date(c.prazoLimite);
  return { mttd, mtta, mttr, tmc, sla };
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
  const fim = c.tempos && c.tempos.conclusaoTecnica;
  const ref = fim ? new Date(fim) : new Date();
  const diff = Math.round((new Date(c.prazoLimite) - ref) / 60000);
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
  BAIXADO_SAP:     { rot: 'Baixa SAP (261)', cls: 'verde' },
  ALOCADO_CLIENTE: { rot: 'Alocado ao cliente', cls: 'ok' }
};
SN.FIB_STATUS = {
  AGUARDANDO_VALIDACAO: { rot: 'Aguardando validação do líder', cls: 'alerta' },
  CORRECAO:             { rot: 'Correção solicitada', cls: 'erro' },
  INCORRETO:            { rot: 'Incorreto (arquivado)', cls: 'erro' },
  PENDENTE_CADASTRO:    { rot: 'Correto · pendente GEOGRID', cls: 'info' },
  CADASTRADO:           { rot: 'Cadastrado no GEOGRID', cls: 'ok' }
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
  sapEstoque(cod) {
    let h = 0; for (const ch of cod) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return { deposito: 'DEP-CAMPINAS', qtd: 5 + (h % 120) };
  },
  sapBaixa261(reg) {
    const doc = '49' + String(Date.now()).slice(-8);
    return this.registrar('SAP', 'Movimento 261 (consumo)', { registro: reg.id, chamado: reg.chamadoId, itens: reg.itens.map(i => ({ cod: i.cod, qtd: i.qtd })) }, { ok: true, documento: doc });
  },
  sapAlocarCliente(reg) {
    return this.registrar('SAP', 'Alocação ao cliente', { registro: reg.id, cliente: reg.cliente, seriais: reg.itens.flatMap(i => i.seriais || []) }, { ok: true });
  }
};

// ═══════════════════════════ Autenticação ═══════════════════════════
// Duas famílias: liderança (Nome + PIN + Complemento, telas por pessoa) e
// técnico (Empresa + Técnico + PIN + Complemento). Sessão de 12h.
const CHAVE_SESSAO = 'sigonet_v2_sessao';
SN.sessao = () => {
  try { const s = JSON.parse(localStorage.getItem(CHAVE_SESSAO)); if (s && s.expira > Date.now()) return s; } catch (e) { }
  return null;
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
  if (String(reg.pin) !== String(pin)) falha('PIN incorreto.');
  if (!reg.complementoHash) {
    if (!novoComplemento) return { primeiroAcesso: true };
    if (novoComplemento.length < 4) throw new Error('O complemento precisa ter pelo menos 4 caracteres.');
    reg.complementoHash = await SN.sha256(reg.nome + '|' + novoComplemento);
  } else if (reg.complementoHash !== await SN.sha256(reg.nome + '|' + complemento)) falha('Complemento incorreto.');
  delete tentativas[chave];
  localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ tipo, nome, empresa: empresa || '', expira: Date.now() + 12 * 3600e3 }));
  reg.ultimoAcesso = SN.agora();
  SN.log('LOGIN', tipo, reg.nome); SN.salvar();
  return { ok: true };
};
SN.sair = () => { SN.log('LOGOUT', '', ''); SN.salvar(); localStorage.removeItem(CHAVE_SESSAO); location.hash = '#/login'; SN.render(); };

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
SN.pdfDataUrl = doc => doc.output('datauristring');

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
  { tela: 'materiais', rot: 'Gestão de Materiais', ico: '📦', href: '#/materiais' },
  { tela: 'fibra', rot: 'Cadastro de Fibra', ico: '🧵', href: '#/fibra' },
  { grupo: 'Gestão' },
  { tela: 'portal', rot: 'Portal de Gestão', ico: '📊', href: '#/portal' },
  { tela: 'cadastros', rot: 'Cadastros e Acessos', ico: '👥', href: '#/cadastros' },
  { tela: 'auditoria', rot: 'Auditoria', ico: '🕑', href: '#/auditoria' }
];
SN.casca = (ativo, html) => {
  const u = SN.usuario();
  const itens = SN.MENU.filter(m => m.grupo || m.tela === 'inicio' || SN.temTela(m.tela));
  const menu = itens.map((m, i) => m.grupo
    ? (itens[i + 1] && !itens[i + 1].grupo ? `<div class="grupo">${m.grupo}</div>` : '')
    : `<a href="${m.href}" class="${m.tela === ativo ? 'ativo' : ''}"><span class="ico">${m.ico}</span>${m.rot}</a>`).join('');
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
