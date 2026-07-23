-- Ordenação "Colecção": agrupa por família (como "ordenar=familia") e, dentro
-- de cada família, mostra primeiro a colecção actual (Ano+Estação, configurável
-- no Backoffice) e depois os anos anteriores, do mais recente para o mais
-- antigo. Fonte: DBClassico.dbo.TB0001StkArmazArt.Localiz1 (Ano) / Localiz2
-- (Estação: 'PV' ou 'OI') do armazém '001' - sincronizado em
-- sync-service/sync.js::sincronizarColeccao (não faz parte do delta de
-- TArtigosSincro, por isso corre à parte, sempre, para todos os artigos
-- publicados).
USE DBSiteCD;
GO

IF COL_LENGTH('dbo.ZAPP_DBSiteCD_Artigos', 'Colecao_Ano') IS NULL
ALTER TABLE dbo.ZAPP_DBSiteCD_Artigos ADD Colecao_Ano SMALLINT NULL;
GO
IF COL_LENGTH('dbo.ZAPP_DBSiteCD_Artigos', 'Colecao_Estacao') IS NULL
ALTER TABLE dbo.ZAPP_DBSiteCD_Artigos ADD Colecao_Estacao CHAR(2) NULL;
GO

-- Recria a VCatalogo (ver sql/018_marcas_inactivas.sql para a versão anterior)
-- só para acrescentar as duas colunas novas.
CREATE OR ALTER VIEW dbo.ZAPP_DBSiteCD_VCatalogo
AS
SELECT
    a.Codigo_Artigo,
    a.Descritivo_Artigo,
    a.Slug,
    a.Codigo_Marca,
    m.Marca,
    a.Codigo_Familia,
    f4.Familia          AS Familia_Grau4,
    f3.Codigo_Familia    AS Codigo_Familia_Grau3,
    f3.Familia           AS Familia_Grau3,
    f2.Codigo_Familia    AS Codigo_Familia_Grau2,
    f2.Familia           AS Familia_Grau2,
    f1.Codigo_Familia    AS Codigo_Familia_Grau1,
    f1.Familia           AS Familia_Grau1,
    COALESCE(f4.Modalidade_Id, f3.Modalidade_Id)  AS Modalidade_Id,
    modal.Titulo                                    AS Modalidade,
    modal.Tag                                        AS Modalidade_Tag,
    COALESCE(f4.Genero_Id, f3.Genero_Id)           AS Genero_Id,
    gen.Titulo                                       AS Genero,
    gen.Tag                                          AS Genero_Tag,
    a.Descricao_Longa,
    a.Data_Ult_Compra,
    a.Novidade_Manual,
    a.Publicado,
    a.Colecao_Ano,
    a.Colecao_Estacao,
    p.Preco,
    p.Percentagem_Desconto,
    p.Preco_Outlet,
    CASE WHEN p.Percentagem_Desconto > 0 THEN 1 ELSE 0 END AS Em_Outlet
FROM dbo.ZAPP_DBSiteCD_Artigos a
LEFT JOIN dbo.ZAPP_DBSiteCD_Marcas m ON m.Codigo_Marca = a.Codigo_Marca
LEFT JOIN dbo.ZAPP_DBSiteCD_Precos p ON p.Codigo_Artigo = a.Codigo_Artigo
LEFT JOIN dbo.ZAPP_DBSiteCD_SubFamilias3 f4 ON f4.Codigo_Familia = a.Codigo_Familia
LEFT JOIN dbo.ZAPP_DBSiteCD_SubFamilias2 f3 ON f3.Codigo_Familia = f4.Codigo_Familia_Pai
LEFT JOIN dbo.ZAPP_DBSiteCD_SubFamilias1 f2 ON f2.Codigo_Familia = f3.Codigo_Familia_Pai
LEFT JOIN dbo.ZAPP_DBSiteCD_Familias f1     ON f1.Codigo_Familia = f2.Codigo_Familia_Pai
LEFT JOIN dbo.ZAPP_DBSiteCD_Modalidades modal ON modal.Id = COALESCE(f4.Modalidade_Id, f3.Modalidade_Id)
LEFT JOIN dbo.ZAPP_DBSiteCD_Generos gen       ON gen.Id = COALESCE(f4.Genero_Id, f3.Genero_Id)
WHERE m.Codigo_Marca IS NULL OR m.Situacao = 1;
GO

-- Colecção "actual", editável no Backoffice (secção "Colecção Actual") -
-- ponto de partida da ordenação "Colecção" e usado para assinalar os artigos
-- dessa colecção. Valor inicial = o mais recente encontrado nos dados (2026 PV).
IF NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave = 'ColecaoAnoActual')
INSERT INTO dbo.ZAPP_DBSiteCD_Config (Chave, Valor) VALUES ('ColecaoAnoActual', '2026');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave = 'ColecaoEstacaoActual')
INSERT INTO dbo.ZAPP_DBSiteCD_Config (Chave, Valor) VALUES ('ColecaoEstacaoActual', 'PV');
GO

PRINT 'Migração 032: colunas Colecao_Ano/Colecao_Estacao, VCatalogo actualizada, config ColecaoAnoActual/ColecaoEstacaoActual.';
GO
