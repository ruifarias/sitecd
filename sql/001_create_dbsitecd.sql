-- =============================================================================
-- DBSiteCD - Base de dados dedicada ao site classicodesportivo (novo)
-- Instância: TSERVER\SQLSERVER (mesma instância da DBClassico, base separada)
-- Nunca escreve na DBClassico nem em objectos do ERP Gexor / Sincronizador WEBSW_*
-- Ver PLANO_PROJETO.md secção 2.2
-- =============================================================================

IF DB_ID('DBSiteCD') IS NULL
BEGIN
    CREATE DATABASE DBSiteCD;
END
GO

USE DBSiteCD;
GO

-- =============================================================================
-- Configuração: Modalidades, Géneros, Marcas
-- =============================================================================

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_Modalidades', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_Modalidades (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    Titulo          NVARCHAR(50)    NOT NULL,
    Tag             NVARCHAR(50)    NOT NULL,
    Ordem           INT             NOT NULL DEFAULT 0,
    Situacao        BIT             NOT NULL DEFAULT 1,   -- 1 = Visível, 0 = Escondido
    Data_Criacao    DATETIME        NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UQ_ZAPP_DBSiteCD_Modalidades_Tag UNIQUE (Tag)
);
GO

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_Generos', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_Generos (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    Titulo          NVARCHAR(50)    NOT NULL,
    Tag             NVARCHAR(50)    NOT NULL,
    Categoria       VARCHAR(10)     NOT NULL,   -- 'Calcado' ou 'Textil' (listas de género diferentes - secção 2.1)
    Ordem           INT             NOT NULL DEFAULT 0,
    Situacao        BIT             NOT NULL DEFAULT 1,
    Data_Criacao    DATETIME        NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UQ_ZAPP_DBSiteCD_Generos_Tag_Categoria UNIQUE (Tag, Categoria)
);
GO

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_Marcas', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_Marcas (
    Codigo_Marca        VARCHAR(3)      NOT NULL PRIMARY KEY,   -- espelha TB0001StkMarcas.Codigo_Marca
    Marca                NVARCHAR(50)   NOT NULL,
    Tag                  NVARCHAR(50)   NULL,
    Ordem                INT            NOT NULL DEFAULT 0,
    Situacao             BIT            NOT NULL DEFAULT 1,
    Data_Hora_Origem     DATETIME       NULL,       -- TB0001StkMarcas.Data_Hora
    Data_Sincronizacao   DATETIME       NOT NULL DEFAULT GETDATE()
);
GO

-- =============================================================================
-- Famílias (4 Graus) - espelha TB0001StkFamilias, secção 2.1.1/2.1.2
-- =============================================================================

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_Familias', 'U') IS NULL       -- Grau 1: Categoria
CREATE TABLE dbo.ZAPP_DBSiteCD_Familias (
    Codigo_Familia       VARCHAR(10)    NOT NULL PRIMARY KEY,
    Familia              NVARCHAR(63)   NOT NULL,
    Situacao             BIT            NOT NULL DEFAULT 1,
    Data_Hora_Origem     DATETIME       NULL,
    Data_Sincronizacao   DATETIME       NOT NULL DEFAULT GETDATE()
);
GO

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_SubFamilias1', 'U') IS NULL   -- Grau 2: Agrupador de Modalidade
CREATE TABLE dbo.ZAPP_DBSiteCD_SubFamilias1 (
    Codigo_Familia       VARCHAR(10)    NOT NULL PRIMARY KEY,
    Codigo_Familia_Pai   VARCHAR(10)    NOT NULL REFERENCES dbo.ZAPP_DBSiteCD_Familias(Codigo_Familia),
    Familia              NVARCHAR(63)   NOT NULL,
    Situacao             BIT            NOT NULL DEFAULT 1,
    Data_Hora_Origem     DATETIME       NULL,
    Data_Sincronizacao   DATETIME       NOT NULL DEFAULT GETDATE()
);
GO

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_SubFamilias2', 'U') IS NULL   -- Grau 3: Modalidade + Género (normalmente)
CREATE TABLE dbo.ZAPP_DBSiteCD_SubFamilias2 (
    Codigo_Familia       VARCHAR(10)    NOT NULL PRIMARY KEY,
    Codigo_Familia_Pai   VARCHAR(10)    NOT NULL REFERENCES dbo.ZAPP_DBSiteCD_SubFamilias1(Codigo_Familia),
    Familia              NVARCHAR(63)   NOT NULL,
    Modalidade_Id        INT            NULL REFERENCES dbo.ZAPP_DBSiteCD_Modalidades(Id),
    Genero_Id            INT            NULL REFERENCES dbo.ZAPP_DBSiteCD_Generos(Id),
    Situacao             BIT            NOT NULL DEFAULT 1,
    Data_Hora_Origem     DATETIME       NULL,
    Data_Sincronizacao   DATETIME       NOT NULL DEFAULT GETDATE()
);
GO

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_SubFamilias3', 'U') IS NULL   -- Grau 4: Especificação (Codigo_Familia do Artigo aponta sempre aqui)
CREATE TABLE dbo.ZAPP_DBSiteCD_SubFamilias3 (
    Codigo_Familia       VARCHAR(10)    NOT NULL PRIMARY KEY,
    Codigo_Familia_Pai   VARCHAR(10)    NOT NULL REFERENCES dbo.ZAPP_DBSiteCD_SubFamilias2(Codigo_Familia),
    Familia              NVARCHAR(63)   NOT NULL,
    Modalidade_Id        INT            NULL REFERENCES dbo.ZAPP_DBSiteCD_Modalidades(Id),  -- override, normalmente herdado do Grau 3
    Genero_Id            INT            NULL REFERENCES dbo.ZAPP_DBSiteCD_Generos(Id),      -- p.ex. categoria "Clubes": género só aparece aqui (secção 2.1.1)
    Situacao             BIT            NOT NULL DEFAULT 1,
    Data_Hora_Origem     DATETIME       NULL,
    Data_Sincronizacao   DATETIME       NOT NULL DEFAULT GETDATE()
);
GO

-- =============================================================================
-- Modelos
-- =============================================================================

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_Modelos', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_Modelos (
    Codigo_Modelo        VARCHAR(10)    NOT NULL,
    Codigo_Marca         VARCHAR(3)     NOT NULL REFERENCES dbo.ZAPP_DBSiteCD_Marcas(Codigo_Marca),
    Modelo                NVARCHAR(50)  NOT NULL,
    Data_Hora_Origem      DATETIME      NULL,
    Data_Sincronizacao    DATETIME      NOT NULL DEFAULT GETDATE(),
    PRIMARY KEY (Codigo_Modelo, Codigo_Marca)
);
GO

-- =============================================================================
-- Artigos (Codigo_Familia aponta sempre para o Grau 4 - secção 2.1.1)
-- =============================================================================

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_Artigos', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_Artigos (
    Codigo_Artigo         VARCHAR(20)     NOT NULL PRIMARY KEY,
    Descritivo_Artigo     NVARCHAR(100)   NOT NULL,
    Tipo_Artigo           CHAR(1)         NOT NULL,      -- 'I' = Internet (secção 2.1)
    Codigo_Marca          VARCHAR(3)      NULL REFERENCES dbo.ZAPP_DBSiteCD_Marcas(Codigo_Marca),
    Codigo_Modelo         VARCHAR(10)     NULL,
    Codigo_Familia        VARCHAR(10)     NULL REFERENCES dbo.ZAPP_DBSiteCD_SubFamilias3(Codigo_Familia),
    Peso                  REAL            NULL,
    Taxa_IVA_Incluido     DECIMAL(5,2)    NULL,
    Descricao_Longa       NVARCHAR(MAX)   NULL,          -- TB0001StkInfoCompArm.Texto_Info_Compl (secção 2.1)
    Data_Ult_Compra       DATE            NULL,           -- TB0001StkArmazArt.Data_Ult_Compra -> critério de Novidade
    Data_Hora_Origem      DATETIME        NULL,           -- max(Data_Hora Artigo, Preco, AcumulQtd) - secção 2.1.3
    Slug                  NVARCHAR(150)   NULL,
    Publicado             BIT             NOT NULL DEFAULT 0,   -- 0 quando Tipo_Artigo deixa de ser 'I' (ArtigosSetNotInternet)
    Eliminado_Na_Origem   BIT             NOT NULL DEFAULT 0,   -- 1 quando apagado na DBClassico (ArtigosDeleted) - nunca DELETE físico
    Novidade_Manual       BIT             NULL,           -- override manual em Backoffice
    Meta_Titulo           NVARCHAR(150)   NULL,
    Meta_Descricao        NVARCHAR(300)   NULL,
    Data_Sincronizacao    DATETIME        NOT NULL DEFAULT GETDATE()
);
GO
-- indice unico filtrado (nao constraint simples) porque UNIQUE CONSTRAINT no SQL Server
-- so permite 1 NULL; Slug fica NULL ate ser gerado, por isso precisa de filtro.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_ZAPP_DBSiteCD_Artigos_Slug')
BEGIN
    SET QUOTED_IDENTIFIER ON;
    CREATE UNIQUE INDEX UX_ZAPP_DBSiteCD_Artigos_Slug ON dbo.ZAPP_DBSiteCD_Artigos(Slug) WHERE Slug IS NOT NULL;
END
GO

-- =============================================================================
-- Variantes (Lotes = Cor+Tamanho, texto livre - secção 2.1)
-- =============================================================================

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_Variantes', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_Variantes (
    Codigo_Artigo         VARCHAR(20)     NOT NULL REFERENCES dbo.ZAPP_DBSiteCD_Artigos(Codigo_Artigo),
    Codigo_Lote           VARCHAR(50)     NOT NULL,
    Descricao_Lote        NVARCHAR(100)   NOT NULL,     -- texto livre, sem parsing (secção 2.1)
    Ean                   VARCHAR(20)     NULL,
    Ativo                 BIT             NOT NULL DEFAULT 1,
    Data_Hora_Origem      DATETIME        NULL,
    Data_Sincronizacao    DATETIME        NOT NULL DEFAULT GETDATE(),
    PRIMARY KEY (Codigo_Artigo, Codigo_Lote)
);
GO

-- =============================================================================
-- Stock por lote/armazém (armazém sempre '001' - secção 2.1)
-- =============================================================================

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_Stock', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_Stock (
    Codigo_Artigo         VARCHAR(20)     NOT NULL,
    Codigo_Lote           VARCHAR(50)     NOT NULL,
    Codigo_Armazem        CHAR(3)         NOT NULL DEFAULT '001',
    Qtd_Disponivel        INT             NOT NULL DEFAULT 0,
    Qtd_Reservada         INT             NOT NULL DEFAULT 0,
    Data_Hora_Origem      DATETIME        NULL,
    Data_Sincronizacao    DATETIME        NOT NULL DEFAULT GETDATE(),
    PRIMARY KEY (Codigo_Artigo, Codigo_Lote, Codigo_Armazem),
    FOREIGN KEY (Codigo_Artigo, Codigo_Lote) REFERENCES dbo.ZAPP_DBSiteCD_Variantes(Codigo_Artigo, Codigo_Lote)
);
GO

-- =============================================================================
-- Preços (Tipo_Preco='PV1', Codigo_Moeda='001', Codigo_Unidade='UN' - secção 2.1.3)
-- =============================================================================

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_Precos', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_Precos (
    Codigo_Artigo          VARCHAR(20)    NOT NULL PRIMARY KEY REFERENCES dbo.ZAPP_DBSiteCD_Artigos(Codigo_Artigo),
    Preco                  MONEY          NOT NULL,          -- IVA incluído
    Codigo_Desconto_Art    VARCHAR(2)     NULL,
    Percentagem_Desconto   DECIMAL(5,2)   NULL,               -- derivada do Codigo_Desconto_Art (secção 2.1)
    Preco_Outlet           MONEY          NULL,
    Data_Alter_Preco_Origem DATETIME      NULL,
    Data_Sincronizacao     DATETIME       NOT NULL DEFAULT GETDATE()
);
GO

-- =============================================================================
-- Imagens (apagadas quando o artigo é despublicado/apagado - secção 2.7)
-- =============================================================================

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_Imagens', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_Imagens (
    Id                     INT IDENTITY(1,1) PRIMARY KEY,
    Codigo_Artigo          VARCHAR(20)    NOT NULL REFERENCES dbo.ZAPP_DBSiteCD_Artigos(Codigo_Artigo),
    Ordem                  TINYINT        NOT NULL DEFAULT 0,
    Path                   NVARCHAR(300)  NOT NULL,
    Data_Sincronizacao     DATETIME       NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UQ_ZAPP_DBSiteCD_Imagens_Artigo_Ordem UNIQUE (Codigo_Artigo, Ordem)
);
GO

-- =============================================================================
-- Log de sincronização (secção 2.6 - mesmas 7 categorias do Sincronizador actual)
-- =============================================================================

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_SyncLog', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_SyncLog (
    Id                      INT IDENTITY(1,1) PRIMARY KEY,
    Data_Hora               DATETIME       NOT NULL DEFAULT GETDATE(),
    Tipo                     VARCHAR(30)   NOT NULL,   -- Marcas, Familias, Artigos, ArtigosLotes, ArtigosSetNotInternet, ArtigosDeleted, Imagens
    Sucesso                  BIT           NOT NULL,
    Registos_Processados     INT           NOT NULL DEFAULT 0,
    Mensagem                 NVARCHAR(500) NULL
);
GO

-- =============================================================================
-- Tabelas de negócio do site (não vêm da DBClassico - secção 2.2)
-- =============================================================================

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_Clientes', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_Clientes (
    Id                  INT IDENTITY(1,1) PRIMARY KEY,
    Nome                NVARCHAR(150)  NOT NULL,
    Email               NVARCHAR(150)  NOT NULL,
    Telefone            NVARCHAR(30)   NULL,
    NIF                 VARCHAR(20)    NULL,
    Password_Hash       NVARCHAR(255)  NULL,
    Data_Criacao        DATETIME       NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UQ_ZAPP_DBSiteCD_Clientes_Email UNIQUE (Email)
);
GO

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_Moradas', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_Moradas (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    Cliente_Id      INT             NOT NULL REFERENCES dbo.ZAPP_DBSiteCD_Clientes(Id),
    Tipo            VARCHAR(20)     NOT NULL DEFAULT 'Entrega',  -- Entrega / Facturacao
    Morada          NVARCHAR(200)   NOT NULL,
    Localidade      NVARCHAR(100)   NOT NULL,
    Codigo_Postal   VARCHAR(10)     NOT NULL,
    Pais            NVARCHAR(60)    NOT NULL DEFAULT 'Portugal'
);
GO

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_Encomendas', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_Encomendas (
    Id                   INT IDENTITY(1,1) PRIMARY KEY,
    Numero               VARCHAR(30)    NOT NULL,
    Cliente_Id           INT            NULL REFERENCES dbo.ZAPP_DBSiteCD_Clientes(Id),
    Estado               VARCHAR(30)    NOT NULL DEFAULT 'Pendente',
    Total                MONEY          NOT NULL,
    Metodo_Pagamento     VARCHAR(30)    NULL,          -- MBWAY / Cartao / PayPal
    Data_Criacao         DATETIME       NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UQ_ZAPP_DBSiteCD_Encomendas_Numero UNIQUE (Numero)
);
GO

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_EncomendasLinhas', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_EncomendasLinhas (
    Id                 INT IDENTITY(1,1) PRIMARY KEY,
    Encomenda_Id       INT             NOT NULL REFERENCES dbo.ZAPP_DBSiteCD_Encomendas(Id),
    Codigo_Artigo      VARCHAR(20)     NOT NULL,      -- sem FK para Artigos: mantém histórico mesmo que o artigo seja despublicado/apagado
    Codigo_Lote        VARCHAR(50)     NOT NULL,
    Descricao          NVARCHAR(200)   NOT NULL,
    Quantidade         INT             NOT NULL,
    Preco_Unitario     MONEY           NOT NULL
);
GO

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_Pagamentos', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_Pagamentos (
    Id                     INT IDENTITY(1,1) PRIMARY KEY,
    Encomenda_Id           INT             NOT NULL REFERENCES dbo.ZAPP_DBSiteCD_Encomendas(Id),
    Metodo                 VARCHAR(30)     NOT NULL,   -- MBWAY / Cartao / PayPal / Dinheiro
    Estado                 VARCHAR(60)     NOT NULL DEFAULT 'Pendente',
    Referencia_Externa     NVARCHAR(100)   NULL,       -- id da transacção no Ifthenpay/Stripe/PayPal
    Data_Hora              DATETIME        NOT NULL DEFAULT GETDATE()
);
GO

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_Carrinho', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_Carrinho (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    Sessao_Id       NVARCHAR(100)   NOT NULL,
    Codigo_Artigo   VARCHAR(20)     NOT NULL,
    Codigo_Lote     VARCHAR(50)     NOT NULL,
    Quantidade      INT             NOT NULL,
    Data_Criacao    DATETIME        NOT NULL DEFAULT GETDATE()
);
GO

IF OBJECT_ID('dbo.ZAPP_DBSiteCD_UtilizadoresBackoffice', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_UtilizadoresBackoffice (
    Id                 INT IDENTITY(1,1) PRIMARY KEY,
    Nome               NVARCHAR(100)   NOT NULL,
    Email              NVARCHAR(150)   NOT NULL,
    Password_Hash      NVARCHAR(255)   NOT NULL,
    Ativo              BIT             NOT NULL DEFAULT 1,
    CONSTRAINT UQ_ZAPP_DBSiteCD_UtilizadoresBackoffice_Email UNIQUE (Email)
);
GO

PRINT 'DBSiteCD - schema inicial criado com sucesso.';
GO
