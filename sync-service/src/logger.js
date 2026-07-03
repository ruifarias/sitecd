// Log em ficheiro texto, no mesmo formato do Sincronizador actual (log.txt),
// além do registo em ZAPP_DBSiteCD_SyncLog (BD) - ver PLANO_PROJETO.md secção 2.6.1
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, '..', 'log.txt');

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function writeLine(text) {
  const line = `${timestamp()} : ${text}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function inicio() {
  writeLine('*'.repeat(28) + ' INICIO DE SINCRONISMO ' + '*'.repeat(28));
}

function fim() {
  writeLine('*'.repeat(28) + ' FIM DE SINCRONISMO ' + ' '.repeat(3) + '*'.repeat(28));
}

function tipo(nome, sucesso, registos, erro) {
  if (sucesso) {
    writeLine(`Sincronizacao do tipo "${nome}" efectuada com sucesso. ${registos} registo${registos === 1 ? '' : 's'} carregado${registos === 1 ? '' : 's'}.`);
  } else {
    writeLine(`Sincronizacao do tipo "${nome}" FALHOU. Erro: ${erro}`);
  }
}

module.exports = { inicio, fim, tipo, writeLine };
