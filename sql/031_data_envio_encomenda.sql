-- Data em que a encomenda passou a "Enviada" (ver PUT /admin/encomendas/:numero/avancar).
-- Usada para limitar a janela de devolução do cliente a 30 dias após o envio
-- (Data_Actualizacao não serve para isto - é reescrita de novo quando o
-- cliente confirma a receção, perdendo a data de envio original).
-- NULL nas encomendas já enviadas antes desta migração (sem data de envio
-- conhecida) - tratado como "sem limite" no código, para não bloquear
-- devoluções antigas por falta de dados históricos.
IF COL_LENGTH('dbo.ZAPP_DBSiteCD_Encomendas', 'Data_Envio') IS NULL
ALTER TABLE dbo.ZAPP_DBSiteCD_Encomendas ADD Data_Envio DATETIME NULL;
GO
