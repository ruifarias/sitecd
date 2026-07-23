// Envio de emails de encomenda (confirmação inicial, mudança de estado,
// anulação com motivo) - estilo factura, com imagens dos artigos e IVA
// discriminado. Se SMTP_HOST não estiver definido, não bloqueia nem falha a
// operação - apenas regista um aviso.
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { ESTADOS_LABELS, ehEstadoDevolucao, ESTADO_RECEBIDA_CONFORME } = require('../constants/encomendaEstados');
const { obterEncomendaCompleta } = require('./encomendaService');

const EMPRESA = {
  nome: 'CLÁSSICO DESPORTIVO, Comércio de Artigos de Desporto, Lda.',
  morada: 'Rua Tenente Cabeleira Filipe, 1-A',
  localidade: '2430-306 Marinha Grande',
  pais: 'Portugal',
  nif: 'PT 505 794 268',
  telefone: '244 566 945 * Custo da chamada para rede fixa nacional',
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
      <td style="padding:8px;border-bottom:1px solid #eee">${l.codigoArtigo}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">
        ${nome}
        ${variante ? `<br><span style="color:#1a5fb4;font-size:12px">${variante}</span>` : ''}
      </td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${l.quantidade}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${formatarPreco(l.precoVenda)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${l.descontoPercentagem > 0 ? '-' + l.descontoPercentagem + '%' : '0%'}</td>
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

    <table style="width:100%;border-collapse:collapse;margin-bottom:6px">
      <tr>
        <td style="vertical-align:top;width:55%">
          <img src="cid:logo-empresa" width="70" alt="Clássico Desportivo">
        </td>
        <td style="vertical-align:top;text-align:right">
          <strong style="font-size:15px">Nº Encomenda</strong><br>
          <span style="font-size:18px;font-weight:700">${encomenda.numero}</span><br>
          <strong>Data</strong> ${formatarData(encomenda.data)}
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
          Email: ${encomenda.cliente.email}<br>
          Código de Cliente: ${encomenda.cliente.codigoCliente || '-'}
        </td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <thead>
        <tr style="background:#f5f5f5">
          <th style="padding:8px;text-align:center">Imagem</th>
          <th style="padding:8px;text-align:left">Código</th>
          <th style="padding:8px;text-align:left">Artigo</th>
          <th style="padding:8px;text-align:center">Qtd</th>
          <th style="padding:8px 10px;text-align:right;white-space:nowrap">Preço Venda</th>
          <th style="padding:8px 10px;text-align:right;white-space:nowrap">Desconto</th>
          <th style="padding:8px 10px;text-align:right;white-space:nowrap">Valor Líquido</th>
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
        <td style="vertical-align:top;width:50%">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr>
              <td style="text-align:left;padding:2px 0">Sub-total dos Artigos</td>
              <td style="text-align:right;padding:2px 0;white-space:nowrap">${formatarPreco(totalProdutos)}</td>
            </tr>
            <tr>
              <td style="text-align:left;padding:2px 0">Portes${encomenda.tipoEnvio ? ` (${encomenda.tipoEnvio})` : ''}</td>
              <td style="text-align:right;padding:2px 0;white-space:nowrap">${formatarPreco(encomenda.portes)}</td>
            </tr>
            <tr>
              <td style="text-align:left;padding-top:6px;border-top:1px solid #ddd;font-weight:700;font-size:15px">Total</td>
              <td style="text-align:right;padding-top:6px;border-top:1px solid #ddd;font-weight:700;font-size:15px;white-space:nowrap">${formatarPreco(totalProdutos + encomenda.portes)}</td>
            </tr>
            ${encomenda.valeDesconto > 0 ? `
            <tr>
              <td style="text-align:left;padding:2px 0">Desconto (vale ${encomenda.valeCodigo})</td>
              <td style="text-align:right;padding:2px 0;white-space:nowrap">-${formatarPreco(encomenda.valeDesconto)}</td>
            </tr>
            <tr>
              <td style="text-align:left;padding-top:6px;border-top:1px solid #ddd;font-weight:700;font-size:15px">Total a Pagar</td>
              <td style="text-align:right;padding-top:6px;border-top:1px solid #ddd;font-weight:700;font-size:15px;white-space:nowrap">${formatarPreco(encomenda.total)}</td>
            </tr>` : ''}
            <tr>
              <td></td>
              <td style="text-align:right;color:#777;font-size:12px">IVA incluído</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${ehEstadoDevolucao(encomenda.estado) ? `
      <p style="color:#777;font-size:12px;margin-bottom:16px">Os portes de envio não são devolvidos nem estão sujeitos a crédito.</p>
    ` : ''}

    ${encomenda.devolucao ? `
      <div style="border-top:1px solid #ddd;padding-top:12px;margin-bottom:16px">
        <strong>Dados Bancários para Reembolso</strong><br>
        IBAN: ${encomenda.devolucao.iban}<br>
        Nome do 1º Titular da Conta: ${encomenda.devolucao.nomeTitular}
        ${encomenda.devolucao.motivo ? `<br><br><strong>Razão da Devolução</strong><br>${encomenda.devolucao.motivo}` : ''}
        <br><br><em>Li e Aceito as condições de devolução!</em>
      </div>
    ` : ''}

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
      ${encomenda.metodoPagamentoDetalhe ? `<br><span style="color:#777;font-size:12px">${encomenda.metodoPagamentoDetalhe}</span>` : ''}
    </div>

    <div style="border-top:1px solid #ddd;padding-top:12px;margin-bottom:16px">
      <strong>Estado actual</strong><br>
      ${estadoLabel}
      ${encomenda.estado === 'Anulada' && encomenda.motivoAnulacao ? `<br><strong>Motivo da anulação:</strong> ${encomenda.motivoAnulacao}` : ''}
      ${encomenda.estado === 'DevolucaoRecebidaNaoAceite' && encomenda.motivoAnulacao ? `<br><strong>Motivo da não aceitação:</strong> ${encomenda.motivoAnulacao}` : ''}
    </div>

    ${encomenda.pontosGanhos !== 0 ? `
      <div style="border-top:1px solid #ddd;padding-top:12px;margin-bottom:16px">
        Pontos desta encomenda: <strong>${encomenda.pontosGanhos}</strong>
        ${encomenda.estado === ESTADO_RECEBIDA_CONFORME ? '(já atribuídos, disponíveis para uso)' : encomenda.estado === 'Anulada' ? '(anulados)' : ehEstadoDevolucao(encomenda.estado) ? '(estornados)' : '(pendentes até ser confirmada a receção pelo cliente)'}
      </div>
    ` : ''}

    <p style="color:#999;font-size:11px;margin-top:24px">Clássico Desportivo — este email foi enviado automaticamente, não responda a esta mensagem.</p>
  </div>
  `;
}

async function enviarEmailEncomenda(numero, { tituloEvento, notaEvento, assunto, copiaEmpresa } = {}) {
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
      cc: copiaEmpresa ? EMPRESA.email : undefined,
      subject: assunto || `Encomenda ${numero} — Clássico Desportivo`,
      html: templateFactura(encomenda, { tituloEvento, notaEvento }),
      attachments: anexos,
    });
    console.log(`[email] Enviado (${assunto || numero}) para ${encomenda.cliente.email}${copiaEmpresa ? ` (cc: ${EMPRESA.email})` : ''}.`);
  } catch (err) {
    console.error(`[email] Falha ao enviar email da encomenda ${numero}:`, err.message);
  }
}

// Email de recuperação de password: link com token de uso único (ver
// routes/auth.js - POST /recuperar-password e /redefinir-password). Não falha
// nem bloqueia o pedido do cliente se o SMTP não estiver configurado.
async function enviarEmailRecuperacaoPassword(email, nome, link) {
  const transporte = getTransporte();
  if (!transporte) {
    console.warn(`[email] SMTP não configurado — a saltar envio de recuperação de password para ${email}.`);
    return;
  }

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:500px;margin:0 auto;color:#222;font-size:14px">
      <p><img src="cid:logo-empresa" width="70" alt="Clássico Desportivo"></p>
      <p>Olá ${nome || ''},</p>
      <p>Recebemos um pedido de recuperação de password para a sua conta em Clássico Desportivo.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#111;color:#fff;padding:12px 24px;text-decoration:none;font-weight:700">Criar Nova Password</a>
      </p>
      <p style="color:#777;font-size:12px">Este link é válido por 1 hora. Se não pediu a recuperação de password, ignore este email — a sua password mantém-se inalterada.</p>
      <p style="color:#999;font-size:11px;margin-top:24px">Clássico Desportivo — este email foi enviado automaticamente, não responda a esta mensagem.</p>
    </div>
  `;

  try {
    const anexos = [];
    if (fs.existsSync(CAMINHO_LOGO)) {
      anexos.push({ filename: 'logo.png', path: CAMINHO_LOGO, cid: 'logo-empresa' });
    }
    await transporte.sendMail({
      from: process.env.SMTP_FROM || `"Clássico Desportivo" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Recuperação de Password — Clássico Desportivo',
      html,
      attachments: anexos,
    });
    console.log(`[email] Email de recuperação de password enviado para ${email}.`);
  } catch (err) {
    console.error(`[email] Falha ao enviar email de recuperação de password para ${email}:`, err.message);
  }
}

// Email de confirmação/activação de conta: link com token de uso único (ver
// routes/auth.js - POST /registo e /confirmar-email). Enviado no registo (e
// no reenvio); a conta funciona normalmente até lá (não bloqueia a compra em
// curso) - só passa a ser exigido em sessões de login futuras.
async function enviarEmailConfirmacaoConta(email, nome, link) {
  const transporte = getTransporte();
  if (!transporte) {
    console.warn(`[email] SMTP não configurado — a saltar envio de confirmação de conta para ${email}.`);
    return;
  }

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:500px;margin:0 auto;color:#222;font-size:14px">
      <p><img src="cid:logo-empresa" width="70" alt="Clássico Desportivo"></p>
      <p>Olá ${nome || ''},</p>
      <p>Obrigado por criar conta em Clássico Desportivo. Para confirmar que este email lhe pertence e activar a sua conta, clique no botão abaixo.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#111;color:#fff;padding:12px 24px;text-decoration:none;font-weight:700">Activar a Minha Conta</a>
      </p>
      <p style="color:#777;font-size:12px">Este link é válido por 48 horas. Se não criou esta conta, ignore este email.</p>
      <p style="color:#999;font-size:11px;margin-top:24px">Clássico Desportivo — este email foi enviado automaticamente, não responda a esta mensagem.</p>
    </div>
  `;

  try {
    const anexos = [];
    if (fs.existsSync(CAMINHO_LOGO)) {
      anexos.push({ filename: 'logo.png', path: CAMINHO_LOGO, cid: 'logo-empresa' });
    }
    await transporte.sendMail({
      from: process.env.SMTP_FROM || `"Clássico Desportivo" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Active a sua conta — Clássico Desportivo',
      html,
      attachments: anexos,
    });
    console.log(`[email] Email de confirmação de conta enviado para ${email}.`);
  } catch (err) {
    console.error(`[email] Falha ao enviar email de confirmação de conta para ${email}:`, err.message);
  }
}

// Notifica a loja (EMPRESA.email) quando um cliente confirma o email de uma
// conta nova - só depois de confirmado, para não gerar aviso por cada registo
// nunca validado (ex: email errado/bot). Ver routes/auth.js - POST /confirmar-email.
async function enviarEmailNovoRegisto(cliente) {
  const transporte = getTransporte();
  if (!transporte) {
    console.warn(`[email] SMTP não configurado — a saltar aviso de novo registo (${cliente.email}).`);
    return;
  }

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:500px;margin:0 auto;color:#222;font-size:14px">
      <p>Novo cliente registado e com email confirmado:</p>
      <table style="border-collapse:collapse;font-size:13px">
        <tr><td style="padding:2px 8px 2px 0;color:#777">Nome</td><td>${cliente.nome || '-'}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;color:#777">Email</td><td>${cliente.email || '-'}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;color:#777">Telefone</td><td>${cliente.telefone || '-'}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;color:#777">NIF</td><td>${cliente.nif || '-'}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;color:#777">Morada</td><td>${cliente.morada || '-'}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;color:#777">Localidade</td><td>${cliente.localidade || '-'}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;color:#777">Código Postal</td><td>${cliente.codigoPostal || '-'}</td></tr>
      </table>
    </div>
  `;

  try {
    await transporte.sendMail({
      from: process.env.SMTP_FROM || `"Clássico Desportivo" <${process.env.SMTP_USER}>`,
      to: EMPRESA.email,
      subject: `Novo registo de cliente — ${cliente.nome || cliente.email}`,
      html,
    });
    console.log(`[email] Aviso de novo registo enviado para ${EMPRESA.email} (cliente: ${cliente.email}).`);
  } catch (err) {
    console.error(`[email] Falha ao enviar aviso de novo registo:`, err.message);
  }
}

module.exports = {
  enviarEmailEncomenda,
  enviarEmailRecuperacaoPassword,
  enviarEmailConfirmacaoConta,
  enviarEmailNovoRegisto,
  templateFactura,
  formatarPreco,
  formatarData,
  separarNomeVariante,
  EMPRESA,
};
