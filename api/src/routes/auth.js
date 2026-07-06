// Registo/login de clientes. Password com bcryptjs (sem compilação nativa,
// evita problemas do bcrypt em Windows sem toolchain de compilação).
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool, sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { enviarEmailRecuperacaoPassword } = require('../services/email');
const { normalizarNif } = require('../utils/nif');

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
  if (!telefone || !telefone.trim()) {
    return res.status(400).json({ erro: 'O telefone é obrigatório.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ erro: 'A password deve ter pelo menos 8 caracteres.' });
  }
  const nifValidado = normalizarNif(nif);
  if (!nifValidado.ok) {
    return res.status(400).json({ erro: nifValidado.erro });
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
        .input('telefone', sql.NVarChar(30), telefone.trim())
        .input('nif', sql.VarChar(20), nifValidado.nif)
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
        .input('telefone', sql.NVarChar(30), telefone.trim())
        .input('nif', sql.VarChar(20), nifValidado.nif)
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

// POST /api/auth/recuperar-password - gera um token de uso único (válido 1h)
// e envia por email um link para /redefinir-password.html?token=... . Responde
// sempre com sucesso (mesmo se o email não existir), para não revelar quais
// emails estão registados.
router.post('/recuperar-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ erro: 'O email é obrigatório.' });
  }

  try {
    const pool = await getPool();
    const resultado = await pool.request()
      .input('email', sql.NVarChar(150), email)
      .query('SELECT Id, Nome, Password_Hash FROM dbo.ZAPP_DBSiteCD_Clientes WHERE Email = @email;');

    if (resultado.recordset.length > 0 && resultado.recordset[0].Password_Hash) {
      const cliente = resultado.recordset[0];
      const token = crypto.randomBytes(32).toString('hex');
      const expira = new Date(Date.now() + 60 * 60 * 1000);

      await pool.request()
        .input('id', sql.Int, cliente.Id)
        .input('token', sql.VarChar(64), token)
        .input('expira', sql.DateTime, expira)
        .query('UPDATE dbo.ZAPP_DBSiteCD_Clientes SET Reset_Token = @token, Reset_Token_Expira = @expira WHERE Id = @id;');

      const link = `${process.env.FRONTEND_BASE_URL || 'http://localhost:3000'}/redefinir-password.html?token=${token}`;
      enviarEmailRecuperacaoPassword(email, cliente.Nome, link).catch(() => {});
    }

    res.json({ ok: true, mensagem: 'Se o email estiver registado, receberá um link para recuperar a password.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao processar o pedido de recuperação de password.' });
  }
});

// POST /api/auth/redefinir-password - valida o token (e a sua validade) e
// define a nova password.
router.post('/redefinir-password', async (req, res) => {
  const { token, novaPassword } = req.body;
  if (!token || !novaPassword) {
    return res.status(400).json({ erro: 'Token e nova password são obrigatórios.' });
  }
  if (novaPassword.length < 8) {
    return res.status(400).json({ erro: 'A password deve ter pelo menos 8 caracteres.' });
  }

  try {
    const pool = await getPool();
    const resultado = await pool.request()
      .input('token', sql.VarChar(64), token)
      .query('SELECT Id, Reset_Token_Expira FROM dbo.ZAPP_DBSiteCD_Clientes WHERE Reset_Token = @token;');

    if (resultado.recordset.length === 0) {
      return res.status(400).json({ erro: 'Link de recuperação inválido ou já utilizado.' });
    }
    const cliente = resultado.recordset[0];
    if (!cliente.Reset_Token_Expira || new Date(cliente.Reset_Token_Expira) < new Date()) {
      return res.status(400).json({ erro: 'Link de recuperação expirado. Peça um novo.' });
    }

    const passwordHash = await bcrypt.hash(novaPassword, 10);
    await pool.request()
      .input('id', sql.Int, cliente.Id)
      .input('passwordHash', sql.NVarChar(255), passwordHash)
      .query(`
        UPDATE dbo.ZAPP_DBSiteCD_Clientes
        SET Password_Hash = @passwordHash, Reset_Token = NULL, Reset_Token_Expira = NULL
        WHERE Id = @id;
      `);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao redefinir a password.' });
  }
});

// GET /api/auth/perfil
router.get('/perfil', requireAuth, async (req, res) => {
  try {
    const pool = await getPool();
    const resultado = await pool.request()
      .input('id', sql.Int, req.cliente.id)
      .query('SELECT Nome, Email, Telefone, NIF, IsAdmin, Morada, Localidade, Codigo_Postal, Codigo_Cliente FROM dbo.ZAPP_DBSiteCD_Clientes WHERE Id = @id;');

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
      codigoCliente: c.Codigo_Cliente,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao obter perfil.' });
  }
});

module.exports = router;
