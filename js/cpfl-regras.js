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
    var geral = C.extrair(s, o); // número, postes e coordenada que estejam no corpo (ex.: PDF "Notificação Nº …")
    if (!num) num = geral.numero;
    var dt = /(?:NO DIA|DIA|DATA[^:\n]{0,20}:?)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/.exec(t) || /(\d{1,2}\/\d{1,2}\/\d{4})/.exec(t) || /(\d{1,2}-\d{1,2}-\d{4})/.exec(norm(assunto));
    var data = dt ? C.dataDe(dt[1].replace(/-/g, '/')) : '';
    var hr = /(?:INICIO PREVISTO|INICIO|HORARIO|\bDAS)\s*:?\s*(?:AS\s*)?(\d{1,2})\s*[:H]\s*(\d{2})/.exec(t) || /\bAS\s+(\d{1,2})\s*[:H]\s*(\d{2})/.exec(t);
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
      out.push({ tipo: tipo === 'OUTRO' ? 'LIMPEZA' : tipo, numero: num, data: data, hora: hora, cidade: cid, endereco: r.rua, bairro: r.bairro, pontos: C.pontosDe(s, true), postes: geral.postes || '',
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

  // Nome da rua por extenso para a busca de endereço ("R. Gen. X" → "Rua General X"); sem número/bairro.
  var ABREV = [[/^R\.\s*/i, 'Rua '], [/^AV\.?\s*/i, 'Avenida '], [/^ESTR\.?\s*/i, 'Estrada '], [/^ROD\.?\s*/i, 'Rodovia '], [/^TV\.\s*/i, 'Travessa '], [/^AL\.\s*/i, 'Alameda '], [/^P[ÇC]A\.?\s*/i, 'Praça '],
    [/\bGEN\.\s*/gi, 'General '], [/\bCAP\.\s*/gi, 'Capitão '], [/\bCEL\.\s*/gi, 'Coronel '], [/\bDR\.\s*/gi, 'Doutor '], [/\bPROF\.\s*/gi, 'Professor '], [/\bSTA\.\s*/gi, 'Santa '], [/\bSTO\.\s*/gi, 'Santo '],
    [/\bENG\.\s*/gi, 'Engenheiro '], [/\bMAL\.\s*/gi, 'Marechal '], [/\bPRES\.\s*/gi, 'Presidente ']];
  C.ruaPorExtenso = function (r) { var x = String(r || '').replace(/,.*$/, '').replace(/\s+-\s+.*$/, '').trim(); ABREV.forEach(function (a) { x = x.replace(a[0], a[1]); }); return x.replace(/\s+/g, ' ').trim(); };
  C.ruaSemTipo = function (r) { return C.ruaPorExtenso(r).replace(/^(Rua|Avenida|Estrada|Rodovia|Travessa|Alameda|Praça)\s+/i, ''); };
  // Texto para responder o e-mail: o que passa e o que não passa na nossa rede.
  var diaBr = function (v) { return v ? String(v).split('-').reverse().join('/') : ''; };
  C.resumoRede = function (cands) {
    var lin = function (c) { return '- ' + (c.numero ? 'Nota ' + c.numero + ' · ' : '') + (c.endereco || '(sem endereço)') + (c.bairro ? ' – ' + c.bairro : '') + ' / ' + (c.cidade || '') + (c.data ? ' · ' + diaBr(c.data) : '') + (c.hora ? ' ' + c.hora : ''); };
    var tem = cands.filter(function (c) { return c.rede && c.rede.tem; }), nao = cands.filter(function (c) { return (c.rede && !c.rede.tem) || c.foraArea; }), conf = cands.filter(function (c) { return !c.rede && !c.foraArea; });
    return ['Prezados,', '', 'Segue a verificação da Net Turbo para as intervenções informadas:', '',
      'COM REDE NET TURBO (' + tem.length + ') — a Manutenção vai avaliar e acompanhar:'].concat(tem.length ? tem.map(function (c) { return lin(c) + ' (' + c.rede.metros + ' m de cabo' + (c.rede.caixas ? ', ' + c.rede.caixas + ' caixa(s) de emenda' : '') + ')'; }) : ['- nenhuma'])
      .concat(['', 'SEM REDE NET TURBO (' + nao.length + '):']).concat(nao.length ? nao.map(lin) : ['- nenhuma'])
      .concat(conf.length ? ['', 'A CONFERIR (' + conf.length + ') — endereço não localizado automaticamente:'].concat(conf.map(lin)) : [])
      .concat(['', 'Atenciosamente,', 'Net Turbo — Operação e Manutenção (mensagem automática do SigoNet)']).join('\n');
  };

  // ─────────── Rota do dia (decisões do usuário em 2026-10-12) ───────────
  // Sai do 1º agendamento; tempo no local: 60 min troca de poste, 90 min limpeza/reordenamento.
  // Agendamento COM hora fica fixo (a CPFL marca o horário); SEM hora ou ATRASADO é flexível e entra
  // nos intervalos entre os fixos, sempre o mais perto que ainda dá tempo. Conflito = chegar depois
  // da hora marcada (com tolerância).
  C.TEMPO_LOCAL = { TROCA_POSTE: 60, LIMPEZA: 90, REORDENAMENTO: 90, IRREGULARIDADE: 60, REGULARIZACAO: 90, OUTRO: 60 };
  var minDe = function (h) { var m = /^(\d{1,2}):(\d{2})/.exec(String(h || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  var hhmm = function (m) { m = Math.round(m); return dois(Math.floor(m / 60) % 24) + ':' + dois(m % 60); };
  C.minDe = minDe; C.hhmm = hhmm;
  // Distância em linha reta (m) e tempo estimado de carro na cidade (min), quando não há matriz de ruas.
  var distM = function (a, b) { var r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r, h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2); return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h))); };
  C.distM = distM;
  C.tempoEstimado = function (a, b) { return Math.round(5 + distM(a, b) * 1.35 / 1000 / 30 * 60); }; // 1,35× a reta, 30 km/h, +5 min para estacionar
  // itens: [{ id, ponto:[lat,lng], hora:'HH:MM'|'' , tipo, fixo? }]. opts: { tempo(i,j) → min (índices em itens), inicio:'08:00', fim:'18:00', tolerancia: 15, duracao(item) }.
  C.montarRota = function (itens, opts) {
    var o = opts || {}, tol = o.tolerancia == null ? 15 : o.tolerancia, fimDia = minDe(o.fim || '18:00');
    var dur = o.duracao || function (it) { return C.TEMPO_LOCAL[it.tipo] || 60; };
    var tempo = o.tempo || function (i, j) { return C.tempoEstimado(itens[i].ponto, itens[j].ponto); };
    var idx = itens.map(function (x, i) { return i; });
    var fixos = idx.filter(function (i) { return itens[i].fixo !== false && minDe(itens[i].hora) != null; }).sort(function (a, b) { return minDe(itens[a].hora) - minDe(itens[b].hora); });
    var livres = idx.filter(function (i) { return fixos.indexOf(i) < 0; });
    var seq = [], pos = null, t = null, naoCouberam = [];
    var perto = function (de, lista) { var m = -1, dm = Infinity; lista.forEach(function (j) { var d = de == null ? 0 : tempo(de, j); if (d < dm) { dm = d; m = j; } }); return m; };
    var ir = function (j, horaMarcada) {
      var desloc = pos == null ? 0 : tempo(pos, j), chegada = t == null ? (horaMarcada != null ? horaMarcada : minDe(o.inicio || '08:00')) : t + desloc;
      var inicio = horaMarcada != null ? Math.max(chegada, horaMarcada) : chegada, atraso = horaMarcada != null ? Math.max(0, chegada - horaMarcada) : 0;
      seq.push({ id: itens[j].id, i: j, ordem: seq.length + 1, deslocMin: desloc, chegada: hhmm(chegada), inicio: hhmm(inicio), saida: hhmm(inicio + dur(itens[j])), espera: Math.max(0, inicio - chegada),
        horaMarcada: horaMarcada != null ? hhmm(horaMarcada) : '', atrasoMin: atraso, conflito: atraso > tol, fixo: horaMarcada != null });
      pos = j; t = inicio + dur(itens[j]);
    };
    // Começa pelo 1º agendamento: o 1º fixo; sem fixos, o livre mais "à ponta" (o que tem o vizinho mais longe).
    if (!fixos.length && livres.length) { var ini = livres[0], maior = -1; livres.forEach(function (i) { var s2 = livres.reduce(function (s, j) { return s + (i === j ? 0 : tempo(i, j)); }, 0); if (s2 > maior) { maior = s2; ini = i; } }); livres.splice(livres.indexOf(ini), 1); ir(ini, null); }
    fixos.forEach(function (f) {
      var hf = minDe(itens[f].hora);
      // encaixa livres antes deste fixo enquanto der tempo de chegar nele na hora
      for (var guarda = 0; guarda < 50 && livres.length && t != null; guarda++) {
        var c = perto(pos, livres.filter(function (j) { return t + tempo(pos, j) + dur(itens[j]) + tempo(j, f) <= hf + tol; }));
        if (c < 0) break; livres.splice(livres.indexOf(c), 1); ir(c, null);
      }
      ir(f, hf);
    });
    // depois do último fixo: os livres que restam, do mais perto para o mais longe, até o fim do dia
    while (livres.length) {
      var c2 = perto(pos, livres); livres.splice(livres.indexOf(c2), 1);
      if (t != null && t + (pos == null ? 0 : tempo(pos, c2)) + dur(itens[c2]) > fimDia) { naoCouberam.push(itens[c2].id); continue; }
      ir(c2, null);
    }
    var desl = seq.reduce(function (s, x) { return s + x.deslocMin; }, 0);
    return { seq: seq, naoCouberam: naoCouberam, deslocMin: desl, conflitos: seq.filter(function (x) { return x.conflito; }).length,
      termino: seq.length ? seq[seq.length - 1].saida : '', km: Math.round(seq.reduce(function (s, x, k) { return k ? s + distM(itens[seq[k - 1].i].ponto, itens[x.i].ponto) : s; }, 0) / 100) / 10 };
  };
  // Atrasados (passou a data sem resultado) em blocos de serviços próximos que cabem num dia de trabalho.
  // itens: [{ id, ponto, tipo, data }]. Começa pelo mais antigo e junta o mais perto (até raioKm) enquanto couber.
  C.blocosAtrasados = function (itens, opts) {
    var o = opts || {}, raio = (o.raioKm || 3) * 1000, jornada = o.jornadaMin || 480, resto = itens.slice().sort(function (a, b) { return String(a.data).localeCompare(String(b.data)); }), blocos = [];
    while (resto.length) {
      var b = [resto.shift()], tot = C.TEMPO_LOCAL[b[0].tipo] || 60;
      for (;;) {
        var ult = b[b.length - 1], m = -1, dm = Infinity;
        resto.forEach(function (x, k) { var d = distM(ult.ponto, x.ponto); if (d < dm) { dm = d; m = k; } });
        if (m < 0 || dm > raio) break;
        var add = (C.TEMPO_LOCAL[resto[m].tipo] || 60) + C.tempoEstimado(ult.ponto, resto[m].ponto);
        if (tot + add > jornada) break;
        tot += add; b.push(resto.splice(m, 1)[0]);
      }
      blocos.push({ itens: b, minutos: tot, centro: [b.reduce(function (s, x) { return s + x.ponto[0]; }, 0) / b.length, b.reduce(function (s, x) { return s + x.ponto[1]; }, 0) / b.length], maisAntigo: b[0].data });
    }
    return blocos;
  };
  // Onde encaixar um bloco: o dia (com agendamento) mais próximo dele no período. agenda: [{ data, ponto }].
  C.encaixeSugerido = function (bloco, agenda, opts) {
    var o = opts || {}, raio = (o.raioKm || 5) * 1000, melhor = null;
    (agenda || []).forEach(function (a) { var d = distM(bloco.centro, a.ponto); if (d <= raio && (!melhor || d < melhor.dist || (d === melhor.dist && a.data < melhor.data))) melhor = { data: a.data, dist: Math.round(d), id: a.id }; });
    return melhor;
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
