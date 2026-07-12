-- Métodos de pagamento configuráveis no Backoffice (activar/desactivar,
-- editar designação/detalhe) em vez de codificados no frontend. Ordem
-- controla a posição no checkout (Transferência Bancária primeiro, a
-- pedido do utilizador).
IF OBJECT_ID('dbo.ZAPP_DBSiteCD_MetodosPagamento', 'U') IS NULL
CREATE TABLE dbo.ZAPP_DBSiteCD_MetodosPagamento (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    Codigo       VARCHAR(30)    NOT NULL,
    Designacao   NVARCHAR(100)  NOT NULL,
    Detalhe      NVARCHAR(400)  NULL,
    Activo       BIT            NOT NULL DEFAULT 1,
    Ordem        INT            NOT NULL DEFAULT 0,
    CONSTRAINT UQ_ZAPP_DBSiteCD_MetodosPagamento_Codigo UNIQUE (Codigo)
);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_MetodosPagamento)
INSERT INTO dbo.ZAPP_DBSiteCD_MetodosPagamento (Codigo, Designacao, Detalhe, Activo, Ordem) VALUES
('Transferencia', 'Transferência Bancária', 'IBAN: PT50 5180 0005 0000 0505 7346 8 — Caixa de Crédito de Leiria', 1, 1),
('MBWayTelemovel', 'MBWAY Telemóvel', 'Enviar pagamento para o número 91 224 22 73 — CLÁSSICO DESPORTIVO, LDA', 1, 2),
('Dinheiro', 'A Dinheiro', 'Pago na entrega/levantamento', 1, 3),
('MBWAY', 'MB WAY', 'Recebe uma notificação no telemóvel para confirmar o pagamento', 1, 4);
GO
