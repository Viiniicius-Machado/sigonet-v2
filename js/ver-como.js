// SIGONET V2 — "Ver como o técnico" (pedido do usuário, 14/10/2026).
// A gestão abre a tela do celular do prestador para entender a dificuldade dele, sem
// precisar da senha: o app passa a se comportar como o técnico (mesma fila, mesma OS,
// mesmos botões e avisos), mas SÓ LEITURA. Nada é gravado: SN.salvar e o envio ao
// servidor ficam desligados, e qualquer botão/campo é bloqueado (só a navegação passa).
// Ao sair, a página recarrega e descarta o que estiver em memória.
// Vale só para esta aba (sessionStorage). Fica no log quem abriu a tela de quem.
// As telas de rota (Preventiva / Melhoria / Retirada) vêm do servidor e do aparelho do
// técnico: para elas, o caminho é o "Acompanhar ao vivo".
(function () {
  const CHAVE = 'sn_ver_como';
  const ler = () => { try { return JSON.parse(sessionStorage.getItem(CHAVE) || 'null'); } catch (e) { return null; } };
  const usuarioReal = SN.usuario;
  SN.usuarioReal = usuarioReal;
  SN.usuario = () => {
    const u = usuarioReal(), v = u && u.tipo === 'lideranca' && ler();
    if (!v) return u;
    const t = SN.db.tecnicos.find(x => x.nome === v.nome && x.empresa === v.empresa);
    return t ? { ...t, tipo: 'tecnico', cargo: 'Técnico', verComo: true, por: u.nome } : u;
  };
  SN.emVerComo = () => { const u = SN.usuario(); return !!(u && u.verComo); };
  // Quem acompanha a Esteira pode abrir a tela do técnico.
  SN.podeVerComo = () => { const u = usuarioReal(); return !!u && u.tipo === 'lideranca' && (SN.temTela('chamados') || ['Gerente', 'Gestor', 'Encarregado'].includes(u.cargo)); };

  // O log registra sempre quem está de fato logado.
  const logOrig = SN.log;
  SN.log = (acao, ref, detalhe) => {
    if (!ler()) return logOrig(acao, ref, detalhe);
    const u = usuarioReal();
    SN.db.log.push({ id: SN.uid(), ts: SN.agora(), usuario: u ? u.nome : 'sistema', perfil: u ? (u.cargo || '') : '', acao, ref: ref || '', detalhe: detalhe || '' });
  };

  // Só leitura: nada grava enquanto estiver visualizando.
  let avisado = 0;
  const avisar = () => { if (Date.now() - avisado > 2500) { avisado = Date.now(); SN.toast('Modo visualização: você está vendo a tela do técnico, nada pode ser alterado.', 'erro'); } };
  const salvarOrig = SN.salvar;
  SN.salvar = (...a) => { if (SN.emVerComo()) return; return salvarOrig(...a); };
  if (SN.enviarMudancas) { const env = SN.enviarMudancas; SN.enviarMudancas = (...a) => SN.emVerComo() ? undefined : env(...a); }
  if (SN.vst && SN.vst.exec) { const ex = SN.vst.exec; SN.vst.exec = (acao, dados) => SN.emVerComo() ? Promise.reject(new Error('Modo visualização: nada pode ser alterado.')) : ex(acao, dados); }

  SN.iniciarVerComo = (nome, empresa, destino) => {
    if (!SN.podeVerComo()) return SN.toast('Seu acesso não permite ver a tela do técnico.', 'erro');
    const t = SN.db.tecnicos.find(x => x.nome === nome && x.empresa === empresa);
    if (!t) return SN.toast('Técnico não encontrado no cadastro.', 'erro');
    SN.log('VER_COMO_TECNICO', nome, empresa + (destino ? ' · ' + destino : ''));
    if (SN.enviarMudancas) SN.enviarMudancas(); // o que já estava pendente sobe antes de entrar
    sessionStorage.setItem(CHAVE, JSON.stringify({ nome, empresa, voltar: location.hash || '#/inicio' }));
    location.hash = destino || '#/tec'; SN.render();
  };
  SN.sairVerComo = () => {
    const v = ler(); sessionStorage.removeItem(CHAVE);
    location.hash = (v && v.voltar) || '#/inicio';
    location.reload(); // descarta qualquer coisa que tenha ficado em memória
  };

  // Faixa no topo + moldura de celular.
  const faixa = () => {
    let f = document.getElementById('verComoFaixa');
    if (!SN.emVerComo()) { document.body.classList.remove('vercomo'); if (f) f.remove(); return; }
    const u = SN.usuario();
    document.body.classList.add('vercomo');
    if (!f) { f = document.createElement('div'); f.id = 'verComoFaixa'; f.className = 'vercomo-faixa'; document.body.appendChild(f); }
    f.innerHTML = `<span>👁 Vendo a tela de <b>${SN.esc(SN.nomeExibicao(u.nome))}</b> · ${SN.esc(u.empresa)} · só leitura</span><button type="button" class="btn sm" id="verComoSair">Voltar para a gestão</button>`;
    f.querySelector('#verComoSair').onclick = SN.sairVerComo;
  };
  // Telas de rota: não dá para espelhar daqui (dados no aparelho do técnico).
  const ROTAS_APARELHO = /^\/tec\/(aerea|prog|vistoria|vistorias)(\/|$)/;
  const renderOrig = SN.render;
  SN.render = () => {
    const hash = location.hash.replace(/^#/, '');
    if (SN.emVerComo() && ROTAS_APARELHO.test(hash)) {
      const id = decodeURIComponent(hash.split('/')[3] || '');
      SN.cascaTec('vst', `<div class="aviso info">As rotas de Preventiva, Melhoria e Retirada ficam no aparelho do técnico até ele enviar.
        Para ver o que ele está fazendo agora, use o <b>Acompanhar ao vivo</b> da rota.</div>
        ${id && SN.vst && SN.vst.abrirAoVivo ? `<button class="btn prim bloco" data-vercomo-ok id="verComoVivo" style="margin-top:10px">📡 Acompanhar ao vivo ${SN.esc(id)}</button>` : ''}
        <a class="btn bloco" href="#/tec" style="margin-top:8px">← Fila do técnico</a>`, 'Rota');
      const b = document.getElementById('verComoVivo'); if (b) b.onclick = () => SN.vst.abrirAoVivo(id);
      faixa(); return;
    }
    renderOrig(); faixa();
  };

  // Bloqueia cliques e digitação em tudo que altera algo. Passa: links internos,
  // módulos/abas (navegação), fotos (ampliar), a faixa e o fechar das janelas.
  const LIBERADO = '#verComoFaixa, [data-vercomo-ok], [onclick^="SN.navegar"], a[href], [data-go], .tabbar, .aba, [data-x], .fotos img, .foto-rm img, .vst-thumb img';
  const ALTERA = 'button, input, textarea, select, label, .chip, [data-ceo], [data-ceotipo], [data-cpres], [onclick]';
  ['click', 'pointerdown', 'mousedown', 'change', 'input', 'keydown'].forEach(tipo => document.addEventListener(tipo, ev => {
    if (!SN.emVerComo()) return;
    const el = ev.target && ev.target.closest ? ev.target : null; if (!el) return;
    if (el.closest('#btnSair')) { ev.preventDefault(); ev.stopPropagation(); if (tipo === 'click') SN.sairVerComo(); return; }
    if (el.closest(LIBERADO) && !el.closest('#verComoFaixa input')) return;
    if (!el.closest(ALTERA)) return;
    ev.preventDefault(); ev.stopImmediatePropagation(); if (tipo === 'click') avisar();
  }, { capture: true, passive: false }));
})();
