-- =============================================================================
-- Razão da Devolução: motivo escrito pelo cliente ao registar a devolução,
-- gravado junto com o IBAN/Nome do Titular já existentes em Devolucoes, para
-- constar do PDF/email da Nota de Devolução e da consulta no Backoffice.
-- =============================================================================

USE DBSiteCD;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Devolucoes') AND name = 'Motivo')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Devolucoes ADD Motivo NVARCHAR(500) NULL;
GO

PRINT 'Migração 025: coluna Motivo criada em Devolucoes.';
GO
