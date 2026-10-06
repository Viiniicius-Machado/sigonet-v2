// SIGONET V2 — Instalar como aplicativo (PWA).
// Android/Chrome/Edge: o navegador avisa que dá para instalar (beforeinstallprompt) e o botão
// "Instalar app" abre a instalação. iPhone/iPad: não existe esse aviso; o botão mostra o passo a
// passo do Safari ("Adicionar à Tela de Início"). Já instalado (aberto pelo ícone): não mostra nada.
(() => {
  let aviso = null;
  const instalado = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  SN.appInstalado = instalado;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); aviso = e; SN.pintarInstalar(); });
  window.addEventListener('appinstalled', () => { aviso = null; SN.pintarInstalar(); SN.toast && SN.toast('SigoNet instalado. Abra pelo ícone na tela inicial.', 'ok'); });

  // Desenha (ou esconde) o bloco "Instalar app" onde houver [data-instalar] na tela.
  SN.pintarInstalar = () => {
    document.querySelectorAll('[data-instalar]').forEach(el => {
      if (instalado() || (!aviso && !ios())) { el.innerHTML = ''; return; }
      el.innerHTML = `<div class="card" style="margin-top:14px;display:flex;gap:12px;align-items:center">
        <img src="icones/i192.png" alt="" style="width:44px;height:44px;border-radius:10px;flex:none">
        <div style="flex:1"><b>Instale o SigoNet no celular</b><div class="small muted">Ícone na tela inicial, abre em tela cheia e funciona sem sinal.</div></div>
        <button type="button" class="btn prim" data-instalar-btn>Instalar app</button></div>`;
      el.querySelector('[data-instalar-btn]').onclick = async () => {
        if (aviso) { aviso.prompt(); const r = await aviso.userChoice.catch(() => null); if (r && r.outcome === 'accepted') aviso = null; SN.pintarInstalar(); return; }
        SN.modal({ titulo: 'Instalar no iPhone', corpo: `<ol style="padding-left:20px;line-height:1.7">
          <li>Abra este endereço no <b>Safari</b>.</li>
          <li>Toque em <b>Compartilhar</b> (o quadrado com a seta para cima).</li>
          <li>Escolha <b>Adicionar à Tela de Início</b> e toque em <b>Adicionar</b>.</li></ol>
          <p class="small muted">Depois abra o SigoNet pelo ícone. O login continua o mesmo.</p>` });
      };
    });
  };
})();
