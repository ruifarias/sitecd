-- =============================================================================
-- Carga inicial completa: Artigos, Variantes (Lotes), Stock, Precos, Imagens
-- Cruza DBClassico.ZAPP_DBSiteCD_V* (secção 2.6.1) <-> DBSiteCD (mesma instância)
-- Corridas futuras (job de sincronização) usam o delta de
-- ZAPP_DBSiteCD_TArtigosSincro (secção 2.6/2.6.1) em vez de reprocessar tudo.
-- Ver PLANO_PROJETO.md secção 2.2 / 2.6
-- =============================================================================

USE DBSiteCD;
GO
SET QUOTED_IDENTIFIER ON;  -- necessario por causa do indice filtrado UX_ZAPP_DBSiteCD_Artigos_Slug
GO

-- -----------------------------------------------------------------------------
-- Artigos
-- -----------------------------------------------------------------------------
MERGE dbo.ZAPP_DBSiteCD_Artigos AS tgt
USING DBClassico.dbo.ZAPP_DBSiteCD_VArtigos AS src
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
GO

-- Artigos que existem em DBSiteCD mas ja nao aparecem na origem (deixaram de ser
-- Tipo_Artigo='I', ou foram apagados) -> despublicar, NUNCA apagar (encomendas historicas)
UPDATE tgt
SET tgt.Publicado = 0, tgt.Data_Sincronizacao = GETDATE()
FROM dbo.ZAPP_DBSiteCD_Artigos tgt
WHERE tgt.Publicado = 1
  AND NOT EXISTS (
      SELECT 1 FROM DBClassico.dbo.ZAPP_DBSiteCD_VArtigos src
      WHERE src.Code_Artigo = tgt.Codigo_Artigo COLLATE DATABASE_DEFAULT
  );
GO

-- -----------------------------------------------------------------------------
-- Variantes (Lotes)
-- -----------------------------------------------------------------------------
MERGE dbo.ZAPP_DBSiteCD_Variantes AS tgt
USING DBClassico.dbo.ZAPP_DBSiteCD_VLotes AS src
    ON tgt.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT
   AND tgt.Codigo_Lote   = src.Code_Lote COLLATE DATABASE_DEFAULT
WHEN MATCHED THEN
    UPDATE SET tgt.Descricao_Lote = src.Desc_Lote, tgt.Data_Hora_Origem = src.UpdateDate, tgt.Data_Sincronizacao = GETDATE()
WHEN NOT MATCHED BY TARGET AND EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Artigos a WHERE a.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT) THEN
    INSERT (Codigo_Artigo, Codigo_Lote, Descricao_Lote, Data_Hora_Origem)
    VALUES (src.Code_Artigo, src.Code_Lote, src.Desc_Lote, src.UpdateDate);
GO

-- -----------------------------------------------------------------------------
-- Stock (armazem '001')
-- -----------------------------------------------------------------------------
MERGE dbo.ZAPP_DBSiteCD_Stock AS tgt
USING DBClassico.dbo.ZAPP_DBSiteCD_VLotes AS src
    ON tgt.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT
   AND tgt.Codigo_Lote   = src.Code_Lote COLLATE DATABASE_DEFAULT
   AND tgt.Codigo_Armazem = '001'
WHEN MATCHED THEN
    UPDATE SET tgt.Qtd_Disponivel = src.Quantidade, tgt.Qtd_Reservada = src.Quantidade_Reservada,
               tgt.Data_Hora_Origem = src.UpdateDate, tgt.Data_Sincronizacao = GETDATE()
WHEN NOT MATCHED BY TARGET AND EXISTS (
        SELECT 1 FROM dbo.ZAPP_DBSiteCD_Variantes v
        WHERE v.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT AND v.Codigo_Lote = src.Code_Lote COLLATE DATABASE_DEFAULT
     ) THEN
    INSERT (Codigo_Artigo, Codigo_Lote, Codigo_Armazem, Qtd_Disponivel, Qtd_Reservada, Data_Hora_Origem)
    VALUES (src.Code_Artigo, src.Code_Lote, '001', src.Quantidade, src.Quantidade_Reservada, src.UpdateDate);
GO

-- -----------------------------------------------------------------------------
-- Precos
-- -----------------------------------------------------------------------------
MERGE dbo.ZAPP_DBSiteCD_Precos AS tgt
USING DBClassico.dbo.ZAPP_DBSiteCD_VArtigos AS src
    ON tgt.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT
WHEN MATCHED THEN
    UPDATE SET
        tgt.Preco = src.Preco,
        tgt.Codigo_Desconto_Art = NULLIF(src.Code_desconto, ''),
        tgt.Percentagem_Desconto = TRY_CAST(NULLIF(src.Code_desconto, '') AS DECIMAL(5,2)),
        tgt.Data_Sincronizacao = GETDATE()
WHEN NOT MATCHED BY TARGET AND EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Artigos a WHERE a.Codigo_Artigo = src.Code_Artigo COLLATE DATABASE_DEFAULT) THEN
    INSERT (Codigo_Artigo, Preco, Codigo_Desconto_Art, Percentagem_Desconto)
    VALUES (src.Code_Artigo, src.Preco, NULLIF(src.Code_desconto, ''), TRY_CAST(NULLIF(src.Code_desconto, '') AS DECIMAL(5,2)));
GO

-- Outlet: Preco_Outlet = Preco reduzido pela percentagem, quando > 0,
-- arredondado a multiplos de 10 centimos (regra confirmada pelo utilizador, 2026-07-02)
UPDATE dbo.ZAPP_DBSiteCD_Precos
SET Preco_Outlet = CASE WHEN Percentagem_Desconto > 0
    THEN ROUND(Preco * (1 - Percentagem_Desconto / 100.0) * 100, -1) / 100.0
    ELSE NULL END;
GO

-- Nenhum artigo pode ter preco de venda a 0 EUR (regra confirmada pelo utilizador,
-- 2026-07-02) - despublica defensivamente aqui tambem (a carga inicial corre fora
-- do Node, sem alerta WhatsApp; o job de sincronizacao incremental trata disto com
-- alerta - ver sync-service/src/sync.js validarPrecoZero)
UPDATE dbo.ZAPP_DBSiteCD_Artigos
SET Publicado = 0
WHERE Codigo_Artigo IN (SELECT Codigo_Artigo FROM dbo.ZAPP_DBSiteCD_Precos WHERE Preco = 0)
  AND Publicado = 1;
GO

PRINT 'Carga inicial de Artigos/Variantes/Stock/Precos concluida.';
GO
