// Validação de IBAN (algoritmo mod-97, ISO 13616). Especificamente para
// Portugal: "PT" + 23 dígitos = 25 caracteres no total.
function validarIBAN(ibanInput) {
  const iban = (ibanInput || '').replace(/\s+/g, '').toUpperCase();
  if (!/^PT\d{23}$/.test(iban)) return false;

  const rearranjado = iban.slice(4) + iban.slice(0, 4);
  const numerico = rearranjado.replace(/[A-Z]/g, (ch) => (ch.charCodeAt(0) - 55).toString());

  let resto = numerico;
  while (resto.length > 9) {
    const bloco = resto.slice(0, 9);
    resto = String(parseInt(bloco, 10) % 97) + resto.slice(bloco.length);
  }
  return parseInt(resto, 10) % 97 === 1;
}

module.exports = { validarIBAN };
