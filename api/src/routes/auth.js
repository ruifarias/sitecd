// Registo/login de clientes. Password com bcryptjs (sem compilação nativa,
// evita problemas do bcrypt em Windows sem toolchain de compilação).
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool, sql } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function assinarToken(cliente) {
  return jwt.sign({ sub: cliente.Id, email: cliente.Email }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// POST /api/auth/registo
router.post('/registo', async (req, res) => {
  const { nome, email, password, telefone, nif, morada, localidade, codigoPostal } = req.body;

  if (!nome || !email || !password) {
    return res.status(400).json({ erro: 'Nome, email e password são obrigatórios.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ erro: 'A password deve ter pelo menos 8 caracteres.' });
  }

  try {
    const pool = await getPool();

    const existente = await pool.request()
      .input('email', sql.NVarChar(150), email)
      .query('SELECT Id, Password_Hash FROM dbo.ZAPP_DBSiteCD_Clientes WHERE Email = @email;');

    const passwordHash = await bcrypt.hash(password, 10);

    let cliente;
    if (existente.recordset.length > 0) {
      const registo = existente.recordset[0];
      if (registo.Password_Hash) {
        return res.status(409).json({ erro: 'Este email já está registado. Inicie sessão.' });
      }
      // Conta criada antes (ex: checkout antigo sem password) - "reclama" a conta.
      const actualizado = await pool.request()
        .input('id', sql.Int, registo.Id)
        .input('nome', sql.NVarChar(150), nome)
        .input('passwordHash', sql.NVarChar(255), passwordHash)
        .input('telefone', sql.NVarChar(30), telefone || null)
        .input('nif', sql.VarChar(20), nif || null)
        .input('morada', sql.NVarChar(200), morada || null)
        .input('localidade', sql.NVarChar(100), localidade || null)
        .input('codigoPostal', sql.VarChar(10), codigoPostal || null)
        .query(`
          UPDATE dbo.ZAPP_DBSiteCD_Clientes
          SET Nome = @nome, Password_Hash = @passwordHash, Telefone = @telefone, NIF = @nif,
              Morada = @morada, Localidade = @localidade, Codigo_Postal = @codigoPostal
          OUTPUT inserted.Id, inserted.Nome, inserted.Email
          WHERE Id = @id;
        `);
      cliente = actualizado.recordset[0];
    } else {
      const criado = await pool.request()
        .input('nome', sql.NVarChar(150), nome)
        .input('email', sql.NVarChar(150), email)
        .input('passwordHash', sql.NVarChar(255), passwordHash)
        .input('telefone', sql.NVarChar(30), telefone || null)
        .input('nif', sql.VarChar(20), nif || null)
        .input('morada', sql.NVarChar(200), morada || null)
        .input('localidade', sql.NVarChar(100), localidade || null)
        .input('codigoPostal', sql.VarChar(10), codigoPostal || null)
        .query(`
          INSERT INTO dbo.ZAPP_DBSiteCD_Clientes (Nome, Email, Password_Hash, Telefone, NIF, Morada, Localidade, Codigo_Postal)
          OUTPUT inserted.Id, inserted.Nome, inserted.Email
          VALUES (@nome, @email, @passwordHash, @telefone, @nif, @morada, @localidade, @codigoPostal);
        `);
      cliente = criado.recordset[0];
    }

    const token = assinarToken({ Id: cliente.Id, Email: cliente.Email });
    res.status(201).json({ token, nome: cliente.Nome, email: cliente.Email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao registar cliente.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ erro: 'Email e password são obrigatórios.' });
  }

  const mensagemGenerica = { erro: 'Email ou password inválidos.' };

  try {
    const pool = await getPool();
    const resultado = await pool.request()
      .input('email', sql.NVarChar(150), email)
      .query('SELECT Id, Nome, Email, Password_Hash FROM dbo.ZAPP_DBSiteCD_Clientes WHERE Email = @email;');

    if (resultado.recordset.length === 0 || !resultado.recordset[0].Password_Hash) {
      return res.status(401).json(mensagemGenerica);
    }

    const cliente = resultado.recordset[0];
    const correcta = await bcrypt.compare(password, cliente.Password_Hash);
    if (!correcta) {
      return res.status(401).json(mensagemGenerica);
    }

    const token = assinarToken(cliente);
    res.json({ token, nome: cliente.Nome, email: cliente.Email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao iniciar sessão.' });
  }
});

// GET /api/auth/perfil
router.get('/perfil', requireAuth, async (req, res) => {
  try {
    const pool = await getPool();
    const resultado = await pool.request()
      .input('id', sql.Int, req.cliente.id)
      .query('SELECT Nome, Email, Telefone, NIF, IsAdmin, Morada, Localidade, Codigo_Postal FROM dbo.ZAPP_DBSiteCD_Clientes WHERE Id = @id;');

    if (resultado.recordset.length === 0) {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }
    const c = resultado.recordset[0];
    res.json({
      nome: c.Nome,
      email: c.Email,
      telefone: c.Telefone,
      nif: c.NIF,
      isAdmin: !!c.IsAdmin,
      morada: c.Morada,
      localidade: c.Localidade,
      codigoPostal: c.Codigo_Postal,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao obter perfil.' });
  }
});

module.exports = router;
