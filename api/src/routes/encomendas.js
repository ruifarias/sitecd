// Checkout: cria Cliente/Morada/Encomenda/Linhas/Pagamento, reserva stock de
// forma atómica (evita overselling) e limpa o carrinho. Só o método "Dinheiro"
// está activo por agora (pagamento na entrega/levantamento) - MB WAY/Cartão/
// PayPal ficam para mais tarde, quando houver contas junto desses fornecedores
// (Ifthenpay/Stripe/PayPal - ver PLANO_PROJETO.md secção 2.4 e Fase 2 ponto 4).
const express = require('express');
const { getPool, sql } = require('../db');

const router = express.Router();

const METODOS_ACTIVOS = ['Dinheiro'];

router.post('/', async (req, res) => {
  const { sessaoId, cliente, morada, metodoPagamento } = req.body;

  if (!sessaoId || !cliente?.nome || !cliente?.email || !morada?.morada || !morada?.localidade || !morada?.codigoPostal) {
    return res.status(400).json({ erro: 'sessaoId, cliente (nome, email) e morada (morada, localidade, codigoPostal) são obrigatórios.' });
  }
  if (!METODOS_ACTIVOS.includes(metodoPagamento)) {
    return res.status(400).json({
      erro: `Método de pagamento inválido. De momento só está disponível: ${METODOS_ACTIVOS.join(', ')} (MB WAY/Cartão/PayPal ainda por integrar).`,
    });
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const carrinhoReq = new sql.Request(transaction);
    const carrinho = await carrinhoReq
      .input('sessaoId', sql.NVarChar(100), sessaoId)
      .query(`
        SELECT c.Id, c.Codigo_Artigo, c.Codigo_Lote, c.Quantidade, a.Descritivo_Artigo, v.Descricao_Lote,
               CASE WHEN p.Percentagem_Desconto > 0 THEN p.Preco_Outlet ELSE p.Preco END AS Preco
        FROM dbo.ZAPP_DBSiteCD_Carrinho c
        INNER JOIN dbo.ZAPP_DBSiteCD_Artigos a ON a.Codigo_Artigo = c.Codigo_Artigo
        LEFT JOIN dbo.ZAPP_DBSiteCD_Variantes v ON v.Codigo_Artigo = c.Codigo_Artigo AND v.Codigo_Lote = c.Codigo_Lote
        LEFT JOIN dbo.ZAPP_DBSiteCD_Precos p ON p.Codigo_Artigo = c.Codigo_Artigo
        WHERE c.Sessao_Id = @sessaoId;
      `);

    if (carrinho.recordset.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ erro: 'Carrinho vazio.' });
    }

    // reserva de stock atomica: bloqueia cada linha de stock e valida disponibilidade
    // antes de confirmar (WITH (UPDLOCK, HOLDLOCK) evita condicoes de corrida entre checkouts concorrentes)
    for (const linha of carrinho.recordset) {
      const stockReq = new sql.Request(transaction);
      const stock = await stockReq
        .input('codigoArtigo', sql.VarChar(20), linha.Codigo_Artigo)
        .input('codigoLote', sql.VarChar(50), linha.Codigo_Lote)
        .query(`
          SELECT Qtd_Disponivel, Qtd_Reservada
          FROM dbo.ZAPP_DBSiteCD_Stock WITH (UPDLOCK, HOLDLOCK)
          WHERE Codigo_Artigo = @codigoArtigo AND Codigo_Lote = @codigoLote AND Codigo_Armazem = '001';
        `);

      const disponivel = stock.recordset.length > 0
        ? stock.recordset[0].Qtd_Disponivel - stock.recordset[0].Qtd_Reservada
        : 0;

      if (disponivel < linha.Quantidade) {
        await transaction.rollback();
        return res.status(409).json({
          erro: `Stock insuficiente para ${linha.Descritivo_Artigo} (${linha.Descricao_Lote || linha.Codigo_Lote}). Disponível: ${disponivel}, pedido: ${linha.Quantidade}.`,
        });
      }
    }

    // cliente (encontra por email, ou cria)
    const clienteReq = new sql.Request(transaction);
    const clienteExistente = await clienteReq
      .input('email', sql.NVarChar(150), cliente.email)
      .query(`SELECT Id FROM dbo.ZAPP_DBSiteCD_Clientes WHERE Email = @email;`);

    let clienteId;
    if (clienteExistente.recordset.length > 0) {
      clienteId = clienteExistente.recordset[0].Id;
    } else {
      const novoClienteReq = new sql.Request(transaction);
      const novoCliente = await novoClienteReq
        .input('nome', sql.NVarChar(150), cliente.nome)
        .input('email', sql.NVarChar(150), cliente.email)
        .input('telefone', sql.NVarChar(30), cliente.telefone || null)
        .input('nif', sql.VarChar(20), cliente.nif || null)
        .query(`
          INSERT INTO dbo.ZAPP_DBSiteCD_Clientes (Nome, Email, Telefone, NIF)
          OUTPUT inserted.Id
          VALUES (@nome, @email, @telefone, @nif);
        `);
      clienteId = novoCliente.recordset[0].Id;
    }

    const moradaReq = new sql.Request(transaction);
    await moradaReq
      .input('clienteId', sql.Int, clienteId)
      .input('morada', sql.NVarChar(200), morada.morada)
      .input('localidade', sql.NVarChar(100), morada.localidade)
      .input('codigoPostal', sql.VarChar(10), morada.codigoPostal)
      .query(`
        INSERT INTO dbo.ZAPP_DBSiteCD_Moradas (Cliente_Id, Tipo, Morada, Localidade, Codigo_Postal)
        VALUES (@clienteId, 'Entrega', @morada, @localidade, @codigoPostal);
      `);

    const total = carrinho.recordset.reduce((soma, l) => soma + (l.Preco || 0) * l.Quantidade, 0);

    const encomendaReq = new sql.Request(transaction);
    const encomenda = await encomendaReq
      .input('clienteId', sql.Int, clienteId)
      .input('total', sql.Money, Math.round(total * 100) / 100)
      .input('metodo', sql.VarChar(30), metodoPagamento)
      .query(`
        INSERT INTO dbo.ZAPP_DBSiteCD_Encomendas (Numero, Cliente_Id, Estado, Total, Metodo_Pagamento)
        OUTPUT inserted.Id
        VALUES ('TEMP', @clienteId, 'Confirmada', @total, @metodo);
      `);
    const encomendaId = encomenda.recordset[0].Id;

    const numero = `ENC${String(encomendaId).padStart(6, '0')}`;
    const numeroReq = new sql.Request(transaction);
    await numeroReq
      .input('id', sql.Int, encomendaId)
      .input('numero', sql.VarChar(30), numero)
      .query(`UPDATE dbo.ZAPP_DBSiteCD_Encomendas SET Numero = @numero WHERE Id = @id;`);

    for (const linha of carrinho.recordset) {
      const linhaReq = new sql.Request(transaction);
      await linhaReq
        .input('encomendaId', sql.Int, encomendaId)
        .input('codigoArtigo', sql.VarChar(20), linha.Codigo_Artigo)
        .input('codigoLote', sql.VarChar(50), linha.Codigo_Lote)
        .input('descricao', sql.NVarChar(200), `${linha.Descritivo_Artigo} - ${linha.Descricao_Lote || linha.Codigo_Lote}`)
        .input('quantidade', sql.Int, linha.Quantidade)
        .input('precoUnitario', sql.Money, linha.Preco || 0)
        .query(`
          INSERT INTO dbo.ZAPP_DBSiteCD_EncomendasLinhas (Encomenda_Id, Codigo_Artigo, Codigo_Lote, Descricao, Quantidade, Preco_Unitario)
          VALUES (@encomendaId, @codigoArtigo, @codigoLote, @descricao, @quantidade, @precoUnitario);
        `);

      const reservaReq = new sql.Request(transaction);
      await reservaReq
        .input('codigoArtigo', sql.VarChar(20), linha.Codigo_Artigo)
        .input('codigoLote', sql.VarChar(50), linha.Codigo_Lote)
        .input('quantidade', sql.Int, linha.Quantidade)
        .query(`
          UPDATE dbo.ZAPP_DBSiteCD_Stock
          SET Qtd_Reservada = Qtd_Reservada + @quantidade
          WHERE Codigo_Artigo = @codigoArtigo AND Codigo_Lote = @codigoLote AND Codigo_Armazem = '001';
        `);
    }

    const pagamentoReq = new sql.Request(transaction);
    await pagamentoReq
      .input('encomendaId', sql.Int, encomendaId)
      .input('metodo', sql.VarChar(30), metodoPagamento)
      .query(`
        INSERT INTO dbo.ZAPP_DBSiteCD_Pagamentos (Encomenda_Id, Metodo, Estado)
        VALUES (@encomendaId, @metodo, 'A cobrar na entrega/levantamento');
      `);

    const limparCarrinhoReq = new sql.Request(transaction);
    await limparCarrinhoReq
      .input('sessaoId', sql.NVarChar(100), sessaoId)
      .query(`DELETE FROM dbo.ZAPP_DBSiteCD_Carrinho WHERE Sessao_Id = @sessaoId;`);

    await transaction.commit();

    res.status(201).json({
      numero,
      total: Math.round(total * 100) / 100,
      metodoPagamento,
      estado: 'Confirmada',
      mensagemPagamento: 'Pagamento a efectuar em dinheiro na entrega/levantamento (modo de teste - MB WAY/Cartão/PayPal ainda por integrar).',
    });
  } catch (err) {
    console.error(err);
    try { await transaction.rollback(); } catch (_) { /* já pode ter sido revertida */ }
    res.status(500).json({ erro: 'Falha ao processar encomenda.' });
  }
});

// GET /api/encomendas/:numero - consulta simples de estado
router.get('/:numero', async (req, res) => {
  try {
    const pool = await getPool();
    const encomenda = await pool.request()
      .input('numero', sql.VarChar(30), req.params.numero)
      .query(`SELECT Id, Numero, Estado, Total, Metodo_Pagamento, Data_Criacao FROM dbo.ZAPP_DBSiteCD_Encomendas WHERE Numero = @numero;`);

    if (encomenda.recordset.length === 0) {
      return res.status(404).json({ erro: 'Encomenda não encontrada.' });
    }
    const e = encomenda.recordset[0];

    const linhas = await pool.request()
      .input('encomendaId', sql.Int, e.Id)
      .query(`SELECT Codigo_Artigo, Codigo_Lote, Descricao, Quantidade, Preco_Unitario FROM dbo.ZAPP_DBSiteCD_EncomendasLinhas WHERE Encomenda_Id = @encomendaId;`);

    res.json({
      numero: e.Numero,
      estado: e.Estado,
      total: e.Total,
      metodoPagamento: e.Metodo_Pagamento,
      data: e.Data_Criacao,
      linhas: linhas.recordset.map((l) => ({
        codigoArtigo: l.Codigo_Artigo,
        codigoLote: l.Codigo_Lote,
        descricao: l.Descricao,
        quantidade: l.Quantidade,
        precoUnitario: l.Preco_Unitario,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao obter encomenda.' });
  }
});

module.exports = router;
