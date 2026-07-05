-- =============================================================================
-- Contas de cliente com password, portes de envio, pontos de fidelização e vales
-- =============================================================================

USE DBSiteCD;
GO

-- 1) Encomendas: portes, pontos ganhos, vale aplicado
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Encomendas') AND name = 'Portes')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Encomendas ADD Portes MONEY NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Encomendas') AND name = 'Pontos_Ganhos')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Encomendas ADD Pontos_Ganhos INT NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Encomendas') AND name = 'Vale_Codigo')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Encomendas ADD Vale_Codigo VARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ZAPP_DBSiteCD_Encomendas') AND name = 'Vale_Desconto')
    ALTER TABLE dbo.ZAPP_DBSiteCD_Encomendas ADD Vale_Desconto MONEY NOT NULL DEFAULT 0;
GO

-- 2) Livro-razão de pontos (ganho positivo, gasto negativo, ajuste qualquer sinal)
IF OBJECT_ID('dbo.ZAPP_DBSiteCD_PontosLedger', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_PontosLedger (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    Cliente_Id      INT             NOT NULL REFERENCES dbo.ZAPP_DBSiteCD_Clientes(Id),
    Tipo            VARCHAR(20)     NOT NULL,   -- 'Ganho' | 'Gasto' | 'Ajuste'
    Pontos          INT             NOT NULL,   -- positivo = crédito, negativo = débito
    Encomenda_Id    INT             NULL REFERENCES dbo.ZAPP_DBSiteCD_Encomendas(Id),
    Descricao       NVARCHAR(200)   NULL,
    Data_Criacao    DATETIME        NOT NULL DEFAULT GETDATE()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ZAPP_DBSiteCD_PontosLedger_Cliente')
    CREATE INDEX IX_ZAPP_DBSiteCD_PontosLedger_Cliente ON dbo.ZAPP_DBSiteCD_PontosLedger(Cliente_Id);
GO

-- 3) Vales gerados por troca de pontos
IF OBJECT_ID('dbo.ZAPP_DBSiteCD_Vales', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_Vales (
    Id                      INT IDENTITY(1,1) PRIMARY KEY,
    Codigo                  VARCHAR(20)     NOT NULL,
    Cliente_Id              INT             NOT NULL REFERENCES dbo.ZAPP_DBSiteCD_Clientes(Id),
    Valor                   MONEY           NOT NULL,
    Estado                  VARCHAR(20)     NOT NULL DEFAULT 'Activo',   -- Activo | Utilizado | Cancelado
    Pontos_Ledger_Id        INT             NULL REFERENCES dbo.ZAPP_DBSiteCD_PontosLedger(Id),
    Encomenda_Utilizacao_Id INT             NULL REFERENCES dbo.ZAPP_DBSiteCD_Encomendas(Id),
    Data_Criacao            DATETIME        NOT NULL DEFAULT GETDATE(),
    Data_Utilizacao         DATETIME        NULL,
    CONSTRAINT UQ_ZAPP_DBSiteCD_Vales_Codigo UNIQUE (Codigo)
);
GO

-- 4) Seeds de configuração (Config já é chave/valor genérico, reutilizado sem novos endpoints)
INSERT INTO dbo.ZAPP_DBSiteCD_Config (Chave, Valor)
SELECT 'PortesEnvio', '9.90'
WHERE NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave = 'PortesEnvio');
GO
INSERT INTO dbo.ZAPP_DBSiteCD_Config (Chave, Valor)
SELECT 'PontosPorEuro', '1'
WHERE NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave = 'PontosPorEuro');
GO
INSERT INTO dbo.ZAPP_DBSiteCD_Config (Chave, Valor)
SELECT 'PontosParaVale', '100'
WHERE NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave = 'PontosParaVale');
GO
INSERT INTO dbo.ZAPP_DBSiteCD_Config (Chave, Valor)
SELECT 'ValorVale', '5.00'
WHERE NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Config WHERE Chave = 'ValorVale');
GO

PRINT 'Migração 012: contas com password, pontos, vales e portes de envio.';
GO
