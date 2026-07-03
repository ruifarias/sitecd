-- =============================================================================
-- Tabelas de rastreio de alteracoes + triggers dedicados, na DBClassico.
-- Espelham o padrao comprovado de WEBSW_TArtigosSincro/TDatesSincro (secção 2.6.1),
-- mas SEPARADOS e NOVOS - nunca tocam nos objectos/triggers existentes do
-- ERP Gexor nem do Sincronizador WEBSW_* actual.
-- Cobre apenas dados de ALTO VOLUME (Artigos/Lotes/Stock/Precos) - Marcas,
-- Modelos e Familias sao pequenos e re-sincronizados por inteiro (ver 006).
-- Ver PLANO_PROJETO.md secção 2.6 / 2.6.1
-- =============================================================================

USE DBClassico;
GO

-- -----------------------------------------------------------------------------
-- Tabelas de rastreio (mesma estrutura de WEBSW_TArtigosSincro/TDatesSincro)
-- -----------------------------------------------------------------------------
IF OBJECT_ID('dbo.ZAPP_DBSiteCD_TArtigosSincro', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_TArtigosSincro (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    Codigo_Artigo   VARCHAR(20)   NOT NULL,
    Tipo_Operacao   CHAR(3)       NULL,        -- INS / UPD / DEL
    Data_Hora       DATETIME      NOT NULL DEFAULT GETDATE(),
    Tipo_Imput      VARCHAR(50)   NULL,        -- Artigo / Lote / Stock / Preco / ArmazArt / InfoCompl
    Codigo_Lote     VARCHAR(50)   NULL
);
GO

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_TDatesSincro', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_TDatesSincro (
    table_name   VARCHAR(50)  NOT NULL PRIMARY KEY,
    date         DATETIME     NULL
);
GO

-- marcador inicial (data 0 = sincronizar tudo na primeira corrida)
INSERT INTO dbo.ZAPP_DBSiteCD_TDatesSincro (table_name, date)
SELECT 'ZAPP_DBSiteCD_TArtigosSincro', '1900-01-01'
WHERE NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_TDatesSincro WHERE table_name = 'ZAPP_DBSiteCD_TArtigosSincro');
GO

-- -----------------------------------------------------------------------------
-- Triggers dedicados (novos, aditivos) nas tabelas base de alto volume
-- -----------------------------------------------------------------------------

CREATE OR ALTER TRIGGER dbo.ZAPP_DBSiteCD_TRG_Artigos
ON dbo.TB0001StkArtigos
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.ZAPP_DBSiteCD_TArtigosSincro (Codigo_Artigo, Tipo_Operacao, Tipo_Imput)
    SELECT Codigo_Artigo, 'UPD', 'Artigo' FROM inserted
    UNION ALL
    SELECT Codigo_Artigo, 'DEL', 'Artigo' FROM deleted d
    WHERE NOT EXISTS (SELECT 1 FROM inserted i WHERE i.Codigo_Artigo = d.Codigo_Artigo);
END;
GO

CREATE OR ALTER TRIGGER dbo.ZAPP_DBSiteCD_TRG_Lotes
ON dbo.TB0001StkLotes
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.ZAPP_DBSiteCD_TArtigosSincro (Codigo_Artigo, Codigo_Lote, Tipo_Operacao, Tipo_Imput)
    SELECT Codigo_Artigo, Codigo_Lote, 'UPD', 'Lote' FROM inserted
    UNION ALL
    SELECT Codigo_Artigo, Codigo_Lote, 'DEL', 'Lote' FROM deleted d
    WHERE NOT EXISTS (SELECT 1 FROM inserted i WHERE i.Codigo_Artigo = d.Codigo_Artigo AND i.Codigo_Lote = d.Codigo_Lote);
END;
GO

CREATE OR ALTER TRIGGER dbo.ZAPP_DBSiteCD_TRG_LotesAcumul
ON dbo.TB0001StkLotesAcumul
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.ZAPP_DBSiteCD_TArtigosSincro (Codigo_Artigo, Codigo_Lote, Tipo_Operacao, Tipo_Imput)
    SELECT Codigo_Artigo, Codigo_Lote, 'UPD', 'Stock' FROM inserted WHERE Codigo_Armazem = '001'
    UNION ALL
    SELECT Codigo_Artigo, Codigo_Lote, 'DEL', 'Stock' FROM deleted d
    WHERE d.Codigo_Armazem = '001'
      AND NOT EXISTS (SELECT 1 FROM inserted i WHERE i.Codigo_Artigo = d.Codigo_Artigo AND i.Codigo_Lote = d.Codigo_Lote AND i.Codigo_Armazem = '001');
END;
GO

CREATE OR ALTER TRIGGER dbo.ZAPP_DBSiteCD_TRG_PrecosVenda
ON dbo.TB0001StkPrecosVenda
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.ZAPP_DBSiteCD_TArtigosSincro (Codigo_Artigo, Tipo_Operacao, Tipo_Imput)
    SELECT Codigo_Artigo, 'UPD', 'Preco' FROM inserted
    WHERE Codigo_Armazem = '001' AND Tipo_Preco = 'PV1' AND Codigo_Moeda = '001' AND Codigo_Unidade = 'UN'
    UNION ALL
    SELECT Codigo_Artigo, 'DEL', 'Preco' FROM deleted d
    WHERE d.Codigo_Armazem = '001' AND d.Tipo_Preco = 'PV1' AND d.Codigo_Moeda = '001' AND d.Codigo_Unidade = 'UN'
      AND NOT EXISTS (SELECT 1 FROM inserted i WHERE i.Codigo_Artigo = d.Codigo_Artigo AND i.Codigo_Armazem = d.Codigo_Armazem AND i.Tipo_Preco = d.Tipo_Preco);
END;
GO

CREATE OR ALTER TRIGGER dbo.ZAPP_DBSiteCD_TRG_ArmazArt
ON dbo.TB0001StkArmazArt
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.ZAPP_DBSiteCD_TArtigosSincro (Codigo_Artigo, Tipo_Operacao, Tipo_Imput)
    SELECT Codigo_Artigo, 'UPD', 'ArmazArt' FROM inserted WHERE Codigo_Armazem = '001';
END;
GO

CREATE OR ALTER TRIGGER dbo.ZAPP_DBSiteCD_TRG_InfoCompArm
ON dbo.TB0001StkInfoCompArm
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.ZAPP_DBSiteCD_TArtigosSincro (Codigo_Artigo, Tipo_Operacao, Tipo_Imput)
    SELECT Codigo_Artigo, 'UPD', 'InfoCompl' FROM inserted
    WHERE Codigo_Armazem = '001' AND Tipo_Info_Compl = 'O' AND Codigo_Info_Compl = 'Internet'
    UNION ALL
    SELECT Codigo_Artigo, 'DEL', 'InfoCompl' FROM deleted d
    WHERE d.Codigo_Armazem = '001' AND d.Tipo_Info_Compl = 'O' AND d.Codigo_Info_Compl = 'Internet'
      AND NOT EXISTS (SELECT 1 FROM inserted i WHERE i.Codigo_Artigo = d.Codigo_Artigo);
END;
GO

PRINT 'Tabelas de rastreio e triggers ZAPP_DBSiteCD_* criados em DBClassico.';
GO
