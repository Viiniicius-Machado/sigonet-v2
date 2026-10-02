// SIGONET V2 — Preventiva: câmera, marca d'água, compressão e GPS.
//
// Cada foto é tratada NO MOMENTO da captura:
//  1. lê a data do arquivo: EXIF DateTimeOriginal (leitor próprio, sem
//     biblioteca) ou, sem EXIF, o lastModified do arquivo;
//  2. reduz para lado maior de 1600 px e aplica a marca d'água (ID da CS, rota,
//     data, hora, lat/lng e precisão) — a marca fica "queimada" na imagem;
//  3. gera JPEG 0,7 para envio e uma miniatura para a tela.
//
// LIMITAÇÃO (registrada também em docs/PREVENTIVA.md): o navegador NÃO garante que
// a foto veio da câmera. O input usa capture="environment", mas alguns celulares
// ainda deixam escolher da galeria. A mitigação é comparar a data do arquivo com
// a hora da captura (flag_suspeita, VR.fotoSuspeita) + a revisão humana.
SN.VF = (() => {
  const VF = {};

  // ─────────── EXIF: data original ───────────
  // Devolve Date (hora local do aparelho que tirou a foto) ou null.
  VF.dataExif = async file => {
    try {
      const buf = await file.slice(0, 256 * 1024).arrayBuffer();
      return VF.lerDataExif(new DataView(buf));
    } catch (e) { return null; }
  };
  VF.lerDataExif = dv => {
    if (dv.byteLength < 4 || dv.getUint16(0) !== 0xFFD8) return null; // não é JPEG
    let p = 2;
    while (p + 4 <= dv.byteLength) {
      const marca = dv.getUint16(p), tam = dv.getUint16(p + 2);
      if (marca === 0xFFE1 && dv.getUint32(p + 4) === 0x45786966) return lerTiff(dv, p + 10); // "Exif"
      if ((marca & 0xFF00) !== 0xFF00 || marca === 0xFFDA) break; // início da imagem: sem EXIF
      p += 2 + tam;
    }
    return null;
  };
  const lerTiff = (dv, t) => {
    const le = dv.getUint16(t) === 0x4949; // "II" = little endian
    const u16 = o => dv.getUint16(t + o, le), u32 = o => dv.getUint32(t + o, le);
    const texto = (ent) => { const n = u32(ent + 4), off = n > 4 ? u32(ent + 8) : ent + 8; let s = ''; for (let i = 0; i < n - 1; i++) s += String.fromCharCode(dv.getUint8(t + off + i)); return s; };
    const ifd = off => { const out = {}; const n = u16(off); for (let i = 0; i < n; i++) { const e = off + 2 + i * 12; out[u16(e)] = e; } return out; };
    const ifd0 = ifd(u32(4));
    let bruto = null;
    if (ifd0[0x8769]) { const ex = ifd(u32(ifd0[0x8769] + 8)); if (ex[0x9003]) bruto = texto(ex[0x9003]); }
    if (!bruto && ifd0[0x0132]) bruto = texto(ifd0[0x0132]);
    const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(bruto || '');
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return isNaN(d.getTime()) ? null : d;
  };

  // ─────────── Imagem: reduzir + marca d'água ───────────
  const carregar = async file => {
    if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { } }
    return new Promise((ok, falha) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => { ok(i); }; i.onerror = falha; i.src = u; });
  };
  VF.LADO_MAX = 1600; VF.QUALIDADE = 0.7;
  // Quebra o texto em linhas que cabem na largura.
  const quebrar = (g, txt, larg) => {
    const out = []; let linha = '';
    String(txt || '').split(/\s+/).forEach(p => { const t = linha ? linha + ' ' + p : p; if (g.measureText(t).width > larg && linha) { out.push(linha); linha = p; } else linha = t; });
    if (linha) out.push(linha); return out;
  };
  // Marca d'água no estilo Timemark, "queimada" na imagem:
  //   10:47 │ 28/09/2026
  //         │ segunda-feira
  //   Rua X, 123 - Bairro, Cidade - SP, 13000-000
  //   -23.561300, -46.656500 ±8 m
  //   CS-001 · ROT-00001 · Foto 3
  // Logo oficial Net Turbo (MARCA.NETTURBO, versão horizontal do manual de marca)
  // à direita da hora; se a foto for estreita demais, a logo fica de fora.
  // marca = { agora (ISO), pos {lat,lng,precisao} | null, endereco (texto | null), contexto (texto) }
  let logoImg = null;
  const logo = () => {
    if (!logoImg && typeof MARCA !== 'undefined' && MARCA.NETTURBO) logoImg = new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = MARCA.NETTURBO; });
    return logoImg || Promise.resolve(null);
  };
  VF.processar = async (file, marca) => {
    const lg = await logo();
    const img = await carregar(file);
    const w0 = img.width, h0 = img.height, k = Math.min(1, VF.LADO_MAX / Math.max(w0, h0));
    const c = document.createElement('canvas'); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, c.width, c.height);
    if (img.close) img.close();
    const W = c.width, H = c.height, fs = Math.max(13, Math.round(Math.min(W, H) * 0.03)), pad = Math.round(fs * 0.9);
    const fonte = (peso, tam) => `${peso} ${tam}px Inter, "Segoe UI", Arial, sans-serif`;
    const d = new Date(marca.agora);
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const data = d.toLocaleDateString('pt-BR'), dia = d.toLocaleDateString('pt-BR', { weekday: 'long' });
    const largTexto = W - pad * 2;
    g.font = fonte(500, Math.round(fs * 0.95));
    const endLinhas = quebrar(g, marca.endereco || (marca.pos ? 'Endereço não consultado (sem internet no momento)' : 'Sem GPS: endereço e posição indisponíveis'), largTexto).slice(0, 3);
    const coords = marca.pos ? `${Number(marca.pos.lat).toFixed(6)}, ${Number(marca.pos.lng).toFixed(6)}${marca.pos.precisao ? '  ±' + marca.pos.precisao + ' m' : ''}` : '';
    g.font = fonte(600, Math.round(fs * 0.85));
    const ctxLinhas = quebrar(g, marca.contexto || '', largTexto).slice(0, 2);
    const hHora = Math.round(fs * 2.3), lin = fs * 1.3;
    const alturaBloco = hHora + fs * 0.5 + endLinhas.length * lin + (coords ? lin : 0) + ctxLinhas.length * lin;
    const topo = H - pad - alturaBloco;
    // fundo em degradê (legível em qualquer foto, sem tampar a imagem inteira)
    const grad = g.createLinearGradient(0, topo - pad * 2, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.35, 'rgba(0,0,0,0.45)'); grad.addColorStop(1, 'rgba(0,0,0,0.72)');
    g.fillStyle = grad; g.fillRect(0, topo - pad * 2, W, H - topo + pad * 2);
    g.textBaseline = 'top'; g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = Math.round(fs * 0.25);
    let y = topo;
    // hora grande │ data + dia da semana
    g.fillStyle = '#ffffff'; g.font = fonte(800, hHora); g.fillText(hora, pad, y - hHora * 0.08);
    const xBarra = pad + g.measureText(hora).width + fs * 0.6;
    g.shadowBlur = 0; g.fillStyle = '#a8c93c'; g.fillRect(xBarra, y + hHora * 0.08, Math.max(3, Math.round(fs * 0.18)), hHora * 0.84);
    g.shadowBlur = Math.round(fs * 0.25); g.fillStyle = '#ffffff';
    g.font = fonte(700, Math.round(fs * 0.95)); g.fillText(data, xBarra + fs * 0.6, y + hHora * 0.1);
    g.font = fonte(500, Math.round(fs * 0.9)); g.fillText(dia, xBarra + fs * 0.6, y + hHora * 0.1 + fs * 1.15);
    if (lg) {
      g.font = fonte(700, Math.round(fs * 0.95)); const lData = g.measureText(data).width;
      g.font = fonte(500, Math.round(fs * 0.9)); const fimData = xBarra + fs * 0.6 + Math.max(lData, g.measureText(dia).width);
      let lh = hHora * 0.95, lw = lh * lg.width / lg.height;
      const livre = W - pad - fimData - fs; if (lw > livre) { lw = livre; lh = lw * lg.height / lg.width; }
      if (lh >= fs * 1.2) { g.shadowBlur = 0; g.drawImage(lg, W - pad - lw, y + (hHora - lh) / 2, lw, lh); g.shadowBlur = Math.round(fs * 0.25); }
    }
    y += hHora + fs * 0.5;
    g.font = fonte(500, Math.round(fs * 0.95)); endLinhas.forEach(l => { g.fillText(l, pad, y); y += lin; });
    if (coords) { g.font = fonte(500, Math.round(fs * 0.85)); g.fillStyle = '#e9f7c8'; g.fillText(coords, pad, y); y += lin; }
    g.font = fonte(600, Math.round(fs * 0.85)); g.fillStyle = '#ffffff'; ctxLinhas.forEach(l => { g.fillText(l, pad, y); y += lin; });
    g.shadowBlur = 0;
    const dataUrl = c.toDataURL('image/jpeg', VF.QUALIDADE);
    const kt = 480 / Math.max(W, H), t = document.createElement('canvas'); // miniatura: tela e PDF de controle
    t.width = Math.round(W * kt); t.height = Math.round(H * kt);
    t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
    return { dataUrl, thumb: t.toDataURL('image/jpeg', 0.6), largura: W, altura: H };
  };

  // ─────────── Endereço pela coordenada (OpenStreetMap) ───────────
  // Guardado no aparelho por ~11 m de raio para não repetir a consulta. Sem
  // internet devolve null (a foto sai com as coordenadas). O mesmo serviço já é
  // usado no "Local da falha" do chamado.
  const CHAVE_END = 'sigonet_v2_enderecos';
  const cacheEnd = (() => { try { return JSON.parse(localStorage.getItem(CHAVE_END)) || {}; } catch (e) { return {}; } })();
  VF.endereco = async (pos, limiteMs = 5000) => {
    if (!pos) return null;
    const k = Number(pos.lat).toFixed(4) + ',' + Number(pos.lng).toFixed(4);
    if (cacheEnd[k]) return cacheEnd[k];
    if (!navigator.onLine) return null;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=pt-BR&lat=${pos.lat}&lon=${pos.lng}`,
        { signal: AbortSignal.timeout ? AbortSignal.timeout(limiteMs) : undefined });
      const a = (await r.json()).address || {};
      const uf = (a['ISO3166-2-lvl4'] || '').replace(/^BR-/, '') || a.state || '';
      const rua = [a.road || a.pedestrian || a.footway, a.house_number].filter(Boolean).join(', ');
      const cidade = [a.city || a.town || a.village || a.municipality, uf].filter(Boolean).join(' - ');
      const txt = [rua, a.suburb || a.neighbourhood || a.quarter, cidade, a.postcode].filter(Boolean).join(', ');
      if (!txt) return null;
      cacheEnd[k] = txt;
      const ks = Object.keys(cacheEnd); if (ks.length > 300) delete cacheEnd[ks[0]];
      try { localStorage.setItem(CHAVE_END, JSON.stringify(cacheEnd)); } catch (e) { }
      return txt;
    } catch (e) { return null; }
  };

  // Foto completa do app: GPS (até 8 s) + endereço + data do arquivo + marca d'água.
  // contexto = texto da última linha (ex.: "CH-00012 · Cliente" ou "CS-001 · ROT-00001 · Foto 3").
  VF.fotoCarimbada = async (file, contexto) => {
    const agora = SN.agora();
    let pos = VF.posicao && Date.now() - VF.posicao.ts < 120000 ? VF.posicao : null;
    if (!pos) pos = await VF.pegarPosicao(60000, 8000).catch(() => null);
    const [endereco, exif] = await Promise.all([VF.endereco(pos), VF.dataExif(file)]);
    const dataArq = exif || (file.lastModified ? new Date(file.lastModified) : null);
    const img = await VF.processar(file, { agora, pos, endereco, contexto });
    return { ...img, agora, pos, endereco, dataArquivo: dataArq ? dataArq.toISOString() : '', fonteData: exif ? 'exif' : 'lastModified' };
  };

  // ─────────── GPS ───────────
  // Enquanto a tela da rota está aberta o GPS fica ligado (watchPosition); a
  // foto usa a última posição fresca, sem esperar.
  VF.posicao = null; let watch = null;
  const guardar = p => { VF.posicao = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), precisao: Math.round(p.coords.accuracy || 0), ts: Date.now() }; };
  VF.ligarGps = () => {
    if (watch != null || !navigator.geolocation) return;
    watch = navigator.geolocation.watchPosition(guardar, () => { }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
  };
  VF.desligarGps = () => { if (watch != null) navigator.geolocation.clearWatch(watch); watch = null; };
  // Posição fresca (até maxIdade ms) ou uma nova leitura. Parado no mesmo ponto
  // o aparelho nem sempre manda posição nova: se houver uma do GPS contínuo com
  // até 2 min, espera no máximo 5 s pela nova e usa a que tem (também se a
  // leitura nova falhar).
  VF.RESERVA_MS = 120000; VF.ESPERA_NOVA_MS = 5000;
  VF.pegarPosicao = (maxIdade = 30000, limiteMs = 20000) => new Promise((ok, falha) => {
    if (VF.posicao && Date.now() - VF.posicao.ts <= maxIdade) return ok(VF.posicao);
    if (!navigator.geolocation) return falha(new Error('Este aparelho não tem GPS disponível no navegador.'));
    const reserva = VF.posicao && Date.now() - VF.posicao.ts <= VF.RESERVA_MS ? VF.posicao : null;
    let feito = false; const fim = (f, x) => { if (!feito) { feito = true; clearTimeout(timer); f(x); } };
    const timer = reserva ? setTimeout(() => fim(ok, reserva), VF.ESPERA_NOVA_MS) : null;
    navigator.geolocation.getCurrentPosition(p => { guardar(p); fim(ok, VF.posicao); },
      e => {
        if (e.code !== 1 && reserva) return fim(ok, reserva);
        fim(falha, new Error(e.code === 1 ? 'GPS bloqueado: permita a localização para este site nas configurações do navegador.' : 'Não foi possível obter o GPS agora. Tente de novo em local aberto.'));
      },
      { enableHighAccuracy: true, timeout: limiteMs, maximumAge: maxIdade });
  });
  return VF;
})();
