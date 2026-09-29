// SIGONET V2 — Visual da gestão: opção A "Grafite" (escolhida em 2026-09-29).
// Página mais fina (topo baixo, sem degradê nem sombras, cantos retos), menu escuro e
// ícones de traço fino no lugar dos emojis. Os emojis que ainda estão no texto das
// telas da gestão (botões, abas, títulos) saem na hora de desenhar.
// O app do técnico (celular) fica fora: mantém o visual e os ícones grandes de campo.
const TEMA = 'a';
SN.ajustarTema = () => {
  const tec = !!document.querySelector('.app-tec');
  if (tec) delete document.documentElement.dataset.tema; else document.documentElement.dataset.tema = TEMA;
  return !tec;
};

// Ícones de traço (24×24, cor do texto).
const ICO = {
  inicio: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  chamados: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  lpu: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6',
  servicedesk: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5H5a1 1 0 0 1-1-1zM20 14h-3v5h2a1 1 0 0 0 1-1z',
  materiais: 'M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10',
  fibra: 'M3 18c4 0 4-12 9-12s5 12 9 12M3 12h3M18 12h3',
  base: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  portal: 'M4 20V11M10 20V5M16 20v-7M21 20H3',
  cadastros: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
  auditoria: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  planejamento: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  revisao: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  dashboard: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  ponto: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z'
};
SN.iconeSvg = nome => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICO[nome] || ICO.ponto}"/></svg>`;
const ICO_POR_HREF = { '#/inicio': 'inicio', '#/chamados': 'chamados', '#/lpu': 'lpu', '#/servicedesk': 'servicedesk', '#/materiais': 'materiais', '#/fibra': 'fibra',
  '#/base': 'base', '#/portal': 'portal', '#/cadastros': 'cadastros', '#/auditoria': 'auditoria', '#/vst/planejamento': 'planejamento', '#/vst/revisao': 'revisao', '#/vst/dashboard': 'dashboard' };

// Emojis decorativos (pictogramas). Ficam: ✓ ✔ ✕ ✖ ☰ ⚠ ◀ ▶ (são sinais de interface, não enfeite).
const EMOJI = /(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}\u{23F3}\u{231B}](?:️)?)(?:‍[\u{1F300}-\u{1FAFF}](?:️)?)*\s?/gu;
const MANTER = new Set(['✓', '✔', '✕', '✖', '☰', '⚠', '◀', '▶']);
const limparTexto = txt => txt.replace(EMOJI, m => MANTER.has(m.trim().replace('️', '')) ? m : '');
SN.limparVisual = raiz => {
  if (!raiz || !document.documentElement.dataset.tema || (raiz.closest && raiz.closest('.app-tec'))) return;
  // Ícones do menu e dos cartões do Início
  raiz.querySelectorAll && raiz.querySelectorAll('.sidebar a .ico, .hub-card .ico').forEach(el => {
    if (el.dataset.svg) return;
    const a = el.closest('a'); el.innerHTML = SN.iconeSvg(ICO_POR_HREF[a && a.getAttribute('href')]); el.dataset.svg = '1';
  });
  // Texto: tira o emoji e o espaço que vinha depois dele
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement && !n.parentElement.closest('svg, script, style, textarea, input, .ico[data-svg]') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
  const nos = []; while (w.nextNode()) nos.push(w.currentNode);
  nos.forEach(n => { const novo = limparTexto(n.nodeValue); if (novo !== n.nodeValue) n.nodeValue = novo; });
};
// Tudo o que as telas desenham (inclui janelas e avisos) passa por aqui.
new MutationObserver(ms => { if (!SN.ajustarTema()) return;
  ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) SN.limparVisual(n); else if (n.nodeType === 3 && n.parentElement) SN.limparVisual(n.parentElement); })); })
  .observe(document.body, { childList: true, subtree: true });
if (SN.ajustarTema()) SN.limparVisual(document.getElementById('app'));
try { localStorage.removeItem('sigonet_v2_tema'); } catch (e) { } // escolha da avaliação: não é mais usada
