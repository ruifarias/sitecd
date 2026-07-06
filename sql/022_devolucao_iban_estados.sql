-- =============================================================================
-- Dados bancários para reembolso da devolução (IBAN + nome do 1º titular),
-- obrigatórios ao registar uma devolução, e a ligação entre o registo de
-- Devolução e a "Nota de Devolução" (a encomenda negativa DEV+numero criada em
-- services/devolucaoService.js) - permite ir buscar o IBAN/titular quando se
-- gera o PDF/email dessa nota. Os estados da Nota de Devolução (Emitida /
-- Recebida e Aceite / Recebida mas Não Aceite / Paga) usam a mesma coluna
-- Encomendas.Estado já existente - não é preciso migração para isso.
-- =============================================================================

USE DBSiteCD;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Devolucoes') AND name = 'Iban')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Devolucoes ADD Iban VARCHAR(34) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Devolucoes') AND name = 'Nome_Titular')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Devolucoes ADD Nome_Titular NVARCHAR(150) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Devolucoes') AND name = 'Encomenda_Devolucao_Id')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Devolucoes ADD Encomenda_Devolucao_Id INT NULL REFERENCES dbo.ZAPP_DBSiteCD_Encomendas(Id);
GO

PRINT 'Migração 022: Iban/Nome_Titular/Encomenda_Devolucao_Id criadas em Devolucoes.';
GO
