-- =============================================================================
-- Devoluções de encomendas já enviadas (parciais ou totais). Cada devolução
-- regista as linhas/quantidades devolvidas e o valor correspondente; os pontos
-- de fidelização já atribuídos são estornados proporcionalmente ao valor
-- devolvido (ver PontosLedger, Tipo = 'Devolucao').
-- =============================================================================

USE DBSiteCD;
GO

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_Devolucoes', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_Devolucoes (
    Id                  INT IDENTITY(1,1) PRIMARY KEY,
    Encomenda_Id        INT             NOT NULL REFERENCES dbo.ZAPP_DBSiteCD_Encomendas(Id),
    Valor_Devolvido     MONEY           NOT NULL,
    Pontos_Estornados   INT             NOT NULL,
    Data_Criacao        DATETIME        NOT NULL DEFAULT GETDATE()
);
GO

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_DevolucoesLinhas', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_DevolucoesLinhas (
    Id                  INT IDENTITY(1,1) PRIMARY KEY,
    Devolucao_Id        INT             NOT NULL REFERENCES dbo.ZAPP_DBSiteCD_Devolucoes(Id),
    Codigo_Artigo       VARCHAR(20)     NOT NULL,
    Codigo_Lote         VARCHAR(50)     NOT NULL,
    Descricao           NVARCHAR(200)   NOT NULL,
    Quantidade          INT             NOT NULL,
    Preco_Unitario      MONEY           NOT NULL
);
GO

PRINT 'Migração 017: tabelas de Devoluções criadas.';
GO
