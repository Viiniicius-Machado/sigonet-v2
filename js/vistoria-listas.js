// SIGONET V2 — Preventiva (vistoria de rede subterrânea): listas fechadas.
//
// Tudo o que o técnico escolhe no formulário vem daqui (valor gravado → rótulo
// na tela). Listas que dependem de decisão externa (operadoras, tipos de tampa)
// NÃO ficam aqui: são configuráveis na tela de Configurações (VST_CONFIG).
//
// Este arquivo roda em três lugares sem alteração: navegador, Node (testes) e
// Apps Script (é copiado para servidor/VistoriaRegras.gs por
// ferramentas/gerar-regras-gs.mjs). Por isso: sem DOM, sem import/export.
var VR_LISTAS = (function () {
  var L = {};

  // ─────────── Identificação ───────────
  L.situacao_cadastro = [['consta_bate', 'Consta e bate'], ['consta_divergente', 'Consta com posição divergente'], ['nao_consta', 'Não consta']];

  // ─────────── Acesso ───────────
  L.sim_nao = [['sim', 'Sim'], ['nao', 'Não']];
  L.sim_nao_parcial = [['sim', 'Sim'], ['nao', 'Não'], ['parcial', 'Parcial']];
  L.motivo_nao_abriu = [['veiculo', 'Veículo sobre a tampa'], ['travada', 'Tampa travada ou soldada'], ['encoberta', 'Tampa asfaltada ou encoberta'],
    ['alagamento', 'Alagamento'], ['risco', 'Risco de segurança'], ['outro', 'Outro']];

  // ─────────── Solo do entorno (na chegada) ───────────
  L.solo_entorno = [['normal', 'Normal'], ['depressao', 'Depressão ou afundamento'], ['pavimento', 'Pavimento trincado ou cedendo'],
    ['desnivel', 'Tampa desnivelada em relação ao piso']];

  // ─────────── Tampa ───────────
  L.tampa_estado = [['integra', 'Íntegra'], ['trincada', 'Trincada'], ['quebrada', 'Quebrada'], ['desnivelada', 'Desnivelada'], ['ausente', 'Ausente']];
  L.tampa_identificacao = [['presente', 'Presente'], ['ausente', 'Ausente'], ['ilegivel', 'Ilegível']];

  // ─────────── Interior ───────────
  L.agua = [['seca', 'Seca'], ['umida', 'Úmida'], ['lamina', "Lâmina d'água"], ['parcial', 'Parcialmente alagada'], ['alagada', 'Alagada']];
  L.limpeza = [['limpa', 'Limpa'], ['terra', 'Terra'], ['entulho', 'Entulho'], ['lixo', 'Lixo']];
  L.assoreamento = [['nenhum', 'Nenhum'], ['pouco', 'Pouco'], ['muito', 'Muito (assoreada)']];
  L.estrutura = [['integra', 'Íntegra'], ['trincada', 'Trincada'], ['desmoronando', 'Desmoronando']];

  // ─────────── Cabos ───────────
  L.operadora_nao_identificado = 'nao_identificado'; // sempre acrescentada à lista configurável
  L.cabos_divergencia = [['excedente', 'Cabo excedente'], ['faltante', 'Cabo faltante'], ['nao_identificado', 'Cabo não identificado']];

  // ─────────── Organização ───────────
  L.reserva = [['acomodada', 'Presente e acomodada'], ['desorganizada', 'Presente e desorganizada'], ['ausente', 'Ausente']];
  L.organizacao = [['organizado', 'Organizado'], ['desorganizado', 'Desorganizado'], ['solto', 'Cabo solto no fundo'], ['tensionado', 'Cabo tensionado']];

  // ─────────── Emenda (inspeção visual externa) ───────────
  L.emenda_caixa = [['integra', 'Íntegra'], ['danificada', 'Danificada']];
  L.emenda_fixacao = [['fixada', 'Fixada'], ['solta', 'Solta']];
  L.emenda_submersa = [['nao', 'Não submersa'], ['sim', 'Submersa']];
  L.emenda_vedacao = [['ok', 'OK'], ['comprometida', 'Comprometida']];

  // ─────────── Conclusão ───────────
  L.conclusao = [['conforme', 'Conforme'], ['ressalva', 'Conforme com ressalva'], ['nao_conforme', 'Não conforme']];
  L.prioridade = [['critica', 'Crítica'], ['media', 'Média'], ['baixa', 'Baixa']];

  // ─────────── Trecho ───────────
  L.anomalia_trecho = [['afundamento', 'Afundamento'], ['calcada', 'Calçada cedendo'], ['obra', 'Obra de terceiro'],
    ['caixa_nao_cadastrada', 'Caixa não cadastrada'], ['outro', 'Outro']];

  // ─────────── Protocolo de fotos ───────────
  // n = número do protocolo; cada tipo tem seu próprio campo na tela.
  // "anomalia_solo" é a foto 9 aplicada à condição do solo do entorno (bloco da
  // CS); "anomalia" é a foto 9 de cada anomalia do trecho.
  L.fotos = [
    { tipo: 'contexto',       n: 1,  rot: 'Contexto: tampa fechada com a rua ou fachada ao fundo' },
    { tipo: 'tampa_perto',    n: 2,  rot: 'Tampa fechada de perto (estado e identificação)' },
    { tipo: 'tampa_aberta',   n: 3,  rot: 'Tampa aberta, vista de cima, interior inteiro' },
    { tipo: 'profundidade',   n: 4,  rot: 'Medição de profundidade com a trena legível' },
    { tipo: 'parede',         n: 5,  rot: 'Parede com entrada de duto (uma por parede)', multipla: true },
    { tipo: 'plaquetas',      n: 6,  rot: 'Plaquetas dos cabos, legíveis', multipla: true },
    { tipo: 'organizacao',    n: 7,  rot: 'Organização geral: ferragens e reserva' },
    { tipo: 'emenda_externa', n: 8,  rot: 'Emenda: vista externa' },
    { tipo: 'emenda_antes',   n: 8,  rot: 'Emenda aberta: antes' },
    { tipo: 'emenda_depois',  n: 8,  rot: 'Emenda aberta: depois' },
    { tipo: 'anomalia_solo',  n: 9,  rot: 'Anomalia do solo no entorno' },
    { tipo: 'anomalia',       n: 9,  rot: 'Anomalia do trecho (uma por anomalia)', multipla: true },
    { tipo: 'tampa_final',    n: 10, rot: 'Tampa fechada ao final' },
    // Aérea: foto opcional do apontamento de produção (postes, cordoalha, plaquetas…).
    { tipo: 'producao',       n: 11, rot: 'Foto da produção (aérea)', multipla: true },
    // PDF de controle (ficha da CS / do apontamento): vai pela mesma fila das fotos, não aparece como campo.
    { tipo: 'ficha_pdf',      n: 0,  rot: 'Ficha PDF de controle', pdf: true }
  ];

  // ─────────── Segmentos da Preventiva ───────────
  // SUBTERRANEA: vistoria CS a CS. AEREA: percorrer rota (KMZ) e apontar produção.
  L.segmentos = [['SUBTERRANEA', 'Subterrânea'], ['AEREA', 'Aérea']];
  L.tipo_apontamento = [['parcial', 'Parcial'], ['final', 'Finalizado']];
  // Campos de produção da aérea (os mesmos da planilha de KPIs + caixas/CEO).
  L.producao_aerea = [
    { k: 'metros', rot: 'Rota percorrida (m)', un: 'm' },
    { k: 'postes', rot: 'Postes equipados', un: '' },
    { k: 'cordoalha', rot: 'Cordoalha (m)', un: 'm' },
    { k: 'plaquetas', rot: 'Plaquetas', un: '' },
    { k: 'caixas', rot: 'Caixas/CEO regularizadas', un: '' },
    { k: 'sobra', rot: 'Sobra técnica', un: '' }
  ];

  // ─────────── Revisão ───────────
  L.motivos_rejeicao = [['foto_faltando', 'Foto obrigatória faltando'], ['foto_ilegivel', 'Foto ilegível ou escura'],
    ['foto_suspeita', 'Foto suspeita (data do arquivo incompatível)'], ['gps_sem_justificativa', 'GPS divergente sem justificativa'],
    ['profundidade_sem_foto', 'Profundidade sem foto da trena'], ['cabo_sem_foto', 'Cabo divergente sem foto da plaqueta'],
    ['nao_aberta_sem_motivo', 'CS não aberta sem motivo válido'], ['outro', 'Outro']];

  // ─────────── Status ───────────
  L.status_rota = {
    PLANEJADA:  { rot: 'Planejada',  cls: 'alerta' },
    DESPACHADA: { rot: 'Despachada', cls: 'info' },
    EM_CAMPO:   { rot: 'Em campo',   cls: 'verde' },
    CONCLUIDA:  { rot: 'Concluída',  cls: 'ok' }
  };
  L.status_vistoria = {
    RASCUNHO:           { rot: 'Rascunho',            cls: '' },
    AGUARDANDO_REVISAO: { rot: 'Aguardando revisão',  cls: 'alerta' },
    APROVADA:           { rot: 'Aprovada',            cls: 'ok' },
    REJEITADA:          { rot: 'Rejeitada (refazer)', cls: 'erro' }
  };

  // Rótulo de um valor numa lista [[valor, rótulo]].
  L.rotulo = function (lista, valor) {
    var arr = typeof lista === 'string' ? L[lista] : lista;
    if (!arr || !arr.length) return valor == null ? '' : String(valor);
    for (var i = 0; i < arr.length; i++) if (arr[i][0] === valor) return arr[i][1];
    return valor == null ? '' : String(valor);
  };
  L.valores = function (nome) { return (L[nome] || []).map(function (x) { return x[0]; }); };
  L.foto = function (tipo) { for (var i = 0; i < L.fotos.length; i++) if (L.fotos[i].tipo === tipo) return L.fotos[i]; return null; };

  return L;
})();
if (typeof SN !== 'undefined') SN.VR_LISTAS = VR_LISTAS;
if (typeof module !== 'undefined' && module.exports) module.exports = VR_LISTAS;
