-- =============================================================================
-- Seguimento do estado da encomenda (Backoffice) - Aguardar Pagamento →
-- Pagamento Efectuado → Em Preparação → Enviada, ou Anulada em qualquer altura.
-- Pontos só são atribuídos definitivamente quando a encomenda é marcada como
-- Enviada; se for anulada depois disso, os pontos são estornados.
-- =============================================================================

USE DBSiteCD;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Encomendas') AND name = 'Data_Actualizacao')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Encomendas ADD Data_Actualizacao DATETIME NULL;
GO

-- Encomendas já existentes ficam marcadas como 'Enviada' (o fluxo antigo não
-- tinha estados intermédios) para não bloquear pontos já esperados pelos clientes.
UPDATE dbo.ZAPP_DBSiteCD_Encomendas SET Estado = 'Enviada' WHERE Estado = 'Confirmada';
GO

PRINT 'Migração 013: seguimento de estado da encomenda.';
GO
