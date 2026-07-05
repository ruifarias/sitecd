-- =============================================================================
-- Morada de entrega por omissão na ficha do cliente. Recolhida na criação da
-- conta (ou editável depois em "Os Meus Dados"), separada da tabela Moradas
-- (que regista o histórico da morada usada em cada encomenda).
-- =============================================================================

USE DBSiteCD;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Clientes') AND name = 'Morada')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Clientes ADD Morada NVARCHAR(200) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Clientes') AND name = 'Localidade')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Clientes ADD Localidade NVARCHAR(100) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Clientes') AND name = 'Codigo_Postal')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Clientes ADD Codigo_Postal VARCHAR(10) NULL;
GO

PRINT 'Migração 019: colunas Morada/Localidade/Codigo_Postal criadas em Clientes.';
GO
