-- Nº de dias após a encomenda ser marcada como "Enviada" a partir dos quais o
-- cliente pode confirmar a receção (e libertar os pontos de fidelização).
INSERT INTO dbo.ZAPP_DBSiteCD_Config (Chave, Valor)
SELECT 'DiasConfirmacaoRecepcao', '1'
WHERE NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave = 'DiasConfirmacaoRecepcao');
GO

PRINT 'Migração 026: config de dias para confirmação de receção.';
GO
