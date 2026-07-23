-- Confirmação de email no registo de clientes (segurança - garante que o
-- email indicado é real e pertence ao próprio cliente). Ver routes/auth.js
-- (POST /registo, /confirmar-email, /reenviar-confirmacao).
-- Contas já existentes (com password definida antes desta funcionalidade)
-- ficam automaticamente confirmadas - não interrompe clientes já activos.
USE DBSiteCD;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('dbo.ZAPP_DBSiteCD_Clientes', 'Email_Confirmado') IS NULL
ALTER TABLE dbo.ZAPP_DBSiteCD_Clientes ADD Email_Confirmado BIT NOT NULL DEFAULT 0;
GO
IF COL_LENGTH('dbo.ZAPP_DBSiteCD_Clientes', 'Confirmacao_Token') IS NULL
ALTER TABLE dbo.ZAPP_DBSiteCD_Clientes ADD Confirmacao_Token VARCHAR(64) NULL;
GO
IF COL_LENGTH('dbo.ZAPP_DBSiteCD_Clientes', 'Confirmacao_Token_Expira') IS NULL
ALTER TABLE dbo.ZAPP_DBSiteCD_Clientes ADD Confirmacao_Token_Expira DATETIME NULL;
GO

UPDATE dbo.ZAPP_DBSiteCD_Clientes SET Email_Confirmado = 1 WHERE Password_Hash IS NOT NULL AND Email_Confirmado = 0;
GO

PRINT 'Migração 033: Email_Confirmado/Confirmacao_Token/Confirmacao_Token_Expira em Clientes; contas existentes marcadas como confirmadas.';
GO
