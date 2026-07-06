-- =============================================================================
-- Código de Cliente: identificador único e estável por cliente (CLI+Id, à
-- semelhança de ENC/DEV para encomendas), usado nas Fichas de Clientes, no
-- Extracto de Cliente, nas encomendas e nos emails. Coluna calculada
-- (PERSISTED) a partir do Id - nunca precisa de ser gerada/atualizada à mão,
-- e já cobre automaticamente todos os clientes existentes.
-- =============================================================================

USE DBSiteCD;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Clientes') AND name = 'Codigo_Cliente')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Clientes ADD Codigo_Cliente AS ('CLI' + RIGHT('000000' + CAST(Id AS VARCHAR(6)), 6)) PERSISTED;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_ZAPP_DBSiteCD_Clientes_CodigoCliente' AND object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Clientes'))
    CREATE UNIQUE INDEX UQ_ZAPP_DBSiteCD_Clientes_CodigoCliente ON dbo.ZAPP_DBSiteCD_Clientes(Codigo_Cliente);
GO

PRINT 'Migração 023: coluna calculada Codigo_Cliente criada em Clientes.';
GO
