// Checkout: exige cliente autenticado (JWT), calcula portes e pontos ganhos,
// aplica um vale opcional, reserva stock de forma atómica (evita overselling)
// e limpa o carrinho. Só o método "Dinheiro" está activo por agora (pagamento na
// entrega/levantamento) - MB WAY/Cartão/PayPal ficam para mais tarde, quando
// houver contas junto desses fornecedores (Ifthenpay/Stripe/PayPal).
const express = require('express');
const { getPool, sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { enviarEmailEncomenda } = require('../services/email');
const { ESTADOS_LABELS } = require('../constants/encomendaEstados');

const router = express.Router();

const METODOS_ACTIVOS = ['Dinheiro'];

router.post('/', requireAuth, async (req, res) => {
  const { sessaoId, morada, metodoPagamento, valeCodigo } = req.body;
  const clienteId = req.cliente.id;

  if (!sessaoId || !morada?.morada || !morada?.localidade || !morada?.codigoPostal) {
    return res.status(400).json({ erro: 'sessaoId e morada (morada, localidade, codigoPostal) são obrigatórios.' });
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
               p.Preco AS Preco_Venda,
               CASE WHEN p.Percentagem_Desconto > 0 THEN p.Preco_Outlet ELSE p.Preco END AS Preco,
               CASE WHEN p.Percentagem_Desconto > 0 THEN ISNULL(p.Preco, 0) - ISNULL(p.Preco_Outlet, 0) ELSE 0 END AS Desconto
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

    // configuração de portes e pontos (Config já genérico, sem endpoint dedicado)
    const configReq = new sql.Request(transaction);
    const configRes = await configReq.query(`
      SELECT Chave, Valor FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave IN ('PortesEnvio', 'PontosPorEuro');
    `);
    const config = {};
    configRes.recordset.forEach((r) => { config[r.Chave] = r.Valor; });
    const portes = parseFloat(config.PortesEnvio) || 0;
    const pontosPorEuro = parseFloat(config.PontosPorEuro) || 1;

    const totalProdutos = carrinho.recordset.reduce((soma, l) => soma + (l.Preco || 0) * l.Quantidade, 0);

    // vale opcional: tem de pertencer ao cliente autenticado e estar activo
    let valeAplicado = null;
    let desconto = 0;
    if (valeCodigo) {
      const valeReq = new sql.Request(transaction);
      const valeRes = await valeReq
        .input('codigo', sql.VarChar(20), valeCodigo)
        .input('clienteId', sql.Int, clienteId)
        .query(`
          SELECT Id, Valor FROM dbo.ZAPP_DBSiteCD_Vales WITH (UPDLOCK, HOLDLOCK)
          WHERE Codigo = @codigo AND Cliente_Id = @clienteId AND Estado = 'Activo';
        `);
      if (valeRes.recordset.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ erro: 'Vale inválido, já utilizado ou não pertence a esta conta.' });
      }
      valeAplicado = valeRes.recordset[0];
      desconto = valeAplicado.Valor;
    }

    const total = Math.max(0, Math.round((totalProdutos + portes - desconto) * 100) / 100);
    const pontosGanhos = Math.floor(totalProdutos * pontosPorEuro);

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

    const encomendaReq = new sql.Request(transaction);
    const encomenda = await encomendaReq
      .input('clienteId', sql.Int, clienteId)
      .input('total', sql.Money, total)
      .input('portes', sql.Money, portes)
      .input('valeCodigo', sql.VarChar(20), valeCodigo || null)
      .input('valeDesconto', sql.Money, desconto)
      .input('pontosGanhos', sql.Int, pontosGanhos)
      .input('metodo', sql.VarChar(30), metodoPagamento)
      .input('morada', sql.NVarChar(200), morada.morada)
      .input('localidade', sql.NVarChar(100), morada.localidade)
      .input('codigoPostal', sql.VarChar(10), morada.codigoPostal)
      .query(`
        INSERT INTO dbo.ZAPP_DBSiteCD_Encomendas
          (Numero, Cliente_Id, Estado, Total, Portes, Vale_Codigo, Vale_Desconto, Pontos_Ganhos, Metodo_Pagamento, Data_Actualizacao, Morada_Entrega, Localidade_Entrega, Codigo_Postal_Entrega)
        OUTPUT inserted.Id
        VALUES ('TEMP', @clienteId, 'AguardarPagamento', @total, @portes, @valeCodigo, @valeDesconto, @pontosGanhos, @metodo, GETDATE(), @morada, @localidade, @codigoPostal);
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
        .input('precoVenda', sql.Money, linha.Preco_Venda || linha.Preco || 0)
        .input('desconto', sql.Money, linha.Desconto || 0)
        .query(`
          INSERT INTO dbo.ZAPP_DBSiteCD_EncomendasLinhas (Encomenda_Id, Codigo_Artigo, Codigo_Lote, Descricao, Quantidade, Preco_Unitario, Preco_Venda, Desconto)
          VALUES (@encomendaId, @codigoArtigo, @codigoLote, @descricao, @quantidade, @precoUnitario, @precoVenda, @desconto);
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

    if (valeAplicado) {
      const marcarValeReq = new sql.Request(transaction);
      await marcarValeReq
        .input('valeId', sql.Int, valeAplicado.Id)
        .input('encomendaId', sql.Int, encomendaId)
        .query(`
          UPDATE dbo.ZAPP_DBSiteCD_Vales
          SET Estado = 'Utilizado', Encomenda_Utilizacao_Id = @encomendaId, Data_Utilizacao = GETDATE()
          WHERE Id = @valeId;
        `);
    }

    // Nota: os pontos NÃO são atribuídos ao livro-razão aqui. Ficam apenas
    // reservados em Encomendas.Pontos_Ganhos até o Backoffice marcar a encomenda
    // como "Enviada" (ver PUT /api/admin/encomendas/:numero/avancar) - só nessa
    // altura entram em PontosLedger e passam a poder ser usados.

    const limparCarrinhoReq = new sql.Request(transaction);
    await limparCarrinhoReq
      .input('sessaoId', sql.NVarChar(100), sessaoId)
      .query(`DELETE FROM dbo.ZAPP_DBSiteCD_Carrinho WHERE Sessao_Id = @sessaoId;`);

    await transaction.commit();

    const mensagemPagamento = 'Pagamento a efectuar em dinheiro na entrega/levantamento (modo de teste - MB WAY/Cartão/PayPal ainda por integrar). Os pontos desta compra ficam pendentes até a encomenda ser enviada.';

    // Email de confirmação - depois do commit, nunca deve falhar a resposta da encomenda.
    enviarEmailEncomenda(numero, {
      assunto: `Encomenda ${numero} confirmada — Clássico Desportivo`,
      tituloEvento: 'Encomenda Confirmada',
      notaEvento: 'Obrigado pela sua compra! Assim que o pagamento for confirmado, actualizamos o estado da sua encomenda por email.',
    }).catch((emailErr) => {
      console.error('[email] Erro ao enviar confirmação (encomenda já confirmada):', emailErr.message);
    });

    res.status(201).json({
      numero,
      total,
      portes,
      valeDesconto: desconto,
      pontosGanhos,
      metodoPagamento,
      estado: 'AguardarPagamento',
      estadoLabel: ESTADOS_LABELS.AguardarPagamento,
      mensagemPagamento,
    });
  } catch (err) {
    console.error(err);
    try { await transaction.rollback(); } catch (_) { /* já pode ter sido revertida */ }
    res.status(500).json({ erro: 'Falha ao processar encomenda.' });
  }
});

// GET /api/encomendas/:numero - consulta pública simples de estado (sem dados sensíveis)
router.get('/:numero', async (req, res) => {
  try {
    const pool = await getPool();
    const encomenda = await pool.request()
      .input('numero', sql.VarChar(30), req.params.numero)
      .query(`SELECT Id, Numero, Estado, Total, Portes, Metodo_Pagamento, Data_Criacao FROM dbo.ZAPP_DBSiteCD_Encomendas WHERE Numero = @numero;`);

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
      estadoLabel: ESTADOS_LABELS[e.Estado] || e.Estado,
      total: e.Total,
      portes: e.Portes,
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
