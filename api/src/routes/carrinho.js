// Carrinho de compras, identificado por Sessao_Id (gerado no frontend/cliente,
// sem exigir login). Ver PLANO_PROJETO.md secção 2.2/3 Fase 2.
const express = require('express');
const { getPool, sql } = require('../db');
const { imagensBaseUrl } = require('../utils/imagens');

const router = express.Router();

// GET /api/carrinho/:sessaoId - linhas do carrinho com preco/descricao actuais e stock disponivel
router.get('/:sessaoId', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('sessaoId', sql.NVarChar(100), req.params.sessaoId)
      .query(`
        SELECT c.Id, c.Codigo_Artigo, c.Codigo_Lote, c.Quantidade,
               a.Descritivo_Artigo, v.Descricao_Lote, p.Preco, p.Preco_Outlet,
               CASE WHEN p.Percentagem_Desconto > 0 THEN 1 ELSE 0 END AS Em_Outlet,
               ISNULL(s.Qtd_Disponivel,0) - ISNULL(s.Qtd_Reservada,0) AS Disponivel,
               (SELECT TOP 1 Path FROM dbo.ZAPP_DBSiteCD_Imagens img WHERE img.Codigo_Artigo = c.Codigo_Artigo AND img.Ordem = 0) AS Imagem
        FROM dbo.ZAPP_DBSiteCD_Carrinho c
        INNER JOIN dbo.ZAPP_DBSiteCD_Artigos a ON a.Codigo_Artigo = c.Codigo_Artigo
        LEFT JOIN dbo.ZAPP_DBSiteCD_Precos p ON p.Codigo_Artigo = c.Codigo_Artigo
        LEFT JOIN dbo.ZAPP_DBSiteCD_Variantes v ON v.Codigo_Artigo = c.Codigo_Artigo AND v.Codigo_Lote = c.Codigo_Lote
        LEFT JOIN dbo.ZAPP_DBSiteCD_Stock s ON s.Codigo_Artigo = c.Codigo_Artigo AND s.Codigo_Lote = c.Codigo_Lote AND s.Codigo_Armazem = '001'
        WHERE c.Sessao_Id = @sessaoId
        ORDER BY c.Data_Criacao;
      `);

    const linhas = result.recordset.map((r) => {
      const precoEfetivo = r.Em_Outlet ? r.Preco_Outlet : r.Preco;
      return {
        id: r.Id,
        codigoArtigo: r.Codigo_Artigo,
        codigoLote: r.Codigo_Lote,
        descricao: r.Descritivo_Artigo,
        variante: r.Descricao_Lote,
        quantidade: r.Quantidade,
        preco: precoEfetivo,
        precoOriginal: r.Em_Outlet ? r.Preco : null,
        emOutlet: !!r.Em_Outlet,
        disponivel: r.Disponivel,
        subtotal: precoEfetivo != null ? Math.round(precoEfetivo * r.Quantidade * 100) / 100 : null,
        imagem: r.Imagem ? `${imagensBaseUrl(req)}/${r.Imagem.replace(/^imagens\//, '')}` : null,
      };
    });

    res.json({
      linhas,
      total: Math.round(linhas.reduce((soma, l) => soma + (l.subtotal || 0), 0) * 100) / 100,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao obter carrinho.' });
  }
});

// POST /api/carrinho - { sessaoId, codigoArtigo, codigoLote, quantidade }
router.post('/', async (req, res) => {
  const { sessaoId, codigoArtigo, codigoLote, quantidade } = req.body;
  if (!sessaoId || !codigoArtigo || !codigoLote || !quantidade || quantidade < 1) {
    return res.status(400).json({ erro: 'sessaoId, codigoArtigo, codigoLote e quantidade (>=1) são obrigatórios.' });
  }
  try {
    const pool = await getPool();

    const variante = await pool.request()
      .input('codigoArtigo', sql.VarChar(20), codigoArtigo)
      .input('codigoLote', sql.VarChar(50), codigoLote)
      .query(`
        SELECT ISNULL(s.Qtd_Disponivel,0) - ISNULL(s.Qtd_Reservada,0) AS Disponivel
        FROM dbo.ZAPP_DBSiteCD_Variantes v
        LEFT JOIN dbo.ZAPP_DBSiteCD_Stock s ON s.Codigo_Artigo = v.Codigo_Artigo AND s.Codigo_Lote = v.Codigo_Lote AND s.Codigo_Armazem = '001'
        WHERE v.Codigo_Artigo = @codigoArtigo AND v.Codigo_Lote = @codigoLote AND v.Ativo = 1;
      `);
    if (variante.recordset.length === 0) {
      return res.status(404).json({ erro: 'Variante (artigo/lote) não encontrada.' });
    }
    const disponivel = variante.recordset[0].Disponivel;

    const existente = await pool.request()
      .input('sessaoId', sql.NVarChar(100), sessaoId)
      .input('codigoArtigo', sql.VarChar(20), codigoArtigo)
      .input('codigoLote', sql.VarChar(50), codigoLote)
      .query(`SELECT Id, Quantidade FROM dbo.ZAPP_DBSiteCD_Carrinho WHERE Sessao_Id = @sessaoId AND Codigo_Artigo = @codigoArtigo AND Codigo_Lote = @codigoLote;`);

    const quantidadeFinal = (existente.recordset[0]?.Quantidade || 0) + quantidade;
    if (quantidadeFinal > disponivel) {
      return res.status(409).json({ erro: `Só há ${disponivel} unidade(s) disponível(eis) para esta variante.` });
    }

    if (existente.recordset.length > 0) {
      await pool.request()
        .input('id', sql.Int, existente.recordset[0].Id)
        .input('quantidade', sql.Int, quantidadeFinal)
        .query(`UPDATE dbo.ZAPP_DBSiteCD_Carrinho SET Quantidade = @quantidade WHERE Id = @id;`);
    } else {
      await pool.request()
        .input('sessaoId', sql.NVarChar(100), sessaoId)
        .input('codigoArtigo', sql.VarChar(20), codigoArtigo)
        .input('codigoLote', sql.VarChar(50), codigoLote)
        .input('quantidade', sql.Int, quantidade)
        .query(`
          INSERT INTO dbo.ZAPP_DBSiteCD_Carrinho (Sessao_Id, Codigo_Artigo, Codigo_Lote, Quantidade)
          VALUES (@sessaoId, @codigoArtigo, @codigoLote, @quantidade);
        `);
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao adicionar ao carrinho.' });
  }
});

// PUT /api/carrinho/:id - { quantidade }
router.put('/:id', async (req, res) => {
  const { quantidade } = req.body;
  if (!quantidade || quantidade < 1) {
    return res.status(400).json({ erro: 'quantidade (>=1) é obrigatória.' });
  }
  try {
    const pool = await getPool();

    const linha = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT ISNULL(s.Qtd_Disponivel,0) - ISNULL(s.Qtd_Reservada,0) AS Disponivel
        FROM dbo.ZAPP_DBSiteCD_Carrinho c
        LEFT JOIN dbo.ZAPP_DBSiteCD_Stock s ON s.Codigo_Artigo = c.Codigo_Artigo AND s.Codigo_Lote = c.Codigo_Lote AND s.Codigo_Armazem = '001'
        WHERE c.Id = @id;
      `);
    if (linha.recordset.length === 0) {
      return res.status(404).json({ erro: 'Linha de carrinho não encontrada.' });
    }
    const disponivel = linha.recordset[0].Disponivel;
    if (quantidade > disponivel) {
      return res.status(409).json({ erro: `Só há ${disponivel} unidade(s) disponível(eis) para esta variante.` });
    }

    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('quantidade', sql.Int, quantidade)
      .query(`UPDATE dbo.ZAPP_DBSiteCD_Carrinho SET Quantidade = @quantidade WHERE Id = @id;`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao actualizar linha do carrinho.' });
  }
});

// DELETE /api/carrinho/:id
router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`DELETE FROM dbo.ZAPP_DBSiteCD_Carrinho WHERE Id = @id;`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao remover linha do carrinho.' });
  }
});

module.exports = router;
