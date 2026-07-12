-- MB WAY (Ifthenpay) precisa do número de telemóvel para reenviar a notificação
-- de pagamento se a primeira tentativa falhar (ver POST /api/encomendas/:numero/mbway/reenviar).
IF COL_LENGTH('dbo.ZAPP_DBSiteCD_Pagamentos', 'Telemovel') IS NULL
ALTER TABLE dbo.ZAPP_DBSiteCD_Pagamentos ADD Telemovel VARCHAR(20) NULL;
GO
