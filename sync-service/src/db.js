require('dotenv').config();
const sql = require('mssql');

// Ligação ao TSERVER\SQLSERVER (mesma instância para DBClassico e DBSiteCD - secção 2.5/2.5.1)
function makeConfig(database) {
  return {
    server: process.env.TSERVER_HOST.split('\\')[0],
    options: {
      instanceName: process.env.TSERVER_HOST.split('\\')[1],
      trustServerCertificate: true,
      encrypt: false,
    },
    user: process.env.TSERVER_USER,
    password: process.env.TSERVER_PASSWORD,
    database,
  };
}

let classicoPool = null;
let sitecdPool = null;

async function getDBClassicoPool() {
  if (!classicoPool) {
    classicoPool = await sql.connect(makeConfig(process.env.DBCLASSICO_NAME));
    // sem isto, um erro de rede/timeout na ligação derruba o processo inteiro
    // (mesmo bug encontrado na api/ em 2026-07-02 - ver api/src/db.js)
    classicoPool.on('error', (err) => console.error('Erro na pool DBClassico (não fatal):', err.message));
  }
  return classicoPool;
}

// Nota: mssql usa um pool global por defeito (sql.connect); para duas bases
// diferentes na mesma instância usamos ConnectionPool dedicado para a segunda.
async function getDBSiteCDPool() {
  if (!sitecdPool) {
    sitecdPool = new sql.ConnectionPool(makeConfig(process.env.DBSITECD_NAME));
    await sitecdPool.connect();
    sitecdPool.on('error', (err) => console.error('Erro na pool DBSiteCD (não fatal):', err.message));
  }
  return sitecdPool;
}

module.exports = { sql, getDBClassicoPool, getDBSiteCDPool };
