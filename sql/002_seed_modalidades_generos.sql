-- =============================================================================
-- Seed inicial: Modalidades e Generos
-- Ver PLANO_PROJETO.md seccao 2.1.1/2.1.2
-- Titulo/Tag das 20 primeiras Modalidades confirmados por print do Backoffice
-- actual (2026-07-02); as ultimas ~5 (pagina 2, nao vista) foram completadas
-- com base na lista de texto fornecida - A CONFIRMAR/REVER com o Backoffice
-- real ou com a exportacao completa da tabela de Modalidades do site actual.
-- Genero 'Bebe' acrescentado tambem a Calcado (nao estava na lista original
-- fornecida) apos deteccao de familias reais tipo "SANDALIAS BEBE" no Calcado.
-- =============================================================================

USE DBSiteCD;
GO

;WITH Seed AS (
    SELECT * FROM (VALUES
        (N'Aeróbica',    'aerobica',   1),
        (N'Andebol',     'andebol',    2),
        (N'Atletismo',   'atletismo',  3),
        (N'Badminton',   'badminton',  4),
        (N'Ballet',      'ballet',     5),
        (N'Basquetebol', 'basquetebol',6),
        (N'Ciclismo',    'ciclismo',   7),
        (N'Futebol',     'futebol',    8),
        (N'Futsal',      'futsal',     9),
        (N'Ginásio',     'gym',        10),
        (N'Ginástica',   'ginastica',  11),
        (N'Lazer',       'lazer',      12),
        (N'Moda',        'moda',       13),
        (N'Montanha',    'montanha',   14),
        (N'Natação',     'piscina',    15),
        (N'Passeio',     'passeio',    16),
        (N'Ping-pong',   'ping-pong',  17),
        (N'Skate',       'skate',      18),
        (N'Squash',      'squash',     19),
        (N'Surf',        'surf',       20),
        -- Página 2 do Backoffice não vista - completado a partir da lista de texto original, A REVER:
        (N'Ténis',       'tenis',      21),
        (N'Treino',      'treino',     22),
        (N'Volley',      'volley',     23),
        (N'Walking',     'walking',    24)
    ) AS v(Titulo, Tag, Ordem)
)
INSERT INTO dbo.ZAPP_DBSiteCD_Modalidades (Titulo, Tag, Ordem, Situacao)
SELECT s.Titulo, s.Tag, s.Ordem, 1
FROM Seed s
WHERE NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Modalidades m WHERE m.Titulo = s.Titulo);
GO

;WITH SeedG AS (
    SELECT * FROM (VALUES
        (N'Homem',    'homem',    'Calcado', 1),
        (N'Senhora',  'senhora',  'Calcado', 2),
        (N'Junior',   'junior',   'Calcado', 3),
        (N'Bebe',     'bebe',     'Calcado', 4),
        (N'Homem',    'homem',    'Textil',  1),
        (N'Senhora',  'senhora',  'Textil',  2),
        (N'Rapaz',    'rapaz',    'Textil',  3),
        (N'Rapariga', 'rapariga', 'Textil',  4),
        (N'Bebe',     'bebe',     'Textil',  5),
        (N'Junior',   'junior',   'Textil',  6)  -- também usado para resolver Género em Clubes (Grau4, secção 2.1.1), que não tem bucket próprio
    ) AS v(Titulo, Tag, Categoria, Ordem)
)
INSERT INTO dbo.ZAPP_DBSiteCD_Generos (Titulo, Tag, Categoria, Ordem, Situacao)
SELECT s.Titulo, s.Tag, s.Categoria, s.Ordem, 1
FROM SeedG s
WHERE NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Generos g WHERE g.Titulo = s.Titulo AND g.Categoria = s.Categoria);
GO

PRINT 'Modalidades e Generos semeados.';
GO
