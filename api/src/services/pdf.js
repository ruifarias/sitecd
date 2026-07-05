// Exportação da encomenda em PDF (estilo factura), usando pdfkit (não requer
// motor de renderização externo). Imagens dos artigos são lidas directamente
// do disco (storage/imagens), não via HTTP, para evitar dependência de rede.
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { obterEncomendaCompleta } = require('./encomendaService');
const { EMPRESA, formatarPreco, formatarData, separarNomeVariante } = require('./email');
const { ESTADOS_LABELS } = require('../constants/encomendaEstados');

const PASTA_IMAGENS = path.resolve(__dirname, '..', '..', '..', 'storage', 'imagens');
const CAMINHO_LOGO = path.resolve(__dirname, '..', '..', '..', 'frontend', 'imagens', 'logo-transparente.png');

function caminhoLocalImagem(urlImagem) {
  if (!urlImagem) return null;
  const nomeFicheiro = urlImagem.split('/').pop();
  const caminho = path.join(PASTA_IMAGENS, nomeFicheiro);
  return fs.existsSync(caminho) ? caminho : null;
}

async function gerarPdfEncomenda(numero) {
  const encomenda = await obterEncomendaCompleta(numero);
  if (!encomenda) return null;

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const fimPromise = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const larguraUtil = doc.page.width - 80;

  // Cabeçalho: logo + número/data
  if (fs.existsSync(CAMINHO_LOGO)) {
    doc.image(CAMINHO_LOGO, 40, 40, { width: 80 });
  }
  doc.fontSize(10).font('Helvetica-Bold').text('Nº Encomenda', 350, 42, { width: 200, align: 'right' });
  doc.fontSize(16).text(encomenda.numero, 350, 56, { width: 200, align: 'right' });
  doc.fontSize(10).font('Helvetica-Bold').text('Data', 350, 80, { width: 200, align: 'right' });
  doc.fontSize(10).font('Helvetica').text(formatarData(encomenda.data), 350, 94, { width: 200, align: 'right' });

  let y = 175;

  // Empresa (esquerda) / Cliente (direita)
  doc.fontSize(9).font('Helvetica-Bold').text(EMPRESA.nome, 40, y, { width: 260 });
  doc.font('Helvetica').text(EMPRESA.morada, 40, doc.y, { width: 260 });
  doc.text(EMPRESA.localidade, 40, doc.y, { width: 260 });
  doc.text(EMPRESA.pais, 40, doc.y, { width: 260 });
  doc.text(`NIF/NIPC: ${EMPRESA.nif}`, 40, doc.y, { width: 260 });
  doc.text(`Tel: ${EMPRESA.telefone}`, 40, doc.y, { width: 260 });
  doc.text(EMPRESA.email, 40, doc.y, { width: 260 });

  doc.fontSize(9).font('Helvetica-Bold').text('Exmo(s) Senhor(es)', 320, y, { width: 235 });
  doc.font('Helvetica').text(encomenda.cliente.nome, 320, doc.y, { width: 235 });
  doc.text(encomenda.morada.morada || '-', 320, doc.y, { width: 235 });
  doc.text(`${encomenda.morada.codigoPostal || ''} ${encomenda.morada.localidade || ''}`, 320, doc.y, { width: 235 });
  doc.text('Portugal', 320, doc.y, { width: 235 });
  doc.moveDown(0.5);
  doc.text(`Nº Contribuinte: ${encomenda.cliente.nif || '-'}`, 320, doc.y, { width: 235 });
  doc.text(`Email: ${encomenda.cliente.email}`, 320, doc.y, { width: 235 });

  // Tabela de artigos
  y = 260;
  const colunas = [
    { titulo: 'Descrição', largura: 210 },
    { titulo: 'Código', largura: 80 },
    { titulo: 'Pr. Unit.', largura: 75, alinhar: 'right' },
    { titulo: 'Qtd', largura: 40, alinhar: 'center' },
    { titulo: 'Pr. Total', largura: 80, alinhar: 'right' },
  ];

  doc.rect(40, y, larguraUtil, 20).fill('#f5f5f5');
  doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
  let x = 40;
  colunas.forEach((col) => {
    doc.text(col.titulo, x + 4, y + 6, { width: col.largura - 8, align: col.alinhar || 'left' });
    x += col.largura;
  });
  y += 24;

  doc.font('Helvetica').fontSize(9);
  for (const linha of encomenda.linhas) {
    const alturaLinha = 40;
    if (y + alturaLinha > doc.page.height - 150) {
      doc.addPage();
      y = 40;
    }

    const imagemLocal = caminhoLocalImagem(linha.imagem);
    if (imagemLocal) {
      try { doc.image(imagemLocal, 40, y + 4, { width: 28, height: 28 }); } catch (_) { /* imagem inválida, ignora */ }
    }

    const { nome, variante } = separarNomeVariante(linha.descricao);
    x = 40;
    doc.fillColor('#000').text(nome, x + 34, y + 6, { width: colunas[0].largura - 38 });
    if (variante) {
      doc.fillColor('#777').text(variante, x + 34, doc.y, { width: colunas[0].largura - 38 });
      doc.fillColor('#000');
    }
    x += colunas[0].largura;
    doc.text(`${linha.codigoArtigo} | ${linha.codigoLote}`, x + 4, y + 8, { width: colunas[1].largura - 8 });
    x += colunas[1].largura;
    doc.text(formatarPreco(linha.precoUnitario), x, y + 8, { width: colunas[2].largura - 4, align: 'right' });
    x += colunas[2].largura;
    doc.text(String(linha.quantidade), x, y + 8, { width: colunas[3].largura, align: 'center' });
    x += colunas[3].largura;
    doc.text(formatarPreco(linha.precoTotal), x, y + 8, { width: colunas[4].largura - 4, align: 'right' });

    doc.moveTo(40, y + alturaLinha).lineTo(40 + larguraUtil, y + alturaLinha).strokeColor('#eee').stroke();
    y += alturaLinha;
  }

  y += 16;
  const totalProdutos = encomenda.linhas.reduce((s, l) => s + l.precoTotal, 0);

  // IVA (esquerda) / Totais (direita)
  doc.fontSize(9).font('Helvetica-Bold').text('Taxa de IVA', 40, y);
  doc.font('Helvetica').text(`${encomenda.taxaIva.toFixed(2)} %`, 150, y);
  doc.font('Helvetica-Bold').text('Base de Incidência', 40, y + 14);
  doc.font('Helvetica').text(formatarPreco(encomenda.baseIncidencia), 150, y + 14);
  doc.font('Helvetica-Bold').text('Valor IVA', 40, y + 28);
  doc.font('Helvetica').text(formatarPreco(encomenda.valorIva), 150, y + 28);

  doc.font('Helvetica').fontSize(9).text('Total de Compras', 320, y, { width: 150, align: 'left' });
  doc.text(formatarPreco(totalProdutos), 460, y, { width: 95, align: 'right' });
  let yDireita = y + 14;
  if (encomenda.valeDesconto > 0) {
    doc.text(`Desconto (vale ${encomenda.valeCodigo})`, 320, yDireita, { width: 150 });
    doc.text(`-${formatarPreco(encomenda.valeDesconto)}`, 460, yDireita, { width: 95, align: 'right' });
    yDireita += 14;
  }
  doc.text('Embalagem e Envio', 320, yDireita, { width: 150 });
  doc.text(formatarPreco(encomenda.portes), 460, yDireita, { width: 95, align: 'right' });
  yDireita += 18;
  doc.fontSize(11).font('Helvetica-Bold').text('Valor a Pagar', 320, yDireita, { width: 150 });
  doc.text(formatarPreco(encomenda.total), 460, yDireita, { width: 95, align: 'right' });
  doc.fontSize(9).font('Helvetica').fillColor('#777').text('IVA incluído', 320, yDireita + 16);
  doc.fillColor('#000');

  y += 80;

  // Local de entrega
  doc.fontSize(9).font('Helvetica-Bold').text('Local de Entrega', 40, y);
  doc.font('Helvetica').fontSize(9);
  doc.text(`Nome: ${encomenda.cliente.nome}`, 40, y + 14);
  doc.text(`Morada: ${encomenda.morada.morada || '-'}`, 40, y + 27);
  doc.text(`Código Postal: ${encomenda.morada.codigoPostal || '-'}    Localidade: ${encomenda.morada.localidade || '-'}`, 40, y + 40);
  doc.text(`País: Portugal    Telemóvel: ${encomenda.cliente.telefone || '-'}    Email: ${encomenda.cliente.email}`, 40, y + 53);

  y += 76;
  doc.font('Helvetica-Bold').text('Método de Pagamento', 40, y);
  doc.font('Helvetica').text(encomenda.metodoPagamento, 40, y + 14);

  y += 36;
  const estadoLabel = ESTADOS_LABELS[encomenda.estado] || encomenda.estado;
  doc.font('Helvetica-Bold').text('Estado Actual', 40, y);
  doc.font('Helvetica').text(estadoLabel, 40, y + 14);
  if (encomenda.estado === 'Anulada' && encomenda.motivoAnulacao) {
    doc.font('Helvetica-Bold').fillColor('#c0392b').text(`Motivo da anulação: ${encomenda.motivoAnulacao}`, 40, y + 28, { width: larguraUtil });
    doc.fillColor('#000');
  }

  doc.end();
  return fimPromise;
}

module.exports = { gerarPdfEncomenda };
