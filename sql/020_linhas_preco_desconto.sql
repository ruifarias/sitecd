-- =============================================================================
-- Guarda o preço de venda (tabela) e o desconto de outlet aplicado a cada linha
-- de encomenda, para poder discriminar Preço Venda / Desconto / Valor Líquido
-- no detalhe da encomenda (Minha Conta e Backoffice). Encomendas já existentes
-- não têm este dado guardado - assume-se desconto 0 (Preco_Venda = Preco_Unitario).
-- =============================================================================

USE DBSiteCD;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_EncomendasLinhas') AND name = 'Preco_Venda')
    ALTER TABLE dbo.ZAPP_DBSiteCD_EncomendasLinhas ADD Preco_Venda MONEY NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_EncomendasLinhas') AND name = 'Desconto')
    ALTER TABLE dbo.ZAPP_DBSiteCD_EncomendasLinhas ADD Desconto MONEY NOT NULL DEFAULT 0;
GO

UPDATE dbo.ZAPP_DBSiteCD_EncomendasLinhas SET Preco_Venda = Preco_Unitario WHERE Preco_Venda IS NULL;
GO

PRINT 'Migração 020: colunas Preco_Venda/Desconto criadas em EncomendasLinhas.';
GO
