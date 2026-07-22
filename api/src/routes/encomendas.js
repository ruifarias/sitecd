// Checkout: exige cliente autenticado (JWT), calcula portes e pontos ganhos,
// aplica um vale opcional, reserva stock de forma atómica (evita overselling)
// e limpa o carrinho. Os métodos de pagamento disponíveis são geridos no
// Backoffice (ZAPP_DBSiteCD_MetodosPagamento) - "MBWAY" é o único com
// integração automática (via Ifthenpay); os restantes (Dinheiro,
// Transferência Bancária, MBWAY Telemóvel) são só informativos - o
// Backoffice confirma o pagamento manualmente (avançar estado da encomenda).
const express = require('express');
const { getPool, sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { enviarEmailEncomenda } = require('../services/email');
const { pedirPagamentoMbway, consultarEstadoMbway } = require('../services/ifthenpay');
const { ESTADOS_LABELS } = require('../constants/encomendaEstados');

const router = express.Router();

const REGEX_TELEMOVEL_PT = /^9\d{8}$/;

router.post('/', requireAuth, async (req, res) => {
  const { sessaoId, morada, metodoPagamento, telemovel, valeCodigos, tipoEnvio } = req.body;
  const clienteId = req.cliente.id;

  if (!sessaoId || !morada?.morada || !morada?.localidade || !morada?.codigoPostal) {
    return res.status(400).json({ erro: 'sessaoId e morada (morada, localidade, codigoPostal) são obrigatórios.' });
  }
  if (!tipoEnvio) {
    return res.status(400).json({ erro: 'tipoEnvio é obrigatório.' });
  }

  const pool = await getPool();
  const metodoRes = await pool.request()
    .input('codigo', sql.VarChar(30), metodoPagamento)
    .query(`SELECT Designacao, Detalhe FROM dbo.ZAPP_DBSiteCD_MetodosPagamento WHERE Codigo = @codigo AND Activo = 1;`);
  if (metodoRes.recordset.length === 0) {
    return res.status(400).json({ erro: 'Método de pagamento indisponível. Actualize a página e tente novamente.' });
  }
  const metodoInfo = metodoRes.recordset[0];

  const tipoEnvioRes = await pool.request()
    .input('codigo', sql.VarChar(30), tipoEnvio)
    .query(`SELECT Designacao, Custo FROM dbo.ZAPP_DBSiteCD_TiposEnvio WHERE Codigo = @codigo AND Activo = 1;`);
  if (tipoEnvioRes.recordset.length === 0) {
    return res.status(400).json({ erro: 'Tipo de envio indisponível. Actualize a página e tente novamente.' });
  }
  const tipoEnvioInfo = tipoEnvioRes.recordset[0];

  if (metodoPagamento === 'MBWAY' && !REGEX_TELEMOVEL_PT.test(telemovel || '')) {
    return res.status(400).json({ erro: 'Indique um número de telemóvel português válido (9 dígitos, a começar por 9) para o pedido MB WAY.' });
  }

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

    // configuração de pontos (Config já genérico, sem endpoint dedicado); os
    // portes vêm do tipo de envio escolhido (validado acima, fora da transacção)
    const configReq = new sql.Request(transaction);
    const configRes = await configReq.query(`
      SELECT Chave, Valor FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave = 'PontosPorEuro';
    `);
    const config = {};
    configRes.recordset.forEach((r) => { config[r.Chave] = r.Valor; });
    const portes = parseFloat(tipoEnvioInfo.Custo) || 0;
    const pontosPorEuro = parseFloat(config.PontosPorEuro) || 1;

    const totalProdutos = carrinho.recordset.reduce((soma, l) => soma + (l.Preco || 0) * l.Quantidade, 0);

    // vales opcionais: cada um tem de pertencer ao cliente autenticado e estar
    // activo; regra de negócio - só pode aplicar 1 vale por cada 50€ de
    // compras (validado aqui no servidor, nunca só no browser)
    const valesAplicados = [];
    let desconto = 0;
    if (Array.isArray(valeCodigos) && valeCodigos.length > 0) {
      const codigosUnicos = [...new Set(valeCodigos)];
      if (codigosUnicos.length !== valeCodigos.length) {
        await transaction.rollback();
        return res.status(400).json({ erro: 'Vale seleccionado mais do que uma vez.' });
      }

      const maxVales = Math.floor(totalProdutos / 50);
      if (codigosUnicos.length > maxVales) {
        await transaction.rollback();
        return res.status(400).json({ erro: `Só pode aplicar ${maxVales} vale(s) para uma compra de ${totalProdutos.toFixed(2)}€ (1 vale por cada 50€).` });
      }

      for (const codigo of codigosUnicos) {
        const valeReq = new sql.Request(transaction);
        const valeRes = await valeReq
          .input('codigo', sql.VarChar(20), codigo)
          .input('clienteId', sql.Int, clienteId)
          .query(`
            SELECT Id, Valor FROM dbo.ZAPP_DBSiteCD_Vales WITH (UPDLOCK, HOLDLOCK)
            WHERE Codigo = @codigo AND Cliente_Id = @clienteId AND Estado = 'Activo';
          `);
        if (valeRes.recordset.length === 0) {
          await transaction.rollback();
          return res.status(400).json({ erro: `Vale ${codigo} inválido, já utilizado ou não pertence a esta conta.` });
        }
        valesAplicados.push({ id: valeRes.recordset[0].Id, codigo, valor: valeRes.recordset[0].Valor });
        desconto += valeRes.recordset[0].Valor;
      }
    }

    const total = Math.max(0, Math.round((totalProdutos + portes - desconto) * 100) / 100);
    // pontos calculados sobre o valor pago pelos artigos (Total a Pagar menos
    // Portes = totalProdutos - desconto de vales), não sobre o preço cheio
    const pontosGanhos = Math.floor(Math.max(0, totalProdutos - desconto) * pontosPorEuro);

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
      .input('tipoEnvio', sql.VarChar(30), tipoEnvio)
      .input('valeCodigo', sql.VarChar(200), valesAplicados.length > 0 ? valesAplicados.map((v) => v.codigo).join(', ') : null)
      .input('valeDesconto', sql.Money, desconto)
      .input('pontosGanhos', sql.Int, pontosGanhos)
      .input('metodo', sql.VarChar(30), metodoPagamento)
      .input('morada', sql.NVarChar(200), morada.morada)
      .input('localidade', sql.NVarChar(100), morada.localidade)
      .input('codigoPostal', sql.VarChar(10), morada.codigoPostal)
      .query(`
        INSERT INTO dbo.ZAPP_DBSiteCD_Encomendas
          (Numero, Cliente_Id, Estado, Total, Portes, Tipo_Envio, Vale_Codigo, Vale_Desconto, Pontos_Ganhos, Metodo_Pagamento, Data_Actualizacao, Morada_Entrega, Localidade_Entrega, Codigo_Postal_Entrega)
        OUTPUT inserted.Id
        VALUES ('TEMP', @clienteId, 'AguardarPagamento', @total, @portes, @tipoEnvio, @valeCodigo, @valeDesconto, @pontosGanhos, @metodo, GETDATE(), @morada, @localidade, @codigoPostal);
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

    // Transferência Bancária, MBWAY Telemóvel, etc. (qualquer método além de
    // Dinheiro/MBWAY) fica "A aguardar confirmação de pagamento" - o
    // Backoffice confirma manualmente ao ver o valor entrar na conta/MB WAY.
    const estadoPagamentoInicial = metodoPagamento === 'MBWAY'
      ? 'Pendente'
      : metodoPagamento === 'Dinheiro'
        ? 'A cobrar na entrega/levantamento'
        : 'A aguardar confirmação de pagamento';

    const pagamentoReq = new sql.Request(transaction);
    await pagamentoReq
      .input('encomendaId', sql.Int, encomendaId)
      .input('metodo', sql.VarChar(30), metodoPagamento)
      .input('estado', sql.VarChar(60), estadoPagamentoInicial)
      .input('telemovel', sql.VarChar(20), metodoPagamento === 'MBWAY' ? telemovel : null)
      .query(`
        INSERT INTO dbo.ZAPP_DBSiteCD_Pagamentos (Encomenda_Id, Metodo, Estado, Telemovel)
        VALUES (@encomendaId, @metodo, @estado, @telemovel);
      `);

    for (const vale of valesAplicados) {
      const marcarValeReq = new sql.Request(transaction);
      await marcarValeReq
        .input('valeId', sql.Int, vale.id)
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

    const mensagemPagamento = metodoPagamento === 'MBWAY'
      ? 'Vai receber uma notificação na app MB WAY para confirmar o pagamento. Os pontos desta compra ficam pendentes até a encomenda ser enviada.'
      : metodoPagamento === 'Dinheiro'
        ? 'Pagamento a efectuar em dinheiro na entrega/levantamento. Os pontos desta compra ficam pendentes até a encomenda ser enviada.'
        : `Para concluir a compra: ${metodoInfo.Detalhe}. Assim que confirmarmos a receção do pagamento, actualizamos o estado da sua encomenda. Os pontos desta compra ficam pendentes até a encomenda ser enviada.`;

    // Email de confirmação - depois do commit, nunca deve falhar a resposta da encomenda.
    enviarEmailEncomenda(numero, {
      assunto: `Encomenda ${numero} confirmada — Clássico Desportivo`,
      tituloEvento: 'Encomenda Confirmada',
      notaEvento: 'Obrigado pela sua compra! Assim que o pagamento for confirmado, actualizamos o estado da sua encomenda por email.',
    }).catch((emailErr) => {
      console.error('[email] Erro ao enviar confirmação (encomenda já confirmada):', emailErr.message);
    });

    // Pedido de pagamento MB WAY - depois do commit (chamada externa, não deve
    // segurar a transacção). Se falhar, a encomenda fica na mesma criada e o
    // cliente pode reenviar o pedido (ver POST /:numero/mbway/reenviar).
    let mbway;
    if (metodoPagamento === 'MBWAY') {
      try {
        const { requestId } = await pedirPagamentoMbway({
          orderId: numero,
          amount: total.toFixed(2),
          mobileNumber: `351#${telemovel}`,
          email: req.cliente.email,
          description: `Encomenda ${numero}`,
        });
        const guardarRequestIdReq = new sql.Request(pool);
        await guardarRequestIdReq
          .input('encomendaId', sql.Int, encomendaId)
          .input('requestId', sql.NVarChar(100), requestId)
          .query(`UPDATE dbo.ZAPP_DBSiteCD_Pagamentos SET Referencia_Externa = @requestId WHERE Encomenda_Id = @encomendaId;`);
        mbway = { enviado: true };
      } catch (mbwayErr) {
        console.error(`[mbway] Falha ao pedir pagamento da encomenda ${numero}:`, mbwayErr.message);
        mbway = { enviado: false, erro: mbwayErr.message };
      }
    }

    res.status(201).json({
      numero,
      total,
      portes,
      tipoEnvio: tipoEnvioInfo.Designacao,
      valeDesconto: desconto,
      valesAplicados: valesAplicados.map((v) => v.codigo),
      pontosGanhos,
      metodoPagamento,
      estado: 'AguardarPagamento',
      estadoLabel: ESTADOS_LABELS.AguardarPagamento,
      mensagemPagamento,
      mbway,
    });
  } catch (err) {
    console.error(err);
    try { await transaction.rollback(); } catch (_) { /* já pode ter sido revertida */ }
    res.status(500).json({ erro: 'Falha ao processar encomenda.' });
  }
});

// GET /api/encomendas/:numero/mbway/estado - consultado por polling do checkout
// (ver frontend/js/checkout.js) enquanto se aguarda a confirmação na app MB WAY.
// Cada chamada consulta o Ifthenpay e, se entretanto pago, avança a encomenda
// para "PagamentoEfectuado" automaticamente (sem intervenção do Backoffice).
router.get('/:numero/mbway/estado', requireAuth, async (req, res) => {
  try {
    const pool = await getPool();
    const encRes = await pool.request()
      .input('numero', sql.VarChar(30), req.params.numero)
      .query(`SELECT Id, Estado, Cliente_Id, Metodo_Pagamento FROM dbo.ZAPP_DBSiteCD_Encomendas WHERE Numero = @numero;`);

    if (encRes.recordset.length === 0) {
      return res.status(404).json({ erro: 'Encomenda não encontrada.' });
    }
    const encomenda = encRes.recordset[0];
    if (encomenda.Cliente_Id !== req.cliente.id) {
      return res.status(403).json({ erro: 'Esta encomenda não pertence a esta conta.' });
    }
    if (encomenda.Metodo_Pagamento !== 'MBWAY') {
      return res.status(400).json({ erro: 'Esta encomenda não usa MB WAY.' });
    }

    const pagRes = await pool.request()
      .input('encomendaId', sql.Int, encomenda.Id)
      .query(`SELECT TOP 1 Id, Estado, Referencia_Externa FROM dbo.ZAPP_DBSiteCD_Pagamentos WHERE Encomenda_Id = @encomendaId ORDER BY Id DESC;`);
    const pagamento = pagRes.recordset[0];

    // já resolvido (pago ou definitivamente falhado) - não voltar a incomodar o Ifthenpay
    if (pagamento && ['Pago', 'Rejeitado', 'Expirado', 'Recusado'].includes(pagamento.Estado)) {
      return res.json({ estadoPagamento: pagamento.Estado, estadoEncomenda: encomenda.Estado });
    }
    if (!pagamento?.Referencia_Externa) {
      return res.json({ estadoPagamento: 'Pendente', estadoEncomenda: encomenda.Estado });
    }

    const estadoPagamento = await consultarEstadoMbway(pagamento.Referencia_Externa);

    if (estadoPagamento !== 'Pendente') {
      await pool.request()
        .input('id', sql.Int, pagamento.Id)
        .input('estado', sql.VarChar(60), estadoPagamento)
        .query(`UPDATE dbo.ZAPP_DBSiteCD_Pagamentos SET Estado = @estado WHERE Id = @id;`);
    }

    let estadoEncomenda = encomenda.Estado;
    if (estadoPagamento === 'Pago' && encomenda.Estado === 'AguardarPagamento') {
      estadoEncomenda = 'PagamentoEfectuado';
      await pool.request()
        .input('id', sql.Int, encomenda.Id)
        .input('estado', sql.VarChar(30), estadoEncomenda)
        .query(`UPDATE dbo.ZAPP_DBSiteCD_Encomendas SET Estado = @estado, Data_Actualizacao = GETUTCDATE() WHERE Id = @id;`);

      enviarEmailEncomenda(req.params.numero, {
        assunto: `Encomenda ${req.params.numero} — ${ESTADOS_LABELS.PagamentoEfectuado}`,
        tituloEvento: `Estado actualizado: ${ESTADOS_LABELS.PagamentoEfectuado}`,
        notaEvento: 'Recebemos a confirmação do pagamento por MB WAY. Obrigado!',
      }).catch((emailErr) => console.error('[email] Erro ao enviar confirmação de pagamento MB WAY:', emailErr.message));
    }

    res.json({ estadoPagamento, estadoEncomenda });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao consultar estado do pagamento MB WAY.' });
  }
});

// POST /api/encomendas/:numero/mbway/reenviar - repete o pedido de pagamento
// quando a tentativa inicial falhou (ex: número inválido, indisponibilidade
// momentânea do Ifthenpay) ou expirou/foi rejeitado na app.
router.post('/:numero/mbway/reenviar', requireAuth, async (req, res) => {
  try {
    const pool = await getPool();
    const encRes = await pool.request()
      .input('numero', sql.VarChar(30), req.params.numero)
      .query(`SELECT Id, Estado, Cliente_Id, Total, Metodo_Pagamento FROM dbo.ZAPP_DBSiteCD_Encomendas WHERE Numero = @numero;`);

    if (encRes.recordset.length === 0) {
      return res.status(404).json({ erro: 'Encomenda não encontrada.' });
    }
    const encomenda = encRes.recordset[0];
    if (encomenda.Cliente_Id !== req.cliente.id) {
      return res.status(403).json({ erro: 'Esta encomenda não pertence a esta conta.' });
    }
    if (encomenda.Metodo_Pagamento !== 'MBWAY') {
      return res.status(400).json({ erro: 'Esta encomenda não usa MB WAY.' });
    }
    if (encomenda.Estado !== 'AguardarPagamento') {
      return res.status(400).json({ erro: `A encomenda já está em "${ESTADOS_LABELS[encomenda.Estado] || encomenda.Estado}", não é possível reenviar o pedido.` });
    }

    const pagRes = await pool.request()
      .input('encomendaId', sql.Int, encomenda.Id)
      .query(`SELECT TOP 1 Id, Telemovel FROM dbo.ZAPP_DBSiteCD_Pagamentos WHERE Encomenda_Id = @encomendaId ORDER BY Id DESC;`);
    const pagamento = pagRes.recordset[0];
    if (!pagamento?.Telemovel) {
      return res.status(400).json({ erro: 'Número de telemóvel não encontrado para esta encomenda.' });
    }

    const { requestId } = await pedirPagamentoMbway({
      orderId: req.params.numero,
      amount: encomenda.Total.toFixed(2),
      mobileNumber: `351#${pagamento.Telemovel}`,
      email: req.cliente.email,
      description: `Encomenda ${req.params.numero}`,
    });

    await pool.request()
      .input('id', sql.Int, pagamento.Id)
      .input('requestId', sql.NVarChar(100), requestId)
      .query(`UPDATE dbo.ZAPP_DBSiteCD_Pagamentos SET Estado = 'Pendente', Referencia_Externa = @requestId WHERE Id = @id;`);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message || 'Falha ao reenviar pedido MB WAY.' });
  }
});

// GET /api/encomendas/:numero - consulta pública simples de estado (sem dados sensíveis)
router.get('/:numero', async (req, res) => {
  try {
    const pool = await getPool();
    const encomenda = await pool.request()
      .input('numero', sql.VarChar(30), req.params.numero)
      .query(`
        SELECT e.Id, e.Numero, e.Estado, e.Total, e.Portes, e.Metodo_Pagamento, mp.Designacao AS Metodo_Pagamento_Designacao, e.Data_Criacao
        FROM dbo.ZAPP_DBSiteCD_Encomendas e
        LEFT JOIN dbo.ZAPP_DBSiteCD_MetodosPagamento mp ON mp.Codigo = e.Metodo_Pagamento
        WHERE e.Numero = @numero;
      `);

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
      metodoPagamento: e.Metodo_Pagamento_Designacao || e.Metodo_Pagamento,
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
