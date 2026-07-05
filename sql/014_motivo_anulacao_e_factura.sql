-- =============================================================================
-- Motivo de anulação (escrito pelo operador no Backoffice), morada de entrega
-- guardada directamente na encomenda (para a factura/PDF/email não depender de
-- registos de Moradas que podem mudar depois da compra), e taxa de IVA
-- configurável para a factura.
-- =============================================================================

USE DBSiteCD;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Encomendas') AND name = 'Motivo_Anulacao')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Encomendas ADD Motivo_Anulacao NVARCHAR(500) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Encomendas') AND name = 'Morada_Entrega')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Encomendas ADD Morada_Entrega NVARCHAR(200) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Encomendas') AND name = 'Localidade_Entrega')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Encomendas ADD Localidade_Entrega NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Encomendas') AND name = 'Codigo_Postal_Entrega')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Encomendas ADD Codigo_Postal_Entrega VARCHAR(10) NULL;
GO

INSERT INTO dbo.ZAPP_DBSiteCD_Config (Chave, Valor)
SELECT 'TaxaIVA', '23'
WHERE NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave = 'TaxaIVA');
GO

PRINT 'Migração 014: motivo de anulação, morada de entrega na encomenda, taxa de IVA.';
GO
