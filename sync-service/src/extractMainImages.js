// Extrai a imagem principal (Imagem_Art, campo 'image' na DBClassico) de cada
// artigo publicado, grava-a como ficheiro em disco (IMAGES_DIR) e regista o
// caminho em ZAPP_DBSiteCD_Imagens (Ordem = 0).
// Ver PLANO_PROJETO.md secção 2.7.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getDBClassicoPool, getDBSiteCDPool } = require('./db');

async function main() {
  const imagesDir = path.resolve(__dirname, '..', process.env.IMAGES_DIR);
  fs.mkdirSync(imagesDir, { recursive: true });

  const classico = await getDBClassicoPool();
  const sitecd = await getDBSiteCDPool();

  console.log('A ler imagens principais de DBClassico.ZAPP_DBSiteCD_VImagemPrincipal...');
  const result = await classico.request().query(
    'SELECT Code_Artigo, Imagem FROM dbo.ZAPP_DBSiteCD_VImagemPrincipal'
  );

  console.log(`Encontradas ${result.recordset.length} imagens.`);

  let gravadas = 0;
  let erros = 0;

  for (const row of result.recordset) {
    try {
      const codigo = row.Code_Artigo.trim();
      const buffer = row.Imagem;
      if (!buffer || buffer.length === 0) continue;

      const fileName = `${codigo}-CD0.jpg`;
      const filePath = path.join(imagesDir, fileName);
      fs.writeFileSync(filePath, buffer);

      const relativePath = `imagens/${fileName}`;
      await sitecd.request()
        .input('codigo', codigo)
        .input('caminho', relativePath)
        .query(`
          MERGE dbo.ZAPP_DBSiteCD_Imagens AS tgt
          USING (SELECT @codigo AS Codigo_Artigo, 0 AS Ordem) AS src
              ON tgt.Codigo_Artigo = src.Codigo_Artigo AND tgt.Ordem = src.Ordem
          WHEN MATCHED THEN UPDATE SET tgt.Path = @caminho, tgt.Data_Sincronizacao = GETDATE()
          WHEN NOT MATCHED BY TARGET AND EXISTS (SELECT 1 FROM dbo.ZAPP_DBSiteCD_Artigos a WHERE a.Codigo_Artigo = @codigo)
              THEN INSERT (Codigo_Artigo, Ordem, Path) VALUES (@codigo, 0, @caminho);
        `);
      gravadas++;
      if (gravadas % 500 === 0) console.log(`  ...${gravadas} imagens processadas`);
    } catch (err) {
      erros++;
      console.error(`Erro no artigo ${row.Code_Artigo}: ${err.message}`);
    }
  }

  console.log(`Concluído: ${gravadas} imagens gravadas, ${erros} erros.`);

  await classico.close();
  await sitecd.close();
}

main().catch((err) => {
  console.error('Falha na extracção de imagens:', err);
  process.exit(1);
});
