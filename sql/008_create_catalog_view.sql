-- =============================================================================
-- View de catalogo para a API do site: junta Artigos + Precos + Marcas +
-- hierarquia de Familia (resolvendo Modalidade/Genero herdados do Grau3, com
-- override do Grau4 quando existir - caso "Clubes", secção 2.1.1).
-- So em DBSiteCD - nao mexe em nada na DBClassico.
-- Ver PLANO_PROJETO.md secção 2.2/2.3
-- =============================================================================

USE DBSiteCD;
GO

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
LEFT JOIN dbo.ZAPP_DBSiteCD_Generos gen       ON gen.Id = COALESCE(f4.Genero_Id, f3.Genero_Id);
GO

PRINT 'View de catalogo ZAPP_DBSiteCD_VCatalogo criada.';
GO
