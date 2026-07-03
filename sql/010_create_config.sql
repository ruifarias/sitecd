-- =============================================================================
-- Tabela de configuração do site, gerida via Backoffice (secção 3 Fase 3)
-- =============================================================================

USE DBSiteCD;
GO

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_Config', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_Config (
    Chave   VARCHAR(50)     NOT NULL PRIMARY KEY,
    Valor   NVARCHAR(200)   NOT NULL
);
GO

INSERT INTO dbo.ZAPP_DBSiteCD_Config (Chave, Valor)
SELECT 'NovidadesDias', '180'
WHERE NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave = 'NovidadesDias');
GO

PRINT 'Tabela de configuração criada.';
GO
