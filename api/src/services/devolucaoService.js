// Registo de devoluções: estorna proporcionalmente os pontos já atribuídos e
// regista o histórico em ZAPP_DBSiteCD_Devolucoes/DevolucoesLinhas (usado para
// validar quantidades já devolvidas), e cria também uma "Nota de Devolução"
// (Numero = DEV+numero da encomenda original) como uma linha normal na tabela
// de Encomendas/EncomendasLinhas - com valores negativos - para que apareça
// listada como qualquer outra encomenda e possa ser vista/exportada em PDF
// através do mesmo código já existente (obterEncomendaCompleta/gerarPdfEncomenda).
// Os portes nunca são devolvidos (a Nota de Devolução não tem Portes). O IBAN e
// o nome do 1º titular da conta são obrigatórios (usados para o reembolso) e
// ficam registados em Devolucoes, ligados à Nota de Devolução criada.
const { getPool, sql } = require('../db');
const { ESTADO_DEV_NOTA_EMITIDA } = require('../constants/encomendaEstados');
const { enviarEmailEncomenda } = require('./email');
const { validarIBAN } = require('../utils/iban');

async function registarDevolucao(numero, linhasDevolucao, { iban, nomeTitular, motivo } = {}) {
  if (!Array.isArray(linhasDevolucao) || linhasDevolucao.length === 0) {
    return { erro: 'Indique pelo menos um artigo a devolver.', status: 400 };
  }
  if (!iban || !iban.trim()) {
    return { erro: 'O IBAN é obrigatório.', status: 400 };
  }
  if (!validarIBAN(iban)) {
    return { erro: 'IBAN inválido.', status: 400 };
  }
  if (!nomeTitular || !nomeTitular.trim()) {
    return { erro: 'O nome do 1º titular da conta é obrigatório.', status: 400 };
  }
  if (!motivo || !motivo.trim()) {
    return { erro: 'A razão da devolução é obrigatória.', status: 400 };
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const encReq = new sql.Request(transaction);
    const encRes = await encReq
      .input('numero', sql.VarChar(30), numero)
      .query(`
        SELECT Id, Estado, Cliente_Id, Pontos_Ganhos, Metodo_Pagamento,
               Morada_Entrega, Localidade_Entrega, Codigo_Postal_Entrega
        FROM dbo.ZAPP_DBSiteCD_Encomendas WITH (UPDLOCK, HOLDLOCK)
        WHERE Numero = @numero;
      `);

    if (encRes.recordset.length === 0) {
      await transaction.rollback();
      return { erro: 'Encomenda não encontrada.', status: 404 };
    }
    const encomenda = encRes.recordset[0];

    if (encomenda.Estado !== 'Enviada') {
      await transaction.rollback();
      return { erro: 'Só é possível devolver artigos de encomendas já enviadas.', status: 400 };
    }

    const linhasOriginaisReq = new sql.Request(transaction);
    const linhasOriginaisRes = await linhasOriginaisReq
      .input('encomendaId', sql.Int, encomenda.Id)
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

    const totalProdutosOriginal = linhasOriginaisRes.recordset.reduce((s, l) => s + l.Quantidade * l.Preco_Unitario, 0);

    // Validar cada linha pedida contra a linha original e o que já foi devolvido antes
    const linhasParaDevolver = [];
    for (const pedido of linhasDevolucao) {
      const original = linhasOriginaisRes.recordset.find(
        (l) => l.Codigo_Artigo === pedido.codigoArtigo && l.Codigo_Lote === pedido.codigoLote
      );
      if (!original) {
        await transaction.rollback();
        return { erro: `Artigo ${pedido.codigoArtigo} | ${pedido.codigoLote} não pertence a esta encomenda.`, status: 400 };
      }
      const quantidade = parseInt(pedido.quantidade, 10) || 0;
      const disponivelParaDevolver = original.Quantidade - original.Quantidade_Devolvida;
      if (quantidade <= 0) continue;
      if (quantidade > disponivelParaDevolver) {
        await transaction.rollback();
        return { erro: `Quantidade a devolver de "${original.Descricao}" excede o disponível (${disponivelParaDevolver}).`, status: 400 };
      }
      linhasParaDevolver.push({ ...original, QuantidadeDevolver: quantidade });
    }

    if (linhasParaDevolver.length === 0) {
      await transaction.rollback();
      return { erro: 'Nenhuma quantidade válida a devolver.', status: 400 };
    }

    const valorDevolvido = linhasParaDevolver.reduce((s, l) => s + l.QuantidadeDevolver * l.Preco_Unitario, 0);
    const rateioPontos = totalProdutosOriginal > 0 ? encomenda.Pontos_Ganhos / totalProdutosOriginal : 0;
    const pontosEstornados = Math.round(valorDevolvido * rateioPontos);

    // Nota de Devolução: uma encomenda "negativa" (Numero = DEV+numero original),
    // para aparecer na listagem de encomendas e poder ser exportada em PDF/email
    // pelo mesmo mecanismo já usado para as encomendas normais.
    const sufixoDev = numero.replace(/^ENC/, '');
    let numeroDev = `DEV${sufixoDev}`;
    const existentesReq = new sql.Request(transaction);
    const existentesRes = await existentesReq
      .input('prefixo', sql.VarChar(30), `DEV${sufixoDev}%`)
      .query(`SELECT COUNT(*) AS Total FROM dbo.ZAPP_DBSiteCD_Encomendas WHERE Numero LIKE @prefixo;`);
    const totalExistentes = existentesRes.recordset[0].Total;
    if (totalExistentes > 0) {
      numeroDev = `DEV${sufixoDev}-${totalExistentes + 1}`;
    }

    const devEncomendaReq = new sql.Request(transaction);
    const devEncomendaRes = await devEncomendaReq
      .input('numero', sql.VarChar(30), numeroDev)
      .input('clienteId', sql.Int, encomenda.Cliente_Id)
      .input('total', sql.Money, -valorDevolvido)
      .input('pontosGanhos', sql.Int, -pontosEstornados)
      .input('metodo', sql.VarChar(30), 'Devolução')
      .input('morada', sql.NVarChar(200), encomenda.Morada_Entrega)
      .input('localidade', sql.NVarChar(100), encomenda.Localidade_Entrega)
      .input('codigoPostal', sql.VarChar(10), encomenda.Codigo_Postal_Entrega)
      .query(`
        INSERT INTO dbo.ZAPP_DBSiteCD_Encomendas
          (Numero, Cliente_Id, Estado, Total, Portes, Pontos_Ganhos, Metodo_Pagamento, Data_Actualizacao, Morada_Entrega, Localidade_Entrega, Codigo_Postal_Entrega)
        OUTPUT inserted.Id
        VALUES (@numero, @clienteId, '${ESTADO_DEV_NOTA_EMITIDA}', @total, 0, @pontosGanhos, @metodo, GETDATE(), @morada, @localidade, @codigoPostal);
      `);
    const devEncomendaId = devEncomendaRes.recordset[0].Id;

    for (const linha of linhasParaDevolver) {
      const devLinhaReq = new sql.Request(transaction);
      await devLinhaReq
        .input('encomendaId', sql.Int, devEncomendaId)
        .input('codigoArtigo', sql.VarChar(20), linha.Codigo_Artigo)
        .input('codigoLote', sql.VarChar(50), linha.Codigo_Lote)
        .input('descricao', sql.NVarChar(200), linha.Descricao)
        .input('quantidade', sql.Int, linha.QuantidadeDevolver)
        .input('precoUnitario', sql.Money, -linha.Preco_Unitario)
        .input('precoVenda', sql.Money, linha.Preco_Venda || linha.Preco_Unitario)
        .input('desconto', sql.Money, linha.Desconto || 0)
        .query(`
          INSERT INTO dbo.ZAPP_DBSiteCD_EncomendasLinhas (Encomenda_Id, Codigo_Artigo, Codigo_Lote, Descricao, Quantidade, Preco_Unitario, Preco_Venda, Desconto)
          VALUES (@encomendaId, @codigoArtigo, @codigoLote, @descricao, @quantidade, @precoUnitario, @precoVenda, @desconto);
        `);
    }

    const devolucaoReq = new sql.Request(transaction);
    const devolucaoRes = await devolucaoReq
      .input('encomendaId', sql.Int, encomenda.Id)
      .input('valorDevolvido', sql.Money, valorDevolvido)
      .input('pontosEstornados', sql.Int, pontosEstornados)
      .input('iban', sql.VarChar(34), iban.trim())
      .input('nomeTitular', sql.NVarChar(150), nomeTitular.trim())
      .input('motivo', sql.NVarChar(500), motivo.trim())
      .input('encomendaDevolucaoId', sql.Int, devEncomendaId)
      .query(`
        INSERT INTO dbo.ZAPP_DBSiteCD_Devolucoes (Encomenda_Id, Valor_Devolvido, Pontos_Estornados, Iban, Nome_Titular, Motivo, Encomenda_Devolucao_Id)
        OUTPUT inserted.Id
        VALUES (@encomendaId, @valorDevolvido, @pontosEstornados, @iban, @nomeTitular, @motivo, @encomendaDevolucaoId);
      `);
    const devolucaoId = devolucaoRes.recordset[0].Id;

    // Actualiza/preenche o IBAN e o Nome do 1º Titular na ficha do cliente com
    // os dados usados nesta devolução (ficam disponíveis/pré-preenchidos da
    // próxima vez, e visíveis na Ficha de Cliente do Backoffice).
    const actualizarClienteReq = new sql.Request(transaction);
    await actualizarClienteReq
      .input('clienteId', sql.Int, encomenda.Cliente_Id)
      .input('iban', sql.VarChar(34), iban.trim())
      .input('nomeTitular', sql.NVarChar(150), nomeTitular.trim())
      .query(`
        UPDATE dbo.ZAPP_DBSiteCD_Clientes
        SET Iban = @iban, Nome_Titular_Conta = @nomeTitular
        WHERE Id = @clienteId;
      `);

    for (const linha of linhasParaDevolver) {
      const linhaReq = new sql.Request(transaction);
      await linhaReq
        .input('devolucaoId', sql.Int, devolucaoId)
        .input('codigoArtigo', sql.VarChar(20), linha.Codigo_Artigo)
        .input('codigoLote', sql.VarChar(50), linha.Codigo_Lote)
        .input('descricao', sql.NVarChar(200), linha.Descricao)
        .input('quantidade', sql.Int, linha.QuantidadeDevolver)
        .input('precoUnitario', sql.Money, linha.Preco_Unitario)
        .query(`
          INSERT INTO dbo.ZAPP_DBSiteCD_DevolucoesLinhas (Devolucao_Id, Codigo_Artigo, Codigo_Lote, Descricao, Quantidade, Preco_Unitario)
          VALUES (@devolucaoId, @codigoArtigo, @codigoLote, @descricao, @quantidade, @precoUnitario);
        `);
    }

    if (pontosEstornados > 0) {
      const pontosReq = new sql.Request(transaction);
      await pontosReq
        .input('clienteId', sql.Int, encomenda.Cliente_Id)
        .input('pontos', sql.Int, -pontosEstornados)
        .input('encomendaId', sql.Int, encomenda.Id)
        .input('descricao', sql.NVarChar(200), `Devolução de artigos da encomenda ${numero}`)
        .query(`
          INSERT INTO dbo.ZAPP_DBSiteCD_PontosLedger (Cliente_Id, Tipo, Pontos, Encomenda_Id, Descricao)
          VALUES (@clienteId, 'Devolucao', @pontos, @encomendaId, @descricao);
        `);
    }

    await transaction.commit();

    // Fora da transacção - nunca falha o registo da devolução por causa do email.
    // Enviado ao cliente e em cópia para a empresa (geral@classicodesportivo.pt).
    enviarEmailEncomenda(numeroDev, {
      tituloEvento: 'Nota de Devolução Emitida',
      notaEvento: 'Foi registada uma devolução de artigos. Assim que for recebida e validada, procederemos ao reembolso para o IBAN indicado.',
      assunto: `Nota de Devolução ${numeroDev} — Clássico Desportivo`,
      copiaEmpresa: true,
    }).catch(() => { /* enviarEmailEncomenda já regista o erro internamente */ });

    return { ok: true, valorDevolvido, pontosEstornados, numeroDevolucao: numeroDev };
  } catch (err) {
    console.error(err);
    try { await transaction.rollback(); } catch (_) { /* já pode ter sido revertida */ }
    return { erro: 'Falha ao registar devolução.', status: 500 };
  }
}

module.exports = { registarDevolucao };
