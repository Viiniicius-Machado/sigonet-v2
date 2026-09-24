// SIGONET V2 — Cadastros-mestre (VERSÃO PÚBLICA: pessoas, CNPJs e budgets ficam só na planilha do servidor).
// Tudo aqui é copiado para a base local no primeiro acesso e, a partir daí,
// editado pela tela Cadastros (não é preciso mexer neste arquivo para
// adicionar técnico, prestador, liderança ou mudar budget).

// ── Prestadores / empresas ─────────────────────────────────────────────────
// vinculo: CLT (mão de obra própria — LPU registra hora-homem e produção),
//          PRESTADOR (LPU com valor de serviço conforme contrato/LPU),
//          CONTRATO_FIXO (produção contada, sem valor por item de LPU).
// responsavelLpu: técnico que assina a LPU e emite a NF pela empresa.
const SEED_EMPRESAS = [] /* versão pública: vem da planilha do servidor */;

// ── Técnicos ───────────────────────────────────────────────────────────────
// [empresa, nome, equipe, titular, frente]
// Dupla = mesma empresa + mesma equipe. Só o titular aparece no despacho; o
// parceiro vê a fila da equipe quando entra com o próprio PIN.
const SEED_TECNICOS = [] /* versão pública: vem da planilha do servidor */;

// ── Liderança / operação ───────────────────────────────────────────────────
// Modelo de acesso: Nome + PIN (dado pela gestão) + Complemento pessoal criado
// no 1º acesso (guardado só como hash SHA-256). "telas" define o que cada um
// abre ('*' = tudo). O cargo também libera ações:
//   Gerente/Gestor → tudo; Encarregado → aprova LPU e valida fibra (líder);
//   OEM → sala técnica (cadastro de fibra/GEOGRID, materiais, service desk).
const SEED_LIDERANCA = [] /* versão pública: vem da planilha do servidor */;

// PIN inicial de todo mundo no primeiro uso da base local — a gestão troca
// individualmente em Cadastros. No 1º login a pessoa cria o Complemento.
const PIN_INICIAL = '1234';

// ── Contas contábeis ───────────────────────────────────────────────────────
// faixas = códigos SEV liberados para a conta (mesma regra do V1).
const SEED_CONTAS = [] /* versão pública: vem da planilha do servidor */;

// Conta sugerida no despacho a partir do Tipo de Solicitação (pode ser trocada).
const CONTA_PADRAO_POR_TIPO = {
  'Manutenção': '3.1.1.2.05.0008', 'Preventiva': '3.1.1.2.05.0101', 'Implantação': '3.1.1.2.05.0005',
  'Transmissão': '3.1.1.2.05.0103', 'GTD': '3.1.1.2.05.0006', 'Pós Vendas': '3.1.1.2.05.0006',
  'Medição': '3.1.1.2.05.0102'
};

// ── Contratos fixos (referência para o Service Desk) ───────────────────────
const CONTRATOS_FIXOS = [
  { empresa: 'QUALITY', conta: '3.1.1.2.05.0008', valorMensal: 10000, metaAtividades: 18,
    ciclo: 'Dia 21 ao dia 20 · pagamento dia 28', variaveis: [] },
  { empresa: 'VAL', conta: '3.1.1.2.05.0008', valorMensal: null, metaAtividades: null, observacao: 'Equipes Diurno e Noturno',
    ciclo: 'Dia 21 ao dia 20 · pagamento dia 28',
    variaveis: [
      { desc: 'Cumprir o plantão no fim de semana escalado', valor: 3333.33 },
      { desc: 'Manter o SLA de 4 horas', valor: 1000 },
      { desc: 'Manter os atendimentos sem nenhuma pendência técnica', valor: 1000 }
    ] },
  { empresa: 'SOUZA TELECOM', conta: '3.1.1.2.05.0005', valorMensal: 26000, metaAtividades: null,
    ciclo: 'Dia 21 ao dia 20 · pagamento dia 28',
    variaveis: [
      { desc: 'Cumprir o plantão no final de semana escalado (as duas equipes)', valor: 2000 },
      { desc: 'Atender chamados sem atrasos de horários', valor: 500 },
      { desc: 'Realizar baixas das atividades no forms dentro do prazo (1 dia)', valor: 500 },
      { desc: 'Realizar baixas de materiais no Voalle dentro do prazo (1 dia)', valor: 500 },
      { desc: 'Cumprir todos os padrões construtivos', valor: 500 }
    ] }
];

// Ciclo da LPU de prestador: produção do dia 01 ao último dia do mês, NF no
// fechamento e pagamento no dia 15 (útil) do mês seguinte.
const CICLO_LPU = { diaPagamento: 15 };

// Metas operacionais (mesma régua do V1).
const METAS = { mttdMin: 60, tmcMin: 180, irrPct: 10, preventivaMetrosMes: 76000 };

const MOTIVOS_DISPONIBILIDADE = {
  INATIVO: 'Inativo', FERIAS: 'Férias', TREINAMENTO: 'Treinamento', SUSPENSAO: 'Suspensão Disciplinar',
  ATESTADO: 'Atestado', MANUTENCAO_FROTA: 'Manutenção de Frota', FOLGA: 'Folga compensada'
};

// Tipos de Solicitação em que o botão Cadastro de Fibra aparece para o técnico.
const TIPOS_COM_FIBRA = ['Manutenção', 'Transmissão', 'Implantação', 'Preventiva'];
const TIPOS_CABO = ['01F', '02F', '04F', '06F', '12F', '24F', '36F', '48F', '72F', '144F'];
const SPLITTERS = ['1x2', '1x4', '1x8', '1x16'];
