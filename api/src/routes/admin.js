// Endpoints do Backoffice: configuração, gestão de artigos (publicar/despublicar,
// Novidade manual), famílias por classificar, e consulta ao log de sincronização.
// Ver PLANO_PROJETO.md secção 3 Fase 3.
// Acesso restrito a clientes com IsAdmin = 1 (ver migração 016 e middleware/auth.js).
const express = require('express');
const { getPool, sql } = require('../db');
const {
  SEQUENCIA_ESTADOS,
  ESTADO_ANULADA,
  ESTADO_RECEBIDA_CONFORME,
  ESTADO_DEV_RECEBIDA_ACEITE,
  ESTADO_DEV_RECEBIDA_NAO_ACEITE,
  ESTADO_DEV_PAGA,
  ESTADOS_LABELS,
  proximoEstado,
  ehEstadoDevolucao,
  proximosEstadosDevolucao,
} = require('../constants/encomendaEstados');
const { enviarEmailEncomenda, separarNomeVariante } = require('../services/email');
const { gerarPdfEncomenda } = require('../services/pdf');
const { registarDevolucao } = require('../services/devolucaoService');
const { normalizarNif } = require('../utils/nif');
const { validarIBAN } = require('../utils/iban');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

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

// GET /admin/marcas/:codigo/artigos - artigos publicados desta marca (imagem,
// código, nome, existência), usado para avisar o operador antes de desactivar
// uma marca (ver secção "Marcas Principais").
router.get('/marcas/:codigo/artigos', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('codigoMarca', sql.VarChar(3), req.params.codigo)
      .query(`
        SELECT a.Codigo_Artigo, a.Descritivo_Artigo,
               (SELECT TOP 1 Path FROM dbo.ZAPP_DBSiteCD_Imagens img WHERE img.Codigo_Artigo = a.Codigo_Artigo AND img.Ordem = 0) AS Imagem_Principal,
               ISNULL((
                 SELECT SUM(s.Qtd_Disponivel - s.Qtd_Reservada)
                 FROM dbo.ZAPP_DBSiteCD_Stock s
                 WHERE s.Codigo_Artigo = a.Codigo_Artigo AND s.Codigo_Armazem = '001'
               ), 0) AS Existencia
        FROM dbo.ZAPP_DBSiteCD_Artigos a
        WHERE a.Codigo_Marca = @codigoMarca AND a.Publicado = 1
        ORDER BY a.Descritivo_Artigo;
      `);

    res.json(result.recordset.map((r) => ({
      codigo: r.Codigo_Artigo,
      descricao: r.Descritivo_Artigo,
      imagem: r.Imagem_Principal ? `${process.env.IMAGES_BASE_URL}/${r.Imagem_Principal.replace(/^imagens\//, '')}` : null,
      existencia: r.Existencia,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar artigos da marca.' });
  }
});

// ---- Gestão de Marcas Principais ----
router.get('/marcas-principais', async (req, res) => {
  try {
    const pool = await getPool();
    // Obter todas as marcas (Situacao não é afectado pela sincronização - fica
    // reservado para o Backoffice marcar marcas como já não transaccionadas)
    const marcasRes = await pool.request().query(`
      SELECT DISTINCT m.Codigo_Marca, m.Marca, m.Situacao
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
      activa: !!r.Situacao,
    }));

    res.json(todas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar marcas.' });
  }
});

router.put('/marcas-principais', async (req, res) => {
  const { marcas, inactivas } = req.body; // marcas: nomes principais; inactivas: códigos a desactivar
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

    if (Array.isArray(inactivas)) {
      // Substitui sempre a lista completa (mesma lógica das marcas principais):
      // reactiva tudo e depois desactiva só as indicadas nesta gravação.
      await pool.request().query('UPDATE dbo.ZAPP_DBSiteCD_Marcas SET Situacao = 1;');
      for (const codigo of inactivas) {
        await pool.request()
          .input('codigo', sql.VarChar(3), codigo)
          .query('UPDATE dbo.ZAPP_DBSiteCD_Marcas SET Situacao = 0 WHERE Codigo_Marca = @codigo;');
      }
    }

    res.json({ ok: true, marcas: valor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao actualizar marcas principais.' });
  }
});

// ---- Gestão de Encomendas (seguimento de estado, Backoffice) ----

// GET /admin/encomendas - lista todas as encomendas com dados do cliente
router.get('/encomendas', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    const condicoes = [];

    if (req.query.estado) {
      request.input('estado', sql.VarChar(30), req.query.estado);
      condicoes.push('e.Estado = @estado');
    }

    const whereClause = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

    const resultado = await request.query(`
      SELECT e.Numero, e.Estado, e.Total, e.Portes, e.Pontos_Ganhos, e.Metodo_Pagamento, e.Data_Criacao, e.Data_Actualizacao,
             c.Nome AS Cliente_Nome, c.Email AS Cliente_Email, c.Codigo_Cliente
      FROM dbo.ZAPP_DBSiteCD_Encomendas e
      LEFT JOIN dbo.ZAPP_DBSiteCD_Clientes c ON c.Id = e.Cliente_Id
      ${whereClause}
      ORDER BY e.Data_Criacao DESC;
    `);

    res.json(resultado.recordset.map((e) => ({
      numero: e.Numero,
      estado: e.Estado,
      estadoLabel: ESTADOS_LABELS[e.Estado] || e.Estado,
      total: e.Total,
      portes: e.Portes,
      pontosGanhos: e.Pontos_Ganhos,
      metodoPagamento: e.Metodo_Pagamento,
      data: e.Data_Criacao,
      dataActualizacao: e.Data_Actualizacao,
      clienteNome: e.Cliente_Nome,
      clienteEmail: e.Cliente_Email,
      codigoCliente: e.Codigo_Cliente,
      proximoEstado: proximoEstado(e.Estado),
      proximoEstadoLabel: ESTADOS_LABELS[proximoEstado(e.Estado)] || null,
      podeAnular: e.Estado !== ESTADO_ANULADA && e.Estado !== 'Enviada' && e.Estado !== ESTADO_RECEBIDA_CONFORME && !ehEstadoDevolucao(e.Estado),
      podeDevolver: e.Estado === 'Enviada',
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar encomendas.' });
  }
});

// GET /admin/encomendas/:numero - detalhe (linhas incluídas)
router.get('/encomendas/:numero', async (req, res) => {
  try {
    const pool = await getPool();
    const encomenda = await pool.request()
      .input('numero', sql.VarChar(30), req.params.numero)
      .query(`
        SELECT e.Id, e.Numero, e.Estado, e.Total, e.Portes, e.Vale_Codigo, e.Vale_Desconto, e.Pontos_Ganhos,
               e.Metodo_Pagamento, e.Data_Criacao, e.Data_Actualizacao, e.Motivo_Anulacao,
               c.Nome AS Cliente_Nome, c.Email AS Cliente_Email, c.Codigo_Cliente
        FROM dbo.ZAPP_DBSiteCD_Encomendas e
        LEFT JOIN dbo.ZAPP_DBSiteCD_Clientes c ON c.Id = e.Cliente_Id
        WHERE e.Numero = @numero;
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
      metodoPagamento: e.Metodo_Pagamento,
      data: e.Data_Criacao,
      dataActualizacao: e.Data_Actualizacao,
      motivoAnulacao: e.Motivo_Anulacao,
      clienteNome: e.Cliente_Nome,
      clienteEmail: e.Cliente_Email,
      codigoCliente: e.Codigo_Cliente,
      devolucao,
      proximoEstado: proximoEstado(e.Estado),
      podeAnular: e.Estado !== ESTADO_ANULADA && e.Estado !== 'Enviada' && e.Estado !== ESTADO_RECEBIDA_CONFORME && !ehEstadoDevolucao(e.Estado),
      podeDevolver: e.Estado === 'Enviada',
      proximosEstadosDevolucao: proximosEstadosDevolucao(e.Estado).map((estado) => ({ estado, label: ESTADOS_LABELS[estado] })),
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

// GET /admin/encomendas/:numero/devolucoes - histórico de devoluções da encomenda
router.get('/encomendas/:numero/devolucoes', async (req, res) => {
  try {
    const pool = await getPool();
    const encomendaRes = await pool.request()
      .input('numero', sql.VarChar(30), req.params.numero)
      .query('SELECT Id FROM dbo.ZAPP_DBSiteCD_Encomendas WHERE Numero = @numero;');

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

// POST /admin/encomendas/:numero/devolucao - regista uma devolução parcial ou
// total de artigos já enviados (também disponível para o próprio cliente em
// /api/conta/encomendas/:numero/devolucao - ver services/devolucaoService.js).
router.post('/encomendas/:numero/devolucao', async (req, res) => {
  const resultado = await registarDevolucao(req.params.numero, req.body.linhas, {
    iban: req.body.iban,
    nomeTitular: req.body.nomeTitular,
    motivo: req.body.motivo,
  });
  if (resultado.erro) {
    return res.status(resultado.status || 500).json({ erro: resultado.erro });
  }
  res.status(201).json(resultado);
});

// PUT /admin/encomendas/:numero/estado-devolucao - transição de estado de uma
// Nota de Devolução (Emitida -> Recebida e Aceite / Recebida mas Não Aceite ->
// Paga). Notifica sempre o cliente por email da mudança de estado.
router.put('/encomendas/:numero/estado-devolucao', async (req, res) => {
  const { estado: novoEstado, motivo } = req.body;
  try {
    const pool = await getPool();
    const encRes = await pool.request()
      .input('numero', sql.VarChar(30), req.params.numero)
      .query('SELECT Id, Estado FROM dbo.ZAPP_DBSiteCD_Encomendas WHERE Numero = @numero;');

    if (encRes.recordset.length === 0) {
      return res.status(404).json({ erro: 'Nota de devolução não encontrada.' });
    }
    const estadoActual = encRes.recordset[0].Estado;

    if (!proximosEstadosDevolucao(estadoActual).includes(novoEstado)) {
      return res.status(400).json({ erro: `Não é possível passar de "${ESTADOS_LABELS[estadoActual]}" para "${ESTADOS_LABELS[novoEstado] || novoEstado}".` });
    }

    if (novoEstado === ESTADO_DEV_RECEBIDA_NAO_ACEITE && (!motivo || !motivo.trim())) {
      return res.status(400).json({ erro: 'É obrigatório indicar o motivo da não aceitação.' });
    }

    await pool.request()
      .input('id', sql.Int, encRes.recordset[0].Id)
      .input('estado', sql.VarChar(30), novoEstado)
      .input('motivo', sql.NVarChar(500), novoEstado === ESTADO_DEV_RECEBIDA_NAO_ACEITE ? motivo.trim() : null)
      .query(`
        UPDATE dbo.ZAPP_DBSiteCD_Encomendas
        SET Estado = @estado, Data_Actualizacao = GETDATE(), Motivo_Anulacao = @motivo
        WHERE Id = @id;
      `);

    const eventos = {
      [ESTADO_DEV_RECEBIDA_ACEITE]: { tituloEvento: 'Devolução Recebida e Aceite', notaEvento: 'Os artigos devolvidos foram recebidos e validados. Iremos processar o reembolso para o IBAN indicado.' },
      [ESTADO_DEV_RECEBIDA_NAO_ACEITE]: { tituloEvento: 'Devolução Recebida mas Não Aceite', notaEvento: `Os artigos devolvidos foram recebidos mas não foram aceites. Motivo: ${motivo?.trim() || '-'}` },
      [ESTADO_DEV_PAGA]: { tituloEvento: 'Devolução Paga', notaEvento: 'O reembolso da sua devolução foi processado para o IBAN indicado.' },
    };
    enviarEmailEncomenda(req.params.numero, { ...eventos[novoEstado], copiaEmpresa: true }).catch(() => {});

    res.json({ ok: true, estado: novoEstado, estadoLabel: ESTADOS_LABELS[novoEstado] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao actualizar o estado da devolução.' });
  }
});

// GET /admin/encomendas/:numero/pdf - exportação da encomenda em PDF
router.get('/encomendas/:numero/pdf', async (req, res) => {
  try {
    const pdfBuffer = await gerarPdfEncomenda(req.params.numero);
    if (!pdfBuffer) {
      return res.status(404).json({ erro: 'Encomenda não encontrada.' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.numero}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao gerar PDF da encomenda.' });
  }
});

// PUT /admin/encomendas/:numero/avancar - avança para o próximo estado da
// sequência. Os pontos de fidelização só são atribuídos mais tarde, quando o
// cliente confirma a receção da encomenda (ver routes/conta.js).
router.put('/encomendas/:numero/avancar', async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const encReq = new sql.Request(transaction);
    const encRes = await encReq
      .input('numero', sql.VarChar(30), req.params.numero)
      .query('SELECT Id, Estado, Cliente_Id, Pontos_Ganhos FROM dbo.ZAPP_DBSiteCD_Encomendas WITH (UPDLOCK, HOLDLOCK) WHERE Numero = @numero;');

    if (encRes.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ erro: 'Encomenda não encontrada.' });
    }
    const encomenda = encRes.recordset[0];
    const novoEstado = proximoEstado(encomenda.Estado);

    if (!novoEstado) {
      await transaction.rollback();
      return res.status(400).json({ erro: `A encomenda já está em "${ESTADOS_LABELS[encomenda.Estado] || encomenda.Estado}" e não pode avançar mais.` });
    }

    const updReq = new sql.Request(transaction);
    await updReq
      .input('id', sql.Int, encomenda.Id)
      .input('estado', sql.VarChar(30), novoEstado)
      .query('UPDATE dbo.ZAPP_DBSiteCD_Encomendas SET Estado = @estado, Data_Actualizacao = GETDATE() WHERE Id = @id;');

    if (novoEstado === 'Enviada') {
      // A encomenda já foi facturada no sistema central e o stock real já foi
      // deduzido lá - a reserva local (Qtd_Reservada) deixa de fazer sentido e
      // é libertada, para não ficar contabilizada em duplicado.
      const linhasStockReq = new sql.Request(transaction);
      const linhasStockRes = await linhasStockReq
        .input('encomendaId', sql.Int, encomenda.Id)
        .query('SELECT Codigo_Artigo, Codigo_Lote, Quantidade FROM dbo.ZAPP_DBSiteCD_EncomendasLinhas WHERE Encomenda_Id = @encomendaId;');

      for (const linha of linhasStockRes.recordset) {
        const libertarReq = new sql.Request(transaction);
        await libertarReq
          .input('codigoArtigo', sql.VarChar(20), linha.Codigo_Artigo)
          .input('codigoLote', sql.VarChar(50), linha.Codigo_Lote)
          .input('quantidade', sql.Int, linha.Quantidade)
          .query(`
            UPDATE dbo.ZAPP_DBSiteCD_Stock
            SET Qtd_Reservada = Qtd_Reservada - @quantidade
            WHERE Codigo_Artigo = @codigoArtigo AND Codigo_Lote = @codigoLote AND Codigo_Armazem = '001';
          `);
      }
    }

    await transaction.commit();

    const estadoLabel = ESTADOS_LABELS[novoEstado] || novoEstado;
    enviarEmailEncomenda(req.params.numero, {
      assunto: `Encomenda ${req.params.numero} — ${estadoLabel}`,
      tituloEvento: `Estado actualizado: ${estadoLabel}`,
      notaEvento: novoEstado === 'Enviada'
        ? 'A sua encomenda foi enviada! Assim que confirmar a receção na sua área de cliente, os pontos desta compra ficam disponíveis para utilização.'
        : 'O estado da sua encomenda foi actualizado.',
    }).catch((emailErr) => console.error('[email] Erro ao enviar notificação de estado:', emailErr.message));

    res.json({ ok: true, estado: novoEstado, estadoLabel });
  } catch (err) {
    console.error(err);
    try { await transaction.rollback(); } catch (_) { /* já pode ter sido revertida */ }
    res.status(500).json({ erro: 'Falha ao avançar estado da encomenda.' });
  }
});

// PUT /admin/encomendas/:numero/anular - anula a encomenda, liberta o stock
// reservado e estorna os pontos caso já tivessem sido atribuídos (encomenda já
// enviada e depois anulada).
router.put('/encomendas/:numero/anular', async (req, res) => {
  const motivo = (req.body?.motivo || '').trim();
  if (!motivo) {
    return res.status(400).json({ erro: 'É obrigatório indicar o motivo da anulação.' });
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const encReq = new sql.Request(transaction);
    const encRes = await encReq
      .input('numero', sql.VarChar(30), req.params.numero)
      .query('SELECT Id, Estado, Cliente_Id FROM dbo.ZAPP_DBSiteCD_Encomendas WITH (UPDLOCK, HOLDLOCK) WHERE Numero = @numero;');

    if (encRes.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ erro: 'Encomenda não encontrada.' });
    }
    const encomenda = encRes.recordset[0];

    if (encomenda.Estado === ESTADO_ANULADA) {
      await transaction.rollback();
      return res.status(400).json({ erro: 'Esta encomenda já está anulada.' });
    }

    if (encomenda.Estado === 'Enviada' || encomenda.Estado === ESTADO_RECEBIDA_CONFORME) {
      await transaction.rollback();
      return res.status(400).json({ erro: 'Uma encomenda já enviada não pode ser anulada - utilize a Devolução.' });
    }

    const updReq = new sql.Request(transaction);
    await updReq
      .input('id', sql.Int, encomenda.Id)
      .input('estado', sql.VarChar(30), ESTADO_ANULADA)
      .input('motivo', sql.NVarChar(500), motivo)
      .query('UPDATE dbo.ZAPP_DBSiteCD_Encomendas SET Estado = @estado, Motivo_Anulacao = @motivo, Data_Actualizacao = GETDATE() WHERE Id = @id;');

    // Libertar o stock reservado por esta encomenda
    const linhasReq = new sql.Request(transaction);
    const linhasRes = await linhasReq
      .input('encomendaId', sql.Int, encomenda.Id)
      .query('SELECT Codigo_Artigo, Codigo_Lote, Quantidade FROM dbo.ZAPP_DBSiteCD_EncomendasLinhas WHERE Encomenda_Id = @encomendaId;');

    for (const linha of linhasRes.recordset) {
      const stockReq = new sql.Request(transaction);
      await stockReq
        .input('codigoArtigo', sql.VarChar(20), linha.Codigo_Artigo)
        .input('codigoLote', sql.VarChar(50), linha.Codigo_Lote)
        .input('quantidade', sql.Int, linha.Quantidade)
        .query(`
          UPDATE dbo.ZAPP_DBSiteCD_Stock
          SET Qtd_Reservada = Qtd_Reservada - @quantidade
          WHERE Codigo_Artigo = @codigoArtigo AND Codigo_Lote = @codigoLote AND Codigo_Armazem = '001';
        `);
    }

    // Regista sempre uma linha na conta-corrente de pontos a assinalar a
    // anulação - se a encomenda já tivesse pontos atribuídos (Tipo='Ganho'),
    // são creditados de volta (valor negativo); caso contrário fica a 0, só
    // para dar visibilidade ao cliente/Backoffice de que a encomenda foi anulada.
    const ganhoReq = new sql.Request(transaction);
    const ganhoRes = await ganhoReq
      .input('encomendaId', sql.Int, encomenda.Id)
      .query(`SELECT ISNULL(SUM(Pontos), 0) AS Total FROM dbo.ZAPP_DBSiteCD_PontosLedger WHERE Encomenda_Id = @encomendaId AND Tipo = 'Ganho';`);
    const pontosJaGanhos = ganhoRes.recordset[0].Total;

    const anulacaoReq = new sql.Request(transaction);
    await anulacaoReq
      .input('clienteId', sql.Int, encomenda.Cliente_Id)
      .input('pontos', sql.Int, -pontosJaGanhos)
      .input('encomendaId', sql.Int, encomenda.Id)
      .input('descricao', sql.NVarChar(200), `Encomenda nº ${req.params.numero} Anulada`)
      .query(`
        INSERT INTO dbo.ZAPP_DBSiteCD_PontosLedger (Cliente_Id, Tipo, Pontos, Encomenda_Id, Descricao)
        VALUES (@clienteId, 'Anulacao', @pontos, @encomendaId, @descricao);
      `);

    await transaction.commit();

    enviarEmailEncomenda(req.params.numero, {
      assunto: `Encomenda ${req.params.numero} — Anulada`,
      tituloEvento: 'Encomenda Anulada',
      notaEvento: 'A sua encomenda foi anulada. Detalhes abaixo.',
    }).catch((emailErr) => console.error('[email] Erro ao enviar notificação de anulação:', emailErr.message));

    res.json({ ok: true, estado: ESTADO_ANULADA, estadoLabel: ESTADOS_LABELS[ESTADO_ANULADA] });
  } catch (err) {
    console.error(err);
    try { await transaction.rollback(); } catch (_) { /* já pode ter sido revertida */ }
    res.status(500).json({ erro: 'Falha ao anular encomenda.' });
  }
});

// ---- Fichas de Clientes / Extracto de Cliente ----

// GET /admin/clientes - lista de fichas de clientes (pesquisável por código,
// nome ou email)
router.get('/clientes', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    const condicoes = [];
    if (req.query.q) {
      request.input('q', sql.NVarChar(150), `%${req.query.q}%`);
      condicoes.push('(Codigo_Cliente LIKE @q OR Nome LIKE @q OR Email LIKE @q)');
    }
    const whereClause = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

    const resultado = await request.query(`
      SELECT Codigo_Cliente, Nome, Email, Telefone, NIF, Morada, Localidade, Codigo_Postal, Data_Criacao, IsAdmin, Iban, Nome_Titular_Conta
      FROM dbo.ZAPP_DBSiteCD_Clientes
      ${whereClause}
      ORDER BY Data_Criacao DESC;
    `);

    res.json(resultado.recordset.map((c) => ({
      codigoCliente: c.Codigo_Cliente,
      nome: c.Nome,
      email: c.Email,
      telefone: c.Telefone,
      nif: c.NIF,
      morada: c.Morada,
      localidade: c.Localidade,
      codigoPostal: c.Codigo_Postal,
      dataCriacao: c.Data_Criacao,
      isAdmin: !!c.IsAdmin,
      iban: c.Iban,
      nomeTitularConta: c.Nome_Titular_Conta,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar clientes.' });
  }
});

// GET /admin/clientes/:codigo - ficha de um cliente
router.get('/clientes/:codigo', async (req, res) => {
  try {
    const pool = await getPool();
    const resultado = await pool.request()
      .input('codigo', sql.VarChar(20), req.params.codigo)
      .query(`
        SELECT Codigo_Cliente, Nome, Email, Telefone, NIF, Morada, Localidade, Codigo_Postal, Data_Criacao, IsAdmin, Iban, Nome_Titular_Conta
        FROM dbo.ZAPP_DBSiteCD_Clientes
        WHERE Codigo_Cliente = @codigo;
      `);

    if (resultado.recordset.length === 0) {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }
    const c = resultado.recordset[0];
    res.json({
      codigoCliente: c.Codigo_Cliente,
      nome: c.Nome,
      email: c.Email,
      telefone: c.Telefone,
      nif: c.NIF,
      morada: c.Morada,
      localidade: c.Localidade,
      codigoPostal: c.Codigo_Postal,
      dataCriacao: c.Data_Criacao,
      isAdmin: !!c.IsAdmin,
      iban: c.Iban,
      nomeTitularConta: c.Nome_Titular_Conta,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao obter ficha do cliente.' });
  }
});

// PUT /admin/clientes/:codigo - o Backoffice edita/corrige os dados de um
// cliente (nome, telefone, NIF, morada). O email e o Código de Cliente não são
// editáveis (o email identifica a conta de login; o código é calculado).
router.put('/clientes/:codigo', async (req, res) => {
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
    const resultado = await pool.request()
      .input('codigo', sql.VarChar(20), req.params.codigo)
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
        OUTPUT inserted.Codigo_Cliente
        WHERE Codigo_Cliente = @codigo;
      `);
    if (resultado.recordset.length === 0) {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao guardar os dados do cliente.' });
  }
});

// GET /admin/clientes/:codigo/extrato - encomendas + movimentos de pontos de
// um cliente, opcionalmente filtrado por intervalo de datas (desde/ate),
// ordenado por data mais recente primeiro.
router.get('/clientes/:codigo/extrato', async (req, res) => {
  try {
    const pool = await getPool();
    const clienteRes = await pool.request()
      .input('codigo', sql.VarChar(20), req.params.codigo)
      .query('SELECT Id, Codigo_Cliente, Nome, Email, Telefone, NIF FROM dbo.ZAPP_DBSiteCD_Clientes WHERE Codigo_Cliente = @codigo;');

    if (clienteRes.recordset.length === 0) {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }
    const cliente = clienteRes.recordset[0];

    const { desde, ate } = req.query;
    const condicoesData = [];
    const encReq = pool.request().input('clienteId', sql.Int, cliente.Id);
    const pontosReq = pool.request().input('clienteId', sql.Int, cliente.Id);
    if (desde) {
      encReq.input('desde', sql.DateTime, new Date(desde));
      pontosReq.input('desde', sql.DateTime, new Date(desde));
      condicoesData.push('Data_Criacao >= @desde');
    }
    if (ate) {
      const ateFim = new Date(ate);
      ateFim.setHours(23, 59, 59, 999);
      encReq.input('ate', sql.DateTime, ateFim);
      pontosReq.input('ate', sql.DateTime, ateFim);
      condicoesData.push('Data_Criacao <= @ate');
    }
    const whereData = condicoesData.length > 0 ? `AND ${condicoesData.join(' AND ')}` : '';

    const encomendasRes = await encReq.query(`
      SELECT Numero, Estado, Total, Pontos_Ganhos, Data_Criacao
      FROM dbo.ZAPP_DBSiteCD_Encomendas
      WHERE Cliente_Id = @clienteId ${whereData}
      ORDER BY Data_Criacao DESC;
    `);

    const pontosRes = await pontosReq.query(`
      SELECT Tipo, Pontos, Descricao, Data_Criacao
      FROM dbo.ZAPP_DBSiteCD_PontosLedger
      WHERE Cliente_Id = @clienteId ${whereData}
      ORDER BY Data_Criacao DESC;
    `);

    const saldoRes = await pool.request()
      .input('clienteId', sql.Int, cliente.Id)
      .query('SELECT ISNULL(SUM(Pontos), 0) AS Saldo FROM dbo.ZAPP_DBSiteCD_PontosLedger WHERE Cliente_Id = @clienteId;');

    // Saldo acumulado até ao limite superior do filtro (ou até agora, se sem
    // filtro) - ponto de partida para calcular o "Acumulado" de cada linha do
    // extracto, indo de trás para a frente (a lista vem ordenada da mais
    // recente para a mais antiga).
    const saldoAteFiltroReq = pool.request().input('clienteId', sql.Int, cliente.Id);
    let condicaoAteFiltro = '';
    if (ate) {
      const ateFim = new Date(ate);
      ateFim.setHours(23, 59, 59, 999);
      saldoAteFiltroReq.input('ate', sql.DateTime, ateFim);
      condicaoAteFiltro = 'AND Data_Criacao <= @ate';
    }
    const saldoAteFiltroRes = await saldoAteFiltroReq.query(`
      SELECT ISNULL(SUM(Pontos), 0) AS Saldo FROM dbo.ZAPP_DBSiteCD_PontosLedger WHERE Cliente_Id = @clienteId ${condicaoAteFiltro};
    `);
    let acumulado = saldoAteFiltroRes.recordset[0].Saldo;
    const pontosComAcumulado = pontosRes.recordset.map((p) => {
      const linha = { tipo: p.Tipo, pontos: p.Pontos, descricao: p.Descricao, data: p.Data_Criacao, acumulado };
      acumulado -= p.Pontos;
      return linha;
    });

    res.json({
      cliente: {
        codigoCliente: cliente.Codigo_Cliente,
        nome: cliente.Nome,
        email: cliente.Email,
        telefone: cliente.Telefone,
        nif: cliente.NIF,
      },
      saldoPontos: saldoRes.recordset[0].Saldo,
      encomendas: encomendasRes.recordset.map((e) => ({
        numero: e.Numero,
        estado: e.Estado,
        estadoLabel: ESTADOS_LABELS[e.Estado] || e.Estado,
        total: e.Total,
        pontosGanhos: e.Pontos_Ganhos,
        data: e.Data_Criacao,
      })),
      pontos: pontosComAcumulado.map((p) => ({
        tipo: p.tipo,
        pontos: p.pontos,
        acumulado: p.acumulado,
        descricao: p.descricao,
        data: p.data,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao obter extracto do cliente.' });
  }
});

// ---- Links Úteis (páginas de conteúdo do rodapé) ----

// GET /admin/paginas - lista todas (chave/título) para o sub-menu do Backoffice
router.get('/paginas', async (req, res) => {
  try {
    const pool = await getPool();
    const resultado = await pool.request()
      .query('SELECT Chave, Titulo, Data_Actualizacao FROM dbo.ZAPP_DBSiteCD_PaginasConteudo ORDER BY Titulo;');
    res.json(resultado.recordset.map((p) => ({ chave: p.Chave, titulo: p.Titulo, dataActualizacao: p.Data_Actualizacao })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao listar páginas.' });
  }
});

// GET /admin/paginas/:chave - conteúdo completo para edição
router.get('/paginas/:chave', async (req, res) => {
  try {
    const pool = await getPool();
    const resultado = await pool.request()
      .input('chave', sql.VarChar(50), req.params.chave)
      .query('SELECT Chave, Titulo, Conteudo FROM dbo.ZAPP_DBSiteCD_PaginasConteudo WHERE Chave = @chave;');

    if (resultado.recordset.length === 0) {
      return res.status(404).json({ erro: 'Página não encontrada.' });
    }
    const p = resultado.recordset[0];
    res.json({ chave: p.Chave, titulo: p.Titulo, conteudo: p.Conteudo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao obter página.' });
  }
});

// PUT /admin/paginas/:chave - guarda título/conteúdo editados
router.put('/paginas/:chave', async (req, res) => {
  const { titulo, conteudo } = req.body;
  if (!titulo || !conteudo) {
    return res.status(400).json({ erro: 'Título e conteúdo são obrigatórios.' });
  }

  try {
    const pool = await getPool();
    const resultado = await pool.request()
      .input('chave', sql.VarChar(50), req.params.chave)
      .input('titulo', sql.NVarChar(200), titulo)
      .input('conteudo', sql.NVarChar(sql.MAX), conteudo)
      .query(`
        UPDATE dbo.ZAPP_DBSiteCD_PaginasConteudo
        SET Titulo = @titulo, Conteudo = @conteudo, Data_Actualizacao = GETDATE()
        WHERE Chave = @chave;
      `);

    if (resultado.rowsAffected[0] === 0) {
      return res.status(404).json({ erro: 'Página não encontrada.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Falha ao guardar página.' });
  }
});

module.exports = router;
