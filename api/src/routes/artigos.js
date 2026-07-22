// Endpoints de catálogo: listagem/pesquisa/filtros/ordenação (secção 2.3) e
// ficha de artigo completa (variantes, stock, imagens).
const express = require('express');
const { getPool, sql } = require('../db');
const { imagensBaseUrl, listarImagensAdicionais } = require('../utils/imagens');

const router = express.Router();

// Ordenação por preço usa o preço EFECTIVO (Preco_Outlet quando o artigo tem
// desconto, Preco normal caso contrário) - sem isto, um artigo com desconto de
// 80% (ex.: 97€ -> 19,40€) ordenava pelo valor de tabela, não pelo valor real
// pago, o que ficava mal ordenado (secção 2.3).
const PRECO_EFECTIVO = "CASE WHEN Em_Outlet = 1 THEN Preco_Outlet ELSE Preco END";

// A BD usa Latin1_General_CI_AS (distingue acentos), mas os descritivos tanto
// aparecem com acentos como sem ("CALÇÃO"/"CALCAO") e o utilizador escreve das
// duas formas - as pesquisas de texto livre comparam com collation AI
// (accent-insensitive) para apanhar ambos.
const AI = 'COLLATE Latin1_General_CI_AI';

// Mesma regra usada no separador "Novidades": Novidade_Manual = 1 força
// incluir, = 0 força excluir, NULL segue a regra de Data_Ult_Compra (secção
// 2.6/3). A comparação de datas fica inteiramente no SQL Server (não em JS)
// porque o driver mssql desserializa DATETIME como se já fosse UTC, o que
// desalinha comparações feitas em Node com GETDATE() local (ver nota no
// bug do fuso-horário da confirmação de receção).
function emNovidadeExpr(prefix = '') {
  return `CASE WHEN ${prefix}Novidade_Manual = 1 OR (${prefix}Novidade_Manual IS NULL AND ${prefix}Data_Ult_Compra >= DATEADD(day, -@diasNovidades, GETDATE())) THEN 1 ELSE 0 END`;
}

async function obterDiasNovidades(pool) {
  const configRes = await pool.request().query(
    `SELECT Valor FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave = 'NovidadesDias';`
  );
  return parseInt(configRes.recordset[0]?.Valor, 10) || parseInt(process.env.NOVIDADES_DIAS, 10) || 180;
}

const ORDENACOES = {
  descricao: 'Descritivo_Artigo ASC',
  preco_asc: `${PRECO_EFECTIVO} ASC`,
  preco_desc: `${PRECO_EFECTIVO} DESC`,
  familia: `Familia_Grau1 ASC, Familia_Grau2 ASC, Familia_Grau3 ASC, Familia_Grau4 ASC, ${PRECO_EFECTIVO} DESC`,
  genero: `Genero ASC, ${PRECO_EFECTIVO} DESC`,
  modalidade: `Modalidade ASC, ${PRECO_EFECTIVO} DESC`,
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
      condicoes.push(`Marca ${AI} LIKE @marcaText`);
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
        Descritivo_Artigo ${AI} LIKE @q
        OR Codigo_Artigo LIKE @q
        OR EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Variantes v WHERE v.Codigo_Artigo = ZAPP_DBSiteCD_VCatalogo.Codigo_Artigo AND v.Descricao_Lote ${AI} LIKE @q)
      )`);
      request.input('q', sql.NVarChar(100), `%${req.query.q}%`);
    }

    // Filtros de cor e tamanho - procuram no Descricao_Lote das variantes, exigem que o
    // MESMO lote tenha cor E tamanho (quando ambos indicados) E stock > 0 (secção 2.3)
    if (req.query.cor || req.query.tamanho) {
      const condicoesVariante = [];

      if (req.query.cor) {
        const cor = req.query.cor.trim().toLowerCase();
        const coresVariacoes = {
          'branco': "(v.Descricao_Lote LIKE N'%branco%' OR v.Descricao_Lote LIKE N'%branca%')",
          'branca': "(v.Descricao_Lote LIKE N'%branco%' OR v.Descricao_Lote LIKE N'%branca%')",
          'preto': "(v.Descricao_Lote LIKE N'%preto%' OR v.Descricao_Lote LIKE N'%preta%')",
          'preta': "(v.Descricao_Lote LIKE N'%preto%' OR v.Descricao_Lote LIKE N'%preta%')",
          'amarelo': "(v.Descricao_Lote LIKE N'%amarelo%' OR v.Descricao_Lote LIKE N'%amarela%')",
          'amarela': "(v.Descricao_Lote LIKE N'%amarelo%' OR v.Descricao_Lote LIKE N'%amarela%')",
          'vermelho': "(v.Descricao_Lote LIKE N'%vermelho%' OR v.Descricao_Lote LIKE N'%vermelha%')",
          'vermelha': "(v.Descricao_Lote LIKE N'%vermelho%' OR v.Descricao_Lote LIKE N'%vermelha%')",
          'azul': "(v.Descricao_Lote LIKE N'%azul%')",
          'verde': "(v.Descricao_Lote LIKE N'%verde%')",
          'rosa': "(v.Descricao_Lote LIKE N'%rosa%')",
          'cinzento': "(v.Descricao_Lote LIKE N'%cinzent%')",
          'cinzenta': "(v.Descricao_Lote LIKE N'%cinzent%')",
          'bege': "(v.Descricao_Lote LIKE N'%bege%')",
          'marrom': "(v.Descricao_Lote LIKE N'%marrom%' OR v.Descricao_Lote LIKE N'%castanho%' OR v.Descricao_Lote LIKE N'%castanha%')",
          'castanho': "(v.Descricao_Lote LIKE N'%castanho%' OR v.Descricao_Lote LIKE N'%castanha%' OR v.Descricao_Lote LIKE N'%marrom%')",
          'castanha': "(v.Descricao_Lote LIKE N'%castanho%' OR v.Descricao_Lote LIKE N'%castanha%' OR v.Descricao_Lote LIKE N'%marrom%')",
        };
        request.input('corFiltro', sql.NVarChar(100), `%${cor}%`);
        condicoesVariante.push(coresVariacoes[cor] || `v.Descricao_Lote ${AI} LIKE @corFiltro`);
      }

      if (req.query.tamanho) {
        request.input('tamanhoFiltro', sql.NVarChar(50), `%- ${req.query.tamanho.trim()}%`);
        condicoesVariante.push('v.Descricao_Lote LIKE @tamanhoFiltro');
      }

      const condicaoVarianteStr = condicoesVariante.join(' AND ');
      condicoes.push(`EXISTS (
        SELECT 1 FROM dbo.ZAPP_DBSiteCD_Variantes v
        JOIN dbo.ZAPP_DBSiteCD_Stock s ON s.Codigo_Artigo = v.Codigo_Artigo AND s.Codigo_Lote = v.Codigo_Lote AND s.Codigo_Armazem = '001'
        WHERE v.Codigo_Artigo = ZAPP_DBSiteCD_VCatalogo.Codigo_Artigo
          AND ${condicaoVarianteStr}
          AND (s.Qtd_Disponivel - s.Qtd_Reservada) > 0
      )`);
    }

    const diasNovidades = await obterDiasNovidades(pool);
    request.input('diasNovidades', sql.Int, diasNovidades);

    const separador = req.query.separador;
    if (separador === 'novidades') {
      condicoes.push(`(${emNovidadeExpr()} = 1)`);
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
      SELECT Codigo_Artigo, Descritivo_Artigo, Slug, Marca, Familia_Grau1, Familia_Grau2, Familia_Grau3, Familia_Grau4, Codigo_Familia,
             Modalidade, Genero, Preco, Percentagem_Desconto, Preco_Outlet, Em_Outlet,
             ${emNovidadeExpr()} AS Em_Novidade,
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
        familiaGrau1: r.Familia_Grau1,
        familiaGrau2: r.Familia_Grau2,
        familiaGrau3: r.Familia_Grau3,
        familiaGrau4: r.Familia_Grau4,
        codigoFamilia: r.Codigo_Familia,
        modalidade: r.Modalidade,
        genero: r.Genero,
        preco: r.Preco,
        percentagemDesconto: r.Percentagem_Desconto,
        precoOutlet: r.Preco_Outlet,
        emOutlet: !!r.Em_Outlet,
        emNovidade: !!r.Em_Novidade,
        imagem: r.Imagem_Principal ? `${imagensBaseUrl(req)}/${r.Imagem_Principal.replace(/^imagens\//, '')}` : null,
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

    const diasNovidades = await obterDiasNovidades(pool);

    const artigoRes = await pool.request()
      .input('codigo', sql.VarChar(20), req.params.codigo)
      .input('diasNovidades', sql.Int, diasNovidades)
      .query(`SELECT *, ${emNovidadeExpr()} AS Em_Novidade FROM dbo.ZAPP_DBSiteCD_VCatalogo WHERE Codigo_Artigo = @codigo AND Publicado = 1;`);

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

    // Junta as imagens da BD (normalmente só a principal, Ordem = 0) com as
    // adicionais encontradas no disco (Ordem >= 1, ver listarImagensAdicionais).
    const ordensExistentes = new Set(imagensRes.recordset.map((img) => img.Ordem));
    const imagensAdicionais = listarImagensAdicionais(req.params.codigo)
      .filter((img) => !ordensExistentes.has(img.ordem));
    const todasImagens = [
      ...imagensRes.recordset.map((img) => ({ ordem: img.Ordem, path: img.Path })),
      ...imagensAdicionais,
    ].sort((a, b) => a.ordem - b.ordem);

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
      emNovidade: !!a.Em_Novidade,
      variantes: variantesRes.recordset.map((v) => ({
        codigoLote: v.Codigo_Lote,
        descricao: v.Descricao_Lote,
        disponivel: (v.Qtd_Disponivel || 0) - (v.Qtd_Reservada || 0),
      })),
      imagens: todasImagens.map((img) => `${imagensBaseUrl(req)}/${img.path.replace(/^imagens\//, '')}`),
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

    // Depois, buscar todos os artigos da mesma sub-família (máx 20) com filtros opcionais
    const request = pool.request();
    const condicoes = ['a.Codigo_Familia = @familia', 'a.Publicado = 1'];

    const diasNovidades = await obterDiasNovidades(pool);
    request.input('familia', sql.VarChar(10), codigoFamilia);
    request.input('diasNovidades', sql.Int, diasNovidades);

    // Aplicar filtros de cor e tamanho - exigem que o MESMO lote tenha cor E tamanho
    // (quando ambos indicados) E stock > 0 (Qtd_Disponivel/Qtd_Reservada vêm da tabela Stock)
    const coresVariacoes = {
      'branco': "(v.Descricao_Lote LIKE N'%branco%' OR v.Descricao_Lote LIKE N'%branca%')",
      'branca': "(v.Descricao_Lote LIKE N'%branco%' OR v.Descricao_Lote LIKE N'%branca%')",
      'preto': "(v.Descricao_Lote LIKE N'%preto%' OR v.Descricao_Lote LIKE N'%preta%')",
      'preta': "(v.Descricao_Lote LIKE N'%preto%' OR v.Descricao_Lote LIKE N'%preta%')",
      'amarelo': "(v.Descricao_Lote LIKE N'%amarelo%' OR v.Descricao_Lote LIKE N'%amarela%')",
      'amarela': "(v.Descricao_Lote LIKE N'%amarelo%' OR v.Descricao_Lote LIKE N'%amarela%')",
      'vermelho': "(v.Descricao_Lote LIKE N'%vermelho%' OR v.Descricao_Lote LIKE N'%vermelha%')",
      'vermelha': "(v.Descricao_Lote LIKE N'%vermelho%' OR v.Descricao_Lote LIKE N'%vermelha%')",
      'azul': "(v.Descricao_Lote LIKE N'%azul%')",
      'verde': "(v.Descricao_Lote LIKE N'%verde%')",
      'rosa': "(v.Descricao_Lote LIKE N'%rosa%')",
      'cinzento': "(v.Descricao_Lote LIKE N'%cinzent%')",
      'cinzenta': "(v.Descricao_Lote LIKE N'%cinzent%')",
      'bege': "(v.Descricao_Lote LIKE N'%bege%')",
      'marrom': "(v.Descricao_Lote LIKE N'%marrom%' OR v.Descricao_Lote LIKE N'%castanho%' OR v.Descricao_Lote LIKE N'%castanha%')",
      'castanho': "(v.Descricao_Lote LIKE N'%castanho%' OR v.Descricao_Lote LIKE N'%castanha%' OR v.Descricao_Lote LIKE N'%marrom%')",
      'castanha': "(v.Descricao_Lote LIKE N'%castanho%' OR v.Descricao_Lote LIKE N'%castanha%' OR v.Descricao_Lote LIKE N'%marrom%')",
    };

    if (req.query.cor || req.query.tamanho) {
      const condicoesVariante = [];

      if (req.query.cor) {
        const cor = req.query.cor.trim().toLowerCase();
        request.input('corFiltroSub', sql.NVarChar(100), `%${cor}%`);
        condicoesVariante.push(coresVariacoes[cor] || `v.Descricao_Lote ${AI} LIKE @corFiltroSub`);
      }

      if (req.query.tamanho) {
        request.input('tamanhoFiltroSub', sql.NVarChar(50), `%- ${req.query.tamanho.trim()}%`);
        condicoesVariante.push('v.Descricao_Lote LIKE @tamanhoFiltroSub');
      }

      const condicaoVarianteStr = condicoesVariante.join(' AND ');
      condicoes.push(`EXISTS (
        SELECT 1 FROM dbo.ZAPP_DBSiteCD_Variantes v
        JOIN dbo.ZAPP_DBSiteCD_Stock s ON s.Codigo_Artigo = v.Codigo_Artigo AND s.Codigo_Lote = v.Codigo_Lote AND s.Codigo_Armazem = '001'
        WHERE v.Codigo_Artigo = a.Codigo_Artigo
          AND ${condicaoVarianteStr}
          AND (s.Qtd_Disponivel - s.Qtd_Reservada) > 0
      )`);
    }

    if (req.query.q) {
      request.input('q', sql.NVarChar(100), `%${req.query.q}%`);
      condicoes.push(`a.Descritivo_Artigo ${AI} LIKE @q`);
    }

    if (req.query.marcaText) {
      request.input('marcaText', sql.NVarChar(100), `%${req.query.marcaText}%`);
      condicoes.push(`a.Marca ${AI} LIKE @marcaText`);
    }

    if (req.query.marca) {
      request.input('marca', sql.VarChar(3), req.query.marca);
      condicoes.push('a.Codigo_Marca = @marca');
    }

    if (req.query.genero) {
      request.input('genero', sql.NVarChar(50), req.query.genero);
      condicoes.push('a.Genero_Tag = @genero');
    }

    if (req.query.modalidade) {
      request.input('modalidade', sql.NVarChar(50), req.query.modalidade);
      condicoes.push('a.Modalidade_Tag = @modalidade');
    }

    const whereClause = condicoes.join(' AND ');

    // Depois, buscar todos os artigos da mesma sub-família (máx 40), do preço
    // mais elevado para o mais baixo (preço efectivo - com desconto Outlet
    // quando aplicável)
    const result = await request.query(`
      SELECT TOP 40 a.Codigo_Artigo, a.Descritivo_Artigo, a.Marca, a.Preco, a.Percentagem_Desconto, a.Preco_Outlet, a.Em_Outlet,
             a.Familia_Grau1, a.Familia_Grau2, a.Familia_Grau3, a.Familia_Grau4,
             ${emNovidadeExpr('a.')} AS Em_Novidade,
             (SELECT TOP 1 Path FROM dbo.ZAPP_DBSiteCD_Imagens img WHERE img.Codigo_Artigo = a.Codigo_Artigo AND img.Ordem = 0) AS Imagem_Principal
      FROM dbo.ZAPP_DBSiteCD_VCatalogo a
      WHERE ${whereClause}
      ORDER BY ${PRECO_EFECTIVO} DESC;
    `);

    // Obter info da família do artigo original
    const artigoFullRes = await pool.request()
      .input('codigo', sql.VarChar(20), req.params.codigo)
      .query(`SELECT Familia_Grau1, Familia_Grau2, Familia_Grau3, Familia_Grau4 FROM dbo.ZAPP_DBSiteCD_VCatalogo WHERE Codigo_Artigo = @codigo;`);

    const artigoFull = artigoFullRes.recordset[0] || {};

    // Códigos de família por nível - derivados do código completo (Codigo_Familia)
    // por prefixo, tal como em /familias/grau2, /grau3, /grau4 (grau1 = 1 carácter,
    // grau2 = 2, grau3 = 3, grau4 = código completo)
    res.json({
      familiaGrau1: artigoFull.Familia_Grau1,
      familiaGrau2: artigoFull.Familia_Grau2,
      familiaGrau3: artigoFull.Familia_Grau3,
      familiaGrau4: artigoFull.Familia_Grau4,
      codigoFamiliaGrau1: codigoFamilia.substring(0, 1),
      codigoFamiliaGrau2: codigoFamilia.substring(0, 2),
      codigoFamiliaGrau3: codigoFamilia.substring(0, 3),
      codigoFamiliaGrau4: codigoFamilia,
      artigos: result.recordset.map((r) => ({
        codigo: r.Codigo_Artigo,
        descricao: r.Descritivo_Artigo,
        marca: r.Marca,
        preco: r.Preco,
        percentagemDesconto: r.Percentagem_Desconto,
        precoOutlet: r.Preco_Outlet,
        emOutlet: !!r.Em_Outlet,
        emNovidade: !!r.Em_Novidade,
        imagem: r.Imagem_Principal ? `${imagensBaseUrl(req)}/${r.Imagem_Principal.replace(/^imagens\//, '')}` : null,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar artigos da mesma sub-família.' });
  }
});

module.exports = router;
