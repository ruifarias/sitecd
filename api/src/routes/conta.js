// Área de cliente: histórico de encomendas, saldo de pontos e vales. Todas as
// rotas exigem autenticação (requireAuth define req.cliente.id a partir do JWT).
const express = require('express');
const crypto = require('crypto');
const { getPool, sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { ESTADOS_LABELS } = require('../constants/encomendaEstados');
const { gerarPdfEncomenda } = require('../services/pdf');
const { separarNomeVariante } = require('../services/email');
const { registarDevolucao } = require('../services/devolucaoService');

const router = express.Router();
router.use(requireAuth);

// GET /api/conta/perfil
router.get('/perfil', async (req, res) => {
  try {
    const pool = await getPool();
    const resultado = await pool.request()
      .input('id', sql.Int, req.cliente.id)
      .query('SELECT Nome, Email, Telefone, NIF, Morada, Localidade, Codigo_Postal, Codigo_Cliente FROM dbo.ZAPP_DBSiteCD_Clientes WHERE Id = @id;');

    if (resultado.recordset.length === 0) {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }
    const c = resultado.recordset[0];
    res.json({
      nome: c.Nome,
      email: c.Email,
      telefone: c.Telefone,
      nif: c.NIF,
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

// PUT /api/conta/perfil - o cliente edita os seus próprios dados, incluindo a
// morada de entrega por omissão (pré-preenchida no checkout, mas alterável
// por encomenda).
router.put('/perfil', async (req, res) => {
  const { nome, telefone, nif, morada, localidade, codigoPostal } = req.body;
  if (!nome || !nome.trim()) {
    return res.status(400).json({ erro: 'O nome é obrigatório.' });
  }

  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.cliente.id)
      .input('nome', sql.NVarChar(150), nome.trim())
      .input('telefone', sql.NVarChar(30), telefone || null)
      .input('nif', sql.VarChar(20), nif || null)
      .input('morada', sql.NVarChar(200), morada || null)
      .input('localidade', sql.NVarChar(100), localidade || null)
      .input('codigoPostal', sql.VarChar(10), codigoPostal || null)
      .query(`
        UPDATE dbo.ZAPP_DBSiteCD_Clientes
        SET Nome = @nome, Telefone = @telefone, NIF = @nif,
            Morada = @morada, Localidade = @localidade, Codigo_Postal = @codigoPostal
        WHERE Id = @id;
      `);
    res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao guardar os dados.' });
  }
});

// GET /api/conta/encomendas - lista resumida das encomendas do cliente autenticado
router.get('/encomendas', async (req, res) => {
  try {
    const pool = await getPool();
    const resultado = await pool.request()
      .input('clienteId', sql.Int, req.cliente.id)
      .query(`
        SELECT Numero, Estado, Total, Portes, Pontos_Ganhos, Metodo_Pagamento, Data_Criacao
        FROM dbo.ZAPP_DBSiteCD_Encomendas
        WHERE Cliente_Id = @clienteId
        ORDER BY Data_Criacao DESC;
      `);

    res.json(resultado.recordset.map((e) => ({
      numero: e.Numero,
      estado: e.Estado,
      estadoLabel: ESTADOS_LABELS[e.Estado] || e.Estado,
      total: e.Total,
      portes: e.Portes,
      pontosGanhos: e.Pontos_Ganhos,
      metodoPagamento: e.Metodo_Pagamento,
      data: e.Data_Criacao,
      podeDevolver: e.Estado === 'Enviada',
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar encomendas.' });
  }
});

// GET /api/conta/encomendas/:numero - detalhe, só se pertencer ao cliente autenticado
router.get('/encomendas/:numero', async (req, res) => {
  try {
    const pool = await getPool();
    const encomenda = await pool.request()
      .input('numero', sql.VarChar(30), req.params.numero)
      .input('clienteId', sql.Int, req.cliente.id)
      .query(`
        SELECT Id, Numero, Estado, Total, Portes, Vale_Codigo, Vale_Desconto, Pontos_Ganhos, Metodo_Pagamento, Data_Criacao, Motivo_Anulacao
        FROM dbo.ZAPP_DBSiteCD_Encomendas
        WHERE Numero = @numero AND Cliente_Id = @clienteId;
      `);

    if (encomenda.recordset.length === 0) {
      return res.status(404).json({ erro: 'Encomenda não encontrada.' });
    }
    const e = encomenda.recordset[0];

    const linhas = await pool.request()
      .input('encomendaId', sql.Int, e.Id)
      .query(`
        SELECT l.Codigo_Artigo, l.Codigo_Lote, l.Descricao, l.Quantidade, l.Preco_Unitario, l.Preco_Venda, l.Desconto,
               ISNULL((
                 SELECT SUM(dl.Quantidade)
                 FROM dbo.ZAPP_DBSiteCD_DevolucoesLinhas dl
                 JOIN dbo.ZAPP_DBSiteCD_Devolucoes d ON d.Id = dl.Devolucao_Id
                 WHERE d.Encomenda_Id = l.Encomenda_Id AND dl.Codigo_Artigo = l.Codigo_Artigo AND dl.Codigo_Lote = l.Codigo_Lote
               ), 0) AS Quantidade_Devolvida
        FROM dbo.ZAPP_DBSiteCD_EncomendasLinhas l
        WHERE l.Encomenda_Id = @encomendaId;
      `);

    const totalProdutos = linhas.recordset.reduce((s, l) => s + l.Preco_Unitario * l.Quantidade, 0);
    const podeDevolver = e.Estado === 'Enviada';

    res.json({
      numero: e.Numero,
      estado: e.Estado,
      estadoLabel: ESTADOS_LABELS[e.Estado] || e.Estado,
      total: e.Total,
      totalProdutos,
      portes: e.Portes,
      valeCodigo: e.Vale_Codigo,
      valeDesconto: e.Vale_Desconto,
      pontosGanhos: e.Pontos_Ganhos,
      metodoPagamento: e.Metodo_Pagamento,
      data: e.Data_Criacao,
      motivoAnulacao: e.Motivo_Anulacao,
      podeDevolver,
      linhas: linhas.recordset.map((l) => {
        const { nome, variante } = separarNomeVariante(l.Descricao);
        return {
          codigoArtigo: l.Codigo_Artigo,
          codigoLote: l.Codigo_Lote,
          descricao: l.Descricao,
          nome,
          variante,
          quantidade: l.Quantidade,
          precoUnitario: l.Preco_Unitario,
          precoVenda: l.Preco_Venda,
          desconto: l.Desconto,
          descontoPercentagem: l.Preco_Venda > 0 ? Math.round((l.Desconto / l.Preco_Venda) * 100) : 0,
          valorLiquido: Math.round(l.Preco_Unitario * l.Quantidade * 100) / 100,
          quantidadeDevolvida: l.Quantidade_Devolvida,
          quantidadeDevolvivel: l.Quantidade - l.Quantidade_Devolvida,
        };
      }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao obter encomenda.' });
  }
});

// GET /api/conta/encomendas/:numero/devolucoes - histórico de devoluções desta
// encomenda, só se pertencer ao cliente autenticado
router.get('/encomendas/:numero/devolucoes', async (req, res) => {
  try {
    const pool = await getPool();
    const encomendaRes = await pool.request()
      .input('numero', sql.VarChar(30), req.params.numero)
      .input('clienteId', sql.Int, req.cliente.id)
      .query('SELECT Id FROM dbo.ZAPP_DBSiteCD_Encomendas WHERE Numero = @numero AND Cliente_Id = @clienteId;');

    if (encomendaRes.recordset.length === 0) {
      return res.status(404).json({ erro: 'Encomenda não encontrada.' });
    }
    const encomendaId = encomendaRes.recordset[0].Id;

    const devolucoes = await pool.request()
      .input('encomendaId', sql.Int, encomendaId)
      .query(`
        SELECT Id, Valor_Devolvido, Pontos_Estornados, Data_Criacao
        FROM dbo.ZAPP_DBSiteCD_Devolucoes
        WHERE Encomenda_Id = @encomendaId
        ORDER BY Data_Criacao DESC;
      `);

    const resultado = [];
    for (const d of devolucoes.recordset) {
      const linhas = await pool.request()
        .input('devolucaoId', sql.Int, d.Id)
        .query('SELECT Codigo_Artigo, Codigo_Lote, Descricao, Quantidade, Preco_Unitario FROM dbo.ZAPP_DBSiteCD_DevolucoesLinhas WHERE Devolucao_Id = @devolucaoId;');

      resultado.push({
        id: d.Id,
        valorDevolvido: d.Valor_Devolvido,
        pontosEstornados: d.Pontos_Estornados,
        data: d.Data_Criacao,
        linhas: linhas.recordset.map((l) => ({
          codigoArtigo: l.Codigo_Artigo,
          codigoLote: l.Codigo_Lote,
          descricao: l.Descricao,
          quantidade: l.Quantidade,
          precoUnitario: l.Preco_Unitario,
        })),
      });
    }

    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao obter devoluções.' });
  }
});

// POST /api/conta/encomendas/:numero/devolucao - o próprio cliente regista a
// devolução de artigos de uma encomenda já enviada (os portes nunca são
// devolvidos). Gera de imediato uma Nota de Devolução (DEV+número) e estorna
// os pontos proporcionalmente - ver services/devolucaoService.js.
router.post('/encomendas/:numero/devolucao', async (req, res) => {
  try {
    const pool = await getPool();
    const dono = await pool.request()
      .input('numero', sql.VarChar(30), req.params.numero)
      .input('clienteId', sql.Int, req.cliente.id)
      .query('SELECT Id FROM dbo.ZAPP_DBSiteCD_Encomendas WHERE Numero = @numero AND Cliente_Id = @clienteId;');

    if (dono.recordset.length === 0) {
      return res.status(404).json({ erro: 'Encomenda não encontrada.' });
    }

    const resultado = await registarDevolucao(req.params.numero, req.body.linhas, {
      iban: req.body.iban,
      nomeTitular: req.body.nomeTitular,
    });
    if (resultado.erro) {
      return res.status(resultado.status || 500).json({ erro: resultado.erro });
    }
    res.status(201).json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao registar devolução.' });
  }
});

// GET /api/conta/encomendas/:numero/pdf - exportação da encomenda em PDF
router.get('/encomendas/:numero/pdf', async (req, res) => {
  try {
    const pool = await getPool();
    const dono = await pool.request()
      .input('numero', sql.VarChar(30), req.params.numero)
      .input('clienteId', sql.Int, req.cliente.id)
      .query('SELECT Id FROM dbo.ZAPP_DBSiteCD_Encomendas WHERE Numero = @numero AND Cliente_Id = @clienteId;');

    if (dono.recordset.length === 0) {
      return res.status(404).json({ erro: 'Encomenda não encontrada.' });
    }

    const pdfBuffer = await gerarPdfEncomenda(req.params.numero);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.numero}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao gerar PDF da encomenda.' });
  }
});

// GET /api/conta/pontos - saldo + histórico do livro-razão
router.get('/pontos', async (req, res) => {
  try {
    const pool = await getPool();
    const saldoRes = await pool.request()
      .input('clienteId', sql.Int, req.cliente.id)
      .query('SELECT ISNULL(SUM(Pontos), 0) AS Saldo FROM dbo.ZAPP_DBSiteCD_PontosLedger WHERE Cliente_Id = @clienteId;');

    const historicoRes = await pool.request()
      .input('clienteId', sql.Int, req.cliente.id)
      .query(`
        SELECT TOP 50 Tipo, Pontos, Descricao, Data_Criacao
        FROM dbo.ZAPP_DBSiteCD_PontosLedger
        WHERE Cliente_Id = @clienteId
        ORDER BY Data_Criacao DESC;
      `);

    // Pontos de encomendas ainda não enviadas/anuladas - só entram no saldo
    // usável quando o Backoffice marcar a encomenda como "Enviada".
    const pendentesRes = await pool.request()
      .input('clienteId', sql.Int, req.cliente.id)
      .query(`
        SELECT ISNULL(SUM(Pontos_Ganhos), 0) AS Pendentes
        FROM dbo.ZAPP_DBSiteCD_Encomendas
        WHERE Cliente_Id = @clienteId AND Estado NOT IN ('Enviada', 'Anulada');
      `);

    res.json({
      saldo: saldoRes.recordset[0].Saldo,
      pontosPendentes: pendentesRes.recordset[0].Pendentes,
      historico: historicoRes.recordset.map((h) => ({
        tipo: h.Tipo,
        pontos: h.Pontos,
        descricao: h.Descricao,
        data: h.Data_Criacao,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao obter saldo de pontos.' });
  }
});

// GET /api/conta/vales - lista de vales do cliente
router.get('/vales', async (req, res) => {
  try {
    const pool = await getPool();
    const resultado = await pool.request()
      .input('clienteId', sql.Int, req.cliente.id)
      .query(`
        SELECT Codigo, Valor, Estado, Data_Criacao, Data_Utilizacao
        FROM dbo.ZAPP_DBSiteCD_Vales
        WHERE Cliente_Id = @clienteId
        ORDER BY Data_Criacao DESC;
      `);

    res.json(resultado.recordset.map((v) => ({
      codigo: v.Codigo,
      valor: v.Valor,
      estado: v.Estado,
      data: v.Data_Criacao,
      dataUtilizacao: v.Data_Utilizacao,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar vales.' });
  }
});

// POST /api/conta/vales/trocar - troca um lote fixo de pontos (Config.PontosParaVale)
// por um vale de Config.ValorVale euros. Transacção com UPDLOCK/HOLDLOCK evita
// trocas concorrentes do mesmo cliente gastarem mais pontos do que o saldo permite
// (mesmo padrão de bloqueio de reserva de stock usado em encomendas.js).
router.post('/vales/trocar', async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const configReq = new sql.Request(transaction);
    const configRes = await configReq.query(`
      SELECT Chave, Valor FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave IN ('PontosParaVale', 'ValorVale');
    `);
    const config = {};
    configRes.recordset.forEach((r) => { config[r.Chave] = r.Valor; });
    const pontosParaVale = parseInt(config.PontosParaVale, 10) || 100;
    const valorVale = parseFloat(config.ValorVale) || 5;

    const saldoReq = new sql.Request(transaction);
    const saldoRes = await saldoReq
      .input('clienteId', sql.Int, req.cliente.id)
      .query(`
        SELECT ISNULL(SUM(Pontos), 0) AS Saldo
        FROM dbo.ZAPP_DBSiteCD_PontosLedger WITH (UPDLOCK, HOLDLOCK)
        WHERE Cliente_Id = @clienteId;
      `);
    const saldo = saldoRes.recordset[0].Saldo;

    if (saldo < pontosParaVale) {
      await transaction.rollback();
      return res.status(400).json({ erro: `Saldo insuficiente. Precisa de ${pontosParaVale} pontos, tem ${saldo}.` });
    }

    const ledgerReq = new sql.Request(transaction);
    const ledger = await ledgerReq
      .input('clienteId', sql.Int, req.cliente.id)
      .input('pontos', sql.Int, -pontosParaVale)
      .input('descricao', sql.NVarChar(200), `Troca por vale de ${valorVale.toFixed(2)}€`)
      .query(`
        INSERT INTO dbo.ZAPP_DBSiteCD_PontosLedger (Cliente_Id, Tipo, Pontos, Descricao)
        OUTPUT inserted.Id
        VALUES (@clienteId, 'Gasto', @pontos, @descricao);
      `);
    const ledgerId = ledger.recordset[0].Id;

    const codigo = `VALE-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const valeReq = new sql.Request(transaction);
    await valeReq
      .input('codigo', sql.VarChar(20), codigo)
      .input('clienteId', sql.Int, req.cliente.id)
      .input('valor', sql.Money, valorVale)
      .input('ledgerId', sql.Int, ledgerId)
      .query(`
        INSERT INTO dbo.ZAPP_DBSiteCD_Vales (Codigo, Cliente_Id, Valor, Pontos_Ledger_Id)
        VALUES (@codigo, @clienteId, @valor, @ledgerId);
      `);

    await transaction.commit();
    res.status(201).json({ codigo, valor: valorVale, pontosUtilizados: pontosParaVale });
  } catch (err) {
    console.error(err);
    try { await transaction.rollback(); } catch (_) { /* já pode ter sido revertida */ }
    res.status(500).json({ erro: 'Falha ao trocar pontos por vale.' });
  }
});

module.exports = router;
