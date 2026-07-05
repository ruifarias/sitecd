// Envio de emails de encomenda (confirmação inicial, mudança de estado,
// anulação com motivo) - estilo factura, com imagens dos artigos e IVA
// discriminado. Se SMTP_HOST não estiver definido, não bloqueia nem falha a
// operação - apenas regista um aviso.
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { ESTADOS_LABELS } = require('../constants/encomendaEstados');
const { obterEncomendaCompleta } = require('./encomendaService');

const EMPRESA = {
  nome: 'CLÁSSICO DESPORTIVO, Comércio de Artigos de Desporto, Lda.',
  morada: 'Rua Tenente Cabeleira Filipe, 1-A',
  localidade: '2430-306 Marinha Grande',
  pais: 'Portugal',
  nif: 'PT 505 794 268',
  telefone: '244 566 945',
  email: 'geral@classicodesportivo.pt',
};

const CAMINHO_LOGO = path.resolve(__dirname, '..', '..', '..', 'frontend', 'imagens', 'logo-transparente.png');

function getTransporte() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function formatarPreco(valor) {
  return Number(valor || 0).toFixed(2).replace('.', ',') + ' €';
}

function formatarData(data) {
  return new Date(data).toLocaleDateString('pt-PT');
}

// A descrição da linha é guardada como "Nome do Artigo - Descrição do Lote"
// (ver routes/encomendas.js) - separa-se aqui para mostrar o lote/variante
// numa segunda linha, mais pequena, por baixo do nome do artigo.
function separarNomeVariante(descricao) {
  // Primeira ocorrência: o nome do artigo vem sempre antes, e a descrição do
  // lote (cor/tamanho) pode ter os seus próprios " - " (ex: "PRETO - 2 x 5Kg").
  const indice = descricao.indexOf(' - ');
  if (indice === -1) return { nome: descricao, variante: '' };
  return { nome: descricao.slice(0, indice), variante: descricao.slice(indice + 3) };
}

function templateFactura(encomenda, { tituloEvento, notaEvento } = {}) {
  const totalProdutos = encomenda.linhas.reduce((s, l) => s + l.precoTotal, 0);

  const linhasHtml = encomenda.linhas.map((l) => {
    const { nome, variante } = separarNomeVariante(l.descricao);
    return `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">
        ${l.imagem ? `<img src="${l.imagem}" width="48" height="48" style="object-fit:contain;border:1px solid #eee" alt="">` : ''}
      </td>
      <td style="padding:8px;border-bottom:1px solid #eee">
        ${nome}
        ${variante ? `<br><span style="color:#777;font-size:12px">${variante}</span>` : ''}
      </td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${l.codigoArtigo} | ${l.codigoLote}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${formatarPreco(l.precoUnitario)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${l.quantidade}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${formatarPreco(l.precoTotal)}</td>
    </tr>
  `;
  }).join('');

  const estadoLabel = ESTADOS_LABELS[encomenda.estado] || encomenda.estado;

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;color:#222;font-size:13px">

    ${tituloEvento ? `
      <div style="background:${encomenda.estado === 'Anulada' ? '#f8d7da' : '#111'};color:${encomenda.estado === 'Anulada' ? '#721c24' : '#fff'};padding:14px 18px;margin-bottom:20px;font-size:15px;font-weight:700">
        ${tituloEvento}
      </div>
    ` : ''}

    ${notaEvento ? `<p style="margin-bottom:16px">${notaEvento}</p>` : ''}

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr>
        <td style="vertical-align:top;width:55%">
          <img src="cid:logo-empresa" width="70" alt="Clássico Desportivo">
        </td>
        <td style="vertical-align:top;text-align:right">
          <strong style="font-size:15px">Nº Encomenda</strong><br>
          <span style="font-size:18px;font-weight:700">${encomenda.numero}</span><br><br>
          <strong>Data</strong><br>${formatarData(encomenda.data)}
        </td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr>
        <td style="vertical-align:top;width:50%;padding-right:20px">
          <strong>${EMPRESA.nome}</strong><br>
          ${EMPRESA.morada}<br>
          ${EMPRESA.localidade}<br>
          ${EMPRESA.pais}<br>
          NIF/NIPC: ${EMPRESA.nif}<br>
          Tel: ${EMPRESA.telefone}<br>
          ${EMPRESA.email}
        </td>
        <td style="vertical-align:top;width:50%">
          <strong>Exmo(s) Senhor(es)</strong><br>
          ${encomenda.cliente.nome}<br>
          ${encomenda.morada.morada || '-'}<br>
          ${encomenda.morada.codigoPostal || ''} ${encomenda.morada.localidade || ''}<br>
          Portugal<br><br>
          Nº Contribuinte: ${encomenda.cliente.nif || '-'}<br>
          Email: ${encomenda.cliente.email}
        </td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <thead>
        <tr style="background:#f5f5f5">
          <th style="padding:8px;text-align:center">Imagem</th>
          <th style="padding:8px;text-align:left">Descrição</th>
          <th style="padding:8px;text-align:center">Código</th>
          <th style="padding:8px 10px;text-align:right;white-space:nowrap">Pr. Unit.</th>
          <th style="padding:8px;text-align:center">Qtd</th>
          <th style="padding:8px 10px;text-align:right;white-space:nowrap">Pr. Total</th>
        </tr>
      </thead>
      <tbody>${linhasHtml}</tbody>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr>
        <td style="vertical-align:top;width:50%">
          <strong>Taxa de IVA</strong> ${encomenda.taxaIva.toFixed(2)} %<br>
          <strong>Base de Incidência</strong> ${formatarPreco(encomenda.baseIncidencia)}<br>
          <strong>Valor IVA</strong> ${formatarPreco(encomenda.valorIva)}
        </td>
        <td style="vertical-align:top;width:50%;text-align:right">
          Total de Compras: ${formatarPreco(totalProdutos)}<br>
          ${encomenda.valeDesconto > 0 ? `Desconto (vale ${encomenda.valeCodigo}): -${formatarPreco(encomenda.valeDesconto)}<br>` : ''}
          Embalagem e Envio: ${formatarPreco(encomenda.portes)}<br>
          <strong style="font-size:15px">Valor a Pagar: ${formatarPreco(encomenda.total)}</strong><br>
          <span style="color:#777;font-size:12px">IVA incluído</span>
        </td>
      </tr>
    </table>

    <div style="border-top:1px solid #ddd;padding-top:12px;margin-bottom:16px">
      <strong>Local de Entrega</strong><br>
      Nome: ${encomenda.cliente.nome}<br>
      Morada: ${encomenda.morada.morada || '-'}<br>
      Código Postal: ${encomenda.morada.codigoPostal || '-'}<br>
      Localidade: ${encomenda.morada.localidade || '-'}<br>
      País: Portugal<br>
      Telemóvel: ${encomenda.cliente.telefone || '-'}<br>
      Email: ${encomenda.cliente.email}
    </div>

    <div style="border-top:1px solid #ddd;padding-top:12px;margin-bottom:16px">
      <strong>Método de Pagamento</strong><br>
      ${encomenda.metodoPagamento}
    </div>

    <div style="border-top:1px solid #ddd;padding-top:12px;margin-bottom:16px">
      <strong>Estado actual</strong><br>
      ${estadoLabel}
      ${encomenda.estado === 'Anulada' && encomenda.motivoAnulacao ? `<br><strong>Motivo da anulação:</strong> ${encomenda.motivoAnulacao}` : ''}
    </div>

    ${encomenda.pontosGanhos > 0 ? `
      <div style="border-top:1px solid #ddd;padding-top:12px;margin-bottom:16px">
        Pontos desta encomenda: <strong>${encomenda.pontosGanhos}</strong>
        ${encomenda.estado === 'Enviada' ? '(já atribuídos, disponíveis para uso)' : encomenda.estado === 'Anulada' ? '(anulados)' : '(pendentes até a encomenda ser enviada)'}
      </div>
    ` : ''}

    <p style="color:#999;font-size:11px;margin-top:24px">Clássico Desportivo — este email foi enviado automaticamente, não responda a esta mensagem.</p>
  </div>
  `;
}

async function enviarEmailEncomenda(numero, { tituloEvento, notaEvento, assunto } = {}) {
  const transporte = getTransporte();
  if (!transporte) {
    console.warn(`[email] SMTP não configurado — a saltar envio para a encomenda ${numero}.`);
    return;
  }

  try {
    const encomenda = await obterEncomendaCompleta(numero);
    if (!encomenda || !encomenda.cliente.email) {
      console.warn(`[email] Encomenda ${numero} ou email do cliente não encontrado — envio ignorado.`);
      return;
    }

    const anexos = [];
    if (fs.existsSync(CAMINHO_LOGO)) {
      anexos.push({ filename: 'logo.png', path: CAMINHO_LOGO, cid: 'logo-empresa' });
    }

    await transporte.sendMail({
      from: process.env.SMTP_FROM || `"Clássico Desportivo" <${process.env.SMTP_USER}>`,
      to: encomenda.cliente.email,
      subject: assunto || `Encomenda ${numero} — Clássico Desportivo`,
      html: templateFactura(encomenda, { tituloEvento, notaEvento }),
      attachments: anexos,
    });
    console.log(`[email] Enviado (${assunto || numero}) para ${encomenda.cliente.email}.`);
  } catch (err) {
    console.error(`[email] Falha ao enviar email da encomenda ${numero}:`, err.message);
  }
}

module.exports = { enviarEmailEncomenda, templateFactura, formatarPreco, formatarData, separarNomeVariante, EMPRESA };
