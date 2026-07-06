// Serviço partilhado: obtém o detalhe completo de uma encomenda (cliente, linhas
// com imagem do artigo, morada, IVA) - usado pelo email de notificação e pela
// exportação em PDF, para não duplicar as mesmas queries em vários sítios.
const { getPool, sql } = require('../db');
const { ehEstadoDevolucao } = require('../constants/encomendaEstados');

async function obterTaxaIva(pool) {
  const config = await pool.request().query(`SELECT Valor FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave = 'TaxaIVA';`);
  return parseFloat(config.recordset[0]?.Valor) || 23;
}

async function obterEncomendaCompleta(numero) {
  const pool = await getPool();

  const encomendaRes = await pool.request()
    .input('numero', sql.VarChar(30), numero)
    .query(`
      SELECT e.Id, e.Numero, e.Estado, e.Total, e.Portes, e.Vale_Codigo, e.Vale_Desconto, e.Pontos_Ganhos,
             e.Metodo_Pagamento, e.Data_Criacao, e.Data_Actualizacao, e.Motivo_Anulacao,
             e.Morada_Entrega, e.Localidade_Entrega, e.Codigo_Postal_Entrega,
             c.Nome AS Cliente_Nome, c.Email AS Cliente_Email, c.Telefone AS Cliente_Telefone, c.NIF AS Cliente_Nif, c.Codigo_Cliente
      FROM dbo.ZAPP_DBSiteCD_Encomendas e
      LEFT JOIN dbo.ZAPP_DBSiteCD_Clientes c ON c.Id = e.Cliente_Id
      WHERE e.Numero = @numero;
    `);

  if (encomendaRes.recordset.length === 0) return null;
  const e = encomendaRes.recordset[0];

  const linhasRes = await pool.request()
    .input('encomendaId', sql.Int, e.Id)
    .query(`
      SELECT l.Codigo_Artigo, l.Codigo_Lote, l.Descricao, l.Quantidade, l.Preco_Unitario, l.Preco_Venda, l.Desconto,
             (SELECT TOP 1 Path FROM dbo.ZAPP_DBSiteCD_Imagens img WHERE img.Codigo_Artigo = l.Codigo_Artigo AND img.Ordem = 0) AS Imagem_Path
      FROM dbo.ZAPP_DBSiteCD_EncomendasLinhas l
      WHERE l.Encomenda_Id = @encomendaId;
    `);

  const taxaIva = await obterTaxaIva(pool);
  const baseIncidencia = Math.round((e.Total / (1 + taxaIva / 100)) * 100) / 100;
  const valorIva = Math.round((e.Total - baseIncidencia) * 100) / 100;

  let devolucao = null;
  if (ehEstadoDevolucao(e.Estado)) {
    const devolucaoRes = await pool.request()
      .input('encomendaDevolucaoId', sql.Int, e.Id)
      .query('SELECT Iban, Nome_Titular FROM dbo.ZAPP_DBSiteCD_Devolucoes WHERE Encomenda_Devolucao_Id = @encomendaDevolucaoId;');
    if (devolucaoRes.recordset.length > 0) {
      devolucao = {
        iban: devolucaoRes.recordset[0].Iban,
        nomeTitular: devolucaoRes.recordset[0].Nome_Titular,
      };
    }
  }

  return {
    numero: e.Numero,
    estado: e.Estado,
    total: e.Total,
    portes: e.Portes,
    valeCodigo: e.Vale_Codigo,
    valeDesconto: e.Vale_Desconto,
    pontosGanhos: e.Pontos_Ganhos,
    metodoPagamento: e.Metodo_Pagamento,
    data: e.Data_Criacao,
    dataActualizacao: e.Data_Actualizacao,
    motivoAnulacao: e.Motivo_Anulacao,
    morada: {
      morada: e.Morada_Entrega,
      localidade: e.Localidade_Entrega,
      codigoPostal: e.Codigo_Postal_Entrega,
    },
    cliente: {
      nome: e.Cliente_Nome,
      email: e.Cliente_Email,
      telefone: e.Cliente_Telefone,
      nif: e.Cliente_Nif,
      codigoCliente: e.Codigo_Cliente,
    },
    taxaIva,
    baseIncidencia,
    valorIva,
    devolucao,
    linhas: linhasRes.recordset.map((l) => ({
      codigoArtigo: l.Codigo_Artigo,
      codigoLote: l.Codigo_Lote,
      descricao: l.Descricao,
      quantidade: l.Quantidade,
      precoUnitario: l.Preco_Unitario,
      precoVenda: l.Preco_Venda,
      desconto: l.Desconto,
      descontoPercentagem: l.Preco_Venda > 0 ? Math.round((l.Desconto / l.Preco_Venda) * 100) : 0,
      precoTotal: Math.round(l.Preco_Unitario * l.Quantidade * 100) / 100,
      imagem: l.Imagem_Path ? `${process.env.IMAGES_BASE_URL}/${l.Imagem_Path.replace(/^imagens\//, '')}` : null,
    })),
  };
}

module.exports = { obterEncomendaCompleta };
