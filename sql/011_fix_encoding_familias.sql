-- Corrige 8 titulos de Familias (Grau2/3) gravados com encoding errado (mojibake)
-- durante a recarga apos a descoberta da categoria "Equipamentos" - sqlcmd -i sem
-- -f i:65001 nao detectou o BOM UTF-8 de forma fiavel. A partir de agora, todo o
-- sqlcmd -i com texto acentuado usa -f i:65001 explicitamente.
USE DBSiteCD;
GO

UPDATE dbo.ZAPP_DBSiteCD_SubFamilias1 SET Familia = N'BASQUETEBOL - ANDEBOL - PAVILHÃO' WHERE Codigo_Familia = '14';
UPDATE dbo.ZAPP_DBSiteCD_SubFamilias1 SET Familia = N'FATOS DE BANHO - BIKINIS NATAÇÃO' WHERE Codigo_Familia = '36';
UPDATE dbo.ZAPP_DBSiteCD_SubFamilias1 SET Familia = N'PORTUGAL - SELECÇÃO NACIONAL' WHERE Codigo_Familia = '74';
UPDATE dbo.ZAPP_DBSiteCD_SubFamilias1 SET Familia = N'ACESSORIOS NATAÇÃO' WHERE Codigo_Familia = '87';

UPDATE dbo.ZAPP_DBSiteCD_SubFamilias2 SET Familia = N'SAPATILHAS PAVILHÃO/VOLLEY' WHERE Codigo_Familia = '148';
UPDATE dbo.ZAPP_DBSiteCD_SubFamilias2 SET Familia = N'TOUCAS NATAÇÃO' WHERE Codigo_Familia = '871';
UPDATE dbo.ZAPP_DBSiteCD_SubFamilias2 SET Familia = N'OCULOS NATAÇÃO' WHERE Codigo_Familia = '872';
UPDATE dbo.ZAPP_DBSiteCD_SubFamilias2 SET Familia = N'OUTROS ACESSORIOS NATAÇÃO' WHERE Codigo_Familia = '879';
GO

PRINT 'Encoding de Familias corrigido.';
GO
