-- =============================================================================
-- Recuperação de password (token de uso único com expiração) e IBAN/Nome do
-- 1º Titular da Conta na ficha do cliente (preenchidos/actualizados também
-- automaticamente sempre que o cliente regista uma devolução - ver
-- services/devolucaoService.js).
-- =============================================================================

USE DBSiteCD;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Clientes') AND name = 'Reset_Token')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Clientes ADD Reset_Token VARCHAR(64) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Clientes') AND name = 'Reset_Token_Expira')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Clientes ADD Reset_Token_Expira DATETIME NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Clientes') AND name = 'Iban')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Clientes ADD Iban VARCHAR(34) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Clientes') AND name = 'Nome_Titular_Conta')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Clientes ADD Nome_Titular_Conta NVARCHAR(150) NULL;
GO

PRINT 'Migração 024: Reset_Token(_Expira) e Iban/Nome_Titular_Conta criados em Clientes.';
GO
