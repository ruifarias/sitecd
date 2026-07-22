const fs = require('fs');
const path = require('path');

// Base URL das imagens derivada do próprio pedido (protocolo+host:porta que o
// cliente usou para chegar à API), em vez de um IP fixo em IMAGES_BASE_URL -
// isto garante que funciona tanto em LAN (IP local) como via VPN/Tailscale,
// sem depender de qual rede o browser está a usar para chegar ao servidor.
function imagensBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}/imagens`;
}

const PASTA_IMAGENS = path.resolve(__dirname, '..', '..', '..', 'storage', 'imagens');
const MAX_IMAGENS_ADICIONAIS = 9;

// Imagem principal (CD0) é sincronizada automaticamente da DBClassico (ver
// sync-service/extractMainImages.js), com registo em ZAPP_DBSiteCD_Imagens.
// Fotos adicionais (CD1, CD2, ...) não têm esse processo - são colocadas à
// mão na pasta de imagens, seguindo a mesma convenção de nome, e detectadas
// aqui directamente no disco (sem precisar de gravar nada na BD).
function listarImagensAdicionais(codigo) {
  const adicionais = [];
  for (let n = 1; n <= MAX_IMAGENS_ADICIONAIS; n++) {
    const nomeFicheiro = `${codigo}-CD${n}.jpg`;
    if (fs.existsSync(path.join(PASTA_IMAGENS, nomeFicheiro))) {
      adicionais.push({ ordem: n, path: `imagens/${nomeFicheiro}` });
    }
  }
  return adicionais;
}

module.exports = { imagensBaseUrl, listarImagensAdicionais };
