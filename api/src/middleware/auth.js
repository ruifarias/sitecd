// Autenticação de clientes por JWT (Bearer token) - sem cookies/sessão, já que
// o CORS actual não usa credentials (secção "Autenticação" do plano de contas/pontos).
const jwt = require('jsonwebtoken');
const { getPool, sql } = require('../db');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ erro: 'Autenticação necessária.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.cliente = { id: payload.sub, email: payload.email };
    next();
  } catch (_) {
    res.status(401).json({ erro: 'Sessão inválida ou expirada. Inicie sessão novamente.' });
  }
}

// Restringe o acesso ao Backoffice a clientes com IsAdmin = 1 (ver migração 016).
// Usar sempre depois de requireAuth (precisa de req.cliente.id já definido).
async function requireAdmin(req, res, next) {
  try {
    const pool = await getPool();
    const resultado = await pool.request()
      .input('id', sql.Int, req.cliente.id)
      .query('SELECT IsAdmin FROM dbo.ZAPP_DBSiteCD_Clientes WHERE Id = @id;');

    if (resultado.recordset.length === 0 || !resultado.recordset[0].IsAdmin) {
      return res.status(403).json({ erro: 'Acesso reservado ao administrador do site.' });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao verificar permissões de acesso.' });
  }
}

module.exports = { requireAuth, requireAdmin };
