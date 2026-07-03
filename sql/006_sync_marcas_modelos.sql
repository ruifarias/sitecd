-- =============================================================================
-- Sincronizacao completa (MERGE) de Marcas e Modelos - tabelas de referencia
-- pequenas (155 Marcas, 105 Modelos), re-sincronizadas por inteiro a cada
-- corrida em vez de rastreio incremental por trigger (nao compensa o esforço
-- para este volume). Cruza directamente DBClassico <-> DBSiteCD, mesma
-- instancia TSERVER\SQLSERVER. So actualiza/insere - nunca apaga registos
-- (para nao quebrar FKs de Artigos/Modelos ja carregados).
-- Ver PLANO_PROJETO.md secção 2.6
-- =============================================================================

USE DBSiteCD;
GO

MERGE dbo.ZAPP_DBSiteCD_Marcas AS tgt
USING DBClassico.dbo.ZAPP_DBSiteCD_VMarcas AS src
    ON tgt.Codigo_Marca = src.Codigo_Marca COLLATE DATABASE_DEFAULT
WHEN MATCHED AND (tgt.Marca <> src.Marca COLLATE DATABASE_DEFAULT OR tgt.Data_Hora_Origem <> src.Data_Hora) THEN
    UPDATE SET tgt.Marca = src.Marca, tgt.Data_Hora_Origem = src.Data_Hora, tgt.Data_Sincronizacao = GETDATE()
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Codigo_Marca, Marca, Tag, Data_Hora_Origem)
    VALUES (src.Codigo_Marca, src.Marca, LOWER(src.Marca), src.Data_Hora);
GO

MERGE dbo.ZAPP_DBSiteCD_Modelos AS tgt
USING DBClassico.dbo.ZAPP_DBSiteCD_VModelos AS src
    ON tgt.Codigo_Modelo = src.Codigo_Modelo COLLATE DATABASE_DEFAULT AND tgt.Codigo_Marca = src.Codigo_Marca COLLATE DATABASE_DEFAULT
WHEN MATCHED AND (tgt.Modelo <> src.Modelo COLLATE DATABASE_DEFAULT OR tgt.Data_Hora_Origem <> src.Data_Hora) THEN
    UPDATE SET tgt.Modelo = src.Modelo, tgt.Data_Hora_Origem = src.Data_Hora, tgt.Data_Sincronizacao = GETDATE()
WHEN NOT MATCHED BY TARGET AND EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Marcas m WHERE m.Codigo_Marca = src.Codigo_Marca COLLATE DATABASE_DEFAULT) THEN
    INSERT (Codigo_Modelo, Codigo_Marca, Modelo, Data_Hora_Origem)
    VALUES (src.Codigo_Modelo, src.Codigo_Marca, src.Modelo, src.Data_Hora);
GO

PRINT 'Marcas e Modelos sincronizados.';
GO
