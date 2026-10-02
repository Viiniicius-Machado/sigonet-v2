// SIGONET V2 — Preventiva (vistoria de rede subterrânea): regras de negócio (puras).
//
// Validações que bloqueiam o envio, transições de status, profundidade fora do
// critério, distância GPS, foto suspeita, agregações do dashboard e filtro de
// medição. Nada aqui toca em tela, rede ou planilha.
//
// Roda sem alteração em três lugares:
//   • navegador  → SN.VR (depois de vistoria-listas.js);
//   • Node       → require('app/js/vistoria-regras.js') nos testes;
//   • Apps Script → servidor/VistoriaRegras.gs (cópia gerada por
//     ferramentas/gerar-regras-gs.mjs). O servidor valida de novo tudo o que o
//     app validou: o navegador nunca é a única barreira.
//
// Valores ainda não definidos (profundidade mínima, distância de GPS, metas)
// ficam null na configuração. Enquanto forem null, a regra correspondente NÃO
// marca nada (nem "fora do critério" nem "divergente") e devolve um aviso.
var VR = (function () {
  var L = typeof VR_LISTAS !== 'undefined' ? VR_LISTAS : require('./vistoria-listas.js');
  var R = { listas: L };

  // ═══════════════════════════ Configuração ═══════════════════════════
  // Pendências da diretoria/Tom entram como null (sem valor inventado).
  // foto_tolerancia_min: a especificação fala em "alguns minutos"; o padrão é 5
  // e pode ser alterado na tela de Configurações.
  R.CONFIG_PADRAO = {
    profundidade_min_cm: null,
    gps_max_m: null,
    foto_tolerancia_min: 5,
    operadoras: [],
    tampa_tipos: [],
    meta_padrao_pct: null,
    clusters: {},          // cluster → { extensao_km, meta_pct } (extensão real e meta: a definir)
    importacao: { col_id: '', col_cluster: '', col_cidade: '', col_lat: '', col_lng: '', col_endereco: '', kml_id: 'nome', kml_cluster: 'pasta' },
    // ── Aérea: listas e regiões vindas da planilha "KPIs MANUTENÇÃO PREVENTIVA REDE" ──
    motivos_aerea: ['NOTIFICAÇÃO IRREGULARIDADE', 'TROCA DE POSTES', 'MUTIRÃO/REORDENAMENTO/FAXINA DE CABOS', 'PADRONIZAÇÃO',
      'SOLICITAÇÃO DE CLIENTE', 'PÓS MASSIVA', 'REGULARIZAÇÃO', 'LIMPEZA DE CABOS'],
    solicitantes: ['CPFL - PAULISTA', 'CPFL - PIRATININGA', 'CPFL - SANTA CRUZ', 'NOC', 'ENEL', 'ENERGISA', 'PREFEITURA', 'MASSIVA PLANILHA', 'INTERNO'],
    // mesma regra da coluna "Região" da planilha (cidade → região); editável
    regioes: {
      'REGIÃO RMC': ['CAMPINAS', 'HORTOLANDIA', 'VINHEDO', 'ITATIBA', 'SUMARE', 'VALINHOS', 'NOVA ODESSA', 'JAGUARIUNA', 'AMERICANA', 'INDAIATUBA', 'MONTE MOR', 'PAULINIA'],
      'REGIÃO RMJ': ['LOUVEIRA', 'CAMPO LIMPO PAULISTA', 'JUNDIAI', 'ITUPEVA', 'JARINU'],
      'REGIÃO PIRACICABA': ['PIRACICABA', 'RIO CLARO'],
      'REGIÃO BRAGANÇA PAULISTA': ['BRAGANCA PAULISTA', 'ATIBAIA']
    },
    regiao_padrao: 'DEMAIS REGIÕES',
    meta_aerea_m: 78000,   // meta mensal de metros percorridos (planilha: 78 km)
    metas_aerea_mes: {},   // 'AAAA-MM' → metros, quando um mês tiver meta diferente
    dias_aerea_mes: {}     // 'AAAA-MM' → dias trabalhados informados à mão (sem valor = dias corridos do calendário)
  };
  var numOuNull = function (v) { if (v === '' || v == null) return null; var n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
  R.normalizarConfig = function (c) {
    c = c || {};
    var p = R.CONFIG_PADRAO, out = {};
    out.profundidade_min_cm = numOuNull(c.profundidade_min_cm);
    out.gps_max_m = numOuNull(c.gps_max_m);
    var tol = numOuNull(c.foto_tolerancia_min); out.foto_tolerancia_min = tol == null || tol < 0 ? p.foto_tolerancia_min : tol;
    var lista = function (x) { return (Array.isArray(x) ? x : String(x || '').split(/[\n;]/)).map(function (s) { return String(s).trim(); }).filter(Boolean)
      .filter(function (s, i, a) { return a.indexOf(s) === i; }); };
    out.operadoras = lista(c.operadoras).filter(function (o) { return o !== L.operadora_nao_identificado; });
    out.tampa_tipos = lista(c.tampa_tipos);
    out.meta_padrao_pct = numOuNull(c.meta_padrao_pct);
    out.clusters = {};
    Object.keys(c.clusters || {}).forEach(function (k) {
      var x = c.clusters[k] || {}; out.clusters[k] = { extensao_km: numOuNull(x.extensao_km), meta_pct: numOuNull(x.meta_pct) };
    });
    out.importacao = {};
    Object.keys(p.importacao).forEach(function (k) { out.importacao[k] = String((c.importacao || {})[k] || p.importacao[k] || '').trim(); });
    // Aérea: lista informada vence; sem lista, vale a da planilha.
    out.motivos_aerea = c.motivos_aerea ? lista(c.motivos_aerea) : p.motivos_aerea.slice();
    out.solicitantes = c.solicitantes ? lista(c.solicitantes) : p.solicitantes.slice();
    out.regioes = {};
    var reg = c.regioes || p.regioes;
    Object.keys(reg).forEach(function (k) { out.regioes[String(k).trim()] = lista(reg[k]).map(R.normCidade); });
    out.regiao_padrao = String(c.regiao_padrao || p.regiao_padrao).trim();
    var meta = numOuNull(c.meta_aerea_m); out.meta_aerea_m = meta == null ? p.meta_aerea_m : meta;
    out.metas_aerea_mes = {};
    Object.keys(c.metas_aerea_mes || {}).forEach(function (k) { var m = numOuNull(c.metas_aerea_mes[k]); if (/^\d{4}-\d{2}$/.test(k) && m != null) out.metas_aerea_mes[k] = m; });
    out.dias_aerea_mes = {};
    Object.keys(c.dias_aerea_mes || {}).forEach(function (k) { var n = numOuNull(c.dias_aerea_mes[k]);
      if (/^\d{4}-\d{2}$/.test(k) && n != null && n >= 0 && n <= 31) out.dias_aerea_mes[k] = Math.round(n); });
    return out;
  };
  // Avisos de configuração pendente (mostrados nas telas).
  R.pendenciasConfig = function (cfg) {
    cfg = R.normalizarConfig(cfg); var out = [];
    if (cfg.profundidade_min_cm == null) out.push('Profundidade mínima não definida: o sistema registra, mas não marca "fora do critério".');
    if (cfg.gps_max_m == null) out.push('Distância máxima de GPS não definida: o sistema registra, mas não marca posição divergente.');
    if (!cfg.operadoras.length) out.push('Lista de operadoras vazia: o técnico só consegue marcar "não identificado".');
    if (!cfg.tampa_tipos.length) out.push('Lista de tipos/materiais de tampa vazia: o campo fica fora do formulário.');
    return out;
  };

  // ═══════════════════════════ Utilidades ═══════════════════════════
  var vazio = function (v) { return v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length); };
  var inteiroNaoNeg = function (v) { return v !== '' && v != null && isFinite(Number(v)) && Number(v) >= 0 && Math.floor(Number(v)) === Number(v); };
  var numero = function (v) { return v !== '' && v != null && isFinite(Number(v)); };
  R.vazio = vazio;
  // Data ISO ou objeto Date → milissegundos (null se inválida). As leituras da
  // planilha podem trazer texto ou Date (o Sheets converte sozinho).
  R.ms = function (v) {
    if (v == null || v === '') return null;
    if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? null : v.getTime();
    if (typeof v === 'number') return v;
    var t = new Date(String(v)).getTime(); return isNaN(t) ? null : t;
  };
  R.txtData = function (v) { var t = R.ms(v); return t == null ? (v == null ? '' : String(v)) : new Date(t).toISOString(); };

  // ═══════════════════════════ Status ═══════════════════════════
  // Rota: PLANEJADA → DESPACHADA → EM_CAMPO → CONCLUIDA (e volta de CONCLUIDA
  // para EM_CAMPO quando uma CS é rejeitada e o prestador precisa refazer).
  // Vistoria da CS: RASCUNHO (só no aparelho) → AGUARDANDO_REVISAO → APROVADA
  //                                                         ↘ REJEITADA → AGUARDANDO_REVISAO
  // Papéis: 'planejador', 'tecnico', 'revisor', 'sistema' (o próprio servidor).
  R.TRANSICOES = {
    rota: {
      PLANEJADA:  { DESPACHADA: ['planejador'] },
      DESPACHADA: { PLANEJADA: ['planejador'], EM_CAMPO: ['tecnico', 'sistema'] },
      EM_CAMPO:   { CONCLUIDA: ['tecnico'] },
      CONCLUIDA:  { EM_CAMPO: ['sistema'] }
    },
    vistoria: {
      RASCUNHO:           { AGUARDANDO_REVISAO: ['tecnico'] },
      AGUARDANDO_REVISAO: { AGUARDANDO_REVISAO: ['tecnico'], APROVADA: ['revisor'], REJEITADA: ['revisor'] },
      REJEITADA:          { AGUARDANDO_REVISAO: ['tecnico'] },
      APROVADA:           {}
    }
  };
  R.transicao = function (tipo, de, para, papel) {
    var mapa = R.TRANSICOES[tipo];
    if (!mapa) return { ok: false, erro: 'Tipo de status desconhecido: ' + tipo };
    de = de || (tipo === 'vistoria' ? 'RASCUNHO' : null);
    if (!mapa[de]) return { ok: false, erro: 'Status atual inválido: ' + de };
    var papeis = mapa[de][para];
    if (!papeis) return { ok: false, erro: 'Transição não permitida: ' + de + ' → ' + para };
    if (papel && papeis.indexOf(papel) < 0) return { ok: false, erro: 'Seu perfil não pode fazer ' + de + ' → ' + para };
    return { ok: true };
  };

  // ═══════════════════════════ Medidas ═══════════════════════════
  // Profundidade (cm) medida do pavimento até o topo do duto. Duto mais raso que
  // o mínimo = fora do critério. null = não dá para dizer (sem mínimo ou sem medida).
  R.foraDoCriterio = function (profundidadeCm, minimoCm) {
    if (!numero(profundidadeCm) || !numero(minimoCm)) return null;
    return Number(profundidadeCm) < Number(minimoCm);
  };

  // Distância em metros entre dois pontos (fórmula de haversine).
  R.distanciaM = function (lat1, lng1, lat2, lng2) {
    if (![lat1, lng1, lat2, lng2].every(numero)) return null;
    var rad = function (g) { return Number(g) * Math.PI / 180; };
    var dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
  };
  // Extensão da rota subterrânea: soma das distâncias em linha reta entre CS
  // consecutivas, na ordem da rota. Calculada pela base (lat/lng), nunca digitada.
  // CS sem coordenada é pulada (liga a anterior à seguinte) e volta em "sem_posicao".
  R.extensaoRotaKm = function (ids, base) {
    var pos = {}; (base || []).forEach(function (c) { pos[String(c.id_cs)] = c; });
    var m = 0, ant = null, sem = [];
    (ids || []).forEach(function (id) {
      var c = pos[String(id)];
      if (!c || !numero(c.lat) || !numero(c.lng)) { sem.push(id); return; }
      if (ant) m += R.distanciaM(ant.lat, ant.lng, c.lat, c.lng);
      ant = c;
    });
    return { km: Math.round(m) / 1000, sem_posicao: sem };
  };
  // Situação de cada CS da base, pelas rotas e vistorias:
  //   CONCLUIDA → tem vistoria APROVADA (validada na revisão), em qualquer rota;
  //   EM_ROTA   → está numa rota (planejada, despachada, em campo ou concluída
  //               aguardando revisão) e ainda não foi aprovada.
  // CS sem entrada no mapa está disponível. excetoRota: a rota que está sendo editada.
  // Rota CANCELADA não prende CS (nem as vistorias dela contam).
  R.situacaoCs = function (rotas, vistorias, excetoRota) {
    var out = {}, canc = {};
    (rotas || []).forEach(function (r) { if (r.status === 'CANCELADA') canc[r.id_rota] = true; });
    (rotas || []).forEach(function (r) {
      if (r.segmento === 'AEREA' || r.importado_planilha || r.id_rota === excetoRota || canc[r.id_rota]) return;
      (r.cs_planejadas || []).forEach(function (id) { if (!out[id]) out[id] = { situacao: 'EM_ROTA', id_rota: r.id_rota, status_rota: r.status }; });
    });
    (vistorias || []).forEach(function (v) {
      if (v.status_revisao !== 'APROVADA' || v.cs_nova || !v.id_cs || canc[v.id_rota]) return;
      var x = out[v.id_cs], em = v.data_revisao || v.enviado_em || '';
      if (x && x.situacao === 'CONCLUIDA' && String(x.em) >= String(em)) return; // vale a aprovação mais recente
      out[v.id_cs] = { situacao: 'CONCLUIDA', id_rota: v.id_rota, id_vistoria: v.id_vistoria, em: em };
    });
    return out;
  };
  // CS da rota que já estão concluídas ou em outra rota. Só passa forçando, com motivo.
  R.conflitosCs = function (rota, rotas, vistorias) {
    var sit = R.situacaoCs(rotas, vistorias, rota && rota.id_rota);
    return ((rota && rota.cs_planejadas) || []).filter(function (id) { return sit[id]; })
      .map(function (id) { var x = sit[id]; return { id_cs: id, situacao: x.situacao, id_rota: x.id_rota }; });
  };
  R.textoConflitos = function (c) {
    var conc = c.filter(function (x) { return x.situacao === 'CONCLUIDA'; }), em = c.filter(function (x) { return x.situacao === 'EM_ROTA'; });
    var p = [];
    if (conc.length) p.push('CS já concluídas (vistoria aprovada): ' + conc.map(function (x) { return x.id_cs; }).join(', ') + '.');
    if (em.length) p.push('CS já em outra rota: ' + em.map(function (x) { return x.id_cs + ' (' + x.id_rota + ')'; }).join(', ') + '.');
    return p.join(' ') + ' Para despachar de novo, marque "Forçar" e informe o motivo.';
  };

  // Sequência de atendimento: caminho contínuo (sem ir e voltar) passando por
  // todas as CS. Começa numa ponta (a CS mais longe do centro do grupo), vai
  // sempre para a mais próxima e depois desfaz cruzamentos (2-opt).
  // opcoes.inicio: força a 1ª CS. CS sem coordenada vão para o fim.
  R.ordenarMenorCaminho = function (ids, base, opcoes) {
    opcoes = opcoes || {};
    var pos = {}; (base || []).forEach(function (c) { pos[String(c.id_cs)] = c; });
    var com = [], sem = [];
    (ids || []).forEach(function (id) { var c = pos[String(id)]; (c && numero(c.lat) && numero(c.lng) ? com : sem).push(id); });
    var n = com.length;
    if (n < 3) return com.concat(sem);
    // Plano local em metros (rápido e preciso o bastante dentro de uma cidade).
    var lat0 = 0; com.forEach(function (id) { lat0 += Number(pos[String(id)].lat); }); lat0 /= n;
    var kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
    var X = com.map(function (id) { return Number(pos[String(id)].lng) * kx; }), Y = com.map(function (id) { return Number(pos[String(id)].lat) * ky; });
    var d = function (a, b) { var dx = X[a] - X[b], dy = Y[a] - Y[b]; return Math.sqrt(dx * dx + dy * dy); };
    var ini = com.indexOf(opcoes.inicio);
    if (ini < 0) {
      var cx = 0, cy = 0, i; for (i = 0; i < n; i++) { cx += X[i]; cy += Y[i]; } cx /= n; cy /= n;
      var dm = -1; for (i = 0; i < n; i++) { var dc = (X[i] - cx) * (X[i] - cx) + (Y[i] - cy) * (Y[i] - cy); if (dc > dm) { dm = dc; ini = i; } }
    }
    // Vizinho mais próximo.
    var usado = [], t = [ini]; usado[ini] = true;
    while (t.length < n) {
      var u = t[t.length - 1], prox = -1, best = Infinity;
      for (var k = 0; k < n; k++) if (!usado[k]) { var dd = d(u, k); if (dd < best) { best = dd; prox = k; } }
      usado[prox] = true; t.push(prox);
    }
    // 2-opt de caminho aberto (o início fica fixo); para em até ~0,4 s.
    var fim = Date.now() + 400, melhorou = true;
    while (melhorou && Date.now() < fim) {
      melhorou = false;
      for (var a = 0; a < n - 2; a++) {
        for (var b = a + 2; b < n; b++) {
          var antes = d(t[a], t[a + 1]) + (b + 1 < n ? d(t[b], t[b + 1]) : 0);
          var depois = d(t[a], t[b]) + (b + 1 < n ? d(t[a + 1], t[b + 1]) : 0);
          if (depois < antes - 0.01) {
            for (var p = a + 1, q = b; p < q; p++, q--) { var tmp = t[p]; t[p] = t[q]; t[q] = tmp; }
            melhorou = true;
          }
        }
      }
    }
    return t.map(function (k) { return com[k]; }).concat(sem);
  };
  // divergente: true/false, ou null quando falta a tolerância ou uma das posições.
  R.gpsDivergencia = function (lat, lng, latCad, lngCad, maxM) {
    var d = R.distanciaM(lat, lng, latCad, lngCad);
    if (d == null || !numero(maxM)) return { distancia_m: d == null ? null : Math.round(d), divergente: null };
    return { distancia_m: Math.round(d), divergente: d > Number(maxM) };
  };

  // Foto suspeita: a data do arquivo (EXIF ou lastModified) está longe do momento
  // da captura no app. LIMITAÇÃO: o navegador não garante bloqueio da galeria;
  // esta flag + a revisão humana são a mitigação.
  R.fotoSuspeita = function (dataArquivo, dataCaptura, toleranciaMin) {
    var a = R.ms(dataArquivo), c = R.ms(dataCaptura);
    if (c == null) return { suspeita: true, diferenca_min: null, motivo: 'sem hora de captura' };
    if (a == null) return { suspeita: true, diferenca_min: null, motivo: 'arquivo sem data' };
    var tol = numero(toleranciaMin) ? Number(toleranciaMin) : R.CONFIG_PADRAO.foto_tolerancia_min;
    var dif = Math.abs(c - a) / 60000;
    return { suspeita: dif > tol, diferenca_min: Math.round(dif * 10) / 10, motivo: dif > tol ? 'data do arquivo difere ' + Math.round(dif) + ' min da captura' : '' };
  };

  // ═══════════════════════════ Fotos obrigatórias ═══════════════════════════
  var abriu = function (v) { return v.abriu === 'sim'; };
  var temEmenda = function (v) { return abriu(v) && v.emenda_existe === 'sim'; };
  var emendaAberta = function (v) { return temEmenda(v) && v.emenda_aberta === 'sim'; };
  R.fotosDoTipo = function (v, tipo, ref) {
    return (v.fotos || []).filter(function (f) { return f.tipo_foto === tipo && (ref === undefined || String(f.ref) === String(ref)); });
  };
  // Lista {tipo, min} do que a situação desta CS exige (sem as do trecho).
  R.fotosObrigatorias = function (v) {
    var out = [{ tipo: 'contexto', min: 1 }, { tipo: 'tampa_perto', min: 1 }];
    if (v.solo_entorno && v.solo_entorno !== 'normal') out.push({ tipo: 'anomalia_solo', min: 1 });
    if (!abriu(v)) return out; // não abriu: só 1 e 2 (+ anomalia de solo, se marcada)
    out.push({ tipo: 'tampa_aberta', min: 1 }, { tipo: 'profundidade', min: 1 }, { tipo: 'parede', min: 1 });
    if (Number(v.cabos_qtd) > 0) out.push({ tipo: 'plaquetas', min: 1 });
    out.push({ tipo: 'organizacao', min: 1 });
    if (temEmenda(v)) out.push({ tipo: 'emenda_externa', min: 1 });
    if (emendaAberta(v)) out.push({ tipo: 'emenda_antes', min: 1 }, { tipo: 'emenda_depois', min: 1 });
    out.push({ tipo: 'tampa_final', min: 1 });
    return out;
  };

  // ═══════════════════════════ Validação da CS ═══════════════════════════
  // ctx = { config, csBase: {lat,lng}|null, rota }
  // Devolve { ok, erros: [{codigo, campo, msg, motivo}], avisos: [txt], flags }.
  // "motivo" liga o erro ao motivo de rejeição correspondente na revisão.
  R.validarVistoria = function (v, ctx) {
    v = v || {}; ctx = ctx || {};
    var cfg = R.normalizarConfig(ctx.config);
    var erros = [], avisos = [];
    var erro = function (codigo, campo, msg, motivo) { erros.push({ codigo: codigo, campo: campo, msg: msg, motivo: motivo || '' }); };
    var escolha = function (campo, lista, rot) { if (L.valores(lista).indexOf(v[campo]) < 0) erro('campo_obrigatorio', campo, 'Escolha: ' + rot + '.'); };
    var texto = function (campo, rot) { if (vazio(v[campo])) erro('campo_obrigatorio', campo, 'Preencha: ' + rot + '.'); };

    // ── Cabeçalho ──
    if (vazio(v.id_vistoria)) erro('campo_obrigatorio', 'id_vistoria', 'Vistoria sem identificação.');
    if (vazio(v.id_rota)) erro('campo_obrigatorio', 'id_rota', 'Vistoria sem rota.');
    if (R.ms(v.inicio) == null) erro('campo_obrigatorio', 'inicio', 'Hora de início não registrada.');
    if (R.ms(v.fim) == null) erro('campo_obrigatorio', 'fim', 'Hora de fim não registrada.');
    else if (R.ms(v.inicio) != null && R.ms(v.fim) < R.ms(v.inicio)) erro('hora_invalida', 'fim', 'A hora de fim é anterior à de início.');

    // ── Identificação ──
    if (v.cs_nova) {
      if (v.situacao_cadastro !== 'nao_consta') erro('situacao_incoerente', 'situacao_cadastro', 'CS fora do cadastro precisa estar marcada como "não consta".');
    } else {
      if (vazio(v.id_cs)) erro('campo_obrigatorio', 'id_cs', 'Escolha a CS da base (ou "CS não consta no cadastro").');
      escolha('situacao_cadastro', 'situacao_cadastro', 'situação no cadastro');
      if (v.situacao_cadastro === 'nao_consta') erro('situacao_incoerente', 'situacao_cadastro', 'A CS foi escolhida da base: não pode ser "não consta". Use "CS não consta no cadastro".');
    }
    if (!numero(v.lat) || !numero(v.lng)) erro('gps_ausente', 'lat', 'Capture a posição (lat/lng) da CS.');
    texto('endereco', 'endereço e referência');
    var gps = { distancia_m: null, divergente: null };
    if (!v.cs_nova && ctx.csBase) {
      gps = R.gpsDivergencia(v.lat, v.lng, ctx.csBase.lat, ctx.csBase.lng, cfg.gps_max_m);
      if (gps.divergente && v.situacao_cadastro !== 'consta_divergente' && vazio(v.gps_justificativa))
        erro('gps_divergente', 'gps_justificativa', 'Posição a ' + gps.distancia_m + ' m do cadastro (máx. ' + cfg.gps_max_m + ' m): marque "posição divergente" ou justifique.', 'gps_sem_justificativa');
      if (gps.divergente === null && cfg.gps_max_m == null) avisos.push('Tolerância de GPS não definida: distância registrada sem conferência.');
    }

    // ── Acesso ──
    escolha('abriu', 'sim_nao', 'conseguiu abrir');
    if (v.abriu === 'nao') {
      if (L.valores('motivo_nao_abriu').indexOf(v.motivo_nao_abriu) < 0) erro('motivo_nao_abriu', 'motivo_nao_abriu', 'Informe por que não abriu.', 'nao_aberta_sem_motivo');
      else if (v.motivo_nao_abriu === 'outro' && vazio(v.motivo_nao_abriu_texto)) erro('motivo_nao_abriu', 'motivo_nao_abriu_texto', 'Descreva o motivo "outro".', 'nao_aberta_sem_motivo');
    }

    // ── Solo e tampa (visíveis mesmo sem abrir) ──
    escolha('solo_entorno', 'solo_entorno', 'condição do solo no entorno');
    if (cfg.tampa_tipos.length) { if (cfg.tampa_tipos.indexOf(v.tampa_tipo) < 0) erro('campo_obrigatorio', 'tampa_tipo', 'Escolha: tipo e material da tampa.'); }
    escolha('tampa_estado', 'tampa_estado', 'estado da tampa');
    escolha('tampa_identificacao', 'tampa_identificacao', 'identificação na tampa');

    var fora = null;
    if (abriu(v)) {
      // ── Interior ──
      escolha('agua', 'agua', 'água');
      escolha('limpeza', 'limpeza', 'limpeza');
      escolha('assoreamento', 'assoreamento', 'acúmulo de terra no fundo');
      escolha('terra_dutos', 'sim_nao', 'terra entrando pelos dutos');
      escolha('infiltracao', 'sim_nao', 'infiltração nas paredes');
      escolha('estrutura', 'estrutura', 'estrutura das paredes e do fundo');

      // ── Dutos ──
      ['dutos_entradas', 'dutos_ocupadas', 'dutos_vagas'].forEach(function (c) {
        if (!inteiroNaoNeg(v[c])) erro('numero_invalido', c, 'Informe um número inteiro em ' + c.replace('dutos_', 'dutos ') + '.');
      });
      if (['dutos_entradas', 'dutos_ocupadas', 'dutos_vagas'].every(function (c) { return inteiroNaoNeg(v[c]); })
        && Number(v.dutos_ocupadas) + Number(v.dutos_vagas) !== Number(v.dutos_entradas))
        erro('dutos_soma', 'dutos_entradas', 'Ocupadas + vagas precisa ser igual ao total de entradas.');
      if (Number(v.dutos_vagas) > 0) escolha('tamponamento', 'sim_nao_parcial', 'tamponamento dos dutos vagos');
      if (!numero(v.profundidade_cm) || Number(v.profundidade_cm) <= 0) erro('numero_invalido', 'profundidade_cm', 'Informe a profundidade em cm (trena do pavimento ao topo do duto).');
      fora = R.foraDoCriterio(v.profundidade_cm, cfg.profundidade_min_cm);
      if (fora === null && numero(v.profundidade_cm) && cfg.profundidade_min_cm == null) avisos.push('Profundidade mínima não definida: "fora do critério" não calculado.');

      // ── Cabos ──
      if (!inteiroNaoNeg(v.cabos_qtd)) erro('numero_invalido', 'cabos_qtd', 'Informe a quantidade de cabos.');
      else {
        var cabos = v.cabos || [];
        if (cabos.length !== Number(v.cabos_qtd)) erro('cabos_lista', 'cabos', 'Informe a operadora de cada um dos ' + v.cabos_qtd + ' cabos.');
        cabos.forEach(function (c, i) {
          var op = c && c.operadora;
          var validas = cfg.operadoras.concat([L.operadora_nao_identificado]);
          if (vazio(op) || (cfg.operadoras.length && validas.indexOf(op) < 0)) erro('cabos_lista', 'cabos.' + i, 'Cabo ' + (i + 1) + ': escolha a operadora pela plaqueta.');
        });
      }
      escolha('cabos_batem', 'sim_nao', 'cabos batem com o cenário esperado');
      if (v.cabos_batem === 'nao') {
        var div = v.cabos_divergencias || [];
        if (!div.length || div.some(function (d) { return L.valores('cabos_divergencia').indexOf(d) < 0; }))
          erro('cabos_divergencia', 'cabos_divergencias', 'Marque o tipo de divergência dos cabos.');
        if (!R.fotosDoTipo(v, 'plaquetas').length) erro('cabo_sem_foto', 'foto:plaquetas', 'Cabo divergente do cenário exige a foto das plaquetas.', 'cabo_sem_foto');
      }

      // ── Organização ──
      escolha('fixacao', 'sim_nao_parcial', 'cabos fixados em ferragem/suporte');
      escolha('reserva', 'reserva', 'reserva técnica');
      escolha('organizacao', 'organizacao', 'estado geral');

      // ── Emenda ──
      escolha('emenda_existe', 'sim_nao', 'existe emenda');
      if (temEmenda(v)) {
        escolha('emenda_caixa', 'emenda_caixa', 'caixa de emenda íntegra/danificada');
        escolha('emenda_fixacao', 'emenda_fixacao', 'caixa de emenda fixada/solta');
        escolha('emenda_submersa', 'emenda_submersa', 'emenda submersa');
        escolha('emenda_vedacao', 'emenda_vedacao', 'vedação aparente');
        escolha('emenda_aberta', 'sim_nao', 'emenda aberta');
        if (emendaAberta(v)) {
          if (vazio(v.emenda_autorizado_por)) erro('emenda_sem_autorizacao', 'emenda_autorizado_por', 'Emenda aberta: informe quem autorizou.');
          if (vazio(v.emenda_tecnico)) erro('emenda_sem_autorizacao', 'emenda_tecnico', 'Emenda aberta: informe o técnico de emenda.');
          if (!R.fotosDoTipo(v, 'emenda_antes').length || !R.fotosDoTipo(v, 'emenda_depois').length)
            erro('emenda_sem_fotos', 'foto:emenda_antes', 'Emenda aberta exige as fotos de antes e depois.', 'foto_faltando');
        }
      }
    }

    // ── Profundidade preenchida sem a foto da trena (vale mesmo fora do "abriu") ──
    if (numero(v.profundidade_cm) && !R.fotosDoTipo(v, 'profundidade').length)
      erro('profundidade_sem_foto', 'foto:profundidade', 'Profundidade informada sem a foto da trena.', 'profundidade_sem_foto');

    // ── Conclusão ──
    escolha('conclusao', 'conclusao', 'conclusão');
    escolha('prioridade', 'prioridade', 'prioridade');

    // ── Fotos obrigatórias ──
    R.fotosObrigatorias(v).forEach(function (o) {
      if (R.fotosDoTipo(v, o.tipo).length >= o.min) return;
      if (erros.some(function (e) { return e.campo === 'foto:' + o.tipo; })) return; // já apontada por uma regra específica
      var f = L.foto(o.tipo);
      erro('foto_faltando', 'foto:' + o.tipo, 'Falta a foto ' + (f ? f.n + ' — ' + f.rot : o.tipo) + '.', 'foto_faltando');
    });

    // ── Trecho (da CS anterior até esta) ──
    if (Number(v.ordem) > 1) {
      var rt = R.validarTrecho(v.trecho, v);
      rt.erros.forEach(function (e) { erros.push(e); });
    }

    var suspeitas = (v.fotos || []).filter(function (f) { return f.flag_suspeita; }).length;
    if (suspeitas) avisos.push(suspeitas + ' foto(s) com data de arquivo incompatível: serão destacadas na revisão.');
    return { ok: !erros.length, erros: erros, avisos: avisos,
      flags: { fora_criterio: fora, gps_distancia_m: gps.distancia_m, gps_divergente: gps.divergente, fotos_suspeitas: suspeitas } };
  };

  // Trecho entre a CS anterior e esta. As fotos das anomalias ficam em v.fotos
  // com tipo_foto "anomalia" e ref = índice da anomalia.
  R.validarTrecho = function (t, v) {
    var erros = [];
    var erro = function (codigo, campo, msg, motivo) { erros.push({ codigo: codigo, campo: 'trecho.' + campo, msg: msg, motivo: motivo || '' }); };
    if (!t) { erro('trecho_ausente', 'superficie_percorrida', 'Preencha o bloco do trecho entre a CS anterior e esta.'); return { ok: false, erros: erros }; }
    if (L.valores('sim_nao').indexOf(t.superficie_percorrida) < 0) erro('campo_obrigatorio', 'superficie_percorrida', 'Trecho: informe se a superfície foi percorrida.');
    (t.anomalias || []).forEach(function (a, i) {
      var n = 'Anomalia ' + (i + 1) + ' do trecho';
      if (!a || L.valores('anomalia_trecho').indexOf(a.tipo) < 0) erro('campo_obrigatorio', 'anomalias.' + i, n + ': escolha o tipo.');
      else if (a.tipo === 'outro' && vazio(a.texto)) erro('campo_obrigatorio', 'anomalias.' + i, n + ': descreva o "outro".');
      if (!a || !numero(a.lat) || !numero(a.lng)) erro('gps_ausente', 'anomalias.' + i, n + ': capture a posição.');
      if (!R.fotosDoTipo(v || {}, 'anomalia', i).length) erro('foto_faltando', 'anomalias.' + i, n + ': falta a foto.', 'foto_faltando');
    });
    return { ok: !erros.length, erros: erros };
  };

  // ═══════════════════════════ Rota e revisão ═══════════════════════════
  R.validarRota = function (r) {
    r = r || {};
    if (r.segmento === 'AEREA') return R.validarRotaAerea(r);
    var erros = [];
    if (vazio(r.cidade)) erros.push('Informe a cidade.');
    if (vazio(r.cluster)) erros.push('Escolha o cluster.');
    // Extensão vem da base (R.extensaoRotaKm); 0 é válido para rota de uma CS só.
    if (!numero(r.extensao_km) || Number(r.extensao_km) < 0) erros.push('Extensão da rota não calculada: confira as CS selecionadas.');
    var cs = r.cs_planejadas || [];
    if (!cs.length) erros.push('Selecione ao menos uma CS.');
    if (cs.some(function (x, i) { return cs.indexOf(x) !== i; })) erros.push('Há CS repetidas na rota.');
    if (vazio(r.prestador)) erros.push('Escolha o prestador.');
    if (R.ms(r.data_planejada) == null) erros.push('Informe a data planejada.');
    validarLimite(r, erros);
    return { ok: !erros.length, erros: erros };
  };
  // Só conclui quando cada CS planejada foi enviada e nenhuma está rejeitada.
  R.podeConcluirRota = function (rota, vistorias) {
    var daRota = (vistorias || []).filter(function (v) { return v.id_rota === rota.id_rota && v.status_revisao && v.status_revisao !== 'RASCUNHO'; });
    var faltam = (rota.cs_planejadas || []).filter(function (cs) { return !daRota.some(function (v) { return v.id_cs === cs; }); });
    var rejeitadas = daRota.filter(function (v) { return v.status_revisao === 'REJEITADA'; }).map(function (v) { return v.id_cs || v.id_vistoria; });
    var erros = [];
    if (faltam.length) erros.push('CS ainda não enviadas: ' + faltam.join(', '));
    if (rejeitadas.length) erros.push('CS rejeitadas para refazer: ' + rejeitadas.join(', '));
    return { ok: !erros.length, erros: erros, faltam: faltam, rejeitadas: rejeitadas };
  };
  R.validarRevisao = function (d) {
    d = d || {}; var erros = [];
    if (['APROVADA', 'REJEITADA'].indexOf(d.decisao) < 0) erros.push('Escolha aprovar ou rejeitar.');
    if (d.decisao === 'REJEITADA') {
      var m = d.motivos || [];
      if (!m.length) erros.push('Escolha ao menos um motivo de rejeição.');
      if (m.some(function (x) { return L.valores('motivos_rejeicao').indexOf(x) < 0; })) erros.push('Motivo de rejeição fora da lista.');
      if (m.indexOf('outro') >= 0 && vazio(d.motivo_texto)) erros.push('Descreva o motivo "outro".');
    }
    return { ok: !erros.length, erros: erros };
  };

  // ═══════════════════════════ Medição e dashboard ═══════════════════════════
  // Regra de negócio: SÓ vistoria APROVADA entra na medição e no pagamento.
  R.aprovadas = function (vistorias) { return (vistorias || []).filter(function (v) { return v.status_revisao === 'APROVADA'; }); };
  var mapaRotas = function (rotas) { var m = {}; (rotas || []).forEach(function (r) { m[r.id_rota] = r; }); return m; };
  // Km de uma CS = extensão da rota ÷ nº de CS planejadas (rateio proporcional).
  R.kmDaVistoria = function (v, rota) {
    if (!rota || !numero(rota.extensao_km)) return 0;
    var n = (rota.cs_planejadas || []).length || 1;
    return Number(rota.extensao_km) / n;
  };
  var arred = function (x, d) { var k = Math.pow(10, d == null ? 2 : d); return Math.round(x * k) / k; };

  R.medicao = function (vistorias, rotas) {
    var rm = mapaRotas(rotas), por = {};
    R.aprovadas(vistorias).forEach(function (v) {
      var p = v.prestador || '(sem prestador)';
      var x = por[p] = por[p] || { prestador: p, cs_aprovadas: 0, km: 0 };
      x.cs_aprovadas++; x.km += R.kmDaVistoria(v, rm[v.id_rota]);
    });
    var linhas = Object.keys(por).sort().map(function (k) { por[k].km = arred(por[k].km, 3); return por[k]; });
    return { linhas: linhas, total_cs: linhas.reduce(function (s, l) { return s + l.cs_aprovadas; }, 0),
      total_km: arred(linhas.reduce(function (s, l) { return s + l.km; }, 0), 3) };
  };

  var pct = function (n, d) { return d ? arred(100 * n / d, 1) : 0; };
  // Conformidade: conta só as APROVADAS (vistoria não revisada não vai para a diretoria).
  R.conformidade = function (vistorias) {
    var novo = function () { return { total: 0, conforme: 0, ressalva: 0, nao_conforme: 0 }; };
    var tot = novo(), cl = {};
    R.aprovadas(vistorias).forEach(function (v) {
      var c = cl[v.cluster || '(sem cluster)'] = cl[v.cluster || '(sem cluster)'] || novo();
      [tot, c].forEach(function (x) { x.total++; if (x[v.conclusao] != null) x[v.conclusao]++; });
    });
    var comPct = function (x) { x.pct_conforme = pct(x.conforme, x.total); x.pct_ressalva = pct(x.ressalva, x.total); x.pct_nao_conforme = pct(x.nao_conforme, x.total); return x; };
    Object.keys(cl).forEach(function (k) { comPct(cl[k]); });
    return { total: comPct(tot), por_cluster: cl };
  };

  // Critérios dos passivos (documentados em docs/PREVENTIVA.md):
  //   tampas a trocar  = estado trincada, quebrada ou ausente
  //   CS alagadas      = água "parcialmente alagada" ou "alagada"
  //   CS assoreadas    = acúmulo "muito"
  //   dutos rasos      = profundidade < mínimo configurado (null → não conta)
  //   cabos não identificados = nº de cabos com operadora "não identificado"
  //   CS com cabo excedente   = divergência "excedente" marcada
  //   CS fora do cadastro     = vistorias de CS nova
  R.passivos = function (vistorias, config) {
    var cfg = R.normalizarConfig(config);
    var novo = function () { return { tampas_trocar: 0, cs_alagadas: 0, cs_assoreadas: 0, dutos_rasos: 0, cabos_nao_identificados: 0, cs_cabo_excedente: 0, cs_fora_cadastro: 0 }; };
    var tot = novo(), cl = {};
    R.aprovadas(vistorias).forEach(function (v) {
      var c = cl[v.cluster || '(sem cluster)'] = cl[v.cluster || '(sem cluster)'] || novo();
      var soma = function (k, n) { tot[k] += n; c[k] += n; };
      if (['trincada', 'quebrada', 'ausente'].indexOf(v.tampa_estado) >= 0) soma('tampas_trocar', 1);
      if (v.cs_nova) soma('cs_fora_cadastro', 1);
      if (!abriu(v)) return;
      if (['parcial', 'alagada'].indexOf(v.agua) >= 0) soma('cs_alagadas', 1);
      if (v.assoreamento === 'muito') soma('cs_assoreadas', 1);
      if (R.foraDoCriterio(v.profundidade_cm, cfg.profundidade_min_cm) === true) soma('dutos_rasos', 1);
      soma('cabos_nao_identificados', (v.cabos || []).filter(function (x) { return x && x.operadora === L.operadora_nao_identificado; }).length);
      if ((v.cabos_divergencias || []).indexOf('excedente') >= 0) soma('cs_cabo_excedente', 1);
    });
    return { total: tot, por_cluster: cl, profundidade_definida: cfg.profundidade_min_cm != null };
  };

  // Divergências cadastro × campo, por cluster.
  R.divergencias = function (vistorias) {
    var novo = function () { return { posicao_divergente: 0, nao_consta: 0, cabos_divergentes: 0, caixa_no_trecho: 0 }; };
    var tot = novo(), cl = {};
    R.aprovadas(vistorias).forEach(function (v) {
      var c = cl[v.cluster || '(sem cluster)'] = cl[v.cluster || '(sem cluster)'] || novo();
      var soma = function (k) { tot[k]++; c[k]++; };
      if (v.situacao_cadastro === 'consta_divergente') soma('posicao_divergente');
      if (v.situacao_cadastro === 'nao_consta' || v.cs_nova) soma('nao_consta');
      if (v.cabos_batem === 'nao') soma('cabos_divergentes');
      if (v.trecho && (v.trecho.anomalias || []).some(function (a) { return a && a.tipo === 'caixa_nao_cadastrada'; })) soma('caixa_no_trecho');
    });
    return { total: tot, por_cluster: cl };
  };

  // Km vistoriado (só APROVADAS) por cluster × meta. Meta em km = extensão do
  // cluster × meta %. Sem extensão ou sem meta definida → meta_km null.
  R.kmPorCluster = function (rotas, vistorias, config) {
    var cfg = R.normalizarConfig(config), rm = mapaRotas(rotas), out = {};
    var linha = function (k) { return out[k] = out[k] || { cluster: k, km_planejado: 0, km_vistoriado: 0, meta_km: null, pct_meta: null }; };
    (rotas || []).forEach(function (r) { linha(r.cluster || '(sem cluster)').km_planejado += numero(r.extensao_km) ? Number(r.extensao_km) : 0; });
    R.aprovadas(vistorias).forEach(function (v) { linha(v.cluster || '(sem cluster)').km_vistoriado += R.kmDaVistoria(v, rm[v.id_rota]); });
    Object.keys(out).forEach(function (k) {
      var x = out[k], c = cfg.clusters[k] || {};
      var metaPct = c.meta_pct != null ? c.meta_pct : cfg.meta_padrao_pct;
      if (c.extensao_km != null && metaPct != null) x.meta_km = arred(c.extensao_km * metaPct / 100, 3);
      x.km_planejado = arred(x.km_planejado, 3); x.km_vistoriado = arred(x.km_vistoriado, 3);
      x.pct_meta = x.meta_km ? pct(x.km_vistoriado, x.meta_km) : null;
    });
    return out;
  };

  // Produção do prestador: planejadas (CS de rotas já despachadas), enviadas,
  // aprovadas, rejeitadas agora e rejeições acumuladas (histórico).
  R.producao = function (rotas, vistorias) {
    var por = {};
    var linha = function (p) { p = p || '(sem prestador)'; return por[p] = por[p] || { prestador: p, planejadas: 0, enviadas: 0, aguardando: 0, aprovadas: 0, rejeitadas: 0, rejeicoes_total: 0 }; };
    (rotas || []).forEach(function (r) { if (r.status && r.status !== 'PLANEJADA') linha(r.prestador).planejadas += (r.cs_planejadas || []).length; });
    (vistorias || []).forEach(function (v) {
      if (!v.status_revisao || v.status_revisao === 'RASCUNHO') return;
      var x = linha(v.prestador);
      x.enviadas++;
      if (v.status_revisao === 'AGUARDANDO_REVISAO') x.aguardando++;
      if (v.status_revisao === 'APROVADA') x.aprovadas++;
      if (v.status_revisao === 'REJEITADA') x.rejeitadas++;
      x.rejeicoes_total += (v.historico || []).filter(function (h) { return h.acao === 'REJEITADA'; }).length;
    });
    return Object.keys(por).sort().map(function (k) { return por[k]; });
  };

  // ═══════════════════════════ Chamado e LPU da rota ═══════════════════════════
  // Cada rota despachada gera UM chamado Preventiva (é por ele que o prestador
  // cobra, no fluxo normal de LPU). Classificação = linha da matriz oficial
  // (catalogos.js: Preventiva › Preventiva de Rede › Preventiva Rede (Externa)).
  R.CHAMADO_PREVENTIVA = { tipo: 'Preventiva', cat1: 'Preventiva de Rede', cat2: 'Preventiva Rede (Externa)', slaHoras: 8, conta: '3.1.1.2.05.0101' };
  // Atividade PLANEJADA não segue o SLA em horas da matriz (decisão de 2026-10-01):
  // o prazo do chamado é o fim do dia da data-limite da rota (sem data-limite = o
  // próprio dia planejado), no horário de Brasília. O chamado ganha planejada: true
  // e fica fora das médias de MTTD/MTTA/MTTR (métricas de corretiva).
  R.diaLimite = function (r) { r = r || {}; return String(r.data_limite || r.data_planejada || '').slice(0, 10); };
  R.prazoPlanejado = function (r) {
    var d = R.diaLimite(r); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    var t = new Date(d + 'T23:59:59-03:00').getTime(); return isNaN(t) ? null : new Date(t).toISOString();
  };
  var validarLimite = function (r, erros) {
    if (vazio(r.data_limite)) return;
    var dl = String(r.data_limite).slice(0, 10), dp = String(r.data_planejada || '').slice(0, 10);
    if (R.ms(dl) == null) erros.push('Data-limite inválida.');
    else if (dp && dl < dp) erros.push('A data-limite não pode ser antes da data planejada.');
  };
  // Itens de LPU já existentes no catálogo:
  //   SEV0022b Abertura/Fechamento Tampa Caixa Subterrânea — por CS aberta
  //   SEV0083  Preventiva Rede Externa Percorrendo Cabo Óptico — por metro
  //   SEV0076  Visita Técnica Improdutiva — por CS que não abriu
  R.LPU_PREVENTIVA = { abertura: 'SEV0022b', metro: 'SEV0083', improdutiva: 'SEV0076' };
  // A conclusão técnica do chamado só sai quando a rota está concluída E todas as
  // vistorias dela estão APROVADAS (regra: só aprovada entra no pagamento).
  R.resumoChamado = function (rota, vistorias) {
    var daRota = (vistorias || []).filter(function (v) { return v.id_rota === rota.id_rota && v.status_revisao && v.status_revisao !== 'RASCUNHO'; });
    var ap = daRota.filter(function (v) { return v.status_revisao === 'APROVADA'; });
    var pendentes = daRota.length - ap.length;
    var cobertas = (rota.cs_planejadas || []).every(function (cs) { return ap.some(function (v) { return v.id_cs === cs; }); });
    var abertas = ap.filter(function (v) { return v.abriu === 'sim'; }).length;
    var naoAbertas = ap.filter(function (v) { return v.abriu === 'nao'; }).length;
    var metros = numero(rota.extensao_km) ? Math.round(Number(rota.extensao_km) * 1000) : 0;
    var lpu = {}; lpu[R.LPU_PREVENTIVA.abertura] = abertas; lpu[R.LPU_PREVENTIVA.metro] = metros; lpu[R.LPU_PREVENTIVA.improdutiva] = naoAbertas;
    return { pronto: rota.status === 'CONCLUIDA' && cobertas && pendentes === 0 && ap.length > 0,
      cs_aprovadas: ap.length, cs_abertas: abertas, cs_nao_abertas: naoAbertas, pendentes: pendentes, metros: metros, lpu_sugerida: lpu };
  };

  // ═══════════════════════════ Preventiva AÉREA ═══════════════════════════
  // A equipe recebe o KMZ da rota, percorre e aponta a produção (parciais e um
  // final). Os KPIs do mês contam pela data do apontamento.
  R.normCidade = function (s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); };
  R.regiaoDaCidade = function (cidade, config) {
    var cfg = R.normalizarConfig(config), c = R.normCidade(cidade);
    if (!c) return '';
    var achou = Object.keys(cfg.regioes).filter(function (k) { return cfg.regioes[k].indexOf(c) >= 0; })[0];
    return achou || cfg.regiao_padrao;
  };
  // Classificação do chamado pela linha da matriz oficial (todas SLA 8 h).
  R.classificacaoRota = function (rota) {
    var base = R.CHAMADO_PREVENTIVA;
    if (!rota || rota.segmento !== 'AEREA') return base;
    var m = R.normCidade(rota.motivo);
    var cat = { tipo: 'Preventiva', cat1: 'Preventiva de Rede', cat2: 'Preventiva Rede (Externa)', slaHoras: 8, conta: base.conta };
    if (m.indexOf('POS MASSIVA') >= 0) cat.cat2 = 'Preventiva Rede (Pós Massiva)';
    else if (m.indexOf('SOLICITACAO DE CLIENTE') >= 0) cat.cat2 = 'Preventiva Rede (Corretiva Cliente)';
    else if (m.indexOf('TROCA DE POSTE') >= 0) { cat.cat1 = 'Acompanhamento'; cat.cat2 = 'Acompanhamento (Troca de Poste)'; }
    return cat;
  };
  R.validarRotaAerea = function (r) {
    var erros = [];
    if (vazio(r.cidade)) erros.push('Informe a cidade.');
    if (vazio(r.motivo)) erros.push('Escolha o motivo da preventiva.');
    if (vazio(r.solicitante)) erros.push('Informe o solicitante / área.');
    if (!numero(r.metros_previstos) || Number(r.metros_previstos) < 0) erros.push('Informe os metros previstos da rota (0 se for pontual).');
    if (vazio(r.prestador)) erros.push('Escolha o prestador (equipe).');
    if (R.ms(r.data_planejada) == null) erros.push('Informe a data.');
    validarLimite(r, erros);
    if (!vazio(r.kmz_url) && !/^https?:\/\//i.test(String(r.kmz_url))) erros.push('O link do KMZ precisa começar com http:// ou https://.');
    return { ok: !erros.length, erros: erros };
  };

  // Número do relato. Metros: "2,134" (km com vírgula) = 2134 m; "2.134" = 2134 m;
  // "2134 m" = 2134; "1,8 km" = 1800. Número pequeno sem unidade (< 50) é lido
  // como km. Demais campos: inteiro (cordoalha aceita decimal).
  R.numeroRelato = function (txt, ehMetros) {
    var s = String(txt || '').toLowerCase(), m = /(\d+(?:[.,]\d+)*)\s*(km|m|mts|metros)?\b/.exec(s);
    if (!m) return null;
    var bruto = m[1], un = m[2] || (s.indexOf('km') >= 0 ? 'km' : ''), v;
    if (/^\d{1,3}(\.\d{3})+$/.test(bruto)) v = Number(bruto.replace(/\./g, ''));        // 2.134 → 2134
    else if (/^\d{1,3}(\.\d{3})+,\d+$/.test(bruto)) v = Number(bruto.replace(/\./g, '').replace(',', '.'));
    else v = Number(bruto.replace(',', '.'));
    if (!isFinite(v)) return null;
    if (ehMetros && (un === 'km' || (!un && v < 50))) v = v * 1000;
    return Math.round(v * 100) / 100;
  };
  // Relato que a equipe manda hoje (texto livre, uma informação por linha):
  //   Rota percorrido 2,134 / Poste equipado 13 / Cordoalha 120 / Plaquetas 15 /
  //   Caixa regularizadas 3 / Sobra técnica 2 / Finalizado
  R.lerRelato = function (texto) {
    var out = { metros: null, postes: null, cordoalha: null, plaquetas: null, caixas: null, sobra: null, tipo: '', reconhecidos: [], ignorados: [] };
    var regras = [
      ['metros', /(rota|percorr|metragem|extens|\bkm\b)/, true],
      ['postes', /poste/], ['cordoalha', /cordoalha/], ['plaquetas', /plaqueta/],
      ['caixas', /(caixa|ceo|cto|emenda)/], ['sobra', /sobra/]
    ];
    String(texto || '').split(/\r?\n|;/).map(function (l) { return l.trim(); }).filter(Boolean).forEach(function (linha) {
      var n = R.normCidade(linha).toLowerCase();
      if (/finaliz|conclui|encerrad/.test(n) && !/\d/.test(n)) { out.tipo = 'final'; out.reconhecidos.push(linha); return; }
      if (/parcial|andamento|continua/.test(n) && !/\d/.test(n)) { out.tipo = 'parcial'; out.reconhecidos.push(linha); return; }
      var r = regras.filter(function (x) { return x[1].test(n); })[0];
      if (!r) { out.ignorados.push(linha); return; }
      var v = R.numeroRelato(n, !!r[2]);
      if (v == null) { out.ignorados.push(linha); return; }
      out[r[0]] = r[0] === 'metros' || r[0] === 'cordoalha' ? v : Math.round(v);
      out.reconhecidos.push(linha);
    });
    return out;
  };

  R.CAMPOS_PRODUCAO = ['metros', 'postes', 'cordoalha', 'plaquetas', 'caixas', 'sobra'];
  R.validarApontamento = function (a) {
    a = a || {}; var erros = [];
    if (vazio(a.id_apontamento)) erros.push('Apontamento sem identificação.');
    if (vazio(a.id_rota)) erros.push('Apontamento sem rota.');
    if (['parcial', 'final'].indexOf(a.tipo) < 0) erros.push('Escolha Parcial ou Finalizado.');
    if (R.ms(a.data) == null) erros.push('Informe a data do apontamento.');
    if (!numero(a.metros) || Number(a.metros) < 0) erros.push('Informe os metros percorridos (0 se não percorreu).');
    ['postes', 'plaquetas', 'caixas', 'sobra'].forEach(function (k) { if (!inteiroNaoNeg(a[k] === '' || a[k] == null ? 0 : a[k])) erros.push('Número inválido em ' + k + '.'); });
    if (a.cordoalha !== '' && a.cordoalha != null && (!numero(a.cordoalha) || Number(a.cordoalha) < 0)) erros.push('Número inválido em cordoalha.');
    if (a.tipo === 'parcial' && !(Number(a.metros) > 0) && !R.CAMPOS_PRODUCAO.some(function (k) { return Number(a[k]) > 0; }))
      erros.push('Apontamento parcial sem produção.');
    return { ok: !erros.length, erros: erros };
  };
  var n0 = function (v) { return numero(v) ? Number(v) : 0; };
  // Soma da produção da rota. opcoes.soAprovados: só o que a revisão aprovou.
  R.producaoRota = function (rota, apontamentos, opcoes) {
    var so = opcoes && opcoes.soAprovados;
    var lista = (apontamentos || []).filter(function (a) { return a.id_rota === rota.id_rota && a.status_revisao !== 'REJEITADA' && (!so || a.status_revisao === 'APROVADA'); });
    var t = { metros: 0, postes: 0, cordoalha: 0, plaquetas: 0, caixas: 0, sobra: 0 };
    lista.forEach(function (a) { R.CAMPOS_PRODUCAO.forEach(function (k) { t[k] += n0(a[k]); }); });
    t.metros = Math.round(t.metros); t.cordoalha = Math.round(t.cordoalha * 100) / 100;
    var final = lista.filter(function (a) { return a.tipo === 'final'; })[0] || null;
    var prev = n0(rota.metros_previstos);
    return { totais: t, apontamentos: lista.length, finalizada: !!final, final: final, pct: prev ? Math.round(1000 * t.metros / prev) / 10 : null };
  };
  // Chamado aéreo: conclui quando há apontamento final e TUDO da rota está aprovado.
  R.resumoChamadoAereo = function (rota, apontamentos) {
    var daRota = (apontamentos || []).filter(function (a) { return a.id_rota === rota.id_rota; });
    var validos = daRota.filter(function (a) { return a.status_revisao !== 'REJEITADA'; });
    var pendentes = validos.filter(function (a) { return a.status_revisao !== 'APROVADA'; }).length;
    var p = R.producaoRota(rota, daRota, { soAprovados: true });
    var lpu = {}; lpu.SEV0083 = p.totais.metros; lpu.SEV0005 = p.totais.plaquetas; lpu.SEV0009 = p.totais.cordoalha; lpu.SEV0084 = p.totais.caixas;
    return { pronto: rota.status === 'CONCLUIDA' && p.finalizada && pendentes === 0, pendentes: pendentes, totais: p.totais, lpu_sugerida: lpu };
  };
  R.LPU_AEREA = { metros: 'SEV0083', plaquetas: 'SEV0005', cordoalha: 'SEV0009', caixas: 'SEV0084' };

  // ─────────── KPIs da aérea ───────────
  var mesDe = function (v) { var t = R.ms(v); return t == null ? '' : new Date(t).toISOString().slice(0, 7); };
  var diaDe = function (v) { var t = R.ms(v); return t == null ? '' : new Date(t).toISOString().slice(0, 10); };
  R.metaAerea = function (mes, config) { var cfg = R.normalizarConfig(config); return cfg.metas_aerea_mes[mes] != null ? cfg.metas_aerea_mes[mes] : cfg.meta_aerea_m; };
  // mes = 'AAAA-MM'. Conta apontamentos não rejeitados com data no mês (produção
  // informada); 'aprovado' traz só o que a revisão aprovou (base de pagamento).
  // Plano de voo como na planilha: média/dia × 30 = projeção.
  R.kpiAereo = function (rotas, apontamentos, mes, config, opcoes) {
    var rm = {}; (rotas || []).forEach(function (r) { rm[r.id_rota] = r; });
    var novo = function () { return { metros: 0, postes: 0, cordoalha: 0, plaquetas: 0, caixas: 0, sobra: 0, rotas: {} }; };
    var tot = novo(), aprovado = novo(), por = { equipe: {}, regiao: {}, motivo: {}, solicitante: {}, cidade: {} }, dias = {};
    (apontamentos || []).forEach(function (a) {
      if (a.status_revisao === 'REJEITADA' || mesDe(a.data) !== mes) return;
      var r = rm[a.id_rota] || {};
      var soma = function (x) { R.CAMPOS_PRODUCAO.forEach(function (k) { x[k] += n0(a[k]); }); x.rotas[a.id_rota] = true; };
      soma(tot); if (a.status_revisao === 'APROVADA') soma(aprovado);
      [['equipe', r.prestador], ['regiao', r.regiao], ['motivo', r.motivo], ['solicitante', r.solicitante], ['cidade', r.cidade]].forEach(function (p) {
        var k = p[1] || '(sem ' + p[0] + ')'; soma(por[p[0]][k] = por[p[0]][k] || novo());
      });
      if (n0(a.metros) > 0) dias[diaDe(a.data)] = true;
    });
    var fecha = function (x) { x.rotas = Object.keys(x.rotas).length; x.metros = Math.round(x.metros); x.cordoalha = Math.round(x.cordoalha); return x; };
    fecha(tot); fecha(aprovado);
    Object.keys(por).forEach(function (g) { Object.keys(por[g]).forEach(function (k) { fecha(por[g][k]); }); });
    var diasTrab = opcoes && numero(opcoes.diasTrabalhados) ? Number(opcoes.diasTrabalhados) : Object.keys(dias).length;
    var meta = R.metaAerea(mes, config), media = diasTrab ? tot.metros / diasTrab : 0;
    return { mes: mes, meta_m: meta, total: tot, aprovado: aprovado, pct_meta: meta ? Math.round(1000 * tot.metros / meta) / 10 : null,
      dias_trabalhados: diasTrab, media_dia_m: Math.round(media), projecao_m: Math.round(media * 30), falta_m: Math.max(0, meta - tot.metros), por: por };
  };
  // Dias trabalhados padrão do "plano de voo": segunda a sábado já decorridos no
  // mês (mês inteiro se já passou). hojeIso = 'AAAA-MM-DD'. Editável na tela.
  R.diasUteisDecorridos = function (mes, hojeIso) {
    var p = mes.split('-').map(Number), ultimo = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
    var ate = String(hojeIso).slice(0, 7) === mes ? Number(String(hojeIso).slice(8, 10)) : (String(hojeIso).slice(0, 7) > mes ? ultimo : 0);
    var n = 0;
    for (var d = 1; d <= ate; d++) if (new Date(Date.UTC(p[0], p[1] - 1, d)).getUTCDay() !== 0) n++;
    return n;
  };
  // Dias trabalhados padrão (decisão de 2026-09-30): dias CORRIDOS do calendário já
  // passados no mês, com sábado e domingo (mês inteiro se já passou; 0 se futuro).
  R.diasCorridosDecorridos = function (mes, hojeIso) {
    var p = mes.split('-').map(Number), ultimo = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
    return String(hojeIso).slice(0, 7) === mes ? Number(String(hojeIso).slice(8, 10)) : (String(hojeIso).slice(0, 7) > mes ? ultimo : 0);
  };
  // Dias trabalhados do mês: o valor salvo na configuração (editado na tela) vence;
  // sem valor salvo, dias corridos. Devolve também o automático, para a tela mostrar.
  R.diasAereaMes = function (mes, config, hojeIso) {
    var cfg = R.normalizarConfig(config), auto = R.diasCorridosDecorridos(mes, hojeIso), salvo = cfg.dias_aerea_mes[mes];
    return { dias: salvo != null ? salvo : auto, automatico: auto, salvo: salvo != null ? salvo : null };
  };
  // Série mensal (metros × meta) dos últimos n meses até 'ate' (AAAA-MM).
  R.serieAerea = function (apontamentos, ate, n, config) {
    var out = [], p = ate.split('-').map(Number);
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(Date.UTC(p[0], p[1] - 1 - i, 1)), mes = d.toISOString().slice(0, 7), m = 0;
      (apontamentos || []).forEach(function (a) { if (a.status_revisao !== 'REJEITADA' && mesDe(a.data) === mes) m += n0(a.metros); });
      out.push({ mes: mes, metros: Math.round(m), meta_m: R.metaAerea(mes, config) });
    }
    return out;
  };

  // ─────────── Histórico da planilha ───────────
  // Linha da aba "Banco de dados Preventiva" (objeto coluna → valor) → rota
  // concluída + apontamento final APROVADO, marcados importado_planilha (sem chamado
  // nem LPU). Datas podem vir como Date, número de série do Excel ou texto.
  var dataPlanilha = function (v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v))) return new Date(Math.round((Number(v) - 25569) * 864e5)).toISOString().slice(0, 10);
    var t = R.ms(v); return t == null ? null : new Date(t).toISOString().slice(0, 10);
  };
  var qtdPlanilha = function (v) { if (v == null || v === '' || /INFORMADO/i.test(String(v))) return null; var n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
  R.historicoDaLinha = function (l, i, config) {
    var g = function (nome) { var k = Object.keys(l).filter(function (x) { return R.normCidade(x) === R.normCidade(nome); })[0]; return k ? l[k] : ''; };
    var inicio = dataPlanilha(g('Inicio')), fim = dataPlanilha(g('Término')) || inicio;
    if (!inicio || vazio(g('Equipe'))) return null;
    var prot = String(g('Protocolo') || '').replace(/\D/g, '');
    var id = 'HIST-' + (prot || 'L') + '-' + (i + 2);
    var cidade = R.normCidade(g('Cidade'));
    var rota = { id_rota: id, segmento: 'AEREA', importado_planilha: true, status: 'CONCLUIDA', data_planejada: inicio, concluida_em: fim,
      prestador: String(g('Equipe')).trim(), cidade: cidade, regiao: String(g('Região') || '').trim() || R.regiaoDaCidade(cidade, config),
      motivo: String(g('Motivo da preventiva')).trim(), solicitante: String(g('Solicitante / Área')).trim(), protocolo: prot,
      observacao: String(g('Observações') || '').trim(), metros_previstos: qtdPlanilha(g('Total (M)')) || 0, extensao_km: (qtdPlanilha(g('Total (M)')) || 0) / 1000 };
    var ap = { id_apontamento: id + '-F', id_rota: id, importado_planilha: true, tipo: 'final', data: fim, status_revisao: 'APROVADA',
      metros: qtdPlanilha(g('Concluído (M)')) || 0, postes: qtdPlanilha(g('Postes equipados')), cordoalha: qtdPlanilha(g('Cordoalha')),
      plaquetas: qtdPlanilha(g('Plaquetas')), caixas: null, sobra: qtdPlanilha(g('Sobra técnica')), prestador: rota.prestador };
    return { rota: rota, apontamento: ap };
  };

  // ═══════════════════════════ Importação da base ═══════════════════════════
  var numCoord = function (v) { if (v == null || v === '') return null; var n = Number(String(v).trim().replace(',', '.')); return isFinite(n) ? n : null; };
  var achaCol = function (linha, preferida, candidatas) {
    var chaves = Object.keys(linha || {});
    var norm = function (s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
    if (preferida) { for (var i = 0; i < chaves.length; i++) if (norm(chaves[i]) === norm(preferida)) return chaves[i]; }
    for (var j = 0; j < candidatas.length; j++) for (var k = 0; k < chaves.length; k++) if (norm(chaves[k]) === candidatas[j]) return chaves[k];
    return null;
  };
  // Linhas de CSV/planilha → CS da base. O nome das colunas é configurável
  // (padrão de nome ainda vem do Tom); sem configuração, tenta nomes comuns.
  // Cidade: coluna do arquivo, se houver; senão, cidadePadrao (informada para o
  // lote todo na importação). O módulo serve qualquer cidade.
  R.normalizarBase = function (linhas, importacao, cidadePadrao) {
    var imp = (importacao || {}), validas = [], erros = [], vistos = {};
    var ex = (linhas || [])[0] || {};
    var col = {
      id: achaCol(ex, imp.col_id, ['idcs', 'cs', 'id', 'codigo', 'nome', 'name']),
      cluster: achaCol(ex, imp.col_cluster, ['cluster', 'agrupamento', 'regiao']),
      cidade: achaCol(ex, imp.col_cidade, ['cidade', 'municipio', 'city']),
      lat: achaCol(ex, imp.col_lat, ['lat', 'latitude']),
      lng: achaCol(ex, imp.col_lng, ['lng', 'lon', 'long', 'longitude']),
      endereco: achaCol(ex, imp.col_endereco, ['endereco', 'logradouro', 'address', 'descricao', 'description'])
    };
    ['id', 'cluster', 'lat', 'lng'].forEach(function (k) { if (!col[k]) erros.push({ linha: 0, msg: 'Coluna de ' + k + ' não encontrada. Ajuste o mapeamento em Configurações.' }); });
    if (!col.cidade && vazio(cidadePadrao)) erros.push({ linha: 0, msg: 'O arquivo não tem coluna de cidade: informe a cidade da base.' });
    if (erros.length) return { validas: [], erros: erros, colunas: col };
    (linhas || []).forEach(function (l, i) {
      var n = i + 2; // linha 1 = cabeçalho
      var id = String(l[col.id] == null ? '' : l[col.id]).trim(), lat = numCoord(l[col.lat]), lng = numCoord(l[col.lng]);
      var cidade = String((col.cidade && l[col.cidade] != null && String(l[col.cidade]).trim()) || cidadePadrao || '').trim();
      if (!id) return erros.push({ linha: n, msg: 'Sem ID da CS.' });
      if (!cidade) return erros.push({ linha: n, msg: id + ': sem cidade.' });
      if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return erros.push({ linha: n, msg: id + ': coordenada inválida.' });
      if (vistos[id]) return erros.push({ linha: n, msg: id + ': repetida no arquivo (mantida a primeira).' });
      vistos[id] = true;
      validas.push({ id_cs: id, cidade: cidade, cluster: String(l[col.cluster] == null ? '' : l[col.cluster]).trim(), lat: lat, lng: lng,
        endereco: col.endereco ? String(l[col.endereco] == null ? '' : l[col.endereco]).trim() : '' });
    });
    return { validas: validas, erros: erros, colunas: col };
  };

  // KML → linhas {id, cluster, lat, lng, endereco, campos}. Leitor simples por
  // texto (roda igual no Apps Script e nos testes). Só Placemarks com Point.
  // mapeamento.kml_id: 'nome' | 'campo:<Nome>'; kml_cluster: 'pasta' | 'campo:<Nome>'.
  var desXml = function (s) {
    s = String(s == null ? '' : s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(Number(d)); }).replace(/&amp;/g, '&').trim();
  };
  var tag = function (xml, nome) { var m = new RegExp('<' + nome + '\\b[^>]*>([\\s\\S]*?)</' + nome + '>', 'i').exec(xml); return m ? desXml(m[1]) : ''; };
  R.lerKml = function (texto, mapeamento) {
    var map = mapeamento || {}, idDe = map.kml_id || 'nome', clDe = map.kml_cluster || 'pasta';
    var re = /<(\/?)(Folder|Placemark)\b[^>]*>/gi, pastas = [], linhas = [], ignorados = 0, m;
    while ((m = re.exec(texto))) {
      if (m[2].toLowerCase() === 'folder') {
        if (m[1]) { pastas.pop(); continue; }
        var resto = texto.slice(re.lastIndex), prox = resto.search(/<(Folder|Placemark|\/Folder)\b/i);
        pastas.push(tag(prox < 0 ? resto : resto.slice(0, prox), 'name'));
        continue;
      }
      if (m[1]) continue;
      var fim = texto.indexOf('</Placemark>', re.lastIndex); if (fim < 0) break;
      var pm = texto.slice(re.lastIndex, fim); re.lastIndex = fim + 12;
      var ponto = /<Point\b[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i.exec(pm);
      if (!ponto) { ignorados++; continue; }
      var xy = desXml(ponto[1]).split(/[\s,]+/).filter(Boolean).map(Number);
      var campos = {}, d, reD = /<Data\s+name="([^"]*)"[^>]*>[\s\S]*?<value>([\s\S]*?)<\/value>[\s\S]*?<\/Data>/gi, reS = /<SimpleData\s+name="([^"]*)"[^>]*>([\s\S]*?)<\/SimpleData>/gi;
      while ((d = reD.exec(pm))) campos[desXml(d[1])] = desXml(d[2]);
      while ((d = reS.exec(pm))) campos[desXml(d[1])] = desXml(d[2]);
      var nome = tag(pm.replace(/<ExtendedData[\s\S]*?<\/ExtendedData>/i, ''), 'name');
      var pega = function (regra, padrao) { return regra.indexOf('campo:') === 0 ? (campos[regra.slice(6)] || '') : padrao; };
      linhas.push({ id: pega(idDe, nome), cluster: pega(clDe, pastas.length ? pastas[pastas.length - 1] : ''),
        lat: xy[1], lng: xy[0], endereco: tag(pm, 'address') || campos.endereco || '', campos: campos });
    }
    return { linhas: linhas, ignorados: ignorados };
  };

  return R;
})();
if (typeof SN !== 'undefined') SN.VR = VR;
if (typeof module !== 'undefined' && module.exports) module.exports = VR;
