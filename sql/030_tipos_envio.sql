-- Tipos de Envio configuráveis no Backoffice (activar/desactivar, editar
-- designação/custo, controlar ordem no checkout) - substitui o valor fixo de
-- Portes de Envio por uma escolha do cliente entre vários tipos, cada um com
-- o seu custo. Ver ZAPP_DBSiteCD_MetodosPagamento para o mesmo padrão.
IF OBJECT_ID('dbo.ZAPP_DBSiteCD_TiposEnvio', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_TiposEnvio (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    Codigo       VARCHAR(30)    NOT NULL,
    Designacao   NVARCHAR(100)  NOT NULL,
    Custo        MONEY          NOT NULL DEFAULT 0,
    Activo       BIT            NOT NULL DEFAULT 1,
    Ordem        INT            NOT NULL DEFAULT 0,
    CONSTRAINT UQ_ZAPP_DBSiteCD_TiposEnvio_Codigo UNIQUE (Codigo)
);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_TiposEnvio)
INSERT INTO dbo.ZAPP_DBSiteCD_TiposEnvio (Codigo, Designacao, Custo, Activo, Ordem) VALUES
('DPD_PONTO', 'Envio por DPD para Ponto de Entrega', 5.00, 1, 1),
('DPD_CASA', 'Envio por DPD Entrega em Casa', 8.00, 1, 2),
('LOJA', 'Levantamento na Loja', 0.00, 1, 3);
GO

-- Guarda qual tipo de envio o cliente escolheu em cada encomenda (o custo
-- resolvido continua em Encomendas.Portes, tal como acontecia com o valor
-- fixo antigo - esta coluna é só para saber/mostrar qual foi escolhido).
IF COL_LENGTH('dbo.ZAPP_DBSiteCD_Encomendas', 'Tipo_Envio') IS NULL
ALTER TABLE dbo.ZAPP_DBSiteCD_Encomendas ADD Tipo_Envio VARCHAR(30) NULL;
GO
