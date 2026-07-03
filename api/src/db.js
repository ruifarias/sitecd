require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.TSERVER_HOST.split('\\')[0],
  options: {
    instanceName: process.env.TSERVER_HOST.split('\\')[1],
    trustServerCertificate: true,
    encrypt: false,
  },
  user: process.env.TSERVER_USER,
  password: process.env.TSERVER_PASSWORD,
  database: process.env.DBSITECD_NAME,
};

let pool = null;

async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
    // sem este handler, um erro de ligação (rede, timeout) faz o EventEmitter
    // atirar uma excepção nao apanhada e derruba TODO o processo Node (bug real
    // encontrado em 2026-07-02 - o site "caiu" ao mudar a ordenação, coincidência
    // com um blip de rede à BD). Com o handler, só regista e o pool tenta recuperar.
    pool.on('error', (err) => {
      console.error('Erro na pool de ligação à BD (não fatal):', err.message);
    });
  }
  return pool;
}

module.exports = { sql, getPool };
