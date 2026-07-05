// Fluxo de estados da encomenda, gerido no Backoffice (Admin). Sequência linear:
// AguardarPagamento → PagamentoEfectuado → EmPreparacao → Enviada, com Anulada
// disponível em qualquer estado antes de Enviada (ver routes/admin.js).
// Os pontos de fidelização só são atribuídos definitivamente quando o estado
// passa a Enviada (ver routes/encomendas.js e routes/admin.js).
const SEQUENCIA_ESTADOS = ['AguardarPagamento', 'PagamentoEfectuado', 'EmPreparacao', 'Enviada'];

const ESTADO_ANULADA = 'Anulada';

const ESTADOS_LABELS = {
  AguardarPagamento: 'Confirmação e a Aguardar Pagamento',
  PagamentoEfectuado: 'Pagamento Efectuado',
  EmPreparacao: 'Encomenda em Preparação',
  Enviada: 'Encomenda Enviada',
  Anulada: 'Encomenda Anulada',
};

function proximoEstado(estadoActual) {
  const indice = SEQUENCIA_ESTADOS.indexOf(estadoActual);
  if (indice === -1 || indice === SEQUENCIA_ESTADOS.length - 1) return null;
  return SEQUENCIA_ESTADOS[indice + 1];
}

module.exports = { SEQUENCIA_ESTADOS, ESTADO_ANULADA, ESTADOS_LABELS, proximoEstado };
