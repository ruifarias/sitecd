// Área de cliente: histórico de encomendas, saldo de pontos e vales. Todas as
// rotas exigem autenticação (requireAuth define req.cliente.id a partir do JWT).
const express = require('express');
const crypto = require('crypto');
const { getPool, sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { ESTADOS_LABELS, ehEstadoDevolucao, ESTADO_RECEBIDA_CONFORME } = require('../constants/encomendaEstados');
const { gerarPdfEncomenda } = require('../services/pdf');
const { separarNomeVariante, enviarEmailEncomenda } = require('../services/email');
const { registarDevolucao } = require('../services/devolucaoService');
const { normalizarNif } = require('../utils/nif');
const { validarIBAN } = require('../utils/iban');

const router = express.Router();
router.use(requireAuth);

// GET /api/conta/perfil
router.get('/perfil', async (req, res) => {
  try {
    const pool = await getPool();
    const resultado = await pool.request()
      .input('id', sql.Int, req.cliente.id)
      .query('SELECT Nome, Email, Telefone, NIF, Morada, Localidade, Codigo_Postal, Codigo_Cliente, Iban, Nome_Titular_Conta FROM dbo.ZAPP_DBSiteCD_Clientes WHERE Id = @id;');

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
      iban: c.Iban,
      nomeTitularConta: c.Nome_Titular_Conta,
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
  const { nome, telefone, nif, morada, localidade, codigoPostal, iban, nomeTitularConta } = req.body;
  if (!nome || !nome.trim()) {
    return res.status(400).json({ erro: 'O nome é obrigatório.' });
  }
  const nifValidado = normalizarNif(nif);
  if (!nifValidado.ok) {
    return res.status(400).json({ erro: nifValidado.erro });
  }
  if (iban && iban.trim() && !validarIBAN(iban)) {
    return res.status(400).json({ erro: 'IBAN inválido.' });
  }

  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.cliente.id)
      .input('nome', sql.NVarChar(150), nome.trim())
      .input('telefone', sql.NVarChar(30), telefone || null)
      .input('nif', sql.VarChar(20), nifValidado.nif)
      .input('morada', sql.NVarChar(200), morada || null)
      .input('localidade', sql.NVarChar(100), localidade || null)
      .input('codigoPostal', sql.VarChar(10), codigoPostal || null)
      .input('iban', sql.VarChar(34), iban || null)
      .input('nomeTitularConta', sql.NVarChar(150), nomeTitularConta || null)
      .query(`
        UPDATE dbo.ZAPP_DBSiteCD_Clientes
        SET Nome = @nome, Telefone = @telefone, NIF = @nif,
            Morada = @morada, Localidade = @localidade, Codigo_Postal = @codigoPostal,
            Iban = @iban, Nome_Titular_Conta = @nomeTitularConta
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
        SELECT e.Numero, e.Estado, e.Total, e.Portes, e.Pontos_Ganhos, e.Metodo_Pagamento, mp.Designacao AS Metodo_Pagamento_Designacao, e.Data_Criacao
        FROM dbo.ZAPP_DBSiteCD_Encomendas e
        LEFT JOIN dbo.ZAPP_DBSiteCD_MetodosPagamento mp ON mp.Codigo = e.Metodo_Pagamento
        WHERE e.Cliente_Id = @clienteId
        ORDER BY e.Data_Criacao DESC;
      `);

    res.json(resultado.recordset.map((e) => ({
      numero: e.Numero,
      estado: e.Estado,
      estadoLabel: ESTADOS_LABELS[e.Estado] || e.Estado,
      total: e.Total,
      portes: e.Portes,
      pontosGanhos: e.Pontos_Ganhos,
      metodoPagamento: e.Metodo_Pagamento_Designacao || e.Metodo_Pagamento,
      data: e.Data_Criacao,
      podeDevolver: e.Estado === 'Enviada' || e.Estado === ESTADO_RECEBIDA_CONFORME,
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
        SELECT e.Id, e.Numero, e.Estado, e.Total, e.Portes, e.Vale_Codigo, e.Vale_Desconto, e.Pontos_Ganhos,
               e.Metodo_Pagamento, mp.Designacao AS Metodo_Pagamento_Designacao, e.Data_Criacao, e.Data_Actualizacao, e.Motivo_Anulacao
        FROM dbo.ZAPP_DBSiteCD_Encomendas e
        LEFT JOIN dbo.ZAPP_DBSiteCD_MetodosPagamento mp ON mp.Codigo = e.Metodo_Pagamento
        WHERE e.Numero = @numero AND e.Cliente_Id = @clienteId;
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
    const podeDevolver = e.Estado === 'Enviada' || e.Estado === ESTADO_RECEBIDA_CONFORME;

    let podeConfirmarRecepcao = false;
    let dataDisponivelConfirmacao = null;
    if (e.Estado === 'Enviada') {
      const configRes = await pool.request().query("SELECT Valor FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave = 'DiasConfirmacaoRecepcao';");
      const diasConfigurados = parseInt(configRes.recordset[0]?.Valor, 10);
      const dias = Number.isNaN(diasConfigurados) ? 1 : diasConfigurados;
      dataDisponivelConfirmacao = new Date(e.Data_Actualizacao);
      dataDisponivelConfirmacao.setDate(dataDisponivelConfirmacao.getDate() + dias);
      podeConfirmarRecepcao = new Date() >= dataDisponivelConfirmacao;
    }

    let devolucao = null;
    if (ehEstadoDevolucao(e.Estado)) {
      const devolucaoRes = await pool.request()
        .input('encomendaDevolucaoId', sql.Int, e.Id)
        .query('SELECT Iban, Nome_Titular, Motivo FROM dbo.ZAPP_DBSiteCD_Devolucoes WHERE Encomenda_Devolucao_Id = @encomendaDevolucaoId;');
      if (devolucaoRes.recordset.length > 0) {
        devolucao = {
          iban: devolucaoRes.recordset[0].Iban,
          nomeTitular: devolucaoRes.recordset[0].Nome_Titular,
          motivo: devolucaoRes.recordset[0].Motivo,
        };
      }
    }

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
      metodoPagamento: e.Metodo_Pagamento_Designacao || e.Metodo_Pagamento,
      data: e.Data_Criacao,
      motivoAnulacao: e.Motivo_Anulacao,
      devolucao,
      podeDevolver,
      podeConfirmarRecepcao,
      dataDisponivelConfirmacao,
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
        SELECT Id, Valor_Devolvido, Pontos_Estornados, Data_Criacao, Iban, Nome_Titular, Motivo
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
        iban: d.Iban,
        nomeTitular: d.Nome_Titular,
        motivo: d.Motivo,
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

// PUT /api/conta/encomendas/:numero/confirmar-recepcao - o cliente confirma
// que recebeu a encomenda e que está tudo conforme, sem necessidade de
// devolução ou troca. Liberta definitivamente os pontos de fidelização desta
// encomenda (entram no livro-razão). Só disponível a partir de
// DiasConfirmacaoRecepcao dias após a encomenda passar a "Enviada".
router.put('/encomendas/:numero/confirmar-recepcao', async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const encReq = new sql.Request(transaction);
    const encRes = await encReq
      .input('numero', sql.VarChar(30), req.params.numero)
      .input('clienteId', sql.Int, req.cliente.id)
      .query('SELECT Id, Estado, Cliente_Id, Pontos_Ganhos, Data_Actualizacao FROM dbo.ZAPP_DBSiteCD_Encomendas WITH (UPDLOCK, HOLDLOCK) WHERE Numero = @numero AND Cliente_Id = @clienteId;');

    if (encRes.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ erro: 'Encomenda não encontrada.' });
    }
    const encomenda = encRes.recordset[0];

    if (encomenda.Estado !== 'Enviada') {
      await transaction.rollback();
      return res.status(400).json({ erro: 'Esta encomenda não está no estado "Encomenda Enviada".' });
    }

    const configReq = new sql.Request(transaction);
    const configRes = await configReq.query("SELECT Valor FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave = 'DiasConfirmacaoRecepcao';");
    const diasConfigurados = parseInt(configRes.recordset[0]?.Valor, 10);
    const dias = Number.isNaN(diasConfigurados) ? 1 : diasConfigurados;
    const disponivelEm = new Date(encomenda.Data_Actualizacao);
    disponivelEm.setDate(disponivelEm.getDate() + dias);
    if (new Date() < disponivelEm) {
      await transaction.rollback();
      return res.status(400).json({ erro: `Só pode confirmar a receção a partir de ${disponivelEm.toLocaleDateString('pt-PT')}.` });
    }

    const updReq = new sql.Request(transaction);
    await updReq
      .input('id', sql.Int, encomenda.Id)
      .input('estado', sql.VarChar(30), ESTADO_RECEBIDA_CONFORME)
      .query('UPDATE dbo.ZAPP_DBSiteCD_Encomendas SET Estado = @estado, Data_Actualizacao = GETUTCDATE() WHERE Id = @id;');

    if (encomenda.Pontos_Ganhos > 0) {
      // idempotente: só atribui se ainda não houver um "Ganho" para esta encomenda
      const jaAtribuidoReq = new sql.Request(transaction);
      const jaAtribuidoRes = await jaAtribuidoReq
        .input('encomendaId', sql.Int, encomenda.Id)
        .query(`SELECT COUNT(*) AS Total FROM dbo.ZAPP_DBSiteCD_PontosLedger WHERE Encomenda_Id = @encomendaId AND Tipo = 'Ganho';`);

      if (jaAtribuidoRes.recordset[0].Total === 0) {
        const pontosReq = new sql.Request(transaction);
        await pontosReq
          .input('clienteId', sql.Int, encomenda.Cliente_Id)
          .input('pontos', sql.Int, encomenda.Pontos_Ganhos)
          .input('encomendaId', sql.Int, encomenda.Id)
          .input('descricao', sql.NVarChar(200), `Compra ${req.params.numero} (receção confirmada)`)
          .query(`
            INSERT INTO dbo.ZAPP_DBSiteCD_PontosLedger (Cliente_Id, Tipo, Pontos, Encomenda_Id, Descricao)
            VALUES (@clienteId, 'Ganho', @pontos, @encomendaId, @descricao);
          `);
      }
    }

    await transaction.commit();

    const estadoLabel = ESTADOS_LABELS[ESTADO_RECEBIDA_CONFORME];
    enviarEmailEncomenda(req.params.numero, {
      assunto: `Encomenda ${req.params.numero} — ${estadoLabel}`,
      tituloEvento: `Estado actualizado: ${estadoLabel}`,
      notaEvento: 'Confirmou a receção da encomenda. Os pontos desta compra já estão disponíveis para utilização.',
    }).catch((emailErr) => console.error('[email] Erro ao enviar notificação de estado:', emailErr.message));

    res.json({ ok: true, estado: ESTADO_RECEBIDA_CONFORME, estadoLabel, pontosGanhos: encomenda.Pontos_Ganhos });
  } catch (err) {
    console.error(err);
    try { await transaction.rollback(); } catch (_) { /* já pode ter sido revertida */ }
    res.status(500).json({ erro: 'Falha ao confirmar a receção da encomenda.' });
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
      motivo: req.body.motivo,
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

    // Pontos de encomendas ainda não confirmadas como recebidas/anuladas - só
    // entram no saldo usável quando o cliente confirmar a receção da encomenda.
    const pendentesRes = await pool.request()
      .input('clienteId', sql.Int, req.cliente.id)
      .query(`
        SELECT ISNULL(SUM(Pontos_Ganhos), 0) AS Pendentes
        FROM dbo.ZAPP_DBSiteCD_Encomendas
        WHERE Cliente_Id = @clienteId AND Estado NOT IN ('${ESTADO_RECEBIDA_CONFORME}', 'Anulada');
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

// GET /api/conta/vales - lista de vales do cliente (todos os estados; o
// checkout filtra do lado do cliente pelos "Activo"). estadoLabel traduz
// "Utilizado" para "Descontado", já com o nº da encomenda onde foi gasto.
router.get('/vales', async (req, res) => {
  try {
    const pool = await getPool();
    const resultado = await pool.request()
      .input('clienteId', sql.Int, req.cliente.id)
      .query(`
        SELECT v.Id, v.Codigo, v.Valor, v.Estado, v.Data_Criacao, v.Data_Utilizacao, e.Numero AS Numero_Encomenda
        FROM dbo.ZAPP_DBSiteCD_Vales v
        LEFT JOIN dbo.ZAPP_DBSiteCD_Encomendas e ON e.Id = v.Encomenda_Utilizacao_Id
        WHERE v.Cliente_Id = @clienteId
        ORDER BY v.Data_Criacao DESC;
      `);

    res.json(resultado.recordset.map((v) => ({
      id: v.Id,
      codigo: v.Codigo,
      valor: v.Valor,
      estado: v.Estado,
      estadoLabel: v.Estado === 'Utilizado'
        ? `Descontado${v.Numero_Encomenda ? ` (${v.Numero_Encomenda})` : ''}`
        : v.Estado,
      numeroEncomendaUtilizacao: v.Numero_Encomenda,
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
