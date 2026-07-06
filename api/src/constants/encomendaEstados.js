// Fluxo de estados da encomenda, gerido no Backoffice (Admin). Sequência linear:
// AguardarPagamento → PagamentoEfectuado → EmPreparacao → Enviada, com Anulada
// disponível em qualquer estado antes de Enviada (ver routes/admin.js).
// Os pontos de fidelização só são atribuídos definitivamente quando o cliente
// confirma a receção da encomenda (ver routes/conta.js), passando o estado a
// RecebidaSemDevolucao - não faz parte da sequência automática de "avançar"
// porque essa transição é sempre despoletada pelo cliente, nunca pelo Backoffice.
const SEQUENCIA_ESTADOS = ['AguardarPagamento', 'PagamentoEfectuado', 'EmPreparacao', 'Enviada'];

const ESTADO_ANULADA = 'Anulada';
const ESTADO_RECEBIDA_CONFORME = 'RecebidaSemDevolucao';

// Fluxo (não-linear) da Nota de Devolução: emitida ao ser criada pelo cliente
// (ou pelo Backoffice), depois o Backoffice marca-a como aceite ou não aceite,
// e só se aceite é que pode passar a paga (ver services/devolucaoService.js).
const ESTADO_DEV_NOTA_EMITIDA = 'NotaDevolucaoEmitida';
const ESTADO_DEV_RECEBIDA_ACEITE = 'DevolucaoRecebidaAceite';
const ESTADO_DEV_RECEBIDA_NAO_ACEITE = 'DevolucaoRecebidaNaoAceite';
const ESTADO_DEV_PAGA = 'DevolucaoPaga';

const ESTADOS_DEVOLUCAO = [
  ESTADO_DEV_NOTA_EMITIDA,
  ESTADO_DEV_RECEBIDA_ACEITE,
  ESTADO_DEV_RECEBIDA_NAO_ACEITE,
  ESTADO_DEV_PAGA,
];

const TRANSICOES_DEVOLUCAO = {
  [ESTADO_DEV_NOTA_EMITIDA]: [ESTADO_DEV_RECEBIDA_ACEITE, ESTADO_DEV_RECEBIDA_NAO_ACEITE],
  [ESTADO_DEV_RECEBIDA_ACEITE]: [ESTADO_DEV_PAGA],
  [ESTADO_DEV_RECEBIDA_NAO_ACEITE]: [],
  [ESTADO_DEV_PAGA]: [],
};

const ESTADOS_LABELS = {
  AguardarPagamento: 'Confirmação e a Aguardar Pagamento',
  PagamentoEfectuado: 'Pagamento Efectuado',
  EmPreparacao: 'Encomenda em Preparação',
  Enviada: 'Encomenda Enviada',
  [ESTADO_RECEBIDA_CONFORME]: 'Recebida pelo Cliente e Estava Tudo Conforme, sem Necessidade de Devolução ou Troca',
  Anulada: 'Encomenda Anulada',
  [ESTADO_DEV_NOTA_EMITIDA]: 'Nota de Devolução Emitida',
  [ESTADO_DEV_RECEBIDA_ACEITE]: 'Devolução Recebida e Aceite',
  [ESTADO_DEV_RECEBIDA_NAO_ACEITE]: 'Devolução Recebida mas Não Aceite',
  [ESTADO_DEV_PAGA]: 'Devolução Paga',
};

function proximoEstado(estadoActual) {
  const indice = SEQUENCIA_ESTADOS.indexOf(estadoActual);
  if (indice === -1 || indice === SEQUENCIA_ESTADOS.length - 1) return null;
  return SEQUENCIA_ESTADOS[indice + 1];
}

function ehEstadoDevolucao(estado) {
  return ESTADOS_DEVOLUCAO.includes(estado);
}

function proximosEstadosDevolucao(estadoActual) {
  return TRANSICOES_DEVOLUCAO[estadoActual] || [];
}

module.exports = {
  SEQUENCIA_ESTADOS,
  ESTADO_ANULADA,
  ESTADO_RECEBIDA_CONFORME,
  ESTADO_DEV_NOTA_EMITIDA,
  ESTADO_DEV_RECEBIDA_ACEITE,
  ESTADO_DEV_RECEBIDA_NAO_ACEITE,
  ESTADO_DEV_PAGA,
  ESTADOS_DEVOLUCAO,
  ESTADOS_LABELS,
  proximoEstado,
  ehEstadoDevolucao,
  proximosEstadosDevolucao,
};
