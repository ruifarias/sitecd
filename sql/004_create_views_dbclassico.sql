-- =============================================================================
-- Views de leitura ZAPP_DBSiteCD_V* na DBClassico
-- Paralelas e independentes das WEBSW_VSyncro* existentes - NUNCA as alteram.
-- Só SELECT (sem qualquer escrita), sem impacto no ERP Gexor.
-- Ver PLANO_PROJETO.md secção 2.6 / 2.6.1 / 2.1.3
-- =============================================================================

USE DBClassico;
GO

-- -----------------------------------------------------------------------------
-- ZAPP_DBSiteCD_VMarcas
-- -----------------------------------------------------------------------------
CREATE OR ALTER VIEW dbo.ZAPP_DBSiteCD_VMarcas
AS
SELECT
    Codigo_Marca,
    Marca,
    Data_Hora
FROM dbo.TB0001StkMarcas WITH (NOLOCK);
GO

-- -----------------------------------------------------------------------------
-- ZAPP_DBSiteCD_VFamilias  (todos os 4 Graus, tal como TB0001StkFamilias)
-- -----------------------------------------------------------------------------
CREATE OR ALTER VIEW dbo.ZAPP_DBSiteCD_VFamilias
AS
SELECT
    Codigo_Familia,
    Familia,
    Grau,
    Data_Hora
FROM dbo.TB0001StkFamilias WITH (NOLOCK);
GO

-- -----------------------------------------------------------------------------
-- ZAPP_DBSiteCD_VModelos
-- -----------------------------------------------------------------------------
CREATE OR ALTER VIEW dbo.ZAPP_DBSiteCD_VModelos
AS
SELECT
    Codigo_Modelo,
    Codigo_Marca,
    Modelo,
    Data_Hora
FROM dbo.TB0001StkModelos WITH (NOLOCK);
GO

-- -----------------------------------------------------------------------------
-- ZAPP_DBSiteCD_VArtigos
-- Regras confirmadas (seccao 2.1 / 2.1.3):
--   - Codigo_Armazem = '001' (filtro EXPLICITO, ao contrario da WEBSW_VSyncroArtigos)
--   - Tipo_Artigo = 'I'
--   - Preco: Tipo_Preco='PV1' + Codigo_Moeda='001' + Codigo_Unidade='UN'
--   - Especificacoes tecnicas: TB0001StkInfoCompArm, Tipo_Info_Compl='O', Codigo_Info_Compl='Internet'
--   - UpdateDate = maximo de 3 datas (Artigo, Preco PV1, AcumulQtd do ano corrente)
-- -----------------------------------------------------------------------------
CREATE OR ALTER VIEW dbo.ZAPP_DBSiteCD_VArtigos
AS
SELECT
    art.Codigo_Artigo                                  AS Code_Artigo,
    art.Descritivo_Artigo                               AS Descricao,
    art.Tipo_Artigo                                      AS Internet,
    art.Codigo_Marca                                     AS Code_Marca,
    art.Codigo_Modelo                                    AS Code_Modelo,
    art.Codigo_Familia                                   AS Code_Familia,      -- aponta sempre para o Grau 4 (seccao 2.1.1)
    art.Peso                                             AS Peso,
    art.Taxa_IVA_Incluido                                AS Iva,
    armazArt.Data_Ult_Compra                             AS Data_Compra,       -- criterio de Novidade
    ISNULL(
        (SELECT Preco
         FROM dbo.TB0001StkPrecosVenda pv WITH (NOLOCK)
         WHERE pv.Codigo_Armazem = '001' AND pv.Codigo_Artigo = art.Codigo_Artigo
           AND pv.Tipo_Preco = 'PV1' AND pv.Codigo_Moeda = '001' AND pv.Codigo_Unidade = 'UN'),
    0)                                                    AS Preco,
    ISNULL(
        (SELECT IVA_Incluido
         FROM dbo.TB0001StkPrecosVenda pv2 WITH (NOLOCK)
         WHERE pv2.Codigo_Armazem = '001' AND pv2.Codigo_Artigo = art.Codigo_Artigo
           AND pv2.Tipo_Preco = 'PV1' AND pv2.Codigo_Moeda = '001' AND pv2.Codigo_Unidade = 'UN'),
    '') AS Iva_Incluido,
    ISNULL(
        (SELECT Codigo_Desconto_Art
         FROM dbo.TB0001StkPrecosVenda pv3 WITH (NOLOCK)
         WHERE pv3.Codigo_Armazem = '001' AND pv3.Codigo_Artigo = art.Codigo_Artigo
           AND pv3.Tipo_Preco = 'PV1' AND pv3.Codigo_Moeda = '001' AND pv3.Codigo_Unidade = 'UN'),
    '') AS Code_desconto,
    (
        SELECT MAX(v) FROM (VALUES
            (art.Data_Hora),
            ((SELECT pv4.Data_Hora
              FROM dbo.TB0001StkPrecosVenda pv4 WITH (NOLOCK)
              WHERE pv4.Codigo_Armazem = '001' AND pv4.Codigo_Artigo = art.Codigo_Artigo
                AND pv4.Tipo_Preco = 'PV1' AND pv4.Codigo_Moeda = '001' AND pv4.Codigo_Unidade = 'UN')),
            ((SELECT aq.Data_Hora
              FROM dbo.TB0001StkAcumulQtd aq WITH (NOLOCK)
              WHERE aq.Ano = YEAR(GETDATE()) AND aq.Codigo_Armazem = '001' AND aq.Codigo_Artigo = art.Codigo_Artigo))
        ) AS d(v)
    )                                                     AS UpdateDate,        -- maximo de 3 datas (seccao 2.1.3)
    (
        SELECT TOP 1 Texto_Info_Compl
        FROM dbo.TB0001StkInfoCompArm ica WITH (NOLOCK)
        WHERE ica.Codigo_Armazem = '001' AND ica.Codigo_Artigo = art.Codigo_Artigo
          AND ica.Tipo_Info_Compl = 'O' AND ica.Codigo_Info_Compl = 'Internet'
    )                                                     AS Texto_Especificacoes
FROM dbo.TB0001StkArtigos art WITH (NOLOCK)
INNER JOIN dbo.TB0001StkArmazArt armazArt WITH (NOLOCK)
    ON armazArt.Codigo_Artigo = art.Codigo_Artigo
WHERE art.Tipo_Artigo = 'I'
  AND armazArt.Codigo_Armazem = '001'   -- filtro explicito (correcao face a WEBSW_VSyncroArtigos - seccao 2.1.3)
  AND (art.Codigo_Familia IS NULL OR LEFT(art.Codigo_Familia, 1) <> '9');  -- Categoria "Equipamentos" descontinuada, excluida do site (decisao 2026-07-02)
GO

-- -----------------------------------------------------------------------------
-- ZAPP_DBSiteCD_VLotes  (Cor+Tamanho, texto livre - stock do armazem '001')
-- -----------------------------------------------------------------------------
CREATE OR ALTER VIEW dbo.ZAPP_DBSiteCD_VLotes
AS
SELECT
    art.Code_Artigo                                       AS Code_Artigo,
    lot.Codigo_Lote                                        AS Code_Lote,
    lot.Descricao_Lote                                     AS Desc_Lote,
    CONVERT(INT, ISNULL(lac.Qtd_Disponivel, 0))            AS Quantidade,
    CONVERT(INT, ISNULL(lac.Qtd_Reservada, 0))             AS Quantidade_Reservada,
    (
        SELECT MAX(v) FROM (VALUES
            (lot.Data_Hora),
            (lac.Data_Hora),
            (art.UpdateDate)
        ) AS d(v)
    )                                                       AS UpdateDate
FROM dbo.ZAPP_DBSiteCD_VArtigos art
INNER JOIN dbo.TB0001StkLotes lot WITH (NOLOCK)
    ON lot.Codigo_Artigo = art.Code_Artigo
LEFT JOIN dbo.TB0001StkLotesAcumul lac WITH (NOLOCK)
    ON lac.Codigo_Artigo = art.Code_Artigo
   AND lac.Codigo_Lote = lot.Codigo_Lote
   AND lac.Codigo_Armazem = '001';
GO

-- -----------------------------------------------------------------------------
-- ZAPP_DBSiteCD_VImagemPrincipal
-- Imagem 0 (binaria, na BD). As imagens 1-8 vêm da directoria Cod_Artigo-CD*.jpg
-- (fora do SQL Server - lidas pelo servico de sincronizacao em CDSERVER).
-- Separada de VArtigos de proposito (campo 'image' pesado, não deve ir no delta geral).
-- -----------------------------------------------------------------------------
CREATE OR ALTER VIEW dbo.ZAPP_DBSiteCD_VImagemPrincipal
AS
SELECT
    Codigo_Artigo   AS Code_Artigo,
    Imagem_Art       AS Imagem
FROM dbo.TB0001StkArtigos WITH (NOLOCK)
WHERE Tipo_Artigo = 'I'
  AND Imagem_Art IS NOT NULL;
GO

PRINT 'Views ZAPP_DBSiteCD_V* criadas em DBClassico.';
GO
