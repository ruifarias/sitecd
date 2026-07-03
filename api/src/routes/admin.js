// Endpoints do Backoffice: configuração, gestão de artigos (publicar/despublicar,
// Novidade manual), famílias por classificar, e consulta ao log de sincronização.
// Ver PLANO_PROJETO.md secção 3 Fase 3.
// NOTA: sem autenticação por agora (ambiente de testes local) - a acrescentar
// antes de ir para produção (Fase 4/5).
const express = require('express');
const { getPool, sql } = require('../db');

const router = express.Router();

// ---- Configuração ----
router.get('/config', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT Chave, Valor FROM dbo.ZAPP_DBSiteCD_Config;');
    const config = {};
    result.recordset.forEach((r) => { config[r.Chave] = r.Valor; });
    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao obter configuração.' });
  }
});

router.put('/config/:chave', async (req, res) => {
  const { valor } = req.body;
  if (valor == null) return res.status(400).json({ erro: 'valor é obrigatório.' });
  try {
    const pool = await getPool();
    await pool.request()
      .input('chave', sql.VarChar(50), req.params.chave)
      .input('valor', sql.NVarChar(200), String(valor))
      .query(`
        MERGE dbo.ZAPP_DBSiteCD_Config AS tgt
        USING (SELECT @chave AS Chave) AS src ON tgt.Chave = src.Chave
        WHEN MATCHED THEN UPDATE SET tgt.Valor = @valor
        WHEN NOT MATCHED THEN INSERT (Chave, Valor) VALUES (@chave, @valor);
      `);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao actualizar configuração.' });
  }
});

// ---- Log de sincronização ----
router.get('/sync-log', async (req, res) => {
  try {
    const pool = await getPool();
    const limite = Math.min(parseInt(req.query.limite, 10) || 100, 500);
    const result = await pool.request()
      .input('limite', sql.Int, limite)
      .query(`SELECT TOP (@limite) Id, Data_Hora, Tipo, Sucesso, Registos_Processados, Mensagem FROM dbo.ZAPP_DBSiteCD_SyncLog ORDER BY Id DESC;`);
    res.json(result.recordset.map((r) => ({
      id: r.Id,
      dataHora: r.Data_Hora,
      tipo: r.Tipo,
      sucesso: !!r.Sucesso,
      registos: r.Registos_Processados,
      mensagem: r.Mensagem,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao obter log de sincronização.' });
  }
});

// ---- Famílias por classificar (Modalidade/Género em falta, com artigos publicados reais) ----
router.get('/familias-por-classificar', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT DISTINCT f4.Codigo_Familia, f4.Familia, f1.Familia AS Categoria,
             COALESCE(f4.Modalidade_Id, f3.Modalidade_Id) AS Modalidade_Id_Actual,
             modal.Titulo AS Modalidade_Titulo_Actual,
             COALESCE(f4.Genero_Id, f3.Genero_Id) AS Genero_Id_Actual,
             gen.Titulo AS Genero_Titulo_Actual,
             COUNT(a.Codigo_Artigo) OVER (PARTITION BY f4.Codigo_Familia) AS NumArtigos
      FROM dbo.ZAPP_DBSiteCD_SubFamilias3 f4
      INNER JOIN dbo.ZAPP_DBSiteCD_SubFamilias2 f3 ON f3.Codigo_Familia = f4.Codigo_Familia_Pai
      INNER JOIN dbo.ZAPP_DBSiteCD_SubFamilias1 f2 ON f2.Codigo_Familia = f3.Codigo_Familia_Pai
      INNER JOIN dbo.ZAPP_DBSiteCD_Familias f1 ON f1.Codigo_Familia = f2.Codigo_Familia_Pai
      INNER JOIN dbo.ZAPP_DBSiteCD_Artigos a ON a.Codigo_Familia = f4.Codigo_Familia AND a.Publicado = 1
      LEFT JOIN dbo.ZAPP_DBSiteCD_Modalidades modal ON modal.Id = COALESCE(f4.Modalidade_Id, f3.Modalidade_Id)
      LEFT JOIN dbo.ZAPP_DBSiteCD_Generos gen ON gen.Id = COALESCE(f4.Genero_Id, f3.Genero_Id)
      WHERE COALESCE(f4.Modalidade_Id, f3.Modalidade_Id) IS NULL
         OR COALESCE(f4.Genero_Id, f3.Genero_Id) IS NULL
      ORDER BY NumArtigos DESC;
    `);
    res.json(result.recordset.map((r) => ({
      codigoFamilia: r.Codigo_Familia,
      familia: r.Familia,
      categoria: r.Categoria,
      numArtigos: r.NumArtigos,
      // já classificado (herdado do Grau3 ou já definido no Grau4) - usado para pré-seleccionar no
      // formulário sem apagar por engano um valor já correcto (secção 3 Fase 3). Comparado por
      // TÍTULO no frontend, não por Id - a lista /api/generos agrupa por Titulo/Tag (dedupe entre
      // Calçado/Têxtil) e pode devolver um Id de categoria diferente do realmente associado à família.
      modalidadeIdActual: r.Modalidade_Id_Actual,
      modalidadeTituloActual: r.Modalidade_Titulo_Actual,
      generoIdActual: r.Genero_Id_Actual,
      generoTituloActual: r.Genero_Titulo_Actual,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao obter famílias por classificar.' });
  }
});

router.put('/familias/:codigo/classificar', async (req, res) => {
  const { modalidadeId, generoId } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input('codigo', sql.VarChar(10), req.params.codigo)
      .input('modalidadeId', sql.Int, modalidadeId || null)
      .input('generoId', sql.Int, generoId || null)
      .query(`
        UPDATE dbo.ZAPP_DBSiteCD_SubFamilias3
        SET Modalidade_Id = @modalidadeId, Genero_Id = @generoId
        WHERE Codigo_Familia = @codigo;
      `);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao classificar família.' });
  }
});

// ---- Gestão de artigos (publicar/despublicar manualmente, Novidade manual) ----
router.get('/artigos', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    const condicoes = [];
    if (req.query.q) {
      condicoes.push('(Descritivo_Artigo LIKE @q OR Codigo_Artigo LIKE @q)');
      request.input('q', sql.NVarChar(100), `%${req.query.q}%`);
    }
    const whereClause = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';
    const result = await request.query(`
      SELECT TOP 100 Codigo_Artigo, Descritivo_Artigo, Publicado, Eliminado_Na_Origem, Novidade_Manual, Data_Sincronizacao
      FROM dbo.ZAPP_DBSiteCD_Artigos
      ${whereClause}
      ORDER BY Data_Sincronizacao DESC;
    `);
    res.json(result.recordset.map((r) => ({
      codigo: r.Codigo_Artigo,
      descricao: r.Descritivo_Artigo,
      publicado: !!r.Publicado,
      eliminadoNaOrigem: !!r.Eliminado_Na_Origem,
      novidadeManual: r.Novidade_Manual,
      dataSincronizacao: r.Data_Sincronizacao,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar artigos.' });
  }
});

router.put('/artigos/:codigo', async (req, res) => {
  const { publicado, novidadeManual } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input('codigo', sql.VarChar(20), req.params.codigo)
      .input('publicado', sql.Bit, publicado != null ? (publicado ? 1 : 0) : null)
      .input('novidadeManual', sql.Bit, novidadeManual != null ? (novidadeManual ? 1 : 0) : null)
      .query(`
        UPDATE dbo.ZAPP_DBSiteCD_Artigos
        SET Publicado = COALESCE(@publicado, Publicado),
            Novidade_Manual = CASE WHEN @novidadeManual IS NOT NULL THEN @novidadeManual ELSE Novidade_Manual END
        WHERE Codigo_Artigo = @codigo;
      `);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao actualizar artigo.' });
  }
});

// ---- Visibilidade de Famílias (Grau 1) ----
router.get('/familias-visibilidade', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT DISTINCT f.Codigo_Familia, f.Familia, f.Situacao
      FROM dbo.ZAPP_DBSiteCD_Familias f
      WHERE LEN(f.Codigo_Familia) = 1
      ORDER BY f.Codigo_Familia;
    `);
    res.json(result.recordset.map((r) => ({
      codigo: r.Codigo_Familia,
      nome: r.Familia,
      visivel: !!r.Situacao,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar visibilidade de famílias.' });
  }
});

router.put('/familias-visibilidade/:codigo', async (req, res) => {
  const { visivel } = req.body;
  if (visivel == null) return res.status(400).json({ erro: 'visivel é obrigatório.' });
  try {
    const pool = await getPool();
    await pool.request()
      .input('codigo', sql.VarChar(10), req.params.codigo)
      .input('visivel', sql.Bit, visivel ? 1 : 0)
      .query(`
        UPDATE dbo.ZAPP_DBSiteCD_Familias
        SET Situacao = @visivel
        WHERE Codigo_Familia = @codigo AND LEN(Codigo_Familia) = 1;
      `);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao actualizar visibilidade de família.' });
  }
});

// ---- Visibilidade de Famílias (Grau 1) ----
router.get('/familias-visibilidade', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT Codigo_Familia, Familia, Situacao
      FROM dbo.ZAPP_DBSiteCD_Familias
      WHERE LEN(Codigo_Familia) = 1
      ORDER BY Codigo_Familia;
    `);

    res.json(result.recordset.map((r) => ({
      codigo: r.Codigo_Familia,
      nome: r.Familia,
      visivel: !!r.Situacao,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar famílias.' });
  }
});

router.put('/familia/:codigo/visibilidade', async (req, res) => {
  const { visivel } = req.body;
  if (typeof visivel !== 'boolean') return res.status(400).json({ erro: 'visivel deve ser boolean.' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('codigo', sql.VarChar(10), req.params.codigo)
      .input('visivel', sql.Bit, visivel ? 1 : 0)
      .query(`
        UPDATE dbo.ZAPP_DBSiteCD_Familias
        SET Situacao = @visivel
        WHERE Codigo_Familia = @codigo AND LEN(Codigo_Familia) = 1;
      `);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao actualizar visibilidade.' });
  }
});

router.put('/familia/:codigo/classificacao', async (req, res) => {
  const { modalidadeId, generoId } = req.body;

  try {
    const pool = await getPool();
    const codigo = req.params.codigo;

    // Atualizar Grau 4 (SubFamilias3)
    await pool.request()
      .input('codigo', sql.VarChar(10), codigo)
      .input('modalidadeId', sql.Int, modalidadeId || null)
      .input('generoId', sql.Int, generoId || null)
      .query(`
        UPDATE dbo.ZAPP_DBSiteCD_SubFamilias3
        SET Modalidade_Id = @modalidadeId, Genero_Id = @generoId
        WHERE Codigo_Familia = @codigo;
      `);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao actualizar classificação.' });
  }
});

// ---- Gestão de Marcas Principais ----
router.get('/marcas-principais', async (req, res) => {
  try {
    const pool = await getPool();
    // Obter todas as marcas
    const marcasRes = await pool.request().query(`
      SELECT DISTINCT m.Codigo_Marca, m.Marca
      FROM dbo.ZAPP_DBSiteCD_Marcas m
      INNER JOIN dbo.ZAPP_DBSiteCD_Artigos a ON a.Codigo_Marca = m.Codigo_Marca
      WHERE a.Publicado = 1
      ORDER BY m.Marca;
    `);

    // Obter lista de marcas principais da config
    const configRes = await pool.request().query(
      `SELECT Valor FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave = 'MarcasPrincipais';`
    );
    const marcasPrincipaisList = configRes.recordset[0]?.Valor || '';
    const marcasPrincipais = new Set(
      marcasPrincipaisList.split(',').map(m => m.trim().toUpperCase()).filter(m => m)
    );

    const todas = marcasRes.recordset.map((r) => ({
      codigo: r.Codigo_Marca,
      nome: r.Marca,
      principal: marcasPrincipais.has(r.Marca.toUpperCase()),
    }));

    res.json(todas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar marcas.' });
  }
});

router.put('/marcas-principais', async (req, res) => {
  const { marcas } = req.body; // array com nomes das marcas principais
  if (!Array.isArray(marcas)) return res.status(400).json({ erro: 'marcas deve ser um array.' });

  try {
    const pool = await getPool();
    const valor = marcas.map(m => m.trim()).join(',');

    await pool.request()
      .input('chave', sql.VarChar(50), 'MarcasPrincipais')
      .input('valor', sql.NVarChar(500), valor)
      .query(`
        MERGE dbo.ZAPP_DBSiteCD_Config AS tgt
        USING (SELECT @chave AS Chave) AS src ON tgt.Chave = src.Chave
        WHEN MATCHED THEN UPDATE SET tgt.Valor = @valor
        WHEN NOT MATCHED THEN INSERT (Chave, Valor) VALUES (@chave, @valor);
      `);

    res.json({ ok: true, marcas: valor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao actualizar marcas principais.' });
  }
});

module.exports = router;
