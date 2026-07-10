// Serviço de sincronização - modo automático (agendado) + disparo manual.
// Espelha o comportamento do Sincronizador actual (WebPostData): sincronização
// automática de hora a hora, com opção de correr imediatamente.
// Ver PLANO_PROJETO.md secção 2.5/2.6.
require('dotenv').config();
const http = require('http');
const cron = require('node-cron');
const { runSync } = require('./sync');

// rede de segurança: um serviço agendado tem de sobreviver a erros pontuais
// (rede, BD) sem morrer - ver api/src/db.js para o bug original que motivou isto
process.on('unhandledRejection', (err) => {
  console.error('Promise rejeitada sem tratamento:', err);
});
process.on('uncaughtException', (err) => {
  console.error('Excepção não apanhada:', err);
});

const CRON_EXPRESSION = process.env.SYNC_CRON || '0 * * * *'; // de hora a hora, por omissao
const PORT = process.env.PORT || 8008;

let aCorrer = false;
let ultimaExecucao = null; // { motivo, inicio, fim, sucesso, erro }

async function correrComLock(motivo) {
  if (aCorrer) {
    console.log(`Sincronizacao ja em curso, a ignorar disparo (${motivo}).`);
    return;
  }
  aCorrer = true;
  const inicio = new Date();
  try {
    await runSync();
    ultimaExecucao = { motivo, inicio, fim: new Date(), sucesso: true };
  } catch (err) {
    console.error('Sincronizacao terminou com erro:', err.message);
    ultimaExecucao = { motivo, inicio, fim: new Date(), sucesso: false, erro: err.message };
  } finally {
    aCorrer = false;
  }
}

// Endpoint de estado (sem dependências extra), para se poder verificar que o
// serviço está de pé tal como os outros apps ZAPP (portas 800x) - não corre
// sincronizações, só reporta o estado do cron em memória.
http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    servico: 'zapp-dbsitecd-sync',
    agendamento: CRON_EXPRESSION,
    aCorrer,
    ultimaExecucao,
  }, null, 2));
}).listen(PORT, () => {
  console.log(`Serviço de sincronização: endpoint de estado em http://localhost:${PORT}`);
});

console.log(`Serviço de sincronização a arrancar. Agendamento: "${CRON_EXPRESSION}" (automático).`);
cron.schedule(CRON_EXPRESSION, () => correrComLock('automatico'));

// Sincronizar imediatamente ao arrancar o serviço, tal como "Sincronizar agora"
correrComLock('arranque');

process.on('SIGINT', () => {
  console.log('Serviço de sincronização a parar.');
  process.exit(0);
});
