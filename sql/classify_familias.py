#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Classifica a exportacao de TB0001StkFamilias em Categoria/Modalidade/Genero
e gera o SQL de carga para ZAPP_DBSiteCD_Familias/SubFamilias1-3.
Ver PLANO_PROJETO.md seccao 2.1.1/2.1.2.
"""
import csv
import re
import unicodedata

SRC = r"C:\Users\ruifarias\Claude\SiteCD\dados\TB0001StkFamilias_export_live_h.tsv"  # exportação directa da view ZAPP_DBSiteCD_VFamilias (2026-07-02), mais completa que o ficheiro estático original (GEN excluído - seccao 2.1.1)
OUT_SQL = r"C:\Users\ruifarias\Claude\SiteCD\sql\003_load_familias.sql"
OUT_REPORT = r"C:\Users\ruifarias\Claude\SiteCD\dados\familias_classificacao_report.tsv"

CATEGORIAS = {
    '1': 'Calcado',
    '3': 'Textil',
    '5': 'Electronica',
    '6': 'AcessoriosTextil',
    '7': 'Clubes',
    '8': 'AcessoriosDiversos',
    '9': 'Equipamentos',   # descoberta em 2026-07-02 ao comparar com a fonte viva - nao estava na exportacao original
}

MODALIDADES = [
    # Valores tal como gravados em ZAPP_DBSiteCD_Modalidades.Titulo (com acentos) -
    # 2026-07-02: corrigido bug em que a versao sem acentos nunca correspondia ao
    # valor real na BD, deixando Ginasio/Ginastica/Natacao/Tenis sempre por classificar.
    "Aeróbica", "Andebol", "Atletismo", "Badminton", "Ballet", "Basquetebol", "Ciclismo",
    "Futebol", "Futsal", "Ginásio", "Ginástica", "Lazer", "Moda", "Montanha",
    "Natação", "Passeio", "Ping-pong", "Skate", "Squash", "Surf", "Ténis",
    "Treino", "Walking", "Volley",
]

GENEROS_CALCADO = ["Homem", "Senhora", "Junior", "Bebe"]  # 'Bebe' confirmado nos dados reais, nao estava na lista original
GENEROS_TEXTIL = ["Homem", "Senhora", "Rapaz", "Rapariga", "Bebe"]
GENEROS_ALL = sorted(set(GENEROS_CALCADO + GENEROS_TEXTIL), key=len, reverse=True)


def strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def norm(s):
    s = strip_accents(s).upper()
    s = s.replace('-', ' ').replace('/', ' ')
    return s


MODALIDADES_NORM = {norm(m): m for m in MODALIDADES}
# tokens auxiliares que mapeiam para modalidades (variantes de escrita encontradas nos dados)
MODALIDADE_ALIASES = {
    'PING PONG': 'Ping-pong',
    'GINASIO': 'Ginásio',
    'DANCA': 'Ballet',       # aproximação: dança->ballet (a rever manualmente)
    'YOGA': 'Ginástica',     # aproximação (a rever manualmente)
    'PAVILHAO': 'Volley',    # aproximação (a rever manualmente)
    'PADEL': 'Ténis',
    'BIKE': 'Ciclismo',
    'BICICLETA': 'Ciclismo',
    'ANDAMENTO': 'Walking',
    'WALKING': 'Walking',
}

GENERO_NORM = {norm(g): g for g in GENEROS_ALL}
GENERO_ALIASES = {
    'ADULTO': None,   # não é genero especifico; so usado em Clubes (grau4), tratado como Homem por omissao? deixamos None -> por classificar
    'CRIANCA': 'Junior',
    'UNISEXO': None,
}


def find_modalidade(texto_norm):
    for token, modalidade in MODALIDADE_ALIASES.items():
        if token in texto_norm:
            return modalidade
    for tnorm, modalidade in MODALIDADES_NORM.items():
        if tnorm in texto_norm:
            return modalidade
    return None


def find_genero(texto_norm, categoria):
    if categoria == 'Calcado':
        lista = GENEROS_CALCADO
    elif categoria == 'Clubes':
        lista = GENEROS_ALL  # Clubes mistura terminologia (Adulto/Junior/Homem/Senhora) - usa a lista completa
    else:
        lista = GENEROS_TEXTIL
    lista_norm = {norm(g): g for g in lista}
    for tnorm, genero in lista_norm.items():
        if re.search(r'\b' + tnorm + r'\b', texto_norm):
            return genero
    for token, genero in GENERO_ALIASES.items():
        if genero and re.search(r'\b' + token + r'\b', texto_norm):
            return genero
    return None


def grau_of(codigo):
    return len(codigo)


def parent_of(codigo):
    return codigo[:-1] if len(codigo) > 1 else None


def sql_escape(s):
    return s.replace("'", "''") if s else s


def main():
    rows = []
    with open(SRC, encoding='utf-8-sig') as f:
        reader = csv.reader(f, delimiter='\t')
        header = next(reader)
        for r in reader:
            if not r or len(r) < 3:
                continue
            codigo, familia, grau = r[0].strip(), r[1].strip(), r[2].strip()
            rows.append((codigo, familia, int(grau)))

    by_grau = {1: [], 2: [], 3: [], 4: []}
    for codigo, familia, grau in rows:
        by_grau[grau].append((codigo, familia))

    # mapa codigo -> categoria (grau1)
    categoria_of = {}
    for codigo, familia in by_grau[1]:
        categoria_of[codigo] = CATEGORIAS.get(codigo, 'Desconhecida')

    def categoria_for(codigo):
        raiz = codigo[0]
        return CATEGORIAS.get(raiz, 'Desconhecida')

    report_rows = []
    sql_lines = []
    sql_lines.append("USE DBSiteCD;")
    sql_lines.append("GO")
    sql_lines.append("")
    sql_lines.append("-- Gerado automaticamente por classify_familias.py (seccao 2.1.1/2.1.2)")
    sql_lines.append("-- Classificacao semi-automatica de Categoria/Modalidade/Genero - REVER manualmente as linhas marcadas como NULL")
    sql_lines.append("")

    # --- Grau 1: Familias ---
    sql_lines.append("-- Grau 1: Categorias")
    for codigo, familia in sorted(by_grau[1], key=lambda x: x[0]):
        sql_lines.append(
            f"UPDATE dbo.ZAPP_DBSiteCD_Familias SET Familia = N'{sql_escape(familia)}' "
            f"WHERE Codigo_Familia = '{sql_escape(codigo)}' AND Familia <> N'{sql_escape(familia)}';"
        )
        sql_lines.append(
            f"INSERT INTO dbo.ZAPP_DBSiteCD_Familias (Codigo_Familia, Familia) "
            f"SELECT '{sql_escape(codigo)}', N'{sql_escape(familia)}' "
            f"WHERE NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Familias WHERE Codigo_Familia = '{sql_escape(codigo)}');"
        )
    sql_lines.append("GO")
    sql_lines.append("")

    # --- Grau 2: SubFamilias1 ---
    sql_lines.append("-- Grau 2: Agrupadores de Modalidade")
    for codigo, familia in sorted(by_grau[2], key=lambda x: x[0]):
        pai = parent_of(codigo)
        sql_lines.append(
            f"UPDATE dbo.ZAPP_DBSiteCD_SubFamilias1 SET Familia = N'{sql_escape(familia)}' "
            f"WHERE Codigo_Familia = '{sql_escape(codigo)}' AND Familia <> N'{sql_escape(familia)}';"
        )
        sql_lines.append(
            f"INSERT INTO dbo.ZAPP_DBSiteCD_SubFamilias1 (Codigo_Familia, Codigo_Familia_Pai, Familia) "
            f"SELECT '{sql_escape(codigo)}', '{sql_escape(pai)}', N'{sql_escape(familia)}' "
            f"WHERE NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_SubFamilias1 WHERE Codigo_Familia = '{sql_escape(codigo)}');"
        )
    sql_lines.append("GO")
    sql_lines.append("")

    # --- Grau 3: SubFamilias2 (Modalidade + Genero, exceto Clubes) ---
    sql_lines.append("-- Grau 3: Modalidade + Genero")
    grau3_count = 0
    grau3_sem_modalidade = 0
    grau3_sem_genero = 0
    for codigo, familia in sorted(by_grau[3], key=lambda x: x[0]):
        pai = parent_of(codigo)
        categoria = categoria_for(codigo)
        texto_norm = norm(familia)
        modalidade = find_modalidade(texto_norm)
        genero = find_genero(texto_norm, categoria) if categoria in ('Calcado', 'Textil') else None
        grau3_count += 1
        if not modalidade:
            grau3_sem_modalidade += 1
        if not genero and categoria in ('Calcado', 'Textil'):
            grau3_sem_genero += 1
        mod_sql = f"(SELECT Id FROM dbo.ZAPP_DBSiteCD_Modalidades WHERE Titulo = N'{modalidade}')" if modalidade else "NULL"
        gen_sql = f"(SELECT Id FROM dbo.ZAPP_DBSiteCD_Generos WHERE Titulo = N'{genero}' AND Categoria = '{categoria}')" if genero else "NULL"
        sql_lines.append(
            f"UPDATE dbo.ZAPP_DBSiteCD_SubFamilias2 SET Familia = N'{sql_escape(familia)}', "
            f"Modalidade_Id = COALESCE(Modalidade_Id, {mod_sql}), Genero_Id = COALESCE(Genero_Id, {gen_sql}) "
            f"WHERE Codigo_Familia = '{sql_escape(codigo)}' AND ("
            f"Familia <> N'{sql_escape(familia)}' "
            f"OR (Modalidade_Id IS NULL AND {mod_sql} IS NOT NULL) "
            f"OR (Genero_Id IS NULL AND {gen_sql} IS NOT NULL));"
        )
        sql_lines.append(
            f"INSERT INTO dbo.ZAPP_DBSiteCD_SubFamilias2 (Codigo_Familia, Codigo_Familia_Pai, Familia, Modalidade_Id, Genero_Id) "
            f"SELECT '{sql_escape(codigo)}', '{sql_escape(pai)}', N'{sql_escape(familia)}', {mod_sql}, {gen_sql} "
            f"WHERE NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_SubFamilias2 WHERE Codigo_Familia = '{sql_escape(codigo)}');"
        )
        report_rows.append((codigo, familia, 3, categoria, modalidade or '', genero or ''))
    sql_lines.append("GO")
    sql_lines.append("")

    # --- Grau 4: SubFamilias3 (herda Modalidade/Genero do pai Grau3; Clubes resolve genero aqui) ---
    sql_lines.append("-- Grau 4: Especificacoes (herda Modalidade/Genero do Grau 3; Clubes resolve Genero aqui)")
    grau4_count = 0
    grau4_sem_modalidade = 0
    grau4_sem_genero = 0
    for codigo, familia in sorted(by_grau[4], key=lambda x: x[0]):
        pai = parent_of(codigo)
        categoria = categoria_for(codigo)
        texto_norm = norm(familia)
        # Para Clubes, o genero so aparece no Grau 4 (secção 2.1.1) - tenta achar aqui (lista Textil, é o mais comum em Clubes)
        genero_local = find_genero(texto_norm, 'Clubes') if categoria == 'Clubes' else None
        modalidade_local = find_modalidade(texto_norm) if categoria not in ('Calcado', 'Textil') else None
        grau4_count += 1
        if categoria == 'Clubes' and not genero_local:
            grau4_sem_genero += 1
        if categoria in ('Electronica', 'AcessoriosTextil', 'AcessoriosDiversos') and not modalidade_local:
            grau4_sem_modalidade += 1
        mod_sql = f"(SELECT Id FROM dbo.ZAPP_DBSiteCD_Modalidades WHERE Titulo = N'{modalidade_local}')" if modalidade_local else "NULL"
        gen_sql = f"(SELECT Id FROM dbo.ZAPP_DBSiteCD_Generos WHERE Titulo = N'{genero_local}' AND Categoria = 'Textil')" if genero_local else "NULL"
        sql_lines.append(
            f"UPDATE dbo.ZAPP_DBSiteCD_SubFamilias3 SET Familia = N'{sql_escape(familia)}', "
            f"Modalidade_Id = COALESCE(Modalidade_Id, {mod_sql}), Genero_Id = COALESCE(Genero_Id, {gen_sql}) "
            f"WHERE Codigo_Familia = '{sql_escape(codigo)}' AND ("
            f"Familia <> N'{sql_escape(familia)}' "
            f"OR (Modalidade_Id IS NULL AND {mod_sql} IS NOT NULL) "
            f"OR (Genero_Id IS NULL AND {gen_sql} IS NOT NULL));"
        )
        sql_lines.append(
            f"INSERT INTO dbo.ZAPP_DBSiteCD_SubFamilias3 (Codigo_Familia, Codigo_Familia_Pai, Familia, Modalidade_Id, Genero_Id) "
            f"SELECT '{sql_escape(codigo)}', '{sql_escape(pai)}', N'{sql_escape(familia)}', {mod_sql}, {gen_sql} "
            f"WHERE NOT EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_SubFamilias3 WHERE Codigo_Familia = '{sql_escape(codigo)}');"
        )
        report_rows.append((codigo, familia, 4, categoria, modalidade_local or '', genero_local or ''))
    sql_lines.append("GO")
    sql_lines.append("")
    sql_lines.append("PRINT 'Familias carregadas.';")
    sql_lines.append("GO")

    with open(OUT_SQL, 'w', encoding='utf-8-sig') as f:
        f.write('\n'.join(sql_lines))

    with open(OUT_REPORT, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, delimiter='\t')
        w.writerow(['Codigo_Familia', 'Familia', 'Grau', 'Categoria', 'Modalidade', 'Genero'])
        for row in report_rows:
            w.writerow(row)

    print(f"Grau1: {len(by_grau[1])}  Grau2: {len(by_grau[2])}  Grau3: {len(by_grau[3])}  Grau4: {len(by_grau[4])}")
    print(f"Grau3 total={grau3_count} sem_modalidade={grau3_sem_modalidade} sem_genero={grau3_sem_genero}")
    print(f"Grau4 total={grau4_count} (Clubes sem_genero={grau4_sem_genero}, outras cat. sem_modalidade={grau4_sem_modalidade})")
    print(f"SQL gerado em: {OUT_SQL}")
    print(f"Relatorio em: {OUT_REPORT}")


if __name__ == '__main__':
    main()
