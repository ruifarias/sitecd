// Validação do dígito de controlo do NIF português (9 dígitos). Quando o NIF
// não é indicado, a convenção do site é gravar "Consumidor Final" em vez de
// deixar o campo vazio - por isso normalizarNif() trata esse valor sentinela
// como válido e só valida o dígito de controlo quando são mesmo 9 dígitos.
const CONSUMIDOR_FINAL = 'Consumidor Final';

function validarNIF(nif) {
  if (!/^\d{9}$/.test(nif)) return false;
  const digitos = nif.split('').map(Number);
  const soma = digitos.slice(0, 8).reduce((acc, d, i) => acc + d * (9 - i), 0);
  const resto = soma % 11;
  const digitoControlo = resto < 2 ? 0 : 11 - resto;
  return digitoControlo === digitos[8];
}

// Devolve { ok: true, nif } ou { ok: false, erro } - nunca lança excepção.
function normalizarNif(nifInput) {
  const nif = (nifInput || '').trim();
  if (!nif || nif === CONSUMIDOR_FINAL) {
    return { ok: true, nif: CONSUMIDOR_FINAL };
  }
  if (!validarNIF(nif)) {
    return { ok: false, erro: 'NIF inválido.' };
  }
  return { ok: true, nif };
}

module.exports = { validarNIF, normalizarNif, CONSUMIDOR_FINAL };
