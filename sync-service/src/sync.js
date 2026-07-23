// Job de sincronização incremental DBClassico -> DBSiteCD.
// Consome o delta de DBClassico.dbo.ZAPP_DBSiteCD_TArtigosSincro (secção 2.6.1),
// processa só o que mudou, e regista o resultado em ZAPP_DBSiteCD_SyncLog + log.txt.
// Ver PLANO_PROJETO.md secção 2.6.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getDBClassicoPool, getDBSiteCDPool } = require('./db');
const log = require('./logger');
const { alertar } = require('./alertas');

const WATERMARK_KEY = 'ZAPP_DBSiteCD_TArtigosSincro';
const IMAGES_DIR = path.resolve(__dirname, '..', process.env.IMAGES_DIR);

async function ensureStagingTable(pool) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.ZAPP_DBSiteCD_SyncStaging_ChangedArtigos', 'U') IS NULL
    CREATE TABLE dbo.ZAPP_DBSiteCD_SyncStaging_ChangedArtigos (Codigo_Artigo VARCHAR(20) PRIMARY KEY);
  `);
}

async function logResultado(pool, tipoNome, sucesso, registos, mensagem) {
  await pool.request()
    .input('tipo', tipoNome)
    .input('sucesso', sucesso ? 1 : 0)
    .input('registos', registos)
    .input('mensagem', mensagem || null)
    .query(`
      INSERT INTO dbo.ZAPP_DBSiteCD_SyncLog (Tipo, Sucesso, Registos_Processados, Mensagem, Data_Hora)
      VALUES (@tipo, @sucesso, @registos, @mensagem, GETUTCDATE());
    `);
  log.tipo(tipoNome, sucesso, registos, mensagem);
  if (!sucesso) {
    await alertar(`Falha na sincronização de "${tipoNome}"`, mensagem || 'Sem detalhe.');
  }
}

// Busca os artigos que estavam a ser processados no momento da falha (melhor
// esforço - se isto também falhar, ex. BD em baixo, ignora e segue sem eles),
// para o erro no log dizer *quais* artigos, não só a mensagem genérica do SQL.
async function obterCodigosAlterados(pool) {
  try {
    const r = await pool.request().query('SELECT Codigo_Artigo FROM dbo.ZAPP_DBSiteCD_SyncStaging_ChangedArtigos;');
    return r.recordset.map((row) => row.Codigo_Artigo);
  } catch {
    return [];
  }
}

// Enriquece a mensagem de erro com detalhe do SQL Server (número/linha do erro,
// úteis para apontar a instrução exacta que falhou) e os artigos afectados,
// para o log de sincronização deixar de mostrar só "Invalid column name 'X'."
// sem contexto (secção 2.6.1) - truncado para caber em Mensagem NVARCHAR(500).
function detalheErro(err, codigos = []) {
  const partes = [err.message];
  if (err.number) partes.push(`SQL#${err.number}`);
  if (err.lineNumber) partes.push(`linha ${err.lineNumber}`);
  if (codigos.length > 0) {
    const max = 15;
    const lista = codigos.slice(0, max).join(', ');
    const resto = codigos.length > max ? ` (+${codigos.length - max} artigo(s))` : '';
    partes.push(`artigos: ${lista}${resto}`);
  }
  const mensagem = partes.join(' | ');
  return mensagem.length > 500 ? `${mensagem.slice(0, 497)}...` : mensagem;
}

async function syncMarcasModelos(pool) {
  const r1 = await pool.request().query(`
    MERGE dbo.ZAPP_DBSiteCD_Marcas AS tgt
    USING DBClassico.dbo.ZAPP_DBSiteCD_VMarcas AS src
        ON tgt.Codigo_Marca = src.Codigo_Marca COLLATE DATABASE_DEFAULT
    WHEN MATCHED AND (tgt.Marca <> src.Marca COLLATE DATABASE_DEFAULT OR tgt.Data_Hora_Origem <> src.Data_Hora) THEN
        UPDATE SET tgt.Marca = src.Marca, tgt.Data_Hora_Origem = src.Data_Hora, tgt.Data_Sincronizacao = GETDATE()
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (Codigo_Marca, Marca, Tag, Data_Hora_Origem)
        VALUES (src.Codigo_Marca, src.Marca, LOWER(src.Marca), src.Data_Hora);
  `);
  await pool.request().query(`
    MERGE dbo.ZAPP_DBSiteCD_Modelos AS tgt
    USING DBClassico.dbo.ZAPP_DBSiteCD_VModelos AS src
        ON tgt.Codigo_Modelo = src.Codigo_Modelo COLLATE DATABASE_DEFAULT AND tgt.Codigo_Marca = src.Codigo_Marca COLLATE DATABASE_DEFAULT
    WHEN MATCHED AND (tgt.Modelo <> src.Modelo COLLATE DATABASE_DEFAULT OR tgt.Data_Hora_Origem <> src.Data_Hora) THEN
        UPDATE SET tgt.Modelo = src.Modelo, tgt.Data_Hora_Origem = src.Data_Hora, tgt.Data_Sincronizacao = GETDATE()
    WHEN NOT MATCHED BY TARGET AND EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Marcas m WHERE m.Codigo_Marca = src.Codigo_Marca COLLATE DATABASE_DEFAULT) THEN
        INSERT (Codigo_Modelo, Codigo_Marca, Modelo, Data_Hora_Origem)
        VALUES (src.Codigo_Modelo, src.Codigo_Marca, src.Modelo, src.Data_Hora);
  `);
  return r1.rowsAffected[0] || 0;
}

async function popularAlteracoes(pool, ultimaSincronizacao) {
  await pool.request().query('TRUNCATE TABLE dbo.ZAPP_DBSiteCD_SyncStaging_ChangedArtigos;');
  const r = await pool.request()
    .input('ultima', ultimaSincronizacao)
    .query(`
      INSERT INTO dbo.ZAPP_DBSiteCD_SyncStaging_ChangedArtigos (Codigo_Artigo)
      SELECT DISTINCT Codigo_Artigo
      FROM DBClassico.dbo.ZAPP_DBSiteCD_TArtigosSincro
      WHERE Data_Hora > @ultima;
    `);
  return r.rowsAffected[0] || 0;
}

// Garante que a hierarquia de Familia existe (Grau4->1), com Modalidade/Genero
// a NULL se for codigo novo - fica sinalizado como "por classificar" (secção 2.1.1 ponto 3)
async function garantirFamilias(pool) {
  const result = await pool.request().query(`
    -- Grau 1
    INSERT INTO dbo.ZAPP_DBSiteCD_Familias (Codigo_Familia, Familia)
    SELECT vf.Codigo_Familia, vf.Familia
    FROM DBClassico.dbo.ZAPP_DBSiteCD_VFamilias vf
    INNER JOIN (
        SELECT DISTINCT LEFT(src.Code_Familia, 1) AS Raiz
        FROM DBClassico.dbo.ZAPP_DBSiteCD_VArtigos src
        INNER JOIN dbo.ZAPP_DBSiteCD_SyncStaging_ChangedArtigos c ON c.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT
        WHERE src.Code_Familia IS NOT NULL
    ) r ON vf.Codigo_Familia = r.Raiz COLLATE DATABASE_DEFAULT
    WHERE vf.Grau = 1
      AND NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Familias f WHERE f.Codigo_Familia = vf.Codigo_Familia COLLATE DATABASE_DEFAULT);

    -- Grau 2
    INSERT INTO dbo.ZAPP_DBSiteCD_SubFamilias1 (Codigo_Familia, Codigo_Familia_Pai, Familia)
    SELECT vf.Codigo_Familia, LEFT(vf.Codigo_Familia, 1), vf.Familia
    FROM DBClassico.dbo.ZAPP_DBSiteCD_VFamilias vf
    INNER JOIN (
        SELECT DISTINCT LEFT(src.Code_Familia, 2) AS Cod2
        FROM DBClassico.dbo.ZAPP_DBSiteCD_VArtigos src
        INNER JOIN dbo.ZAPP_DBSiteCD_SyncStaging_ChangedArtigos c ON c.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT
        WHERE src.Code_Familia IS NOT NULL AND LEN(src.Code_Familia) >= 2
    ) r ON vf.Codigo_Familia = r.Cod2 COLLATE DATABASE_DEFAULT
    WHERE vf.Grau = 2
      AND NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_SubFamilias1 f WHERE f.Codigo_Familia = vf.Codigo_Familia COLLATE DATABASE_DEFAULT)
      AND EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Familias fp WHERE fp.Codigo_Familia = LEFT(vf.Codigo_Familia,1) COLLATE DATABASE_DEFAULT);

    -- Grau 3
    INSERT INTO dbo.ZAPP_DBSiteCD_SubFamilias2 (Codigo_Familia, Codigo_Familia_Pai, Familia)
    SELECT vf.Codigo_Familia, LEFT(vf.Codigo_Familia, 2), vf.Familia
    FROM DBClassico.dbo.ZAPP_DBSiteCD_VFamilias vf
    INNER JOIN (
        SELECT DISTINCT LEFT(src.Code_Familia, 3) AS Cod3
        FROM DBClassico.dbo.ZAPP_DBSiteCD_VArtigos src
        INNER JOIN dbo.ZAPP_DBSiteCD_SyncStaging_ChangedArtigos c ON c.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT
        WHERE src.Code_Familia IS NOT NULL AND LEN(src.Code_Familia) >= 3
    ) r ON vf.Codigo_Familia = r.Cod3 COLLATE DATABASE_DEFAULT
    WHERE vf.Grau = 3
      AND NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_SubFamilias2 f WHERE f.Codigo_Familia = vf.Codigo_Familia COLLATE DATABASE_DEFAULT)
      AND EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_SubFamilias1 fp WHERE fp.Codigo_Familia = LEFT(vf.Codigo_Familia,2) COLLATE DATABASE_DEFAULT);

    -- Grau 4 (o nivel que os artigos referenciam directamente - secção 2.1.1)
    INSERT INTO dbo.ZAPP_DBSiteCD_SubFamilias3 (Codigo_Familia, Codigo_Familia_Pai, Familia)
    OUTPUT inserted.Codigo_Familia
    SELECT vf.Codigo_Familia, LEFT(vf.Codigo_Familia, 3), vf.Familia
    FROM DBClassico.dbo.ZAPP_DBSiteCD_VFamilias vf
    INNER JOIN (
        SELECT DISTINCT src.Code_Familia AS Cod4
        FROM DBClassico.dbo.ZAPP_DBSiteCD_VArtigos src
        INNER JOIN dbo.ZAPP_DBSiteCD_SyncStaging_ChangedArtigos c ON c.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT
        WHERE src.Code_Familia IS NOT NULL AND LEN(src.Code_Familia) >= 4
    ) r ON vf.Codigo_Familia = r.Cod4 COLLATE DATABASE_DEFAULT
    WHERE vf.Grau = 4
      AND NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_SubFamilias3 f WHERE f.Codigo_Familia = vf.Codigo_Familia COLLATE DATABASE_DEFAULT)
      AND EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_SubFamilias2 fp WHERE fp.Codigo_Familia = LEFT(vf.Codigo_Familia,3) COLLATE DATABASE_DEFAULT);
  `);
  // conta linhas devolvidas pelo ultimo OUTPUT (familias de Grau 4 novas, "por classificar")
  const novas = result.recordset ? result.recordset.length : 0;
  return novas;
}

async function syncArtigos(pool) {
  const r = await pool.request().query(`
    MERGE dbo.ZAPP_DBSiteCD_Artigos AS tgt
    USING (
        SELECT src.* FROM DBClassico.dbo.ZAPP_DBSiteCD_VArtigos src
        INNER JOIN dbo.ZAPP_DBSiteCD_SyncStaging_ChangedArtigos c ON c.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT
    ) AS src
    ON tgt.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT
    WHEN MATCHED THEN
        UPDATE SET
            tgt.Descritivo_Artigo   = src.Descricao,
            tgt.Tipo_Artigo         = src.Internet,
            tgt.Codigo_Marca        = NULLIF(src.Code_Marca, ''),
            tgt.Codigo_Modelo       = NULLIF(src.Code_Modelo, ''),
            tgt.Codigo_Familia      = NULLIF(src.Code_Familia, ''),
            tgt.Peso                = src.Peso,
            tgt.Descricao_Longa     = src.Texto_Especificacoes,
            tgt.Data_Ult_Compra     = src.Data_Compra,
            tgt.Data_Hora_Origem    = src.UpdateDate,
            tgt.Publicado           = 1,
            tgt.Eliminado_Na_Origem = 0,
            tgt.Data_Sincronizacao  = GETDATE()
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (Codigo_Artigo, Descritivo_Artigo, Tipo_Artigo, Codigo_Marca, Codigo_Modelo,
                Codigo_Familia, Peso, Descricao_Longa, Data_Ult_Compra, Data_Hora_Origem, Publicado)
        VALUES (src.Code_Artigo, src.Descricao, src.Internet, NULLIF(src.Code_Marca,''), NULLIF(src.Code_Modelo,''),
                NULLIF(src.Code_Familia,''), src.Peso, src.Texto_Especificacoes, src.Data_Compra, src.UpdateDate, 1);
  `);

  await pool.request().query(`
    MERGE dbo.ZAPP_DBSiteCD_Precos AS tgt
    USING (
        SELECT src.* FROM DBClassico.dbo.ZAPP_DBSiteCD_VArtigos src
        INNER JOIN dbo.ZAPP_DBSiteCD_SyncStaging_ChangedArtigos c ON c.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT
    ) AS src
    ON tgt.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT
    WHEN MATCHED THEN
        UPDATE SET tgt.Preco = src.Preco, tgt.Codigo_Desconto_Art = NULLIF(src.Code_desconto, ''),
                   tgt.Percentagem_Desconto = TRY_CAST(NULLIF(src.Code_desconto, '') AS DECIMAL(5,2)),
                   tgt.Data_Sincronizacao = GETDATE()
    WHEN NOT MATCHED BY TARGET AND EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Artigos a WHERE a.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT) THEN
        INSERT (Codigo_Artigo, Preco, Codigo_Desconto_Art, Percentagem_Desconto)
        VALUES (src.Code_Artigo, src.Preco, NULLIF(src.Code_desconto,''), TRY_CAST(NULLIF(src.Code_desconto, '') AS DECIMAL(5,2)));

    -- arredondado a multiplos de 10 centimos (regra confirmada pelo utilizador, 2026-07-02);
    -- recalculado sempre que o artigo sofra alteracao de preco ou desconto (artigo entra no delta)
    UPDATE dbo.ZAPP_DBSiteCD_Precos
    SET Preco_Outlet = CASE WHEN Percentagem_Desconto > 0
        THEN ROUND(Preco * (1 - Percentagem_Desconto / 100.0) * 100, -1) / 100.0
        ELSE NULL END
    WHERE Codigo_Artigo IN (SELECT Codigo_Artigo FROM dbo.ZAPP_DBSiteCD_SyncStaging_ChangedArtigos);
  `);

  const rLotes = await pool.request().query(`
    MERGE dbo.ZAPP_DBSiteCD_Variantes AS tgt
    USING (
        SELECT src.* FROM DBClassico.dbo.ZAPP_DBSiteCD_VLotes src
        INNER JOIN dbo.ZAPP_DBSiteCD_SyncStaging_ChangedArtigos c ON c.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT
    ) AS src
    ON tgt.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT AND tgt.Codigo_Lote = src.Code_Lote COLLATE DATABASE_DEFAULT
    WHEN MATCHED THEN
        UPDATE SET tgt.Descricao_Lote = src.Desc_Lote, tgt.Data_Hora_Origem = src.UpdateDate, tgt.Data_Sincronizacao = GETDATE()
    WHEN NOT MATCHED BY TARGET AND EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Artigos a WHERE a.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT) THEN
        INSERT (Codigo_Artigo, Codigo_Lote, Descricao_Lote, Data_Hora_Origem)
        VALUES (src.Code_Artigo, src.Code_Lote, src.Desc_Lote, src.UpdateDate);

    MERGE dbo.ZAPP_DBSiteCD_Stock AS tgt2
    USING (
        SELECT src.* FROM DBClassico.dbo.ZAPP_DBSiteCD_VLotes src
        INNER JOIN dbo.ZAPP_DBSiteCD_SyncStaging_ChangedArtigos c ON c.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT
    ) AS src2
    ON tgt2.Codigo_Artigo = src2.Code_Artigo COLLATE DATABASE_DEFAULT AND tgt2.Codigo_Lote = src2.Code_Lote COLLATE DATABASE_DEFAULT AND tgt2.Codigo_Armazem = '001'
    WHEN MATCHED THEN
        UPDATE SET tgt2.Qtd_Disponivel = src2.Quantidade, tgt2.Qtd_Reservada = src2.Quantidade_Reservada,
                   tgt2.Data_Hora_Origem = src2.UpdateDate, tgt2.Data_Sincronizacao = GETDATE()
    WHEN NOT MATCHED BY TARGET AND EXISTS (
            SELECT 1 FROM dbo.ZAPP_DBSiteCD_Variantes v
            WHERE v.Codigo_Artigo = src2.Code_Artigo COLLATE DATABASE_DEFAULT AND v.Codigo_Lote = src2.Code_Lote COLLATE DATABASE_DEFAULT
         ) THEN
        INSERT (Codigo_Artigo, Codigo_Lote, Codigo_Armazem, Qtd_Disponivel, Qtd_Reservada, Data_Hora_Origem)
        VALUES (src2.Code_Artigo, src2.Code_Lote, '001', src2.Quantidade, src2.Quantidade_Reservada, src2.UpdateDate);
  `);

  return { artigos: r.rowsAffected[0] || 0, lotes: rLotes.rowsAffected[0] || 0 };
}

// Regra de negócio confirmada pelo utilizador (2026-07-02): nenhum artigo pode
// ter preço de venda a 0€ - despublica automaticamente e alerta (WhatsApp/log),
// nunca deixa um artigo destes visível no site à espera de correcção manual na origem.
async function validarPrecoZero(pool) {
  const result = await pool.request().query(`
    DECLARE @ComPrecoZero TABLE (Codigo_Artigo VARCHAR(20), Descritivo_Artigo NVARCHAR(100), Marca NVARCHAR(100), Preco DECIMAL(10,2));

    UPDATE a
    SET a.Publicado = 0, a.Data_Sincronizacao = GETDATE()
    OUTPUT inserted.Codigo_Artigo, inserted.Descritivo_Artigo, m.Marca, p.Preco INTO @ComPrecoZero
    FROM dbo.ZAPP_DBSiteCD_Artigos a
    INNER JOIN dbo.ZAPP_DBSiteCD_Precos p ON p.Codigo_Artigo = a.Codigo_Artigo
    INNER JOIN dbo.ZAPP_DBSiteCD_SyncStaging_ChangedArtigos c ON c.Codigo_Artigo = a.Codigo_Artigo
    LEFT JOIN dbo.ZAPP_DBSiteCD_Marcas m ON m.Codigo_Marca = a.Codigo_Marca
    WHERE p.Preco = 0 AND a.Publicado = 1;

    SELECT * FROM @ComPrecoZero;
  `);
  const artigos = result.recordset || [];
  if (artigos.length > 0) {
    const detalhe = artigos.map((a) =>
      `Código: ${a.Codigo_Artigo}\nNome: ${a.Descritivo_Artigo}\nMarca: ${a.Marca || 'N/A'}\nPreço: €${a.Preco}\nMotivo: Preço de venda configurado a 0€ (inválido para publicação)`
    ).join('\n' + '='.repeat(60) + '\n');

    await alertar(
      'Artigos com preço de venda a 0€ (despublicados automaticamente)',
      detalhe
    );

    // Registar em detalhe no log
    artigos.forEach((a) => {
      log.writeLine(`[ERRO] Artigo despublicado: ${a.Codigo_Artigo} - ${a.Descritivo_Artigo} (Marca: ${a.Marca}, Preço: €${a.Preco})`);
    });
  }
  return artigos.length;
}

// Artigos que estavam na lista de alterados mas ja nao aparecem na View (deixaram
// de ser Tipo_Artigo='I', mudaram de armazem, ou foram apagados) -> despublicar,
// nunca apagar fisicamente (secção 2.6). Devolve os codigos despublicados agora,
// para o passo seguinte limpar as imagens (secção 2.7).
async function despublicarRemovidos(pool) {
  const result = await pool.request().query(`
    DECLARE @Despublicados TABLE (Codigo_Artigo VARCHAR(20));

    UPDATE tgt
    SET tgt.Publicado = 0,
        tgt.Eliminado_Na_Origem = CASE WHEN NOT EXISTS (
            SELECT 1 FROM DBClassico.dbo.TB0001StkArtigos ta WHERE ta.Codigo_Artigo = tgt.Codigo_Artigo COLLATE DATABASE_DEFAULT
        ) THEN 1 ELSE 0 END,
        tgt.Data_Sincronizacao = GETDATE()
    OUTPUT inserted.Codigo_Artigo INTO @Despublicados
    FROM dbo.ZAPP_DBSiteCD_Artigos tgt
    INNER JOIN dbo.ZAPP_DBSiteCD_SyncStaging_ChangedArtigos c ON c.Codigo_Artigo = tgt.Codigo_Artigo
    WHERE tgt.Publicado = 1
      AND NOT EXISTS (
          SELECT 1 FROM DBClassico.dbo.ZAPP_DBSiteCD_VArtigos src
          WHERE src.Code_Artigo = tgt.Codigo_Artigo COLLATE DATABASE_DEFAULT
      );

    SELECT Codigo_Artigo FROM @Despublicados;
  `);
  return (result.recordset || []).map((r) => r.Codigo_Artigo);
}

// Apaga as imagens (ficheiro + registo) dos artigos despublicados/apagados,
// para o storage nao crescer com artigos que ja nao aparecem no site (secção 2.7)
async function limparImagens(pool, codigosDespublicados) {
  if (codigosDespublicados.length === 0) return 0;

  // path das imagens a apagar
  const placeholders = codigosDespublicados.map((_, i) => `@c${i}`).join(',');
  const reqPaths = pool.request();
  codigosDespublicados.forEach((c, i) => reqPaths.input(`c${i}`, c));
  const paths = await reqPaths.query(`
    SELECT Codigo_Artigo, Path FROM dbo.ZAPP_DBSiteCD_Imagens WHERE Codigo_Artigo IN (${placeholders});
  `);

  for (const row of paths.recordset) {
    const filePath = path.join(IMAGES_DIR, path.basename(row.Path));
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
      log.writeLine(`Aviso: falha a apagar imagem ${row.Path} (${row.Codigo_Artigo}): ${err.message}`);
    }
  }

  const reqDel = pool.request();
  codigosDespublicados.forEach((c, i) => reqDel.input(`c${i}`, c));
  const del = await reqDel.query(`
    DELETE FROM dbo.ZAPP_DBSiteCD_Imagens WHERE Codigo_Artigo IN (${placeholders});
  `);
  return del.rowsAffected[0] || 0;
}

// Para os artigos alterados que CONTINUAM publicados: a imagem principal pode
// ter sido trocada (re-extrai e sobrescreve) ou apagada na ficha do artigo na
// origem (Imagem_Art a NULL) - nesse caso apaga tambem do lado do site
// (ficheiro + registo), tal como pedido pelo utilizador (2026-07-02).
// Ano/Estação da colecção (Localiz1/Localiz2 em TB0001StkArmazArt, armazém
// '001') - não faz parte do delta de TArtigosSincro, por isso corre sempre,
// para todos os artigos publicados, em vez de ficar dependente de outra
// alteração coincidente no artigo para se manter actualizado. Valores fora
// do formato esperado (ano de 4 dígitos "1xxx"/"2xxx", 'PV'/'OI') ficam a
// NULL - há muito dado antigo sujo nestes campos (texto livre, promoções).
async function sincronizarColeccao(classicoPool, sitecdPool) {
  const result = await sitecdPool.request().query(`
    UPDATE tgt
    SET tgt.Colecao_Ano = CASE WHEN src.Localiz1 LIKE '[12][0-9][0-9][0-9]' THEN CAST(src.Localiz1 AS SMALLINT) ELSE NULL END,
        tgt.Colecao_Estacao = CASE WHEN src.Localiz2 IN ('PV', 'OI') THEN src.Localiz2 ELSE NULL END
    FROM dbo.ZAPP_DBSiteCD_Artigos tgt
    INNER JOIN DBClassico.dbo.TB0001StkArmazArt src
        ON src.Codigo_Artigo = tgt.Codigo_Artigo COLLATE DATABASE_DEFAULT AND src.Codigo_Armazem = '001'
    WHERE tgt.Publicado = 1;
  `);
  return result.rowsAffected[0] || 0;
}

async function sincronizarImagensPrincipais(classicoPool, sitecdPool, codigosAlterados) {
  if (codigosAlterados.length === 0) return { gravadas: 0, removidas: 0 };

  const placeholders = codigosAlterados.map((_, i) => `@c${i}`).join(',');

  const reqImg = classicoPool.request();
  codigosAlterados.forEach((c, i) => reqImg.input(`c${i}`, c));
  const comImagemNaOrigem = await reqImg.query(`
    SELECT Code_Artigo, Imagem FROM dbo.ZAPP_DBSiteCD_VImagemPrincipal WHERE Code_Artigo IN (${placeholders});
  `);

  const codigosComImagem = new Set();
  let gravadas = 0;
  for (const row of comImagemNaOrigem.recordset) {
    const codigo = row.Code_Artigo.trim();
    const buffer = row.Imagem;
    if (!buffer || buffer.length === 0) continue;
    codigosComImagem.add(codigo);

    const fileName = `${codigo}-CD0.jpg`;
    fs.writeFileSync(path.join(IMAGES_DIR, fileName), buffer);

    await sitecdPool.request()
      .input('codigo', codigo)
      .input('caminho', `imagens/${fileName}`)
      .query(`
        MERGE dbo.ZAPP_DBSiteCD_Imagens AS tgt
        USING (SELECT @codigo AS Codigo_Artigo, 0 AS Ordem) AS src
            ON tgt.Codigo_Artigo = src.Codigo_Artigo AND tgt.Ordem = src.Ordem
        WHEN MATCHED THEN UPDATE SET tgt.Path = @caminho, tgt.Data_Sincronizacao = GETDATE()
        WHEN NOT MATCHED BY TARGET AND EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Artigos a WHERE a.Codigo_Artigo = @codigo)
            THEN INSERT (Codigo_Artigo, Ordem, Path) VALUES (@codigo, 0, @caminho);
      `);
    gravadas++;
  }

  // artigos alterados sem imagem na origem (removida na ficha do artigo, ex: Imagem_Art = NULL)
  // -> apagar ficheiro + registo tambem do lado do site, se existirem
  const semImagemNaOrigem = codigosAlterados.filter((c) => !codigosComImagem.has(c));
  let removidas = 0;
  if (semImagemNaOrigem.length > 0) {
    const ph2 = semImagemNaOrigem.map((_, i) => `@r${i}`).join(',');
    const reqSel = sitecdPool.request();
    semImagemNaOrigem.forEach((c, i) => reqSel.input(`r${i}`, c));
    const existentes = await reqSel.query(`
      SELECT Codigo_Artigo, Path FROM dbo.ZAPP_DBSiteCD_Imagens WHERE Ordem = 0 AND Codigo_Artigo IN (${ph2});
    `);

    for (const row of existentes.recordset) {
      const filePath = path.join(IMAGES_DIR, path.basename(row.Path));
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (err) {
        log.writeLine(`Aviso: falha a apagar imagem ${row.Path} (${row.Codigo_Artigo}): ${err.message}`);
      }
    }

    if (existentes.recordset.length > 0) {
      const reqDel2 = sitecdPool.request();
      semImagemNaOrigem.forEach((c, i) => reqDel2.input(`r${i}`, c));
      const del2 = await reqDel2.query(`
        DELETE FROM dbo.ZAPP_DBSiteCD_Imagens WHERE Ordem = 0 AND Codigo_Artigo IN (${ph2});
      `);
      removidas = del2.rowsAffected[0] || 0;
    }
  }

  return { gravadas, removidas };
}

async function actualizarMarcador(pool) {
  await pool.request().query(`
    DECLARE @novo DATETIME = (SELECT MAX(Data_Hora) FROM DBClassico.dbo.ZAPP_DBSiteCD_TArtigosSincro);
    IF @novo IS NOT NULL
      UPDATE DBClassico.dbo.ZAPP_DBSiteCD_TDatesSincro SET date = @novo WHERE table_name = '${WATERMARK_KEY}';
  `);
}

// "Última actualização" mostrada no rodapé do site (secção 2.6) - ao contrário
// de "última sincronização" (que avança em todos os ciclos, mesmo sem nada para
// fazer), isto só avança quando este ciclo teve mesmo dados novos/alterados a
// processar (marcas/modelos ou artigos). Guardado como texto ISO com 'Z' (não
// DATETIME do SQL) para não repetir o problema GETDATE()/UTC já corrigido acima.
async function marcarUltimaActualizacao(pool) {
  const agora = new Date().toISOString();
  await pool.request()
    .input('valor', agora)
    .query(`
      MERGE dbo.ZAPP_DBSiteCD_Config AS tgt
      USING (SELECT 'UltimaActualizacaoDados' AS Chave) AS src ON tgt.Chave = src.Chave
      WHEN MATCHED THEN UPDATE SET tgt.Valor = @valor
      WHEN NOT MATCHED THEN INSERT (Chave, Valor) VALUES ('UltimaActualizacaoDados', @valor);
    `);
}

async function runSync() {
  log.inicio();
  const pool = await getDBSiteCDPool();
  const classicoPool = await getDBClassicoPool();

  try {
    await ensureStagingTable(pool);

    const ultimaRes = await pool.request().query(
      `SELECT date FROM DBClassico.dbo.ZAPP_DBSiteCD_TDatesSincro WHERE table_name = '${WATERMARK_KEY}';`
    );
    const ultimaSincronizacao = ultimaRes.recordset[0]?.date || new Date('1900-01-01');

    let nMarcas = 0;
    try {
      nMarcas = await syncMarcasModelos(pool);
      await logResultado(pool, 'Marcas', true, nMarcas);
    } catch (err) {
      await logResultado(pool, 'Marcas', false, 0, detalheErro(err));
    }

    try {
      const nColeccao = await sincronizarColeccao(classicoPool, pool);
      await logResultado(pool, 'Coleccao', true, nColeccao);
    } catch (err) {
      await logResultado(pool, 'Coleccao', false, 0, detalheErro(err));
    }

    const nAlterados = await popularAlteracoes(pool, ultimaSincronizacao);

    if (nAlterados === 0) {
      await logResultado(pool, 'Artigos', true, 0);
      await logResultado(pool, 'ArtigosLotes', true, 0);
      await logResultado(pool, 'ArtigosSetNotInternet', true, 0);
      await logResultado(pool, 'ArtigosDeleted', true, 0);
      if (nMarcas > 0) await marcarUltimaActualizacao(pool);
      return;
    }

    try {
      const nFamilias = await garantirFamilias(pool);
      await logResultado(pool, 'Familias', true, nFamilias, nFamilias > 0 ? `${nFamilias} familia(s) nova(s) por classificar (Modalidade/Genero) em Backoffice` : null);
    } catch (err) {
      await logResultado(pool, 'Familias', false, 0, detalheErro(err, await obterCodigosAlterados(pool)));
    }

    try {
      const { artigos, lotes } = await syncArtigos(pool);
      await logResultado(pool, 'Artigos', true, artigos);
      await logResultado(pool, 'ArtigosLotes', true, lotes);

      const nPrecoZero = await validarPrecoZero(pool);
      if (nPrecoZero > 0) {
        await logResultado(pool, 'Artigos', true, 0, `${nPrecoZero} artigo(s) despublicado(s) por ter preço a 0€ - ver alerta`);
      }
    } catch (err) {
      await logResultado(pool, 'Artigos', false, 0, detalheErro(err, await obterCodigosAlterados(pool)));
    }

    let despublicados = [];
    try {
      despublicados = await despublicarRemovidos(pool);
      await logResultado(pool, 'ArtigosSetNotInternet', true, despublicados.length);
      await logResultado(pool, 'ArtigosDeleted', true, 0); // distincao fina feita no UPDATE (Eliminado_Na_Origem)
    } catch (err) {
      await logResultado(pool, 'ArtigosSetNotInternet', false, 0, detalheErro(err, await obterCodigosAlterados(pool)));
    }

    try {
      const nImagensRemovidasDespublicacao = await limparImagens(pool, despublicados);

      // artigos que continuam publicados: reflectir troca/remocao da imagem principal
      // na propria ficha do artigo na origem (nao so quando o artigo e despublicado)
      const alteradosRes = await pool.request().query(
        'SELECT Codigo_Artigo FROM dbo.ZAPP_DBSiteCD_SyncStaging_ChangedArtigos;'
      );
      const codigosAlterados = alteradosRes.recordset.map((r) => r.Codigo_Artigo);
      const aindaPublicados = codigosAlterados.filter((c) => !despublicados.includes(c));
      const { gravadas, removidas } = await sincronizarImagensPrincipais(classicoPool, pool, aindaPublicados);

      const totalRemovidas = nImagensRemovidasDespublicacao + removidas;
      const totalGravadas = gravadas;
      await logResultado(
        pool, 'Imagens', true, totalGravadas + totalRemovidas,
        `${totalGravadas} gravada(s)/actualizada(s), ${totalRemovidas} removida(s) (${nImagensRemovidasDespublicacao} por despublicação, ${removidas} por remoção na origem)`
      );
    } catch (err) {
      await logResultado(pool, 'Imagens', false, 0, detalheErro(err, await obterCodigosAlterados(pool)));
    }

    await marcarUltimaActualizacao(pool);
    await actualizarMarcador(pool);
  } catch (err) {
    log.writeLine(`ERRO GERAL na sincronizacao: ${err.message}`);
    throw err;
  } finally {
    log.fim();
  }
}

module.exports = { runSync };

if (require.main === module) {
  runSync()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
