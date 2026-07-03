# Site CD — Loja Online de Artigos de Desporto
## Plano de Necessidades, Plano de Execução e Apresentação do Projecto

Data: 2026-07-01

---

## 1. Visão Geral

Criação de uma loja online (e-commerce) de artigos de desporto (Calçado, Vestuário, Acessórios), com:

- Catálogo de artigos, imagens, preços e stocks sincronizados a partir da base de dados de gestão **DBClassico** (SQL Server, empresa **TB0001**).
- Carrinho de compras e encomendas online.
- Pagamento via **MB WAY**, **Cartão de Crédito** e **PayPal** (ou equivalente de baixo custo).
- Fase 1: instalação local em **CDSERVER** para testes internos.
- Fase 2: publicação online com domínio próprio, de baixo custo e fácil manutenção.

O ponto crítico do projecto **não é o layout**, é a **fiabilidade da sincronização de artigos, preços e stock por lote (cor/tamanho)** entre a DBClassico (dados de gestão) e a base de dados do site (dados públicos, otimizados para pesquisa e apresentação).

---

## 2. Plano de Necessidades

### 2.1 Dados de origem (DBClassico / TB0001)

| Tabela | Função | Uso no site |
|---|---|---|
| `TB0001StkArtigos` | Ficha de artigo | Nome, descrição, tipo, marca, modelo, grupo, família, imagem principal, IVA |
| `TB0001StkLotes` | Lotes (variantes: cor/tamanho) | Cada combinação cor/tamanho de um artigo |
| `TB0001StkLotesAcumul` | Stock acumulado por lote/armazém | Quantidade disponível por variante (base do "stock em tempo real") |
| `TB0001StkMarcas` | Marcas | Filtro "Marca" |
| `TB0001StkModelos` | Modelos | Filtro/atributo |
| `TB0001StkInfoCompArm` | Especificações técnicas do artigo | Filtrando `Codigo_Armazem = '001'`, `Tipo_Info_Compl = 'O'`, `Codigo_Info_Compl = 'Internet'` — `Texto_Info_Compl` fornece o texto de especificações técnicas de cada artigo, usado como `Descricao_Longa` na ficha de produto |
| `TB0001StkPrecosVenda` | Preços de venda | Preço a apresentar: `Tipo_Preco='PV1'` + `Codigo_Moeda='001'` + `Codigo_Unidade='UN'` (confirmado por SQL real, secção 2.1.3) |
| `TB0001StkFamilias` | Famílias/subfamílias (4 Graus) | Estrutura de navegação Categoria > Modalidade > Modalidade+Género > Especificação. Ver detalhe abaixo — **exportação completa recebida e guardada em [dados/TB0001StkFamilias_export.tsv](dados/TB0001StkFamilias_export.tsv)** |
| `TB0001StkArmazArt` | Localização física + `Data_Ult_Compra` | Localização não necessária no site público (uso interno logística); `Data_Ult_Compra` é usada como critério de "Novidade" |
| `TB0001StkAcumulQtd` | Acumulado de quantidades por Ano/Armazém/Artigo | **Descoberta em 2026-07-02** (secção 2.1.3) — usada só pela sua `Data_Hora`, como um dos sinais de "última alteração" de um artigo, a par de `TB0001StkArtigos` e `TB0001StkPrecosVenda` |

**Regras de negócio confirmadas (2026-07-02):**

| Ponto | Regra |
|---|---|
| Armazém | `Codigo_Armazem = '001'` — único armazém exposto no site |
| Preço público (PVP) | `TB0001StkPrecosVenda.Preco` onde `Tipo_Preco = 'PV1'` **(corrigido em 2026-07-02 a partir do SQL real da view actual — não é `'PVP1'` como assumido inicialmente)**, mais `Codigo_Moeda = '001'` e `Codigo_Unidade = 'UN'` (dois filtros adicionais descobertos no SQL real, que não estavam nos campos originalmente listados para `TB0001StkPrecosVenda` — ver secção 2.1.3), já com **IVA incluído (taxa 23%)**. O site apresenta sempre preços com IVA incluído — nunca fazer novo cálculo de IVA sobre este valor |
| Artigo publicável | `TB0001StkArtigos.Tipo_Artigo = 'I'` (Internet) — é o único critério de elegibilidade, não é preciso tabela extra de "artigos site" |
| Cor / Tamanho | Não vêm de `TB0001StkInfoCompArm`. Cada registo de `TB0001StkLotes` já representa uma combinação única de cor+tamanho, descrita em `Descricao_Lote`. **Não tem formato fixo** (ex.: `"PRETO - S"` ou `"FV2354 BRANCA/azul - 25"` — referência de cor do fornecedor + descrição da cor + tamanho, tudo variável). **Decisão: não se faz parsing/split do campo.** Cada lote é tratado como uma variante única e a pesquisa/selecção de variante é feita por **correspondência de texto livre dentro de `Descricao_Lote`**, não por facetas estruturadas de Cor e Tamanho separadas (ver impacto na secção 2.3) |
| Outlet | `TB0001StkPrecosVenda.Codigo_Desconto_Art` é um **código que representa directamente a percentagem de desconto** (ex.: `"05"` = 5%, `"20"` = 20%). Outlet = artigos cujo `Codigo_Desconto_Art` corresponde a uma percentagem `> 0` |
| Novidades | Baseado em `TB0001StkArmazArt.Data_Ult_Compra` (para `Codigo_Armazem = '001'`), últimos 180 dias (parametrizável) — reflete quando o artigo entrou em stock pela última vez, sinal mais fiável de "novidade" do que uma data de edição de ficha |
| Especificações técnicas | `TB0001StkInfoCompArm.Texto_Info_Compl`, filtrando `Codigo_Armazem = '001'`, `Tipo_Info_Compl = 'O'`, `Codigo_Info_Compl = 'Internet'` — é o texto de especificações técnicas por artigo a mostrar na ficha de produto |
| Género / Modalidade | **Actualizado (2026-07-02), com base na exportação completa de `TB0001StkFamilias`** — ver secção 2.1.1. Não são extraídos por regex genérico; são atribuídos a partir de uma tabela de referência construída manualmente a partir da estrutura real de Famílias |

> Todas as regras essenciais da View SQL (armazém, preço, elegibilidade, variantes, Outlet, Novidades, especificações técnicas, Género/Modalidade) estão agora definidas.

### 2.1.1 Estrutura de Famílias (hierarquia de 4 níveis) e derivação de Categoria/Modalidade/Género

`TB0001StkFamilias` tem uma hierarquia fixa de 4 graus, identificável pelo número de dígitos de `Codigo_Familia`. **Actualizado em 2026-07-02** com a contagem real confirmada via a View `ZAPP_DBSiteCD_VFamilias`: **1135 famílias** (7 + 51 + 237 + 840, excluindo a família `GEN`, secção 2.6 Fase 1 ponto 1) — mais do que a exportação estática inicial (~1000), que não incluía a categoria `9 = Equipamentos`.

| Grau | Dígitos | Significado | Exemplo |
|---|---|---|---|
| 1 | 1 | Categoria | `1`=Calçado, `3`=Têxtil, `5`=Electrónica, `6`=Acessórios Têxtil, `7`=Clubes, `8`=Acessórios Diversos, `9`=Equipamentos (**descontinuada — excluída do site, decisão confirmada em 2026-07-02, ver nota abaixo**) |
| 2 | 2 | Agrupador de Modalidade(s) — por vezes combina várias modalidades num único grupo (ex.: `12`="TÉNIS - PADEL - SKATE - BIKE") | `11`=Futebol-Futsal-Turf |
| 3 | 3 | Modalidade + Género (normalmente) | `111`=Sapatilhas Futebol Homem |
| 4 | 4 | Especificação/variante técnica dentro da Sub-Família (tipo de piso, tecido, corte, etc.) | `1111`=Chuteiras Futebol Homem Pelado HG |

> Existe ainda uma família à parte, `Codigo_Familia = 'GEN'` ("Generica", Grau 1, código não-numérico), usada historicamente para artigos muito antigos sem stock que não podiam ficar com família nula (confirmado pelo utilizador). **Não tem nenhum artigo publicado (`Tipo_Artigo='I'`) associado** — por isso é ignorada em toda a lógica de sincronização e classificação, sem necessidade de lhe atribuir um código de substituição.

> **Decisão confirmada (2026-07-02): a Categoria "Equipamentos" (Grau 1 = `9`) foi descontinuada e não será mostrada no site.** Os 30 dos 39 artigos "órfãos" (secção 4/Riscos) que apontavam para famílias de Grau 3 dentro desta categoria (sem correspondência em Grau 4) vão ser reclassificados manualmente pelo utilizador directamente na DBClassico para a família correcta — trabalho em curso. **Acção para a View/job de sincronização**: excluir explicitamente `Codigo_Familia` cuja raiz (Grau 1) seja `9`, tal como já estava previsto fazer-se com Clubes/Electrónica caso ficassem fora do âmbito (secção 4).

**Nota importante — a Categoria "Clubes" (Grau 1 = `7`) tem profundidade diferente**: o Género só aparece no Grau 4 (ex.: `711`="CAMISOLAS BENFICA" sem género, `7111`="Camisolas Benfica Adulto"), ao contrário de Calçado/Têxtil onde o género já está no Grau 3. A lógica de extracção tem de tratar isto por categoria, não com uma regra universal.

**Confirmado (2026-07-02, print do ERP):** cada artigo em `TB0001StkArtigos.Codigo_Familia` é codificado directamente com a família de **Grau 4** (ex.: artigo `44150` "SABRINA B-UNITED GINÁSTICA..." tem `Familia = 1551` "Sabrinas Ginástica", que é Grau 4). Os Graus 1/2/3 (Categoria, Agrupador de Modalidade, Modalidade+Género) **não estão gravados no artigo** — obtêm-se por truncagem numérica do código de Grau 4 (`1551` → Grau 3 = `155`, Grau 2 = `15`, Grau 1 = `1`) e lookup na tabela `TB0001StkFamilias` para cada nível, ou reconstruindo a árvore via `Codigo_Familia_Pai` em `DBSiteCD`. A View/job de sincronização tem de fazer esta subida na hierarquia a partir do `Codigo_Familia` do artigo — não é preciso nenhum campo adicional na DBClassico para isto.
>
> **Excepção confirmada (2026-07-02, testado com dados reais)**: 99.4% dos artigos publicados (6842/6881) seguem esta regra e apontam para Grau 4, mas **39 artigos (0.6%) apontam directamente para um código de Grau 2 ou Grau 3**. A resolução da hierarquia no job de sincronização (secção 2.6) tem de identificar em que Grau está o `Codigo_Familia` do artigo (pelo nº de dígitos) e subir a árvore a partir daí, em vez de assumir sempre Grau 4.

**Decisão de desenho:** em vez de fazer parsing de texto em tempo real na sincronização (frágil e difícil de validar), a abordagem é:

1. Construir as tabelas **`ZAPP_DBSiteCD_Familias`/`Sub_Familias_1-3`** (secção 2.1.2/2.2), associadas por FK a `ZAPP_DBSiteCD_Modalidades`/`ZAPP_DBSiteCD_Generos`, preenchidas **uma vez** a partir da exportação completa recebida — classificação semi-automática (por keyword-match nas ~650 famílias) seguida de **revisão manual** de uma folha de cálculo antes de carregar para a BD (ou migradas do site actual, se possível — secção 2.1.2). É um trabalho de preparação de dados de poucas horas, não um algoritmo de produção.
2. O job de sincronização usa essas tabelas como **lookup directo** por `Codigo_Familia` (rápido, previsível, sem ambiguidade em tempo de execução).
3. **Famílias novas** (que a DBClassico venha a criar no futuro e que não existam ainda nestas tabelas) ficam sinalizadas no `ZAPP_DBSiteCD_SyncLog` como "família por classificar" — o artigo continua a ser publicado (não fica escondido), mas sem Modalidade/Género até alguém as classificar manualmente num pequeno ecrã de Backoffice. Isto evita que a sincronização quebre ou esconda artigos por causa de uma família nova.
4. Casos ambíguos (Grau 2/3 que combinam mais que uma modalidade, ex.: "SAPATILHAS TÉNIS-PADEL HOMEM") são resolvidos manualmente ao classificar a família (ex.: atribuir a modalidade dominante, ou criar um valor composto "Ténis/Padel" como opção de filtro válida).

Isto substitui a ideia anterior de reconhecimento de palavra-chave em tempo real — passa a ser **dados de referência versionados**, mais fiável e mais fácil de auditar.

> Nota: a Categoria "Clubes" (Grau 1 = `7`) e "Electrónica" (Grau 1 = `5`) aparecem na estrutura de Famílias mas não foram mencionadas no âmbito inicial do site (Calçado, Vestuário, Acessórios). A confirmar se também devem ser publicadas no site ou ficam fora do MVP (ver Fase 0). **"Equipamentos" (Grau 1 = `9`) já ficou decidida como excluída (2026-07-02) — ver nota da secção anterior.**

### 2.1.2 O site actual (classicodesportivo.pt / Backoffice Incentea) já resolve isto — aproveitar a estrutura

Captura do Backoffice do site actual (2026-07-02) mostra que este problema **já está resolvido em produção** há anos, através de tabelas de configuração próprias, geridas pelo operador:

- **Modalidades** — lista própria (Aeróbica, Andebol, Atletismo, Badminton, Ballet, Basquetebol, Ciclismo, Futebol, Futsal, Ginásio, Ginástica, Lazer, Moda, Montanha, Natação, Passeio, Ping-pong, Skate, Squash, Surf, …), cada uma com `Título`, `Tag` (slug usado na pesquisa/URL), `Ordem` e `Situação` (Visível/Escondido).
- **Géneros** — mesma estrutura (tabela própria, provavelmente Homem/Senhora/Junior/Rapaz/Rapariga/Bebé conforme secção 2.1).
- **Marcas** — idem.
- **Familias, Sub-Familias, Sub-Familias 2, Sub-Familias 3** — tabelas próprias que espelham os 4 Graus da DBClassico (secção 2.1.1), cada uma provavelmente com uma **associação a Modalidade e a Género** feita manualmente no Backoffice, e com `Situação` para esconder famílias que não interessa mostrar no site.
- Existem ainda separadores/menus já geridos assim: "Novidades", "ARTIGOS COM 10% A ...", "OUTLET — ARTIGOS COM...", "TODOS OS ARTIGOS", "links directos famílias" — confirma exactamente os separadores pedidos na secção 2.3, já validados em produção.

**Implicação para o novo site:** não faz sentido reinventar isto — o `DBSiteCD` deve replicar esta estrutura comprovada (tabelas `Modalidades`, `Generos`, `Marcas` com `Titulo`/`Tag`/`Ordem`/`Situacao`, e `Familias`/`Sub_Familias_1`/`Sub_Familias_2`/`Sub_Familias_3` cada uma associada a `Modalidade_Id`/`Genero_Id` por Foreign Key, editável em Backoffice). Isto substitui a proposta de uma única tabela plana `Familia_Metadata` por uma estrutura mais granular, alinhada com o que a equipa já conhece e usa — reduz risco e custo de formação.

**Ponto em aberto (não bloqueante, mas com grande impacto no esforço da Fase 0/1):** confirmar se a base de dados do site actual (Incentea) já tem a associação Família↔Modalidade↔Género gravada e acessível. Se sim, **migrar esse mapeamento directamente** elimina a necessidade de reclassificar manualmente as ~650 famílias da exportação (secção 2.1.1) — poupa provavelmente vários dias de trabalho. Fica como ação a confirmar na Fase 0 (ver acesso à BD do site actual, motor/tecnologia do Incentea, e se é SQL Server acessível).

### 2.1.3 Correcções e detalhes confirmados a partir do SQL real das views `WEBSW_VSyncro*` (recebido em 2026-07-02)

O utilizador partilhou o código-fonte (`sql_script.sql`) das views `WEBSW_VSyncroArtigos`, `WEBSW_VSyncroLotes` e `WEBSW_VSyncroFamilias`. Isto permitiu confirmar exactamente a lógica de negócio (mais fiável do que inferir só pelos nomes de campos) e corrigir alguns pontos assumidos incorrectamente antes:

- **Correcção: o valor de `Tipo_Preco` é literalmente `'PV1'`, não `'PVP1'`** como tinha sido assumido nas secções anteriores deste documento (já corrigido em todo o documento).
- **Filtros adicionais descobertos em `TB0001StkPrecosVenda`**: a consulta ao preço/desconto exige também `Codigo_Moeda = '001'` e `Codigo_Unidade = 'UN'`, além de `Tipo_Preco = 'PV1'` e do `Codigo_Armazem`. Estes dois campos (`Codigo_Moeda`, `Codigo_Unidade`) não constavam da lista original de campos desta tabela — a View/consulta do novo site tem de os incluir sempre.
- **Nova tabela descoberta: `TB0001StkAcumulQtd`** (`Ano`, `Codigo_Armazem`, `Codigo_Artigo`, `Data_Hora`) — um acumulado de quantidades por ano/armazém/artigo, usado pela view actual só para saber **quando a quantidade foi alterada pela última vez** (não para o valor em si — esse vem de `TB0001StkLotesAcumul` por lote). É mais uma fonte de "última alteração" a considerar no cálculo de delta do novo site.
- **A "data de última alteração" de um artigo não é um único campo — é o máximo de três datas**: a view actual (`UpdateDate`) calcula o mais recente entre `TB0001StkArtigos.Data_Hora`, a `Data_Hora` do preço PV1 em `TB0001StkPrecosVenda`, e a `Data_Hora` em `TB0001StkAcumulQtd` (ano corrente, armazém do artigo). Ao nível do Lote (`WEBSW_VSyncroLotes`), soma-se ainda o máximo entre `TB0001StkLotes.Data_Hora` e `TB0001StkLotesAcumul.Data_Hora`. **O novo site deve replicar esta lógica de "máximo de várias datas"** ao decidir o que entra no delta de sincronização — usar só uma data isolada deixaria escapar alterações de preço ou de stock que não tocam na ficha do artigo em si.
- **`Data_Hora` vs `Data_Alteracao` (esclarecido em 2026-07-02, não bloqueante):** segundo o utilizador, `Data_Hora` é provavelmente a data de criação do artigo, actualizada também nas alterações manuais à ficha — mas na prática, na maioria dos artigos, as duas datas (`Data_Hora` e `Data_Alteracao`) coincidem quase exactamente (diferenças de milissegundos), o que sugere que são o mesmo tipo de marca temporal, possivelmente até o mesmo campo com dois nomes diferentes usados em contextos diferentes (SQL da view vs. documentação inicial). **Decisão prática: seguir o precedente comprovado e usar `TB0001StkArtigos.Data_Hora`** (o campo que a view `WEBSW_VSyncroArtigos` já usa em produção), em vez de `Data_Alteracao`, para o cálculo de "última alteração" nas Views `ZAPP_DBSiteCD_V*` — não vale a pena continuar a investigar a diferença entre os dois campos, dado que na prática produzem o mesmo resultado.
- **Nuance sobre o filtro de armazém em `WEBSW_VSyncroArtigos`**: a view actual faz `INNER JOIN` de `TB0001StkArmazArt` com `TB0001StkArtigos` **sem filtrar explicitamente `Codigo_Armazem = '001'`** ao nível do artigo (o armazém de contexto vem de cada linha de `TB0001StkArmazArt`, usado depois para escolher o preço e o `Desc_Armazem` dessa linha). Isto só não causa duplicação de artigos na prática se cada artigo só tiver uma linha em `TB0001StkArmazArt` (um único armazém) — **por precaução, e porque já decidimos expor só o armazém `001` (secção 2.1), a View `ZAPP_DBSiteCD_VArtigos` deve filtrar explicitamente `WHERE TB0001StkArmazArt.Codigo_Armazem = '001'`**, para nunca depender dessa suposição e evitar duplicar artigos caso algum exista em mais do que um armazém.
- **`WEBSW_VSyncroLotes`** confirma exactamente o que já tínhamos assumido: `Descricao_Lote` é usado tal-e-qual (sem parsing), o stock vem de `TB0001StkLotesAcumul.Qtd_Disponivel` filtrado a `Codigo_Armazem = '001'` (hardcoded na view actual), e o `LEFT JOIN` (não `INNER JOIN`) permite lotes sem quantidade acumulada ainda (novos), tratados com `Qtd_Disponivel = 0`.
- **`WEBSW_VSyncroFamilias`** é uma cópia simples de `TB0001StkFamilias` (todos os graus, sem filtrar por Grau) com `WHERE LEN(Codigo_Familia) < 5` — ou seja, sincroniza a árvore completa de família tal como está na DBClassico, sem qualquer resolução de Modalidade/Género (confirma que essa resolução é mesmo um trabalho novo a fazer, secção 2.1.2).
- Existe (ou existiu) uma `WEBSW_VSyncroDescontos`, actualmente descartada pelo próprio script (`DROP VIEW` condicional) — indica que o mecanismo de descontos evoluiu para vir directamente de `TB0001StkPrecosVenda.Codigo_Desconto_Art` dentro de `WEBSW_VSyncroArtigos`, sem view dedicada. Não é preciso replicar uma view de descontos à parte.

### 2.2 Base de dados própria do site (`DBSiteCD`)

**Actualizado em 2026-07-02:** `DBSiteCD` é uma base de dados nova e independente, criada na **mesma instância SQL Server que a DBClassico** (`TSERVER\SQLSERVER`) — não em CDSERVER (não há ali SQL Server utilizável para este efeito, secção 2.5). É uma base separada da DBClassico, sem qualquer relação de dependência com as tabelas do ERP Gexor nem com os objectos `WEBSW_*` do Sincronizador actual — só o serviço em CDSERVER (secção 2.6) lê da DBClassico e escreve na `DBSiteCD`, ambas no TSERVER.

**Nomenclatura (confirmada em 2026-07-02):** todos os objectos novos criados para este projecto — tanto as tabelas de armazenamento do site em `DBSiteCD` como as Views e tabelas de rastreio de leitura na DBClassico (secção 2.6.1), ambas no TSERVER — usam o mesmo prefixo **`ZAPP_DBSiteCD_`**, para ficar consistente com as restantes aplicações já desenvolvidas (ex.: `ZAPP_Reposicoes`, também no TSERVER). Nas secções seguintes deste documento, os nomes das tabelas (`Artigos`, `Imagens`, `Sync_Log`, etc.) são usados de forma abreviada por legibilidade — na implementação real correspondem a `ZAPP_DBSiteCD_Artigos`, `ZAPP_DBSiteCD_Imagens`, `ZAPP_DBSiteCD_SyncLog`, etc. (tabelas de armazenamento, na base `DBSiteCD`) e `ZAPP_DBSiteCD_VArtigos`, `ZAPP_DBSiteCD_TArtigosSincro`, etc. (Views/tabelas de rastreio, na base `DBClassico`) — distinguíveis pelo tipo de objecto (`V*`/`T*` vs. tabela de armazenamento) e pela base onde estão, nunca pelo nome sozinho.

Tabelas principais (espelho simplificado + campos de e-commerce):

- **`ZAPP_DBSiteCD_Artigos`** — 1 registo por `Codigo_Artigo`. Campos ERP + `Descricao_Longa` (vem de `TB0001StkInfoCompArm.Texto_Info_Compl`, filtro `Tipo_Info_Compl='O'`/`Codigo_Info_Compl='Internet'` — especificações técnicas) + campos só-site: `Slug`, `Publicado` (bit; posto a `0` quando o artigo deixa de ter `Tipo_Artigo='I'`), `Eliminado_Na_Origem` (bit; artigo apagado na DBClassico — nunca `DELETE` físico em `DBSiteCD`, por causa de `ZAPP_DBSiteCD_EncomendasLinhas` históricas), `Novidade_Manual` (bit, override), `Meta_Titulo`, `Meta_Descricao`.
- **`ZAPP_DBSiteCD_Variantes`** (mapeia Lotes) — `Codigo_Artigo`, `Codigo_Lote`, `Descricao_Lote` (texto livre, guardado tal-e-qual, indexado para pesquisa), `Ean` (opcional), `Ativo`.
- **`ZAPP_DBSiteCD_Stock`** — `Codigo_Artigo`, `Codigo_Lote`, `Codigo_Armazem` (sempre `'001'`), `Qtd_Disponivel`, `Qtd_Reservada`, `Data_Hora` (é a tabela que mais precisa de estar "fresca").
- **`ZAPP_DBSiteCD_Precos`** — `Codigo_Artigo`, `Preco` (`Tipo_Preco='PV1'`, IVA incluído), `Codigo_Desconto_Art`, `Percentagem_Desconto` (derivada do código), `Preco_Outlet` (calculado, nullable), `Data_Alter_Preco`.
- **`ZAPP_DBSiteCD_Modelos`** (espelho de `TB0001StkModelos`).
- **`ZAPP_DBSiteCD_Familias` / `ZAPP_DBSiteCD_SubFamilias1` / `ZAPP_DBSiteCD_SubFamilias2` / `ZAPP_DBSiteCD_SubFamilias3`** — espelho de `TB0001StkFamilias` por Grau (1/2/3/4), cada registo com `Codigo_Familia`, `Familia`, `Codigo_Familia_Pai`, mais `Modalidade_Id` (FK) e `Genero_Id` (FK, quando aplicável ao Grau — ver nota da categoria Clubes na secção 2.1.1), `Situacao` (Visível/Escondido).
- **`ZAPP_DBSiteCD_Modalidades`**, **`ZAPP_DBSiteCD_Generos`**, **`ZAPP_DBSiteCD_Marcas`** — tabelas de configuração próprias (`Id`, `Titulo`, `Tag`, `Ordem`, `Situacao`), geridas em Backoffice — **replica a estrutura já comprovada do site actual** (secção 2.1.2). A associação Família→Modalidade/Género é feita uma vez (idealmente migrada do site actual, se existir — ver 2.1.2) e depois mantida manualmente sempre que surgir família nova, sinalizada no `ZAPP_DBSiteCD_SyncLog`.
- **`ZAPP_DBSiteCD_Imagens`** — `Codigo_Artigo`, `Ordem`, `Path/URL` (a imagem 0 vem da BD, as imagens 1-8 vêm da directoria `Cod_Artigo-CD*.jpg`). **Ao contrário do registo do Artigo (que é só despublicado, nunca apagado — secção 2.6), as imagens são efectivamente removidas** (linha da tabela + ficheiro físico/blob) quando o artigo deixa de ser `Tipo_Artigo='I'` ou é apagado na origem, para o espaço em disco/BD não crescer indefinidamente com imagens de artigos que já não aparecem no site. Se o artigo voltar a ficar elegível mais tarde, as imagens são re-sincronizadas a partir da BD/directoria de origem (fonte da verdade, nunca se perde nada permanentemente).
- **`ZAPP_DBSiteCD_SyncLog`** — histórico/estado de cada corrida de sincronização (nº registos alterados, erros, duração) — essencial para diagnosticar falhas sem teres de adivinhar.

Tabelas de negócio do site (não vêm da DBClassico), mesma convenção:
- **`ZAPP_DBSiteCD_Clientes`**, **`ZAPP_DBSiteCD_Moradas`**, **`ZAPP_DBSiteCD_Encomendas`**, **`ZAPP_DBSiteCD_EncomendasLinhas`**, **`ZAPP_DBSiteCD_Pagamentos`**, **`ZAPP_DBSiteCD_Carrinho`** (ou gerido em sessão/local storage + tabela de reserva de stock temporária), **`ZAPP_DBSiteCD_UtilizadoresBackoffice`**.

### 2.3 Pesquisa e navegação

Filtros estruturados (facetas, com contagem por opção): Família (Grau 1/2/3), Marca, Modalidade, Género, Código Artigo, Descrição.
Separadores: Todos os Artigos, Novidades (parametrizável, default 180 dias), Outlet, (extensível).
Ordenação: Descrição, Preço ↑, Preço ↓, Família, Género, Modalidade.

**Cor e Tamanho não são facetas estruturadas**, dado que `Descricao_Lote` não tem formato fixo (secção 2.1). Em vez disso:
- Na **ficha de artigo**, os lotes desse artigo são listados como variantes seleccionáveis (ex.: botões/dropdown), mostrando o `Descricao_Lote` tal como vem do ERP e o respectivo stock.
- Na **caixa de pesquisa geral**, o termo digitado pelo utilizador pesquisa também dentro de `Descricao_Lote` (ex.: escrever "42" ou "preto" devolve artigos que tenham pelo menos um lote cujo texto contenha esse termo) — pesquisa por `LIKE '%termo%'` (ou full-text search se o volume justificar), não por igualdade estruturada.
- **Nota para o Backoffice**: se no futuro se quiser um filtro real de "Cor" por checkbox (como no puma.pt), a única forma fiável é a equipa de gestão de artigos **atribuir manualmente uma Cor normalizada a cada lote** através de um pequeno ecrã de backoffice (não é possível derivar isso automaticamente do texto livre com fiabilidade). Fica registado como possível evolução (Fase 6), não faz parte do MVP.

Implica indexação em BD (índices nos campos de filtro, e índice/full-text em `Descricao_Lote`) e, se o catálogo crescer muito, eventualmente um motor de pesquisa (Meilisearch/Elasticsearch) — não necessário na fase 1.

### 2.4 Pagamentos (baixo custo, fácil integração em Portugal)

| Meio | Opção recomendada | Notas |
|---|---|---|
| MB WAY + Multibanco | **SIBS API Market / Ifthenpay** | Ifthenpay tem setup simples, sem mensalidade fixa em vários planos, boa documentação PT |
| Cartão de Crédito | **Stripe** ou **Ifthenpay (via SIBS)** | Stripe: integração muito boa, sem custo fixo, comissão por transação |
| PayPal | **PayPal Checkout SDK** | Standard, fácil, comissão por transação |

Recomendação prática: **Ifthenpay** para MB WAY/Multibanco (mercado português, custo baixo) + **Stripe** para cartão + **PayPal** — os três não têm custo mensal fixo relevante, cobram por transação, o que é ideal numa fase inicial de baixo volume.

### 2.5 Infraestrutura

- **Fase 1 (local):** o **código/serviço de sincronização e a aplicação Node.js correm em CDSERVER** (onde já se desenvolve — VS Code local, Node.js/npm/git já instalados e confirmados em 2026-07-02). A **base de dados `DBSiteCD` fica no TSERVER**, na mesma instância SQL Server que a DBClassico (`TSERVER\SQLSERVER`), como uma **base de dados separada e independente** — não uma instância nova. Não existe SQL Server utilizável em CDSERVER para este efeito (há uma instância local `CDSERVER\SQLOCTACODE`, mas foi instalada por um software de demonstração não relacionado, sem credenciais conhecidas, e não deve ser usada).
- **Fase 2 (online):** hosting de baixo custo (ex.: VPS económico — Hetzner/DigitalOcean, ou hosting gerido tipo Railway/Render para reduzir manutenção). A ligação à DBClassico **não deve ser exposta à internet directamente** — a sincronização deve continuar a correr localmente (serviço em CDSERVER, ligando-se ao TSERVER) e só publicar os dados já tratados para o site online.
- Domínio: registo `.pt` ou `.com`, custo baixo (~10-15€/ano), com certificado SSL (Let's Encrypt, gratuito).

**Precedente confirmado (2026-07-02):** o SQL Server (`TSERVER\SQLSERVER`) e o programa "Sincronizador" (WebPostData, tecnologia inCentea) que alimenta o site actual estão **ambos instalados no TSERVER** — não é um SQL Agent Job, é uma aplicação Windows dedicada, com ecrã de configuração próprio: escolha de entidades a sincronizar (Marcas, Famílias, Artigos, Imagens), modo "sincronizar apenas alterados", e sincronização automática agendada (diária, em intervalos de N horas — actualmente configurado para **de hora a hora, todos os dias**). Isto confirma e valida a decisão da secção 2.6 de ter um **serviço/worker dedicado** (equivalente Node.js) em vez de depender só de SQL Agent Jobs, e confirma que uma cadência **horária é suficiente na prática** para este negócio — não há sinal de que o site actual precise de tempo real. O novo serviço de sincronização corre em **CDSERVER** e liga-se ao **TSERVER** para tudo (leitura da DBClassico via `ZAPP_DBSiteCD_V*`, e leitura/escrita na `DBSiteCD`, ambas no TSERVER).

> **Nota:** a DBClassico é gerida pelo ERP **Gexor** — reforça a regra já estabelecida (secções 2.6.1, 2.6): nunca alterar nada das tabelas/objectos do Gexor nem do Sincronizador `WEBSW_*` existente. A `DBSiteCD` é criada como base nova e independente na mesma instância, sem qualquer relação de dependência com esses objectos.

### 2.5.1 Ligação à DBClassico

Dados de acesso fornecidos (instância `TSERVER\SQLSERVER`, base `DBClassico`, utilizador `GIWINDOWS`) — formato ODBC (usado normalmente em scripts Python/`pyodbc`). Em **Node.js** não se usa driver ODBC; a ligação ao SQL Server é feita via TDS nativo com o pacote [`mssql`](https://www.npmjs.com/package/mssql) (ou `tedious` diretamente). Equivalente da mesma ligação:

```js
// config/db.js
module.exports = {
  server: 'TSERVER\\SQLSERVER',
  database: 'DBClassico',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    trustServerCertificate: true, // equivalente a TrustServerCertificate=yes
    encrypt: true,
  },
};
```

> **Segurança — não esquecer:**
> - Utilizador/password nunca ficam em texto no código-fonte nem em documentos de projecto versionados — usar variáveis de ambiente (`.env`, fora do controlo de versões) ou um cofre de segredos (ex.: Azure Key Vault, Windows Credential Manager, ou mesmo um `.env` local em CDSERVER com permissões restritas de ficheiro).
> - O utilizador `GIWINDOWS` parece ser uma conta genérica partilhada — para o job de sincronização, o ideal seria uma **conta SQL dedicada, só de leitura (`db_datareader`)**, exclusiva do site, para limitar o raio de impacto caso a credencial seja comprometida. Confirmar com o responsável de sistemas se é possível criar essa conta antes de ir para produção; para a Fase 1 (local, testes internos) a conta actual é aceitável.
> - Ligação nunca deve ser feita a partir do servidor online (Fase 2) diretamente à DBClassico — só o serviço de sincronização em CDSERVER liga à DBClassico (secção 2.5).

### 2.6 Sincronização de dados (o coração do projecto)

Duas camadas:

1. **Views `ZAPP_DBSiteCD_V*`** na DBClassico (secção 2.6.1) que juntam Artigos + Lotes + Stock + Preços + Marca + Modelo + Família + `TB0001StkArmazArt` (para `Data_Ult_Compra`) + `TB0001StkInfoCompArm` (para especificações técnicas, `Tipo_Info_Compl='O'`/`Codigo_Info_Compl='Internet'`), aplicando os filtros confirmados: `Codigo_Armazem = '001'`, `Tipo_Artigo = 'I'`, preço com `Tipo_Preco='PV1'`+`Codigo_Moeda='001'`+`Codigo_Unidade='UN'` (IVA incluído) de `TB0001StkPrecosVenda` — secção 2.1.3, mapeamento `Codigo_Desconto_Art` → percentagem para calcular Outlet, e `Data_Ult_Compra` para calcular Novidades. Como `TB0001StkArtigos.Codigo_Familia` aponta sempre para o Grau 4 (secção 2.1.1), a View resolve também os códigos de Grau 1/2/3 por truncagem numérica (ou `self-join` sucessivo em `TB0001StkFamilias`), para permitir a navegação por Categoria/Modalidade sem depender só do Grau 4.
2. **Serviço de sincronização em Node.js**, a correr em CDSERVER (secção 2.5), agendado via `node-cron`, com um modo "sincronizar agora" além do automático (espelhando o ecrã do Sincronizador actual), processando as mesmas 7 categorias observadas no `log.txt` actual (secção 2.6.1): `Marcas`, `Familias`, `Artigos`, `ArtigosLotes`, `ArtigosSetNotInternet`, `ArtigosDeleted`, `Imagens`. Para cada corrida:
   - Lê `ZAPP_DBSiteCD_VArtigosToUpdate` (delta desde a última corrida, secção 2.6.1) em vez de comparar datas manualmente.
   - Faz `LEFT JOIN` de `Codigo_Familia` contra as tabelas `Familias`/`Sub_Familias_1-3` (secção 2.1.2/2.2) para obter Categoria/Modalidade/Género; se não encontrar associação, grava o artigo na mesma (Modalidade/Género a `NULL`) e regista a família em falta no `Sync_Log` para classificação manual em Backoffice.
   - Faz **upsert incremental** nas tabelas de `DBSiteCD` (só o que mudou) para artigos, lotes/stock, marcas, famílias e imagens.
   - **`ArtigosSetNotInternet`**: artigos que deixaram de ter `Tipo_Artigo='I'` são **despublicados** (`Publicado = 0`), nunca apagados — mantêm o registo para preservar o histórico de encomendas antigas que os referenciem. **As imagens desse artigo, essas sim, são apagadas** (linhas em `Imagens` + ficheiros/blob) — não há razão para manter o espaço ocupado com imagens de um artigo que já não é visível, e a BD do site fica assim com um tamanho mais dinâmico/controlado em vez de crescer sempre.
   - **`ArtigosDeleted`**: artigos apagados na DBClassico são tratados da mesma forma — `Publicado = 0` + `Eliminado_Na_Origem = 1` em `DBSiteCD`, nunca `DELETE` físico do registo do artigo (idem, por causa de `Encomendas_Linhas`), mas com a mesma limpeza de imagens.
   - Regista o resultado em `Sync_Log` (nº registos processados por categoria, erros, duração) **e** num `log.txt`, replicando o formato do Sincronizador actual, para facilitar a operação a quem já está habituado a este tipo de registo.
   - Corre automaticamente **de hora a hora** por omissão (configurável), com opção de disparo manual imediato.

> **Recomendação final:** o mecanismo de rastreio por triggers (secção 2.6.1) já permite delta em tempo real ao nível dos dados (cada alteração fica logo registada em `ZAPP_DBSiteCD_TArtigosSincro`); a **cadência do job que consome esse delta** é que define a frequência de actualização do site. Seguir o precedente já validado em produção pelo Sincronizador actual (ver secção 2.5): arrancar também com **execução automática de hora a hora**, com opção de correr manualmente/imediatamente a pedido (tal como o botão "Sincronizar agora" do Sincronizador actual). Só reduzir o intervalo mais tarde se se justificar (ex.: para stocks de artigos com muita rotação), não é uma necessidade validada pelo negócio até agora.

### 2.6.1 Infraestrutura de sincronização já existente (WEBSW_*) — usada como referência, não reaproveitada directamente

Descoberta em 2026-07-02: já existe em produção, ao serviço do site actual, um mecanismo de rastreio de alterações e um conjunto de views de exportação, no schema `dbo`:

**Tabelas de rastreio de alterações (mecanismo confirmado em 2026-07-02):**
- `WEBSW_TArtigosSincro` (`Codigo_Artigo`, `Tipo_Operacao`, `Data_Hora`, `Tipo_Imput`, `Codigo_Lote`) — **alimentada por triggers** nas tabelas base sempre que um artigo (ou um lote específico) é alterado; regista o quê mudou e quando, ao nível do artigo+lote. É o "livro de alterações" que a sincronização consome.
- `WEBSW_TDatesSincro` (`table_name`, `date`) — uma linha por view/tabela de exportação (`WEBSW_VSyncroMarcas`, `VSyncroFamilias`, `VSyncroArtigos`, `VSyncroLotes`, `VSyncroArtigosToUpdate`, `TArtigosSincro`, `VSyncroImagens`), com a **data do último envio bem-sucedido para o site** — é o "marcador" que o processo de sincronização actualiza depois de cada corrida, para saber a partir de onde continuar da próxima vez.

**Fluxo confirmado:** trigger na tabela base → grava linha em `WEBSW_TArtigosSincro` (artigo + lote + tipo de operação + data/hora) → o processo que corre para o site actual lê `WEBSW_TArtigosSincro` filtrando pela data guardada em `WEBSW_TDatesSincro`, vai buscar a informação actualizada às views `WEBSW_VSyncro*`, actualiza o site, e no fim actualiza `WEBSW_TDatesSincro` com a nova data de referência.

**Categorias de sincronização confirmadas pelo `log.txt` do Sincronizador actual (2026-07-02)** — cada corrida processa estes 7 tipos, cada um com a sua contagem de registos:

| Tipo (no log) | Significado | Implicação para o `ZAPP_DBSiteCD_*` |
|---|---|---|
| `Marcas` | Marcas novas/alteradas | Directo |
| `Familias` | Famílias novas/alteradas | Directo |
| `Artigos` | Artigos novos/alterados (ficha) | Directo |
| `ArtigosLotes` | Lotes/stock novos ou alterados | **Sincronização separada da ficha do artigo** — confirma que Artigo e Lote/Stock têm ciclos de vida distintos (stock muda com muito mais frequência do que a ficha) |
| `ArtigosSetNotInternet` | **Artigos que deixaram de ter `Tipo_Artigo='I'`** (deixaram de ser elegíveis para o site) | **Ponto que faltava no desenho anterior**: não basta o artigo desaparecer do delta — é preciso um tipo de evento explícito para **despublicar** (`Publicado = 0`) um artigo que já estava no site e deixou de ser elegível. Sem isto, o artigo ficaria "preso" publicado indefinidamente |
| `ArtigosDeleted` | Artigos apagados fisicamente na DBClassico | Equivalente a `ArtigosSetNotInternet` mas para apagados — o `ZAPP_DBSiteCD_*` precisa do mesmo tratamento: nunca apagar fisicamente do `DBSiteCD` (há `Encomendas_Linhas` que referenciam `Codigo_Artigo` de encomendas antigas), marcar como `Publicado = 0` / `Eliminado_Na_Origem = 1` |
| `Imagens` | Imagens novas/alteradas | Directo |

Isto confirma que `Tipo_Operacao` em `WEBSW_TArtigosSincro`/`ZAPP_DBSiteCD_TArtigosSincro` tem de distinguir pelo menos: inserção/alteração normal, "deixou de ser Internet", e "apagado" — não é um simples log de INSERT/UPDATE. O `log.txt` (ficheiro de texto, timestamp + tipo + sucesso/erro + contagem) é também um padrão simples e útil a replicar para o `Sync_Log` do novo site, além do registo em BD — facilita a operação diária para quem já está habituado a este formato.

**Views de exportação:**
- `WEBSW_VSyncroArtigos` — já traz, por artigo: `Code_Artigo`, `Descricao`, `Desc_Armazem`, `Code_Marca`, `Desc_Marca`, `Code_Familia`, `Desc_Familia`, `Preco`, `Iva_Incluido`, `Iva`, `Code_desconto`, `Data_Compra`, `Internet` (já o filtro `Tipo_Artigo='I'` resolvido), `UpdateDate`, `Peso`.
- `WEBSW_VSyncroMarcas`, `WEBSW_VSyncroFamilias`, `WEBSW_VSyncroLotes`, `WEBSW_VSyncroImagens` — equivalentes para as restantes entidades.
- `WEBSW_VSyncroArtigosToUpdate` — a view de **delta** (artigos alterados desde a última sincronização), cruzando `WEBSW_TArtigosSincro`/`WEBSW_TDatesSincro`.

**Limitação confirmada pelo utilizador:** o novo site precisa de **mais campos do que os que `WEBSW_VSyncroArtigos` hoje expõe** (ex.: especificações técnicas de `TB0001StkInfoCompArm`, `Data_Ult_Compra` de `TB0001StkArmazArt` para Novidades, resolução da hierarquia completa de Família/Modalidade/Género, stock por lote de `TB0001StkLotesAcumul`). Não dá para usar as views actuais tal como estão — servem de **modelo/padrão a replicar e estender**, não de fonte directa.

**Decisão confirmada (2026-07-02): conjunto totalmente paralelo e independente, sem tocar em nada do que já existe.**

O novo site **nunca lê nem escreve nos objectos `WEBSW_*` actuais** — servem apenas de referência de desenho (nomes de campos, ideia geral do mecanismo de delta), não de dependência. Regras a cumprir sempre, sem excepção:

- **Zero alterações aos objectos existentes** — nenhuma View, tabela, trigger, índice ou stored procedure já em produção (do ERP Gexor, `WEBSW_*`, ou qualquer outra) é criada, alterada ou apagada.
- **Nomenclatura própria e claramente distinta**, para nunca colidir nem ser confundida com os objectos actuais — prefixo `ZAPP_DBSiteCD_` (confirmado em 2026-07-02, mesma convenção usada também nas tabelas de armazenamento do site na base `DBSiteCD`, secção 2.2 — tudo na mesma instância TSERVER). A distinção entre "View de leitura da origem" e "tabela de armazenamento do site" faz-se pelo tipo de objecto/sufixo (`V*` = View, `T*` = tabela de rastreio, sem sufixo = tabela de armazenamento) e pela base de dados onde cada um vive (`DBClassico` vs. `DBSiteCD`), nunca pelo nome isoladamente:

| Objecto novo (`ZAPP_DBSiteCD_*`) | Equivalente actual | Diferença/adição face ao existente |
|---|---|---|
| `ZAPP_DBSiteCD_TArtigosSincro` (`Codigo_Artigo`, `Codigo_Lote`, `Tipo_Operacao`, `Data_Hora`, `Tipo_Imput`) | `WEBSW_TArtigosSincro` | Mesma estrutura; alimentada por **triggers novos e próprios**, adicionados às tabelas base — nunca alterando os triggers que já alimentam `WEBSW_TArtigosSincro`. Precisa de triggers nas mesmas tabelas que já disparam para o `WEBSW_*` (`TB0001StkArtigos`, `TB0001StkLotes`, `TB0001StkLotesAcumul`, `TB0001StkPrecosVenda`) **e também em tabelas que o mecanismo actual não cobre**: `TB0001StkArmazArt` (para `Data_Ult_Compra` → Novidades) e `TB0001StkInfoCompArm` (para especificações técnicas) |
| `ZAPP_DBSiteCD_TDatesSincro` (`table_name`, `date`) | `WEBSW_TDatesSincro` | Mesma estrutura, uma linha por `ZAPP_DBSiteCD_V*` |
| `ZAPP_DBSiteCD_VArtigos` | `WEBSW_VSyncroArtigos` | Mesmos campos base + `Texto_Especificacoes` (de `TB0001StkInfoCompArm`), `Data_Ult_Compra`, `Codigo_Familia_Grau1/2/3/4` resolvidos, `Percentagem_Desconto` calculada |
| `ZAPP_DBSiteCD_VMarcas`, `ZAPP_DBSiteCD_VFamilias`, `ZAPP_DBSiteCD_VLotes`, `ZAPP_DBSiteCD_VImagens` | `WEBSW_VSyncro{Marcas,Familias,Lotes,Imagens}` | `VLotes` acrescenta `Qtd_Disponivel`/`Qtd_Reservada` de `TB0001StkLotesAcumul` (o `WEBSW_VSyncroLotes` pode já ter isto — confirmar ao inspeccionar) |
| `ZAPP_DBSiteCD_VArtigosToUpdate` | `WEBSW_VSyncroArtigosToUpdate` | Mesma lógica de delta, cruzando `ZAPP_DBSiteCD_TArtigosSincro`/`ZAPP_DBSiteCD_TDatesSincro` |

> Nota: como criar triggers novos nas tabelas base da DBClassico é a única parte desta abordagem que toca (ainda que só para adicionar, nunca alterar) no sistema em produção, deve ser tratada como o passo mais sensível da Fase 1 — testar primeiro num ambiente de testes/cópia da DBClassico, nunca directamente em produção. Antes de desenhar os triggers novos, vale a pena **inspeccionar o código dos triggers existentes** (os que já alimentam `WEBSW_TArtigosSincro`) como referência de implementação — não para os alterar, só para copiar o padrão e adaptar.

### 2.7 Imagens

- Imagem principal: vem da BD (`Imagem_Art`) — extrair para ficheiro/blob storage no momento da sincronização (não fica na BD do site como binário, fica como ficheiro/URL).
- Imagens 2-9: já existem na directoria como `Cod_Artigo-CD1.jpg` … `Cod_Artigo-CD8.jpg` — o job de sincronização varre a pasta e regista as existentes na tabela `Imagens`.
- **Limpeza automática (confirmado 2026-07-02)**: quando um artigo passa a `ArtigosSetNotInternet` ou `ArtigosDeleted` (secção 2.6), as imagens correspondentes são **efectivamente apagadas** do storage/BD do site (ao contrário do registo do artigo, que só é despublicado) — mantém o tamanho do storage/BD proporcional só aos artigos actualmente visíveis no site, sem acumular indefinidamente imagens de artigos já não publicados. Se o artigo voltar a ficar elegível, as imagens são obtidas de novo a partir da BD/directoria de origem no ciclo de sincronização seguinte.
- **Limite de tamanho por imagem — já não é a preocupação que era (confirmado 2026-07-02)**: o mecanismo actual limita cada imagem a ~150KB e regista em `large_files.txt` as que ultrapassam esse valor, mas o próprio utilizador confirma que **o tamanho em disco/BD deixou de ser um problema relevante hoje em dia** (armazenamento é barato, secção 2.5 já prevê storage tipo S3-compatible de baixo custo na Fase 2). **Decisão: o novo site não replica este limite rígido.** Em vez disso:
  - Guardar as imagens com uma resolução/compressão razoável para uso web (ex.: redimensionar para uma largura máxima sensata como 1200-1600px e comprimir com qualidade alta usando `sharp` em Node.js), por performance de carregamento no site — não por limite de espaço.
  - Sem necessidade de log de "ficheiros grandes" nem de rejeitar/sinalizar imagens — só otimização automática e transparente no momento da sincronização.
- Fase 2: mover para storage tipo S3-compatible (Backblaze B2 / Cloudflare R2 — baixo custo) para servir bem via CDN quando estiver online.

---

## 3. Plano de Execução (por fases)

### Fase 0 — Descoberta e Definições (1-2 semanas)
1. ~~Regras de armazém, preço, artigo publicável, cor/tamanho, Outlet, Novidades, especificações técnicas, Género/Modalidade~~ — **confirmadas em 2026-07-02** (secção 2.1).
2. Confirmar SQL Server: versão, acessos, permissões de leitura na DBClassico.
3. Confirmar localização e nomenclatura real da pasta de imagens.
4. Validar amostra real de `Codigo_Desconto_Art` para confirmar mapeamento código→percentagem sem excepções.
5. **Verificar se a BD do site actual (Incentea/classicodesportivo.pt) já tem a associação Família↔Modalidade↔Género** e se há acesso possível a essa base (motor, versão, credenciais) — se existir e for migrável, poupa a reclassificação manual das ~650 famílias (secção 2.1.2). Só se não for possível/viável migrar é que se avança para classificação semi-automática + revisão manual a partir de [dados/TB0001StkFamilias_export.tsv](dados/TB0001StkFamilias_export.tsv).
6. Confirmar se as categorias "Clubes" e "Electrónica" (fora do âmbito inicial) devem ser publicadas no site ou excluídas do MVP. ~~"Equipamentos"~~ — **decidido em 2026-07-02: excluída** (categoria descontinuada, sem correspondência a Grau 4 em várias famílias — ver secção 2.1.1).
7. ~~Documentar o mecanismo `WEBSW_*`~~ — **confirmado em 2026-07-02** (secção 2.6.1): alimentado por triggers nas tabelas base, granular a artigo+lote. Falta ainda **inspeccionar o código desses triggers existentes** (só como referência de implementação, nunca para alterar) antes de desenhar os triggers novos e dedicados `ZAPP_DBSiteCD_*`.
8. Levantar requisitos legais mínimos para e-commerce PT (termos e condições, política de devolução — RGPD, Livro de Reclamações Online).
9. ~~Confirmar `Data_Hora` vs `Data_Alteracao`~~ — **esclarecido em 2026-07-02** (secção 2.1.3): usar `TB0001StkArtigos.Data_Hora` (campo já comprovado em produção), sem necessidade de mais investigação.

### Fase 1 — Modelo de Dados e Sincronização (2-3 semanas)
1. ~~Desenhar e criar `DBSiteCD`, carregar Modalidades/Generos/Familias~~ — **concluído em 2026-07-02** no `TSERVER\SQLSERVER`:
   - Schema inicial (21 tabelas) em [sql/001_create_dbsitecd.sql](sql/001_create_dbsitecd.sql).
   - Seed de `Modalidades` (24) e `Generos` (10, incluindo a correcção "Bebé" em Calçado, descoberta ao validar os dados reais) em [sql/002_seed_modalidades_generos.sql](sql/002_seed_modalidades_generos.sql).
   - **Correcção importante**: ao criar a View `ZAPP_DBSiteCD_VFamilias` (ponto 2) e comparar com a exportação estática original, descobri que a DBClassico tem **8 categorias de Grau 1 em produção**, não as 6 da exportação inicial — faltava `9 = Equipamentos` (com artigos reais publicados, incluída) e `GEN = Generica` (código não-numérico, criado para artigos antigos sem stock que não podiam ficar com família nula — confirmado pelo utilizador; **0 artigos publicados** usam esta família, por isso foi **excluída** da classificação, sem necessidade de código de substituição). A partir daqui, a fonte de verdade passou a ser a **exportação directa da View viva** (`dados/TB0001StkFamilias_export_live_h.tsv`), não o ficheiro estático original.
   - Classificação semi-automática das famílias reais via [sql/classify_familias.py](sql/classify_familias.py) → [sql/003_load_familias.sql](sql/003_load_familias.sql). Carregados: **7 Categorias (Grau1), 51 Agrupadores (Grau2), 237 Modalidade+Género (Grau3), 840 Especificações (Grau4)**.
   - Casos não resolvidos automaticamente (ex.: "Adulto" em Clubes, modalidades compostas como "Dança"/"Yoga" mapeadas por aproximação) ficam com `Modalidade_Id`/`Genero_Id = NULL`, prontos a rever/completar manualmente em Backoffice (ecrã da Fase 3) sem bloquear a publicação dos artigos — ver relatório completo em [dados/familias_classificacao_report.tsv](dados/familias_classificacao_report.tsv).
   - **Nota técnica**: durante o processo houve um problema temporário de codificação de caracteres (acentuação corrompida) ao combinar ficheiros gerados por `sqlcmd` (Bash) com `PowerShell` — identificado e corrigido antes de dar os dados como definitivos; os dados finais em `DBSiteCD` foram verificados linha a linha e estão correctos.
2. ~~Criar as Views novas `ZAPP_DBSiteCD_V*` de leitura na DBClassico~~ — **concluído em 2026-07-02**, script em [sql/004_create_views_dbclassico.sql](sql/004_create_views_dbclassico.sql): `VMarcas`, `VFamilias`, `VModelos`, `VArtigos` (filtro explícito `Codigo_Armazem='001'`, preço `Tipo_Preco='PV1'`, `UpdateDate` = máximo de 3 datas, especificações técnicas, **exclusão da categoria "Equipamentos" descontinuada** — secção 2.1.1/2.1.3), `VLotes`, e `VImagemPrincipal` (separada de `VArtigos` por ser um campo `image` pesado). Paralelas e independentes das `WEBSW_VSyncro*` existentes — nada foi alterado nos objectos actuais.
   - **Nota (achado durante os testes)**: confirmei que `Codigo_Familia` do artigo aponta *quase sempre* para o Grau 4, com uma pequena excepção residual entretanto corrigida pelo utilizador (secção 4/Riscos).
3. ~~Criar as tabelas de rastreio e triggers~~ — **concluído em 2026-07-02**, script em [sql/005_create_sync_tracking.sql](sql/005_create_sync_tracking.sql): `ZAPP_DBSiteCD_TArtigosSincro`/`TDatesSincro` + 6 triggers novos e dedicados (`Artigos`, `Lotes`, `LotesAcumul`, `PrecosVenda`, `ArmazArt`, `InfoCompArm`) — testados com alterações reais (no-op, sem efeito nos dados), confirmados a disparar correctamente sem tocar nos triggers/objectos existentes do ERP Gexor ou do Sincronizador `WEBSW_*`.
4. ~~Implementar sincronização inicial (Marcas/Modelos/Artigos/Variantes/Stock/Preços)~~ — **concluído em 2026-07-02**:
   - [sql/006_sync_marcas_modelos.sql](sql/006_sync_marcas_modelos.sql) — sincronização completa (`MERGE`, sem rastreio incremental, por serem tabelas pequenas): **155 Marcas, 105 Modelos**.
   - [sql/007_initial_load_artigos.sql](sql/007_initial_load_artigos.sql) — carga inicial completa via `MERGE` cruzando directamente `DBClassico` ↔ `DBSiteCD` (mesma instância TSERVER). Após a correcção do último artigo residual (secção 4/Riscos): **6881 Artigos publicados, 41174 Variantes/Lotes, 41174 linhas de Stock, 6881 Preços** — números finais, sem excepções pendentes. Corridas futuras do job de sincronização usam o delta de `ZAPP_DBSiteCD_TArtigosSincro` em vez de reprocessar tudo.
   - **Regra confirmada pelo utilizador (2026-07-02): `Preco_Outlet` arredondado sempre a múltiplos de 10 cêntimos** (`0,10, 0,20, ..., 0,90` ou `0,00`) — corrigida a fórmula em [sql/007_initial_load_artigos.sql](sql/007_initial_load_artigos.sql) (carga inicial) e [sync-service/src/sync.js](sync-service/src/sync.js) (recalculado automaticamente sempre que o artigo tem alteração de preço ou desconto e entra no delta), de `Preco * (1 - Desconto/100)` (arredondamento livre a 2 casas) para `ROUND(Preco * (1 - Desconto/100) * 100, -1) / 100.0`. Recalculados os 6881 preços já carregados — confirmado **0 valores fora da regra**.
   - **Regra confirmada pelo utilizador (2026-07-02): nenhum artigo pode ter preço de venda a 0€.** Implementada em [sync-service/src/sync.js](sync-service/src/sync.js) (`validarPrecoZero`) — despublica automaticamente (nunca apaga) qualquer artigo cujo `Preco` chegue a 0€, e dispara um alerta (secção 2.6/4). Reforçada defensivamente também em [sql/007_initial_load_artigos.sql](sql/007_initial_load_artigos.sql) para a carga inicial. **Testado de ponta a ponta com um artigo real** (`10002`): posto a 0€ na origem → sincronizado → despublicado automaticamente + alerta disparado → confirmado a desaparecer da API pública → preço reposto → sincronizado de novo → confirmado a reaparecer correctamente.
   - **Alertas em tempo real (WhatsApp, via CallMeBot)**: novo módulo [sync-service/src/alertas.js](sync-service/src/alertas.js), com um único ponto de entrada (`alertar(titulo, detalhe)`) já ligado a todas as falhas de sincronização (`logResultado` alerta automaticamente sempre que algum tipo falha) e à regra de preço zero. **CallMeBot escolhido por ser gratuito e não precisar de conta empresarial** (alternativa a Email, que também foi oferecida). Configuração pendente em `sync-service/.env` (`WHATSAPP_PHONE`, `WHATSAPP_APIKEY`) — **acção do utilizador**: guardar o contacto CallMeBot no WhatsApp, enviar "I allow callmebot to send me messages", e colar a apikey recebida. **Sem credenciais configuradas, os alertas ficam só registados no `log.txt`/`SyncLog`** (degradação graciosa, nunca falha a sincronização por causa de um alerta) — testado e confirmado a funcionar em modo "sem credenciais".
   - **Correcção de esquema durante a carga**: a constraint `UNIQUE` em `Artigos.Slug` rebentava com múltiplos `NULL` (particularidade do SQL Server — `UNIQUE CONSTRAINT` só permite 1 `NULL`, ao contrário do standard ANSI); substituída por um índice único filtrado (`WHERE Slug IS NOT NULL`), corrigido em [sql/001_create_dbsitecd.sql](sql/001_create_dbsitecd.sql) para futuras instalações.
5. ~~Implementar leitura/extracção das imagens~~ — **imagem principal concluída em 2026-07-02**: criado o início do serviço Node.js em [sync-service/](sync-service/) (`package.json`, ligação `mssql` em [sync-service/src/db.js](sync-service/src/db.js), extracção em [sync-service/src/extractMainImages.js](sync-service/src/extractMainImages.js)). Extraídas as **6881 imagens principais** (campo `image` da BD) para ficheiro em `storage/imagens/{Codigo_Artigo}-CD0.jpg` (**5.7 GB no total** — dado real a considerar no dimensionamento do storage S3-compatible da Fase 2, secção 2.5) e registadas em `ZAPP_DBSiteCD_Imagens`. **Falta ainda**: ler a directoria `Cod_Artigo-CD*.jpg` para as imagens 2-9 — por decisão do utilizador, adiado para depois (não é a imagem principal, é a menos urgente).
6. ~~Implementar o job de sincronização incremental~~ — **concluído em 2026-07-02**:
   - [sync-service/src/sync.js](sync-service/src/sync.js) — lê o delta de `ZAPP_DBSiteCD_TArtigosSincro` desde o último marcador em `ZAPP_DBSiteCD_TDatesSincro`; sincroniza Marcas/Modelos (completo), garante a hierarquia de Família em falta (novas famílias entram com `Modalidade_Id`/`Genero_Id = NULL`, sinalizadas para classificação em Backoffice — secção 2.1.1 ponto 3), sincroniza Artigos/Variantes/Stock/Preços só dos códigos alterados, **despublica** (nunca apaga) artigos que deixaram de aparecer na View de origem — confirmado pelo utilizador (2026-07-02): isto acontece quando `Tipo_Artigo` muda de `'I'` para outro valor (ex.: `'A'`) na DBClassico — distinguindo `Eliminado_Na_Origem` consoante o artigo ainda existe ou não na DBClassico, e **apaga as imagens** (ficheiro + registo) dos artigos despublicados (secção 2.7).
   - **Sincronização da imagem principal também para artigos que continuam publicados** (esclarecido pelo utilizador, 2026-07-02): se a imagem for trocada ou apagada directamente na ficha do artigo (`Imagem_Art`) sem o artigo deixar de estar publicado, o job re-extrai/sobrescreve, ou remove do lado do site (ficheiro + registo), consoante o caso — não é só na despublicação do artigo. **Testado de ponta a ponta com um ciclo real** (remover imagem → sincronizar → confirmar remoção no site → repor imagem → sincronizar → confirmar reposição, artigo `10002`): funcionou correctamente nos dois sentidos.
   - [sync-service/src/logger.js](sync-service/src/logger.js) — grava em `log.txt` no mesmo formato do Sincronizador actual (`INICIO/FIM DE SINCRONISMO`, contagem por tipo), além do registo em `ZAPP_DBSiteCD_SyncLog`.
   - [sync-service/src/index.js](sync-service/src/index.js) — agendamento via `node-cron`, **de hora a hora por omissão** (`SYNC_CRON` configurável), com sincronização imediata ao arrancar (equivalente ao "Sincronizar agora" do Sincronizador actual), e proteção contra sobreposição de corridas.
   - **Testado de ponta a ponta com uma alteração real**: a reclassificação do artigo `9011` (secção 4/Riscos) ainda estava por processar quando os triggers foram criados — a primeira corrida do novo job apanhou-a correctamente (1 artigo + 12 lotes actualizados), confirmando o ciclo completo trigger → `TArtigosSincro` → job → `DBSiteCD`.
7. Testar sincronização com dados reais — validado (ponto 6); falta ainda testar em profundidade o caminho de despublicação/eliminação (`ArtigosSetNotInternet`/`ArtigosDeleted`) com um caso real, e confirmar que o site actual continua a funcionar sem qualquer alteração de comportamento (não há razão para achar que não, já que nada foi alterado nos objectos existentes, mas fica como validação final antes de produção).

### Fase 2 — Backend/API do site (2-4 semanas)
1. ~~Stack~~ — **Node.js confirmado**, Express (sem TypeScript, por consistência com o `sync-service` já implementado e menor atrito).
2. ~~API REST: listagem/pesquisa de artigos, ficha de artigo~~ — **concluído em 2026-07-02**, novo projecto em [api/](api/):
   - [sql/008_create_catalog_view.sql](sql/008_create_catalog_view.sql) — `ZAPP_DBSiteCD_VCatalogo` em `DBSiteCD`, junta Artigos+Preços+Marcas+hierarquia de Família, resolvendo Modalidade/Género herdados do Grau 3 com override do Grau 4 (caso "Clubes", secção 2.1.1).
   - [api/src/routes/artigos.js](api/src/routes/artigos.js) — `GET /api/artigos` (filtros: família, marca, modalidade, género, pesquisa livre incluindo texto do lote/variante, separadores Novidades/Outlet; ordenação: descrição/preço/família/género/modalidade; paginação) e `GET /api/artigos/:codigo` (ficha completa: variantes com stock disponível calculado, imagens).
   - **Testado com dados reais**: listagem (6881 artigos), filtro por marca, separador Outlet (3607 artigos em outlet), pesquisa livre ("futebol" → 42 resultados), filtro combinado modalidade+género, ficha de artigo com variantes e stock correctos, e as imagens estáticas servidas correctamente (`/imagens/*`).
   - ~~Carrinho/checkout/encomendas~~ — **concluído em 2026-07-02** (modo de teste, secção 2.4 revista): [api/src/routes/carrinho.js](api/src/routes/carrinho.js) (`GET`/`POST`/`PUT`/`DELETE /api/carrinho`, identificado por `Sessao_Id`) e [api/src/routes/encomendas.js](api/src/routes/encomendas.js) (`POST /api/encomendas` — checkout completo: cliente novo ou existente por email, morada, linhas, `GET /api/encomendas/:numero` para consulta).
   - **Decisão confirmada pelo utilizador (2026-07-02): pagamentos reais (MB WAY/Cartão/PayPal) adiados** — por agora só o método **"Dinheiro"** está activo (pagamento a cobrar na entrega/levantamento, sem gateway externo), para permitir testar todo o fluxo de compra sem depender de contas junto do Ifthenpay/Stripe/PayPal.
3. ~~Gestão de stock em tempo de checkout~~ — **concluído em 2026-07-02**: reserva atómica dentro de uma transacção SQL (`WITH (UPDLOCK, HOLDLOCK)` sobre `ZAPP_DBSiteCD_Stock`), valida disponibilidade (`Qtd_Disponivel - Qtd_Reservada`) antes de confirmar, evitando overselling entre checkouts concorrentes.
   - **Testado de ponta a ponta com dados reais**: adicionar ao carrinho → ver carrinho → checkout com sucesso (`ENC000002`, artigo `10034`/lote `BR44`) → disponibilidade correctamente descontada (1→0) → **segunda tentativa de compra do mesmo stock esgotado bloqueada correctamente** (`409 Stock insuficiente`) → dados de teste limpos no final (stock, encomenda, cliente, carrinho revertidos, sem deixar lixo em produção).
   - **Bug de esquema corrigido durante o teste**: `Pagamentos.Estado` (`VARCHAR(30)`) era curto demais para as mensagens de estado usadas — alargado para `VARCHAR(60)`, corrigido em [sql/001_create_dbsitecd.sql](sql/001_create_dbsitecd.sql) para futuras instalações.
4. Integração de pagamentos (Ifthenpay MB WAY/Multibanco, Stripe cartão, PayPal) — **adiado por decisão do utilizador** (ver ponto 2); precisa de contas/credenciais reais junto destes fornecedores, que só o utilizador pode criar. A rota de checkout já valida `metodoPagamento` contra uma lista de métodos activos (`['Dinheiro']`), pelo que activar cada gateway mais tarde é aditivo, não uma reescrita.
5. Notificações por email de confirmação de encomenda — por fazer.

### Fase 3 — Frontend (3-4 semanas, pode correr em paralelo com Fase 2)
1. ~~Wireframes/visual inspirado no puma.pt~~ — **concluído em 2026-07-02**: grelha de produtos, filtros laterais, ficha de artigo com selector de cor/tamanho, carrinho, checkout — implementado directamente em HTML/CSS/JS puro (sem framework, por consistência de "menor atrito" com o resto do projecto), em [frontend/](frontend/).
2. ~~Páginas: Home/Listagem, Ficha de Artigo, Carrinho, Checkout~~ — **concluído em 2026-07-02**:
   - [frontend/index.html](frontend/index.html) + [js/listagem.js](frontend/js/listagem.js) — grelha de produtos, filtros (Marca/Modalidade/Género via novos endpoints `GET /api/marcas|modalidades|generos` em [api/src/routes/filtros.js](api/src/routes/filtros.js)), separadores (Todos/Novidades/Outlet), pesquisa livre, ordenação, paginação — tudo reflectido no URL (permite partilhar/recarregar a pesquisa).
   - [frontend/artigo.html](frontend/artigo.html) + [js/artigo.js](frontend/js/artigo.js) — galeria, selector de variante (cor/tamanho, com opções esgotadas desactivadas), selector de quantidade, adicionar ao carrinho.
   - [frontend/carrinho.html](frontend/carrinho.html) e [frontend/checkout.html](frontend/checkout.html) — carrinho editável e checkout completo (dados de cliente, morada, método de pagamento — só "A Dinheiro" activo, os outros aparecem desactivados com "brevemente").
   - Servido por um pequeno servidor Express estático ([frontend/server.js](frontend/server.js)), separado da API (portas 3000/3001).
   - **Testado de ponta a ponta no browser real** (via preview): fluxo completo listagem → ficha de artigo → selecção de variante → carrinho → checkout → confirmação de encomenda (`ENC000003`), com o total, stock e mensagens todos corretos; dados de teste limpos no final.
   - **Bug de encoding encontrado e corrigido durante o teste**: os URLs de imagem gerados pela API eram relativos (`/imagens/...`), o que funcionava por acaso quando testado directamente na API mas quebrava no frontend (porta diferente) — corrigido para URL absoluto (`IMAGES_BASE_URL` no `.env` da API).
   - **Bug de dados mais sério encontrado e corrigido durante o teste**: 5 Modalidades com acentos (Aeróbica, Ginásio, Ginástica, Natação, Ténis) tinham sido gravadas com mojibake na carga inicial (`sqlcmd -i` sem `-f i:65001`) — e, pior, o classificador ([classify_familias.py](sql/classify_familias.py)) usava internamente as formas sem acento para a pesquisa SQL (`WHERE Titulo = N'Ginasio'`), que nunca correspondiam ao valor real na BD (`'Ginásio'`) — como resultado, **estas 5 modalidades nunca tinham ficado associadas a nenhuma família**, apesar de o relatório de classificação parecer correcto (o relatório usa a lista interna do Python, não faz round-trip pela BD). Corrigido: (a) valores de texto reparados directamente na BD, (b) lista `MODALIDADES` do classificador actualizada para usar as formas acentuadas correctas, (c) condição do `UPDATE` alargada para também disparar quando `Modalidade_Id`/`Genero_Id` está `NULL` (antes só disparava se o texto da família mudasse) — sem esta última correcção, o reprocessamento não teria corrigido os dados já carregados. Recarregado com sucesso: Ginásio (1+1), Ginástica (16+16), Natação (9+9), Ténis (49+49) famílias agora correctamente associadas.
3. ~~Backoffice interno simples~~ — **concluído em 2026-07-02**, em [frontend/admin.html](frontend/admin.html) + [js/admin.js](frontend/js/admin.js), com API dedicada em [api/src/routes/admin.js](api/src/routes/admin.js) (sem autenticação por agora — ambiente de testes local; **a acrescentar antes de ir para produção**, Fase 4/5):
   - **Configurações**: "Novidades = últimos N dias" editável, gravado em nova tabela [sql/010_create_config.sql](sql/010_create_config.sql) (`ZAPP_DBSiteCD_Config`), lido dinamicamente pela API pública em vez de fixo por variável de ambiente.
   - **Famílias por Classificar**: lista as famílias com artigos publicados reais mas sem Modalidade e/ou Género atribuídos, ordenadas por nº de artigos afectados, com formulário para classificar.
   - **Gestão de Artigos**: pesquisa por código/descrição, publicar/despublicar manualmente, forçar "Novidade" (Sim/Não/Automático).
   - **Log de Sincronização**: consulta a `ZAPP_DBSiteCD_SyncLog` (as mesmas 7 categorias do Sincronizador actual).
   - **Testado de ponta a ponta no browser**: classificar uma família (Género gravado e confirmado na BD), despublicar/republicar um artigo (confirmado a desaparecer/reaparecer na API pública), consulta ao log.
   - **Dois bugs reais encontrados e corrigidos durante o teste**:
     1. O formulário de "Famílias por Classificar" não pré-seleccionava a Modalidade/Género já existente (herdado do Grau 3) — **risco real de perda de dados**: gravar sem tocar apagaria um valor já correcto para `NULL`. Corrigido devolvendo o valor actual da API e pré-seleccionando no formulário.
     2. Essa correcção revelou um problema mais subtil: a lista `/api/generos` agrupa por Título+Tag (para não repetir "Homem"/"Senhora" duas vezes no filtro do site, uma por Calçado outra por Têxtil) e escolhe arbitrariamente o `Id` mais baixo — que pode ser de uma categoria diferente da realmente associada à família, fazendo a comparação por `Id` falhar silenciosamente. Corrigido comparando por **Título** em vez de `Id` para a pré-selecção (o `Id` gravado no fim pode ficar associado à categoria "errada", mas sem impacto funcional, já que nada no site filtra Género por Categoria).
   - **Nota**: durante os testes voltou a aparecer um alarme falso de "corrupção de acentuação" (`LIKE '%Ã%'`) — "PAVILHÃO"/"NATAÇÃO" são grafias correctas em maiúsculas; o teste de deteção fiável usa os pares de bytes específicos do mojibake (`Ã¡`, `Ã©`, `Ã§`, etc.), não a simples presença de `Ã`. Confirmado com o teste correcto: **zero corrupção real** em todas as tabelas de família.

### Fase 4 — Testes Internos Locais (2 semanas)
1. Instalação completa em CDSERVER.
2. Testes de carga ligeira, testes de sincronização (alterar stock/preço na DBClassico e confirmar reflexo no site).
3. Testes de encomenda ponta a ponta com os 3 meios de pagamento (em modo sandbox/teste).
4. Correções e ajustes de UI/UX.

### Fase 5 — Ir para Produção (1-2 semanas)
1. Registar domínio.
2. Contratar hosting de baixo custo.
3. Configurar SSL, backups automáticos da `DBSiteCD`, monitorização básica (uptime).
4. Publicar, testar em produção com encomendas reais de baixo valor.
5. Formação da equipa que vai gerir o Backoffice.

### Fase 6 — Evolução (contínuo)
- Motor de pesquisa mais rico se o catálogo crescer.
- App/PWA.
- Programas de desconto/cupões.
- Analytics de vendas.

---

## 4. Riscos e Pontos de Atenção

- **Overselling**: stock por lote precisa de reserva atómica no checkout (transação SQL com lock, ou fila) para não vender o que já não existe entre o momento da sincronização e o momento da compra.
- **Cor/Tamanho sem filtro facetado**: por decisão confirmada, não se faz parsing de `Descricao_Lote` — a pesquisa de variantes é por texto livre. Isto significa que o site **não terá**, no MVP, um filtro tipo "checkboxes de cor" como o puma.pt tem; a selecção de cor/tamanho acontece na ficha do artigo. Definir expectativa com o utilizador para não ser surpresa mais tarde.
- **Mapeamento Codigo_Desconto_Art → percentagem**: confirmar se a relação código→percentagem é sempre directa e literal (código "05" = 5%, "20" = 20%) para todos os códigos existentes, ou se há excepções/tabela de referência a consultar — validar com uma amostra real de `Codigo_Desconto_Art` distintos antes de fechar a lógica de Outlet na View.
- **Classificação de famílias desactualizada**: se a DBClassico criar uma família nova e ninguém a classificar em Backoffice, os artigos dessa família continuam publicados mas sem Modalidade/Género (não aparecem nesses filtros até serem classificados) — mitigado pelo aviso automático no `ZAPP_DBSiteCD_SyncLog`, mas depende de alguém rever essa lista com regularidade. Sugestão: alerta por email quando houver famílias por classificar.
- **Casos combinados na hierarquia** (ex.: `Codigo_Familia = 121` "SAPATILHAS TÉNIS-PADEL HOMEM" combina duas modalidades): resolvidos manualmente ao classificar a família (secção 2.1.1), não têm impacto em tempo de sincronização.
- **Clubes/Electrónica fora do âmbito original**: confirmar se ficam no site (ver Fase 0) — se não, basta excluir `Codigo_Familia` com Grau 1 `5` e `7` da View/job. **"Equipamentos" (Grau 1 `9`) já está decidida como excluída** — falta só reflectir isso na View `ZAPP_DBSiteCD_VArtigos` (excluir `Codigo_Familia` cuja raiz seja `9`).
- ~~39 artigos com `Codigo_Familia` em Grau 2/3 em vez de Grau 4~~ — **corrigido pelo utilizador em 2026-07-02** directamente na DBClassico (os 9 fora da categoria "Equipamentos" foram reclassificados para Grau 4; criou a família nova `3349` "T-s Rapariga Licra/Poliester" e renomeou a `3329` para "T-s Senhora Licra/Poliester"). Verificado: **0 artigos restantes fora de Grau 4**, excluindo a categoria "Equipamentos" (já decidida como fora do site). `DBSiteCD` já reflecte estas alterações (script de carga passou a fazer `UPDATE` além de `INSERT`, para apanhar também renomeações de famílias existentes, não só famílias novas).
- **Imagens em falta**: prever imagem "placeholder" quando não existir `Cod_Artigo-CD*.jpg` nem imagem na BD.
- **Segurança**: acesso à DBClassico deve ser só de leitura, credenciais dedicadas, e nunca exposto directamente à internet.
- **Triggers novos nas tabelas base (secção 2.6.1)**: é a única alteração feita à DBClassico (criação de triggers `ZAPP_DBSiteCD_*` adicionais, sem tocar nos existentes) — risco de impacto em performance de escrita nas tabelas base se mal desenhados, ou de conflito subtil com os triggers já existentes que alimentam `WEBSW_*`. Mitigação: desenvolver e testar exaustivamente numa cópia/ambiente de testes da DBClassico antes de aplicar em produção, e rever com quem gere o ERP antes de avançar.

---

## 5. Próximos Passos Imediatos

1. Validar amostra real de `Codigo_Desconto_Art` (ponto 4 da Fase 0).
2. **Confirmar se dá para aceder/migrar a associação Família↔Modalidade↔Género já existente na BD do site actual (Incentea)** — decide se a classificação das ~650 famílias é uma migração rápida ou um trabalho de classificação manual do zero a partir de [dados/TB0001StkFamilias_export.tsv](dados/TB0001StkFamilias_export.tsv) (posso preparar uma primeira classificação semi-automática para revisão, se for esse o caminho).
3. Confirmar se Clubes/Electrónica entram no MVP.
4. **Esclarecer como são alimentadas `WEBSW_TArtigosSincro`/`WEBSW_TDatesSincro`** (triggers vs. job periódico) — só para referência de desenho dos novos objectos `ZAPP_DBSiteCD_*` (secção 2.6.1); confirmado que não serão reaproveitadas nem alteradas.
5. Assim que houver acesso de leitura à DBClassico, começamos pela Fase 1 (criação das Views `ZAPP_DBSiteCD_V*` e da `DBSiteCD`), já com todas as regras de negócio e a stack (Node.js) definidas.
