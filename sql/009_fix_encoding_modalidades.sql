-- Corrige 5 titulos de Modalidades gravados com encoding errado (mojibake) na
-- carga inicial (002_seed_modalidades_generos.sql executado sem -f i:65001).
-- Ver PLANO_PROJETO.md - nota tecnica sobre encoding.
USE DBSiteCD;
GO

UPDATE dbo.ZAPP_DBSiteCD_Modalidades SET Titulo = N'Aeróbica' WHERE Id = 1;
UPDATE dbo.ZAPP_DBSiteCD_Modalidades SET Titulo = N'Ginásio' WHERE Id = 10;
UPDATE dbo.ZAPP_DBSiteCD_Modalidades SET Titulo = N'Ginástica' WHERE Id = 11;
UPDATE dbo.ZAPP_DBSiteCD_Modalidades SET Titulo = N'Natação' WHERE Id = 15;
UPDATE dbo.ZAPP_DBSiteCD_Modalidades SET Titulo = N'Ténis' WHERE Id = 21;
GO

PRINT 'Encoding de Modalidades corrigido.';
GO
