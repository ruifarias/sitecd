-- Uma encomenda passa a poder aplicar mais do que um vale (regra: 1 vale por
-- cada 50€ de compras, ver checkout). Encomendas.Vale_Codigo guardava só um
-- código (VARCHAR(20)); alarga para caber uma lista separada por vírgulas.
-- A relação "quais vales foram usados nesta encomenda" continua a vir de
-- ZAPP_DBSiteCD_Vales.Encomenda_Utilizacao_Id (já suporta N vales -> 1
-- encomenda sem alterações), Vale_Codigo é só um resumo para PDF/email/admin.
IF COL_LENGTH('dbo.ZAPP_DBSiteCD_Encomendas', 'Vale_Codigo') IS NOT NULL
ALTER TABLE dbo.ZAPP_DBSiteCD_Encomendas ALTER COLUMN Vale_Codigo VARCHAR(200) NULL;
GO
