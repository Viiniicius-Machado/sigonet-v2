// SIGONET V2 — Acompanhamentos CPFL (troca de poste, limpeza de cabo, reordenamento…): regras puras.
//
// Pedido do usuário (2026-10-12). A concessionária agenda serviços nos postes; a sala técnica
// registra cada notificação e a Manutenção acompanha as que podem afetar a rede (critério de
// massiva: risco para 3 ou mais clientes). Resultado de cada acompanhamento:
//   PREVENTIVA     — chegamos no local e tivemos efetivação direta para não romper cabo;
//   IMPRODUTIVA    — agendamento em que a CPFL não compareceu;
//   ACOMPANHAMENTO — estivemos no local com a CPFL, mas não precisou de ação (não havia risco).
// Aqui: normalizar a planilha histórica ("TROCA DE POSTES v2.xlsx", aba NOTIFICAÇÕES), entender
// o texto de uma notificação recebida por e-mail (PDF/Excel) e calcular o painel do mês.
// Roda no navegador (window.CPFL) e no Node (testes).
(function (raiz) {
  'use strict';
  var C = {};
  var norm = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); };
  C.norm = norm;

  C.TIPOS = {
    TROCA_POSTE: { rot: 'Troca de poste', cor: '#d97706', chaves: ['TROCA DE POSTE', 'SUBSTITUICAO DE POSTE', 'SUBSTITUICAO DO POSTE', 'TROCA DO POSTE', 'IMPLANTACAO DE POSTE', 'REMOCAO DE POSTE'] },
    LIMPEZA: { rot: 'Limpeza de cabo', cor: '#0284c7', chaves: ['LIMPEZA DE CABO', 'LIMPEZA DE REDE', 'RETIRADA DE CABO', 'CABOS INATIVOS', 'LIMPEZA'] },
    REORDENAMENTO: { rot: 'Reordenamento', cor: '#7c3aed', chaves: ['REORDENAMENTO', 'REORDENACAO', 'ORDENAMENTO'] },
    IRREGULARIDADE: { rot: 'Irregularidade', cor: '#dc2626', chaves: ['IRREGULARIDADE', 'IRREGULAR', 'OCUPACAO IRREGULAR', 'CLANDESTIN'] },
    REGULARIZACAO: { rot: 'Regularização / ofício', cor: '#059669', chaves: ['REGULARIZACAO', 'OFICIO', 'EMERGENCIA'] },
    OUTRO: { rot: 'Outro', cor: '#6b7280', chaves: [] }
  };
  C.STATUS = {
    PLANEJADO: { rot: 'Planejado', cls: 'alerta' }, CONCLUIDO: { rot: 'Concluído', cls: 'ok' }, CANCELADO: { rot: 'Cancelado', cls: '' },
    NAO_REALIZADO: { rot: 'Não realizado', cls: 'erro' }, NAO_ATENDIDO: { rot: 'Não atendido', cls: 'erro' }
  };
  C.RESULTADOS = {
    PREVENTIVA: { rot: 'Preventiva', desc: 'Chegamos no local e tivemos efetivação direta para não romper cabo.', lpu: 'SEV0085' },
    IMPRODUTIVA: { rot: 'Improdutiva', desc: 'Agendamento em que a CPFL não compareceu no local.', lpu: 'SEV0076' },
    ACOMPANHAMENTO: { rot: 'Acompanhamento', desc: 'Estivemos no local junto com a CPFL, mas não precisou de ação (não havia risco).', lpu: 'SEV0085' }
  };
  C.MIN_CLIENTES_MASSIVA = 3;

  // ─────────── Normalização ───────────
  // O tema vale mais que o tipo de documento: "Ofício … limpeza de cabos" é LIMPEZA.
  C.tipoDe = function (txt) {
    var t = norm(txt), achou = 'OUTRO', pos = Infinity;
    ['TROCA_POSTE', 'LIMPEZA', 'REORDENAMENTO', 'IRREGULARIDADE'].forEach(function (k) { C.TIPOS[k].chaves.forEach(function (ch) { var i = t.indexOf(ch); if (i >= 0 && i < pos) { pos = i; achou = k; } }); });
    if (achou === 'OUTRO' && C.TIPOS.REGULARIZACAO.chaves.some(function (ch) { return t.indexOf(ch) >= 0; })) achou = 'REGULARIZACAO';
    return achou;
  };
  // "PLANEJADO/CANCELADO", "CONCLUÍDO/CANCELADO" → cancelado (vale o último); mantém o texto original à parte.
  C.statusDe = function (txt) {
    var t = norm(txt); if (!t) return 'PLANEJADO';
    if (/CANCEL/.test(t)) return 'CANCELADO';
    if (/NAO REALIZ/.test(t)) return 'NAO_REALIZADO';
    if (/NAO ATEND/.test(t)) return 'NAO_ATENDIDO';
    if (/CONCLU|REALIZAD|EXECUTAD/.test(t)) return 'CONCLUIDO';
    return 'PLANEJADO';
  };
  C.resultadoDe = function (txt) { var t = norm(txt); return /PREVENT/.test(t) ? 'PREVENTIVA' : /IMPRODUT/.test(t) ? 'IMPRODUTIVA' : /ACOMPANH/.test(t) ? 'ACOMPANHAMENTO' : ''; };
  // "PV-TELECOM" e "PV TELECOM" são a mesma equipe.
  C.equipeDe = function (txt) { return norm(txt).replace(/\s*-\s*/g, ' ').replace(/\?/g, '').trim(); };
  // Data: Date, número de série do Excel, "dd/mm/aaaa", "aaaa-mm-dd" → "aaaa-mm-dd".
  var dois = function (n) { return (n < 10 ? '0' : '') + n; };
  C.dataDe = function (v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + dois(v.getMonth() + 1) + '-' + dois(v.getDate());
    if (typeof v === 'number' && v > 20000 && v < 80000) { var d = new Date(Math.round((v - 25569) * 864e5)); return d.getUTCFullYear() + '-' + dois(d.getUTCMonth() + 1) + '-' + dois(d.getUTCDate()); }
    var s = String(v).trim(), m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(s); if (m) { var a = Number(m[3]); if (a < 100) a += 2000; return a + '-' + dois(Number(m[2])) + '-' + dois(Number(m[1])); }
    return '';
  };
  // Hora: Date, fração do dia (Excel), "07:50", "7h50", "12:00:00" → "HH:MM".
  C.horaDe = function (v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) return dois(v.getHours()) + ':' + dois(v.getMinutes());
    if (typeof v === 'number' && v >= 0 && v < 1) { var min = Math.round(v * 1440); return dois(Math.floor(min / 60)) + ':' + dois(min % 60); }
    var m = /(\d{1,2})\s*[:hH]\s*(\d{2})/.exec(String(v)); return m && Number(m[1]) < 24 ? dois(Number(m[1])) + ':' + m[2] : '';
  };
  // Coordenadas: "lat, lng", vários pontos separados por "/" (trecho), graus-minutos-segundos.
  var plausivel = function (la, lg) { return la > -34 && la < 5 && lg > -74 && lg < -34; };
  // estrito (texto livre de PDF): só números com 3+ casas decimais, para não confundir "Rua 15, 45" com coordenada.
  C.pontosDe = function (txt, estrito) {
    var s = String(txt == null ? '' : txt), out = [], m;
    if (/https?:\/\//i.test(s) && !/[@=\/](-?\d{1,2}\.\d{3,})\s*,\s*\+?(-?\d{2,3}\.\d{3,})/.test(s)) return out; // link encurtado: o servidor resolve
    // Números soltos ("-22.9, -47.0", "- 47.06", "-23077694" sem o ponto) → pares (lat, lng) plausíveis.
    var nums = [], re = /(-\s?)?\d+(?:[.,]\d+)?/g;
    while (!/\d\s*[°º]\s*\d/.test(s) && (m = re.exec(s))) {
      var t = m[0].replace(/\s/g, '').replace(',', '.'), neg = t.charAt(0) === '-', d = t.replace('-', '');
      if (!/\./.test(d) && d.length >= 7 && d.length <= 9) d = d.slice(0, 2) + '.' + d.slice(2); // ponto decimal esquecido
      var v = Number(d); if (!isFinite(v) || /\..*\./.test(d) || (estrito && !/\.\d{3,}/.test(d))) continue; nums.push(neg ? -v : v);
    }
    for (var i = 0; i + 1 < nums.length; i++) {
      var la = nums[i], lg = nums[i + 1];
      if (Math.abs(la) < 5 || Math.abs(la) > 34 || Math.abs(lg) < 34 || Math.abs(lg) > 74) continue;
      la = -Math.abs(la); lg = -Math.abs(lg); // Sudeste: latitude e longitude negativas (corrige o sinal esquecido)
      if (plausivel(la, lg)) { out.push([Math.round(la * 1e6) / 1e6, Math.round(lg * 1e6) / 1e6]); i++; }
    }
    if (out.length) return out;
    var dms = /(\d{1,2})\s*[°º]\s*(\d{1,2})\s*['’′]\s*([\d.,]+)\s*["”″]?\s*([NS])[\s,;]+(\d{1,3})\s*[°º]\s*(\d{1,2})\s*['’′]\s*([\d.,]+)\s*["”″]?\s*([EWOL])/gi;
    while ((m = dms.exec(s))) {
      var lat = Number(m[1]) + Number(m[2]) / 60 + Number(m[3].replace(',', '.')) / 3600, lng = Number(m[5]) + Number(m[6]) / 60 + Number(m[7].replace(',', '.')) / 3600;
      if (/S/i.test(m[4])) lat = -lat; if (/[WO]/i.test(m[8])) lng = -lng;
      if (plausivel(lat, lng)) out.push([Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6]);
    }
    return out;
  };
  // Identificador estável: número + data (a mesma notificação pode ser reagendada).
  C.chave = function (r) {
    var n = norm(r.numero).replace(/[^A-Z0-9]/g, ''), base = n && n !== 'SN' ? n : 'SN' + norm(r.cidade).replace(/[^A-Z]/g, '').slice(0, 6) + ((r.pontos || [])[0] || []).join('').replace(/[^0-9]/g, '').slice(0, 10);
    return 'NOT-' + base + '-' + String(r.data || '').replace(/-/g, '');
  };

  // ─────────── Planilha histórica ───────────
  // linhas = matriz (1ª linha = cabeçalho) da aba NOTIFICAÇÕES. Cidade escrita de jeitos diferentes
  // ("Jundiai"/"Jundiaí") fica com a grafia acentuada mais usada.
  C.lerPlanilha = function (linhas) {
    var cab = (linhas[0] || []).map(norm), col = function () { for (var i = 0; i < arguments.length; i++) { var k = cab.indexOf(arguments[i]); if (k >= 0) return k; } return -1; };
    var I = { acao: col('ACAO'), numero: col('NOTIFICACAO'), cidade: col('CIDADE'), coord: col('COORDENADAS'), data: col('DATA'), prazo: col('PRAZO'), hora: col('HORA'),
      status: col('STATUS'), equipe: col('EQUIPE'), resultado: col('ACAO2', 'ACAO 2', 'RESULTADO'), dataAtuacao: col('DATA DA PREVENTIVA', 'DATA DA ATUACAO') };
    if (I.numero < 0 || I.data < 0) throw new Error('Não achei as colunas NOTIFICAÇÃO e DATA na primeira linha.');
    var v = function (l, k) { return k >= 0 ? l[k] : ''; }, regs = [], grafias = {};
    linhas.slice(1).forEach(function (l, n) {
      if (!l || !l.some(function (x) { return x !== null && x !== undefined && String(x).trim() !== ''; })) return;
      var data = C.dataDe(v(l, I.data)); if (!data) return;
      var cid = String(v(l, I.cidade) || '').trim(), kc = norm(cid);
      if (kc) { var g = grafias[kc] = grafias[kc] || {}; g[cid] = (g[cid] || 0) + 1; }
      var prazo = v(l, I.prazo), r = {
        numero: String(v(l, I.numero) == null ? '' : v(l, I.numero)).trim(), tipo: C.tipoDe(v(l, I.acao)), tipo_original: String(v(l, I.acao) || '').trim(),
        cidade: cid, pontos: C.pontosDe(v(l, I.coord)), coord_original: String(v(l, I.coord) || '').trim(), data: data, hora: C.horaDe(v(l, I.hora)),
        prazo: C.dataDe(prazo) || String(prazo == null ? '' : prazo).trim(), status: C.statusDe(v(l, I.status)), status_original: String(v(l, I.status) || '').trim(),
        equipe: C.equipeDe(v(l, I.equipe)), resultado: C.resultadoDe(v(l, I.resultado)), data_atuacao: C.dataDe(v(l, I.dataAtuacao)), origem: 'PLANILHA', linha: n + 2
      };
      regs.push(r);
    });
    var melhor = {}; Object.keys(grafias).forEach(function (k) { var g = grafias[k]; melhor[k] = Object.keys(g).sort(function (a, b) { var ac = /[^\x00-\x7f]/.test(b) - /[^\x00-\x7f]/.test(a); return ac || g[b] - g[a]; })[0]; });
    regs.forEach(function (r) { var k = norm(r.cidade); if (melhor[k]) r.cidade = melhor[k]; r.id = C.chave(r); });
    // Mesma notificação e mesma data repetida na planilha: fica a última linha.
    var porId = {}; regs.forEach(function (r) { porId[r.id] = r; });
    return Object.keys(porId).map(function (k) { return porId[k]; });
  };

  // ─────────── Notificação recebida (texto do PDF ou do Excel) ───────────
  // Entende o tema, o número, a data/hora, a cidade, o endereço, as coordenadas e os postes.
  // cidades = nomes conhecidos (da rede, dos chamados, das notificações) para achar a cidade no texto.
  C.extrair = function (texto, opts) {
    var o = opts || {}, s = String(texto || ''), t = norm(s), r = { tipo: C.tipoDe(s), numero: '', data: '', hora: '', cidade: '', endereco: '', pontos: C.pontosDe(s, true), postes: '' };
    var m = /(?:NOTIFICA(?:CAO|COES)|NOTA(?: DE SERVICO)?|ORDEM(?: DE SERVICO)?|PROTOCOLO|OFICIO|N[O°º]\.?)\s*(?:N[O°º.]*)?\s*[:#-]?\s*(\d{6,10}|\d{2,6}\s*\/\s*\d{4})/.exec(t);
    r.numero = m ? m[1].replace(/\s+/g, '') : ((/\b(\d{7,8})\b/.exec(t) || [])[1] || '');
    // Data do serviço: a que vem perto de "data/programado/agendado/execução/intervenção/previsão"; senão a 1ª.
    var datas = [], re = /(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/g, x;
    while ((x = re.exec(t))) datas.push({ i: x.index, d: C.dataDe(x[1]) });
    var perto = datas.filter(function (d) { return /(PROGRAMAD|AGENDAD|EXECUC|INTERVENC|PREVIS|DATA D[OAE] (SERVICO|OBRA|MANOBRA|DESLIGAMENTO|EXECUCAO)|DESLIGAMENTO|REALIZAC)/.test(t.slice(Math.max(0, d.i - 60), d.i)); })[0];
    var dt = perto || datas[0]; r.data = dt ? dt.d : '';
    if (dt) { var h = /(\d{1,2})\s*[:H]\s*(\d{2})/.exec(t.slice(dt.i, dt.i + 60)) || /(?:HORA|HORARIO|INICIO|DAS)\s*:?\s*(\d{1,2})\s*[:H]\s*(\d{2})/.exec(t); if (h) r.hora = C.horaDe(h[1] + ':' + h[2]); }
    else { var h2 = /(?:HORA|HORARIO|INICIO|DAS)\s*:?\s*(\d{1,2})\s*[:H]\s*(\d{2})/.exec(t); if (h2) r.hora = C.horaDe(h2[1] + ':' + h2[2]); }
    var conta = {}; (o.cidades || []).forEach(function (c) { var k = norm(c); if (k.length < 3) return; var n = t.split(k).length - 1; if (n) conta[c] = (conta[c] || 0) + n; });
    r.cidade = Object.keys(conta).sort(function (a, b) { return conta[b] - conta[a] || b.length - a.length; })[0] || '';
    var e = /\b(RUA|R\.|AVENIDA|AV\.?|ESTRADA|ESTR\.|RODOVIA|ROD\.|TRAVESSA|ALAMEDA|PRACA|VIELA)\s+([^\n;|]{3,90})/i.exec(s);
    if (e) r.endereco = (e[1] + ' ' + e[2]).replace(/\s+/g, ' ').replace(/[,\s]+$/, '').trim().slice(0, 140);
    var p = /(\d{1,3})\s*POSTES?\b/.exec(t); if (p) r.postes = Number(p[1]);
    return r;
  };

  // ─────────── E-mails da CPFL (vários formatos) ───────────
  // Vistos em 2026-10-12 (prints do Outlook):
  //  (a) "LIMPEZA DE CABOS TELECOM - 00000/2026/DJM": "no dia 28/09/2026 … nos seguintes endereços:"
  //      e uma linha por rua "R. Exemplo – Bairro / Cidade – SP" (sem coordenada);
  //  (b) "Projeto de Reordenamento de <cidade> - dd/mm/aaaa": "Início previsto: às 9:00", "Local de atuação: …",
  //      "Ponto de encontro: …";
  //  (c) "[Report Ocupação] Programação equipes de Regularização de Cabos … da semana": tabela com
  //      nota, cidade, "59 postes", ação, data início, data fim, endereço de referência.
  // Devolve uma LISTA de notificações (um e-mail pode ter várias ruas ou várias linhas).
  var RUA = /^\s*(R\.|RUA|AV\.?|AVENIDA|ESTR\.?|ESTRADA|ROD\.?|RODOVIA|TRAVESSA|TV\.|ALAMEDA|AL\.|PRA[ÇC]A|P[ÇC]A\.?|VIELA|LARGO)\s/i;
  // "R. Exemplo – Bairro / Cidade – SP" → rua, bairro, cidade.
  C.lerLinhaEndereco = function (linha) {
    var l = String(linha || '').replace(/\s+/g, ' ').replace(/[–—]/g, '-').trim(), cidade = '', bairro = '', rua = l;
    var m = /^(.*?)\s*\/\s*([^\/]+?)(?:\s*-\s*[A-Z]{2})?\s*$/.exec(l);
    if (m) { rua = m[1]; cidade = m[2].trim(); }
    var b = /^(.*?)\s+-\s+(.+)$/.exec(rua); if (b) { rua = b[1]; bairro = b[2]; }
    return { rua: rua.replace(/[,.;\s]+$/, '').trim(), bairro: bairro.trim(), cidade: cidade };
  };
  // Linha da tabela "Report Ocupação": 7700000 Cidade 69 postes Regularização 05/10/2026 09/10/2026 Endereço…
  var LINHA_REPORT = /(\d{6,8})\s+([A-Za-zÀ-ÿ'.\- ]{3,40}?)\s+(\d{1,4})\s*postes?[ \t]+([A-Za-zÀ-ÿ]+)[ \t]*(\d{1,2}\/\d{1,2}\/\d{4})?[ \t]*(\d{1,2}\/\d{1,2}\/\d{4})?[ \t]*([^\n]*?)(?=[ \t]+\d{6,8}[ \t]+[A-Za-zÀ-ÿ]|\n|$)/g;
  C.extrairEmail = function (texto, opts) {
    var o = opts || {}, s = String(texto || '').replace(/\r/g, ''), t = norm(s), out = [];
    var assunto = ((/(?:^|\n)\s*(?:ASSUNTO|SUBJECT)\s*:\s*([^\n]+)/i.exec(s) || [])[1] || o.assunto || s.split('\n').filter(function (l) { return l.trim(); })[0] || '').trim();
    // (c) tabela de programação semanal
    var linhas = []; s.split('\n').forEach(function (l) { var x = l.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim(); if (x) linhas.push(x); });
    var corpo = linhas.join('\n'), m, achou = [];
    LINHA_REPORT.lastIndex = 0;
    while ((m = LINHA_REPORT.exec(corpo))) achou.push(m);
    if (achou.length >= 2 || (achou.length && /QTD_?POSTES|REPORT OCUPA|PROGRAMACAO EQUIPES/.test(t))) {
      achou.forEach(function (m) {
        var ini = C.dataDe(m[5]), fim = C.dataDe(m[6]);
        out.push({ tipo: 'REGULARIZACAO', numero: m[1], cidade: m[2].trim(), postes: Number(m[3]), acao_cpfl: m[4], data: ini || fim || '', data_fim: fim, hora: '',
          endereco: (m[7] || '').replace(/\s+-\s+SP\b.*$/i, '').replace(/,\s*\d{5}-?\d{3}\s*$/, '').trim(), bairro: '', pontos: [], origem_formato: 'REPORT' });
      });
      return out;
    }
    // (a)/(b) comunicado com data e ruas
    var tipo = C.tipoDe(assunto + ' ' + s);
    var num = (/(\d{3,6}\s*\/\s*\d{4})(?:\s*\/\s*[A-Z]{2,5})?/.exec(norm(assunto)) || [])[1] || (/\b(\d{7,8})\b/.exec(norm(assunto)) || [])[1] || '';
    num = num.replace(/\s+/g, '');
    var dt = /(?:NO DIA|DIA|DATA[^:\n]{0,20}:?)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/.exec(t) || /(\d{1,2}\/\d{1,2}\/\d{4})/.exec(t) || /(\d{1,2}-\d{1,2}-\d{4})/.exec(norm(assunto));
    var data = dt ? C.dataDe(dt[1].replace(/-/g, '/')) : '';
    var hr = /(?:INICIO PREVISTO|INICIO|HORARIO)\s*:?\s*(?:AS\s*)?(\d{1,2})\s*[:H]\s*(\d{2})/.exec(t) || /\bAS\s+(\d{1,2})\s*[:H]\s*(\d{2})/.exec(t);
    var hora = hr ? C.horaDe(hr[1] + ':' + hr[2]) : '';
    var cidadeAssunto = '', cids = o.cidades || [];
    cids.forEach(function (c) { if (norm(c).length > 3 && norm(assunto).indexOf(norm(c)) >= 0) cidadeAssunto = c; });
    var ruas = [], linhasOrig = s.split('\n');
    // depois de "seguintes endereços": cada linha que começa com R./Av./Rua…
    var iEnd = -1; linhasOrig.forEach(function (l, i) { if (iEnd < 0 && /SEGUINTES ENDERECOS|ENDERECOS ABAIXO|NOS ENDERECOS/.test(norm(l))) iEnd = i; });
    if (iEnd >= 0) {
      for (var i = iEnd + 1; i < linhasOrig.length && ruas.length < 30; i++) { var l = linhasOrig[i].trim(); if (!l) continue; if (RUA.test(l)) ruas.push(C.lerLinhaEndereco(l)); else if (ruas.length) break; }
    }
    var achaCampo = function (re) { var x = null; linhasOrig.some(function (l) { var n = norm(l); if (re.test(n)) { x = l.slice(l.indexOf(':') + 1).trim(); return true; } return false; }); return x; };
    var local = achaCampo(/^LOCAL D[AE] (ATUACAO|EXECUCAO|INTERVENCAO)\s*:/);
    if (!ruas.length && local) ruas.push(C.lerLinhaEndereco(local));
    if (!ruas.length) { var r1 = C.extrair(s, o); if (r1.endereco) ruas.push({ rua: r1.endereco, bairro: '', cidade: r1.cidade }); }
    var encontro = achaCampo(/^PONTO DE ENCONTRO\s*:/) || '';
    (ruas.length ? ruas : [{ rua: '', bairro: '', cidade: '' }]).forEach(function (r, i) {
      var cid = r.cidade || cidadeAssunto || C.extrair(s, o).cidade;
      cids.forEach(function (c) { if (norm(c) === norm(cid)) cid = c; });
      out.push({ tipo: tipo === 'OUTRO' ? 'LIMPEZA' : tipo, numero: num, data: data, hora: hora, cidade: cid, endereco: r.rua, bairro: r.bairro, pontos: C.pontosDe(s, true),
        obs: encontro ? 'Ponto de encontro: ' + encontro : '', assunto: assunto, origem_formato: 'COMUNICADO', seq: ruas.length > 1 ? i + 1 : 0 });
    });
    return out;
  };
  // Chave quando um e-mail tem várias ruas: número + data + rua.
  C.chaveRua = function (r) { return C.chave(r) + (r.endereco ? '-' + norm(r.endereco).replace(/[^A-Z0-9]/g, '').slice(0, 24) : ''); };

  // ─────────── A notificação passa na nossa rede? ───────────
  // trechos = geometria da rua (lista de trechos [[lat,lng]…]) ou só o ponto; rede = dados da cidade
  // (rede-regras.js, expandidos); R = funções da rede. Amostra a rua a cada ~10 m e soma o trecho em
  // que há cabo nosso a até "raio" metros; conta as caixas a 30 m da rua.
  C.naRede = function (trechos, rede, R, raio) {
    raio = raio || 20;
    if (!rede || !R) return null;
    var res = { metros: 0, cabos: {}, caixas: [], ruaM: 0 };
    (trechos || []).forEach(function (pts) {
      if (pts.length === 1) { var c1 = R.caboMaisPerto(rede, pts[0][0], pts[0][1]); if (c1.cabo && c1.d <= Math.max(raio, 50)) { res.metros += 1; res.cabos[c1.cabo.n] = 1; } return; }
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i], d = R.dist(a, b), n = Math.max(1, Math.ceil(d / 10));
        for (var k = 0; k < n; k++) {
          var f = (k + 0.5) / n, p = [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])], seg = d / n;
          res.ruaM += seg;
          var cb = R.caboMaisPerto(rede, p[0], p[1]);
          if (cb.cabo && cb.d <= raio) { res.metros += seg; res.cabos[cb.cabo.n] = (res.cabos[cb.cabo.n] || 0) + seg; }
        }
      }
    });
    var perto = function (c) { return (trechos || []).some(function (pts) { if (pts.length === 1) return R.dist(pts[0], [c.lat, c.lng]) <= 30;
      for (var i = 1; i < pts.length; i++) if (R.distSeg([c.lat, c.lng], pts[i - 1], pts[i]) <= 30) return true; return false; }); };
    rede.caixas.forEach(function (c) { if (perto(c)) res.caixas.push(c.n); });
    res.metros = Math.round(res.metros); res.ruaM = Math.round(res.ruaM);
    res.cabos = Object.keys(res.cabos).sort(function (x, y) { return res.cabos[y] - res.cabos[x]; });
    res.tem = res.metros > 0 || res.caixas.length > 0;
    return res;
  };

  // ─────────── Painel do mês (como o "PAINEL MENSAL" da planilha) ───────────
  // iv = [inicio, fim) em "aaaa-mm-dd". Recebidas = notificações com data no período.
  C.painel = function (regs, ini, fim) {
    var no = (regs || []).filter(function (r) { return r.data >= ini && r.data < fim; });
    var p = { recebidas: no.length, unicas: Object.keys(no.reduce(function (a, r) { a[norm(r.numero) || r.id] = 1; return a; }, {})).length,
      comAcao: 0, semAcao: 0, resultados: { PREVENTIVA: 0, IMPRODUTIVA: 0, ACOMPANHAMENTO: 0 }, status: {}, tipos: {}, equipes: {}, cidades: {}, despachadas: 0, massivas: 0 };
    no.forEach(function (r) {
      if (r.resultado) { p.comAcao++; p.resultados[r.resultado] = (p.resultados[r.resultado] || 0) + 1; } else p.semAcao++;
      p.status[r.status] = (p.status[r.status] || 0) + 1; p.tipos[r.tipo] = (p.tipos[r.tipo] || 0) + 1;
      var eq = r.equipe || '(sem equipe)', e = p.equipes[eq] = p.equipes[eq] || { total: 0, PREVENTIVA: 0, IMPRODUTIVA: 0, ACOMPANHAMENTO: 0, semAcao: 0 };
      e.total++; if (r.resultado) e[r.resultado]++; else e.semAcao++;
      var c = p.cidades[r.cidade || '(sem cidade)'] = p.cidades[r.cidade || '(sem cidade)'] || { total: 0, comAcao: 0 }; c.total++; if (r.resultado) c.comAcao++;
      if (r.id_chamado) p.despachadas++; if (r.massiva) p.massivas++;
    });
    p.pctImprodutiva = p.comAcao ? Math.round(1000 * p.resultados.IMPRODUTIVA / p.comAcao) / 10 : 0;
    return p;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  else raiz.CPFL = C;
})(typeof window !== 'undefined' ? window : this);
