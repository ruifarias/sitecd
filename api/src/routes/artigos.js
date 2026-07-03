// Endpoints de catálogo: listagem/pesquisa/filtros/ordenação (secção 2.3) e
// ficha de artigo completa (variantes, stock, imagens).
const express = require('express');
const { getPool, sql } = require('../db');

const router = express.Router();

// Ordenação por preço usa o preço EFECTIVO (Preco_Outlet quando o artigo tem
// desconto, Preco normal caso contrário) - sem isto, um artigo com desconto de
// 80% (ex.: 97€ -> 19,40€) ordenava pelo valor de tabela, não pelo valor real
// pago, o que ficava mal ordenado (secção 2.3).
const PRECO_EFECTIVO = "CASE WHEN Em_Outlet = 1 THEN Preco_Outlet ELSE Preco END";

const ORDENACOES = {
  descricao: 'Descritivo_Artigo ASC',
  preco_asc: `${PRECO_EFECTIVO} ASC`,
  preco_desc: `${PRECO_EFECTIVO} DESC`,
  familia: 'Familia_Grau1 ASC, Familia_Grau3 ASC',
  genero: 'Genero ASC',
  modalidade: 'Modalidade ASC',
};

// GET /api/artigos?familia=&marca=&modalidade=&genero=&q=&separador=&ordenar=&page=&pageSize=
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();

    const condicoes = ['Publicado = 1'];

    if (req.query.familia) {
      condicoes.push(`(Codigo_Familia = @familia OR Codigo_Familia_Grau3 = @familia OR Codigo_Familia_Grau2 = @familia OR Codigo_Familia_Grau1 = @familia)`);
      request.input('familia', sql.VarChar(10), req.query.familia);
    }
    if (req.query.marca) {
      condicoes.push('Codigo_Marca = @marca');
      request.input('marca', sql.VarChar(3), req.query.marca);
    }
    if (req.query.marcaText) {
      condicoes.push('Marca LIKE @marcaText');
      request.input('marcaText', sql.NVarChar(100), `%${req.query.marcaText}%`);
    }
    if (req.query.modalidade) {
      condicoes.push('Modalidade_Tag = @modalidade');
      request.input('modalidade', sql.NVarChar(50), req.query.modalidade);
    }
    if (req.query.genero) {
      condicoes.push('Genero_Tag = @genero');
      request.input('genero', sql.NVarChar(50), req.query.genero);
    }
    if (req.query.codigo) {
      condicoes.push('Codigo_Artigo = @codigo');
      request.input('codigo', sql.VarChar(20), req.query.codigo);
    }
    if (req.query.q) {
      // pesquisa livre: descricao do artigo, codigo, ou texto do lote (cor/tamanho - secção 2.3, sem parsing)
      condicoes.push(`(
        Descritivo_Artigo LIKE @q
        OR Codigo_Artigo LIKE @q
        OR EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Variantes v WHERE v.Codigo_Artigo = ZAPP_DBSiteCD_VCatalogo.Codigo_Artigo AND v.Descricao_Lote LIKE @q)
      )`);
      request.input('q', sql.NVarChar(100), `%${req.query.q}%`);
    }

    // Filtros de cor e tamanho - procuram no Descricao_Lote das variantes
    if (req.query.cor || req.query.tamanho) {
      let condicaoCor = '';
      if (req.query.cor) {
        const cor = req.query.cor.trim();
        // Considerar variações de género da cor (ex: Branco/Branca, Amarelo/Amarela, Preto/Preta)
        const coresVariacoes = {
          'branco': "Descricao_Lote LIKE N'%branco%' OR Descricao_Lote LIKE N'%branca%'",
          'branca': "Descricao_Lote LIKE N'%branco%' OR Descricao_Lote LIKE N'%branca%'",
          'preto': "Descricao_Lote LIKE N'%preto%' OR Descricao_Lote LIKE N'%preta%'",
          'preta': "Descricao_Lote LIKE N'%preto%' OR Descricao_Lote LIKE N'%preta%'",
          'amarelo': "Descricao_Lote LIKE N'%amarelo%' OR Descricao_Lote LIKE N'%amarela%'",
          'amarela': "Descricao_Lote LIKE N'%amarelo%' OR Descricao_Lote LIKE N'%amarela%'",
          'vermelho': "Descricao_Lote LIKE N'%vermelho%' OR Descricao_Lote LIKE N'%vermelha%'",
          'vermelha': "Descricao_Lote LIKE N'%vermelho%' OR Descricao_Lote LIKE N'%vermelha%'",
          'azul': "Descricao_Lote LIKE N'%azul%'",
          'verde': "Descricao_Lote LIKE N'%verde%'",
          'rosa': "Descricao_Lote LIKE N'%rosa%'",
          'cinzento': "Descricao_Lote LIKE N'%cinzent%'",
          'cinzenta': "Descricao_Lote LIKE N'%cinzent%'",
          'bege': "Descricao_Lote LIKE N'%bege%'",
          'marrom': "Descricao_Lote LIKE N'%marrom%' OR Descricao_Lote LIKE N'%castanho%' OR Descricao_Lote LIKE N'%castanha%'",
          'castanho': "Descricao_Lote LIKE N'%castanho%' OR Descricao_Lote LIKE N'%castanha%' OR Descricao_Lote LIKE N'%marrom%'",
          'castanha': "Descricao_Lote LIKE N'%castanho%' OR Descricao_Lote LIKE N'%castanha%' OR Descricao_Lote LIKE N'%marrom%'"
        };
        const corLower = cor.toLowerCase();
        if (coresVariacoes[corLower]) {
          condicaoCor = coresVariacoes[corLower];
        } else {
          condicaoCor = `Descricao_Lote LIKE N'%${cor}%'`;
        }
      }

      let condicaoTamanho = '';
      if (req.query.tamanho) {
        // Procurar tamanho com formato "- 44" (hífen + espaço + tamanho)
        condicaoTamanho = `Descricao_Lote LIKE N'%- ${req.query.tamanho}%'`;
      }

      let condicaoFinal = '';
      if (condicaoCor && condicaoTamanho) {
        condicaoFinal = `EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Variantes v WHERE v.Codigo_Artigo = ZAPP_DBSiteCD_VCatalogo.Codigo_Artigo AND (${condicaoCor}) AND (${condicaoTamanho}))`;
      } else if (condicaoCor) {
        condicaoFinal = `EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Variantes v WHERE v.Codigo_Artigo = ZAPP_DBSiteCD_VCatalogo.Codigo_Artigo AND (${condicaoCor}))`;
      } else if (condicaoTamanho) {
        condicaoFinal = `EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Variantes v WHERE v.Codigo_Artigo = ZAPP_DBSiteCD_VCatalogo.Codigo_Artigo AND (${condicaoTamanho}))`;
      }

      if (condicaoFinal) {
        condicoes.push(condicaoFinal);
      }
    }

    const separador = req.query.separador;
    if (separador === 'novidades') {
      const configRes = await pool.request().query(
        `SELECT Valor FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave = 'NovidadesDias';`
      );
      const dias = parseInt(configRes.recordset[0]?.Valor, 10) || parseInt(process.env.NOVIDADES_DIAS, 10) || 180;
      // Novidade_Manual = 1 força incluir, = 0 força excluir, NULL segue a regra de Data_Ult_Compra (secção 2.6/3)
      condicoes.push(`(Novidade_Manual = 1 OR (Novidade_Manual IS NULL AND Data_Ult_Compra >= DATEADD(day, -${dias}, GETDATE())))`);
    } else if (separador === 'outlet') {
      condicoes.push('Em_Outlet = 1');
    }

    const ordenar = ORDENACOES[req.query.ordenar] || ORDENACOES.descricao;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 24, 1), 100);
    const offset = (page - 1) * pageSize;

    const whereClause = condicoes.join(' AND ');

    request.input('offset', sql.Int, offset);
    request.input('pageSize', sql.Int, pageSize);

    const result = await request.query(`
      SELECT Codigo_Artigo, Descritivo_Artigo, Slug, Marca, Familia_Grau1, Familia_Grau3,
             Modalidade, Genero, Preco, Percentagem_Desconto, Preco_Outlet, Em_Outlet,
             (SELECT TOP 1 Path FROM dbo.ZAPP_DBSiteCD_Imagens img WHERE img.Codigo_Artigo = ZAPP_DBSiteCD_VCatalogo.Codigo_Artigo AND img.Ordem = 0) AS Imagem_Principal,
             COUNT(*) OVER() AS Total
      FROM dbo.ZAPP_DBSiteCD_VCatalogo
      WHERE ${whereClause}
      ORDER BY ${ordenar}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
    `);

    const total = result.recordset[0]?.Total || 0;
    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      artigos: result.recordset.map((r) => ({
        codigo: r.Codigo_Artigo,
        descricao: r.Descritivo_Artigo,
        slug: r.Slug,
        marca: r.Marca,
        familia: r.Familia_Grau1,
        subFamilia: r.Familia_Grau3,
        modalidade: r.Modalidade,
        genero: r.Genero,
        preco: r.Preco,
        percentagemDesconto: r.Percentagem_Desconto,
        precoOutlet: r.Preco_Outlet,
        emOutlet: !!r.Em_Outlet,
        imagem: r.Imagem_Principal ? `${process.env.IMAGES_BASE_URL}/${r.Imagem_Principal.replace(/^imagens\//, '')}` : null,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar artigos.' });
  }
});

// GET /api/artigos/:codigo - ficha completa (variantes/stock/imagens)
router.get('/:codigo', async (req, res) => {
  try {
    const pool = await getPool();

    const artigoRes = await pool.request()
      .input('codigo', sql.VarChar(20), req.params.codigo)
      .query(`SELECT * FROM dbo.ZAPP_DBSiteCD_VCatalogo WHERE Codigo_Artigo = @codigo AND Publicado = 1;`);

    if (artigoRes.recordset.length === 0) {
      return res.status(404).json({ erro: 'Artigo não encontrado.' });
    }
    const a = artigoRes.recordset[0];

    const variantesRes = await pool.request()
      .input('codigo', sql.VarChar(20), req.params.codigo)
      .query(`
        SELECT v.Codigo_Lote, v.Descricao_Lote, s.Qtd_Disponivel, s.Qtd_Reservada
        FROM dbo.ZAPP_DBSiteCD_Variantes v
        LEFT JOIN dbo.ZAPP_DBSiteCD_Stock s ON s.Codigo_Artigo = v.Codigo_Artigo AND s.Codigo_Lote = v.Codigo_Lote AND s.Codigo_Armazem = '001'
        WHERE v.Codigo_Artigo = @codigo AND v.Ativo = 1
        ORDER BY v.Codigo_Lote;
      `);

    const imagensRes = await pool.request()
      .input('codigo', sql.VarChar(20), req.params.codigo)
      .query(`SELECT Ordem, Path FROM dbo.ZAPP_DBSiteCD_Imagens WHERE Codigo_Artigo = @codigo ORDER BY Ordem;`);

    res.json({
      codigo: a.Codigo_Artigo,
      descricao: a.Descritivo_Artigo,
      slug: a.Slug,
      marca: a.Marca,
      familia: a.Familia_Grau1,
      familiaGrau3: a.Familia_Grau3,
      familiaGrau4: a.Codigo_Familia,
      modalidade: a.Modalidade,
      genero: a.Genero,
      descricaoLonga: a.Descricao_Longa,
      preco: a.Preco,
      percentagemDesconto: a.Percentagem_Desconto,
      precoOutlet: a.Preco_Outlet,
      emOutlet: !!a.Em_Outlet,
      variantes: variantesRes.recordset.map((v) => ({
        codigoLote: v.Codigo_Lote,
        descricao: v.Descricao_Lote,
        disponivel: (v.Qtd_Disponivel || 0) - (v.Qtd_Reservada || 0),
      })),
      imagens: imagensRes.recordset.map((img) => `${process.env.IMAGES_BASE_URL}/${img.Path.replace(/^imagens\//, '')}`),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao obter ficha de artigo.' });
  }
});

// GET /api/artigos/:codigo/mesma-subfamilia - artigos da mesma sub-família (Grau 4)
router.get('/:codigo/mesma-subfamilia', async (req, res) => {
  try {
    const pool = await getPool();

    // Primeiro, obter a sub-família (Grau 4) do artigo
    const artigoRes = await pool.request()
      .input('codigo', sql.VarChar(20), req.params.codigo)
      .query(`SELECT Codigo_Familia FROM dbo.ZAPP_DBSiteCD_VCatalogo WHERE Codigo_Artigo = @codigo AND Publicado = 1;`);

    if (artigoRes.recordset.length === 0) {
      return res.status(404).json({ erro: 'Artigo não encontrado.' });
    }

    const codigoFamilia = artigoRes.recordset[0].Codigo_Familia;

    // Depois, buscar todos os artigos da mesma sub-família (máx 10)
    const result = await pool.request()
      .input('familia', sql.VarChar(10), codigoFamilia)
      .query(`
        SELECT TOP 10 Codigo_Artigo, Descritivo_Artigo, Marca, Preco, Percentagem_Desconto, Preco_Outlet, Em_Outlet
        FROM dbo.ZAPP_DBSiteCD_VCatalogo
        WHERE Codigo_Familia = @familia AND Publicado = 1
        ORDER BY Descritivo_Artigo;
      `);

    res.json(result.recordset.map((r) => ({
      codigo: r.Codigo_Artigo,
      descricao: r.Descritivo_Artigo,
      marca: r.Marca,
      preco: r.Preco,
      percentagemDesconto: r.Percentagem_Desconto,
      precoOutlet: r.Preco_Outlet,
      emOutlet: !!r.Em_Outlet,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar artigos da mesma sub-família.' });
  }
});

module.exports = router;
