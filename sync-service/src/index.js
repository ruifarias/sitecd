// Serviço de sincronização - modo automático (agendado) + disparo manual.
// Espelha o comportamento do Sincronizador actual (WebPostData): sincronização
// automática de hora a hora, com opção de correr imediatamente.
// Ver PLANO_PROJETO.md secção 2.5/2.6.
require('dotenv').config();
const http = require('http');
const cron = require('node-cron');
const { runSync } = require('./sync');
const { sql, getLockConnection } = require('./db');

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

const LOCK_RESOURCE = 'ZAPP_DBSiteCD_Sync';

let aCorrer = false;
let ultimaExecucao = null; // { motivo, inicio, fim, sucesso, erro }

// Exclusão mútua entre processos (não só dentro deste): usa sp_getapplock do
// SQL Server, para que, mesmo que fiquem por engano vários processos deste
// serviço a correr ao mesmo tempo (já aconteceu - ver log.txt 10/07 17h/18h,
// dezenas de sincronizações simultâneas causaram erros aleatórios em cascata),
// só uma sincronização execute de facto de cada vez. @LockTimeout=0 significa
// que, se outro processo já tem o lock, falha logo em vez de esperar/empilhar.
async function obterLock() {
  const conn = await getLockConnection();
  const resultado = await conn.request()
    .input('resource', sql.VarChar(255), LOCK_RESOURCE)
    .input('mode', sql.VarChar(32), 'Exclusive')
    .input('owner', sql.VarChar(32), 'Session')
    .input('timeout', sql.Int, 0)
    .query(`
      DECLARE @codigo INT;
      EXEC @codigo = sp_getapplock @Resource = @resource, @LockMode = @mode, @LockOwner = @owner, @LockTimeout = @timeout;
      SELECT @codigo AS codigo;
    `);
  return resultado.recordset[0].codigo >= 0; // 0 ou 1 = obtido; negativo = falhou
}

async function libertarLock() {
  const conn = await getLockConnection();
  await conn.request()
    .input('resource', sql.VarChar(255), LOCK_RESOURCE)
    .input('owner', sql.VarChar(32), 'Session')
    .query('EXEC sp_releaseapplock @Resource = @resource, @LockOwner = @owner;');
}

async function correrComLock(motivo) {
  if (aCorrer) {
    console.log(`Sincronizacao ja em curso (neste processo), a ignorar disparo (${motivo}).`);
    return;
  }
  aCorrer = true;
  const inicio = new Date();
  let obtido = false;
  try {
    obtido = await obterLock();
    if (!obtido) {
      console.log(`Sincronizacao ja em curso (noutro processo), a ignorar disparo (${motivo}).`);
      return;
    }
    await runSync();
    ultimaExecucao = { motivo, inicio, fim: new Date(), sucesso: true };
  } catch (err) {
    console.error('Sincronizacao terminou com erro:', err.message);
    ultimaExecucao = { motivo, inicio, fim: new Date(), sucesso: false, erro: err.message };
  } finally {
    if (obtido) {
      try {
        await libertarLock();
      } catch (err) {
        console.error('Erro ao libertar lock (não fatal):', err.message);
      }
    }
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
