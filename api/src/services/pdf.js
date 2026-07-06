// Exportação da encomenda em PDF (estilo factura), usando pdfkit (não requer
// motor de renderização externo). Imagens dos artigos são lidas directamente
// do disco (storage/imagens), não via HTTP, para evitar dependência de rede.
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { obterEncomendaCompleta } = require('./encomendaService');
const { EMPRESA, formatarPreco, formatarData, separarNomeVariante } = require('./email');
const { ESTADOS_LABELS, ehEstadoDevolucao } = require('../constants/encomendaEstados');

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

  let y = 115;

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
  doc.text(`Código de Cliente: ${encomenda.cliente.codigoCliente || '-'}`, 320, doc.y, { width: 235 });

  // Tabela de artigos
  y = 212;
  const colunas = [
    { titulo: 'Código', largura: 50 },
    { titulo: 'Artigo', largura: 248 },
    { titulo: 'Qtd', largura: 25, alinhar: 'center' },
    { titulo: 'Preço Venda', largura: 62, alinhar: 'right' },
    { titulo: 'Desc.', largura: 60, alinhar: 'right' },
    { titulo: 'Valor Líquido', largura: 70, alinhar: 'right' },
  ];

  doc.rect(40, y, larguraUtil, 20).fill('#f5f5f5');
  doc.fillColor('#000').fontSize(9).font('Helvetica');
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
      try { doc.image(imagemLocal, 40, y + 1, { width: 20, height: 20 }); } catch (_) { /* imagem inválida, ignora */ }
    }

    x = 40;
    doc.fillColor('#000').fontSize(8).text(linha.codigoArtigo, x, y + 26, { width: colunas[0].largura - 4 });
    x += colunas[0].largura;

    const { nome, variante } = separarNomeVariante(linha.descricao);
    doc.fontSize(9).fillColor('#000').text(nome, x + 4, y + 6, { width: colunas[1].largura - 8 });
    if (variante) {
      doc.fillColor('#1a5fb4').text(variante, x + 4, doc.y, { width: colunas[1].largura - 8 });
      doc.fillColor('#000');
    }
    x += colunas[1].largura;

    doc.text(String(linha.quantidade), x, y + 8, { width: colunas[2].largura, align: 'center' });
    x += colunas[2].largura;

    doc.text(formatarPreco(linha.precoVenda), x, y + 8, { width: colunas[3].largura - 4, align: 'right' });
    x += colunas[3].largura;

    doc.text(linha.descontoPercentagem > 0 ? `-${linha.descontoPercentagem}%` : '0%', x, y + 8, { width: colunas[4].largura - 4, align: 'right' });
    x += colunas[4].largura;

    doc.text(formatarPreco(linha.precoTotal), x, y + 8, { width: colunas[5].largura - 4, align: 'right' });

    doc.moveTo(40, y + alturaLinha).lineTo(40 + larguraUtil, y + alturaLinha).strokeColor('#eee').stroke();
    y += alturaLinha;
  }

  y += 16;
  const totalProdutos = encomenda.linhas.reduce((s, l) => s + l.precoTotal, 0);

  // IVA (esquerda) / Totais (direita) - "Sub-total dos Artigos"/"Portes"/"Total"
  // usam exactamente a mesma posição/largura da coluna "Valor Líquido" da
  // tabela acima, para ficarem alinhados com os valores de cada artigo.
  const xValorTotais = 40 + colunas.slice(0, 5).reduce((s, c) => s + c.largura, 0);
  const larguraValorTotais = colunas[5].largura - 4;
  const xLabelTotais = 320;
  const larguraLabelTotais = xValorTotais - xLabelTotais - 10;

  doc.fontSize(9).font('Helvetica-Bold').text('Base de Incidência', 40, y);
  doc.font('Helvetica').text(formatarPreco(encomenda.baseIncidencia), 150, y);
  doc.font('Helvetica-Bold').text('Taxa de IVA', 40, y + 14);
  doc.font('Helvetica').text(`${encomenda.taxaIva.toFixed(2)} %`, 150, y + 14);
  doc.font('Helvetica-Bold').text('Valor do IVA', 40, y + 28);
  doc.font('Helvetica').text(formatarPreco(encomenda.valorIva), 150, y + 28);

  doc.font('Helvetica').fontSize(9).text('Sub-total dos Artigos', xLabelTotais, y, { width: larguraLabelTotais, align: 'left' });
  doc.text(formatarPreco(totalProdutos), xValorTotais, y, { width: larguraValorTotais, align: 'right' });
  let yDireita = y + 14;
  if (encomenda.valeDesconto > 0) {
    doc.text(`Desconto (vale ${encomenda.valeCodigo})`, xLabelTotais, yDireita, { width: larguraLabelTotais });
    doc.text(`-${formatarPreco(encomenda.valeDesconto)}`, xValorTotais, yDireita, { width: larguraValorTotais, align: 'right' });
    yDireita += 14;
  }
  doc.text('Portes', xLabelTotais, yDireita, { width: larguraLabelTotais });
  doc.text(formatarPreco(encomenda.portes), xValorTotais, yDireita, { width: larguraValorTotais, align: 'right' });
  yDireita += 18;
  doc.fontSize(11).font('Helvetica-Bold').text('Total', xLabelTotais, yDireita, { width: larguraLabelTotais });
  doc.text(formatarPreco(encomenda.total), xValorTotais, yDireita, { width: larguraValorTotais, align: 'right' });
  doc.fontSize(9).font('Helvetica').fillColor('#777').text('IVA incluído nos preços', xLabelTotais, yDireita + 16);
  if (ehEstadoDevolucao(encomenda.estado)) {
    doc.text('Os portes de envio não são devolvidos nem estão sujeitos a crédito.', xLabelTotais, yDireita + 30, { width: larguraUtil - (xLabelTotais - 40) });
  }
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

  if (encomenda.devolucao) {
    doc.font('Helvetica-Bold').text('Dados Bancários para Reembolso', 40, y);
    doc.font('Helvetica').text(`IBAN: ${encomenda.devolucao.iban}`, 40, y + 14);
    doc.text(`Nome do 1º Titular da Conta: ${encomenda.devolucao.nomeTitular}`, 40, y + 27);
    y += 50;
  }

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
  if (encomenda.estado === 'DevolucaoRecebidaNaoAceite' && encomenda.motivoAnulacao) {
    doc.font('Helvetica-Bold').fillColor('#c0392b').text(`Motivo da não aceitação: ${encomenda.motivoAnulacao}`, 40, y + 28, { width: larguraUtil });
    doc.fillColor('#000');
  }

  doc.end();
  return fimPromise;
}

module.exports = { gerarPdfEncomenda };
