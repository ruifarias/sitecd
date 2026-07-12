// Integração MB WAY via Ifthenpay (SPG API) - ver
// https://ifthenpay.com/docs/en/api/mbway/ e código-fonte público do SDK PHP
// oficial (github.com/ifthenpay/ifthenpay-sdk-php) para os campos e códigos
// exactos, já que a documentação online é uma SPA que não expõe o conteúdo a
// um simples pedido HTTP.
const MBWAY_INIT_URL = 'https://api.ifthenpay.com/spg/payment/mbway';
const MBWAY_STATUS_URL = 'https://api.ifthenpay.com/spg/payment/mbway/status';

// Códigos devolvidos pelo pedido de pagamento (POST /spg/payment/mbway).
const INIT_STATUS = {
  SUCESSO: '000', // pedido enviado à app do cliente, a aguardar aceitação
  ERRO: '999',
  INCOMPLETO: '100',
  RECUSADO_SIBS: '122',
  CHAVE_INVALIDA: '-1',
};

// Códigos devolvidos pela consulta de estado (GET .../status) - note que "000"
// aqui significa "pago", ao contrário do pedido acima onde "000" só confirma
// que o pedido foi enviado (números iguais, significados diferentes).
const ESTADO_STATUS = {
  PENDENTE: '123',
  PAGO: '000',
  REJEITADO_PELO_CLIENTE: '020',
  EXPIRADO: '101',
  RECUSADO: '122',
};

function obterChave() {
  const chave = process.env.IFTHENPAY_MBWAY_KEY;
  if (!chave) throw new Error('MB WAY indisponível: IFTHENPAY_MBWAY_KEY não configurada no servidor.');
  return chave;
}

// orderId: identificador único (a nossa Numero de encomenda, ex: ENC000123).
// amount: string com 2 casas decimais (ex: "49.90").
// mobileNumber: formato "351#912345678".
async function pedirPagamentoMbway({ orderId, amount, mobileNumber, email, description }) {
  const mbWayKey = obterChave();

  const res = await fetch(MBWAY_INIT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mbWayKey, orderId, amount, mobileNumber, email, description }),
  });
  const dados = await res.json();

  if (dados.Status === INIT_STATUS.SUCESSO) {
    return { requestId: dados.RequestId };
  }

  const mensagens = {
    [INIT_STATUS.ERRO]: 'Erro ao iniciar o pedido MB WAY. Tente novamente.',
    [INIT_STATUS.INCOMPLETO]: 'Não foi possível completar o pedido MB WAY. Tente novamente.',
    [INIT_STATUS.RECUSADO_SIBS]: 'Pedido MB WAY recusado. Verifique o número de telemóvel.',
    [INIT_STATUS.CHAVE_INVALIDA]: 'MB WAY mal configurado (chave inválida) - contacte a loja.',
  };
  throw new Error(mensagens[dados.Status] || `Erro MB WAY desconhecido (${dados.Status || res.status}).`);
}

// Devolve um de: 'Pendente', 'Pago', 'Rejeitado', 'Expirado', 'Recusado'.
async function consultarEstadoMbway(requestId) {
  const mbWayKey = obterChave();

  const params = new URLSearchParams({ mbWayKey, requestId });
  const res = await fetch(`${MBWAY_STATUS_URL}?${params.toString()}`);
  const dados = await res.json();

  switch (dados.Status) {
    case ESTADO_STATUS.PAGO: return 'Pago';
    case ESTADO_STATUS.PENDENTE: return 'Pendente';
    case ESTADO_STATUS.REJEITADO_PELO_CLIENTE: return 'Rejeitado';
    case ESTADO_STATUS.EXPIRADO: return 'Expirado';
    case ESTADO_STATUS.RECUSADO: return 'Recusado';
    default: throw new Error(`Estado MB WAY desconhecido (${dados.Status || res.status}).`);
  }
}

module.exports = { pedirPagamentoMbway, consultarEstadoMbway };
