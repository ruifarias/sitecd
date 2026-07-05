-- =============================================================================
-- Restringe o acesso ao Backoffice: só clientes com IsAdmin = 1 podem usar as
-- rotas /api/admin/*. A conta geral@classicodesportivo.pt é marcada como admin.
-- =============================================================================

USE DBSiteCD;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Clientes') AND name = 'IsAdmin')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Clientes ADD IsAdmin BIT NOT NULL DEFAULT 0;
GO

UPDATE dbo.ZAPP_DBSiteCD_Clientes SET IsAdmin = 1 WHERE Email = 'geral@classicodesportivo.pt';
GO

PRINT 'Migração 016: coluna IsAdmin criada, geral@classicodesportivo.pt marcado como admin.';
GO
