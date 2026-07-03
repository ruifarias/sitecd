// Listas de apoio aos filtros da listagem (Marcas, Modalidades, Géneros) - secção 2.3
const express = require('express');
const { getPool } = require('../db');

const router = express.Router();

router.get('/marcas', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT DISTINCT m.Codigo_Marca, m.Marca
      FROM dbo.ZAPP_DBSiteCD_Marcas m
      INNER JOIN dbo.ZAPP_DBSiteCD_Artigos a ON a.Codigo_Marca = m.Codigo_Marca
      WHERE a.Publicado = 1
      ORDER BY m.Marca;
    `);

    // Obter marcas principais da config (formato: "4F,ADIDAS,AMARRAS,...")
    const configRes = await pool.request().query(
      `SELECT Valor FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave = 'MarcasPrincipais';`
    );
    const marcasPrincipaisList = configRes.recordset[0]?.Valor || '';
    const marcasPrincipais = new Set(
      marcasPrincipaisList.split(',').map(m => m.trim().toUpperCase()).filter(m => m)
    );

    const todas = result.recordset.map((r) => ({ codigo: r.Codigo_Marca, nome: r.Marca }));
    const principais = todas.filter(m => marcasPrincipais.has(m.nome.toUpperCase()));
    const outras = todas.filter(m => !marcasPrincipais.has(m.nome.toUpperCase()));

    res.json({ principais, outras });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar marcas.' });
  }
});

router.get('/modalidades', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT Id, Titulo, Tag, Ordem FROM dbo.ZAPP_DBSiteCD_Modalidades WHERE Situacao = 1 ORDER BY Ordem, Titulo;
    `);
    res.json(result.recordset.map((r) => ({ id: r.Id, titulo: r.Titulo, tag: r.Tag })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar modalidades.' });
  }
});

router.get('/generos', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT MIN(Id) AS Id, Titulo, Tag, MIN(Ordem) AS Ordem
      FROM dbo.ZAPP_DBSiteCD_Generos
      WHERE Situacao = 1
      GROUP BY Titulo, Tag
      ORDER BY
        CASE Titulo
          WHEN 'Homem' THEN 1
          WHEN 'Senhora' THEN 2
          WHEN 'Junior' THEN 3
          WHEN 'Rapaz' THEN 4
          WHEN 'Rapariga' THEN 5
          WHEN 'Bebe' THEN 6
          ELSE 99
        END,
        Titulo;
    `);
    res.json(result.recordset.map((r) => ({ id: r.Id, titulo: r.Titulo, tag: r.Tag })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar géneros.' });
  }
});

// Endpoints para ordenação em cascata por Família (Grau 1 -> Grau 2 -> Grau 3 -> Grau 4)
const { sql } = require('../db');

// Debug - listar todas as famílias
router.get('/familias/debug', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT TOP 20 Codigo_Familia, Familia, LEN(Codigo_Familia) AS Comprimento, Situacao
      FROM dbo.ZAPP_DBSiteCD_Familias
      ORDER BY Codigo_Familia;
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar famílias.' });
  }
});

router.get('/familias/grau1', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT DISTINCT f1.Codigo_Familia, f1.Familia
      FROM dbo.ZAPP_DBSiteCD_Familias f1
      WHERE LEN(f1.Codigo_Familia) = 1 AND f1.Situacao = 1
      ORDER BY f1.Codigo_Familia;
    `);
    res.json(result.recordset.map((r) => ({ codigo: r.Codigo_Familia, nome: r.Familia })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar famílias Grau 1.' });
  }
});

router.get('/familias/grau2', async (req, res) => {
  try {
    const grau1 = req.query.grau1;
    if (!grau1) return res.status(400).json({ erro: 'Parâmetro grau1 obrigatório.' });

    const pool = await getPool();
    const result = await pool.request()
      .input('grau1', sql.VarChar(10), grau1)
      .query(`
        SELECT DISTINCT sf.Codigo_Familia, sf.Familia
        FROM dbo.ZAPP_DBSiteCD_SubFamilias1 sf
        WHERE SUBSTRING(sf.Codigo_Familia, 1, 1) = @grau1 AND sf.Situacao = 1
        ORDER BY sf.Codigo_Familia;
      `);
    res.json(result.recordset.map((r) => ({ codigo: r.Codigo_Familia, nome: r.Familia })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar famílias Grau 2.' });
  }
});

router.get('/familias/grau3', async (req, res) => {
  try {
    const grau2 = req.query.grau2;
    if (!grau2) return res.status(400).json({ erro: 'Parâmetro grau2 obrigatório.' });

    const pool = await getPool();
    const result = await pool.request()
      .input('grau2', sql.VarChar(10), grau2)
      .query(`
        SELECT DISTINCT sf.Codigo_Familia, sf.Familia
        FROM dbo.ZAPP_DBSiteCD_SubFamilias2 sf
        WHERE SUBSTRING(sf.Codigo_Familia, 1, 2) = @grau2 AND sf.Situacao = 1
        ORDER BY sf.Codigo_Familia;
      `);
    res.json(result.recordset.map((r) => ({ codigo: r.Codigo_Familia, nome: r.Familia })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar famílias Grau 3.' });
  }
});

router.get('/familias/grau4', async (req, res) => {
  try {
    const grau3 = req.query.grau3;
    if (!grau3) return res.status(400).json({ erro: 'Parâmetro grau3 obrigatório.' });

    const pool = await getPool();
    const result = await pool.request()
      .input('grau3', sql.VarChar(10), grau3)
      .query(`
        SELECT DISTINCT f.Codigo_Familia, f.Familia
        FROM dbo.ZAPP_DBSiteCD_SubFamilias3 f
        WHERE SUBSTRING(f.Codigo_Familia, 1, 3) = @grau3 AND f.Situacao = 1
        ORDER BY f.Codigo_Familia;
      `);
    res.json(result.recordset.map((r) => ({ codigo: r.Codigo_Familia, nome: r.Familia })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar famílias Grau 4.' });
  }
});

module.exports = router;
