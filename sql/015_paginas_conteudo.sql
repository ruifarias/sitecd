-- =============================================================================
-- Conteúdo editável no Backoffice para as páginas informativas do rodapé
-- ("Links Úteis": Sobre nós, Termos e Condições, Entregas, Pagamentos
-- Permitidos, Política de Privacidade, Política de Cookies).
-- =============================================================================

USE DBSiteCD;
GO

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_PaginasConteudo', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_PaginasConteudo (
    Chave               VARCHAR(50)     NOT NULL PRIMARY KEY,
    Titulo              NVARCHAR(200)   NOT NULL,
    Conteudo            NVARCHAR(MAX)   NOT NULL,
    Data_Actualizacao   DATETIME        NOT NULL DEFAULT GETDATE()
);
GO

PRINT 'Migração 015: tabela de páginas de conteúdo (Links Úteis) criada.';
GO
