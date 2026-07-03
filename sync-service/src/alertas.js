// Alertas em tempo real via WhatsApp (CallMeBot - gratuito, sem conta empresarial).
// Ver PLANO_PROJETO.md secção 2.6/4.
// Configuração (sync-service/.env): WHATSAPP_PHONE, WHATSAPP_APIKEY.
// Sem credenciais configuradas, os alertas ficam só registados no log.txt/consola
// (degradação graciosa - nunca falha a sincronização por causa de um alerta).
require('dotenv').config();
const log = require('./logger');

function configurado() {
  return Boolean(process.env.WHATSAPP_PHONE && process.env.WHATSAPP_APIKEY);
}

async function enviarWhatsApp(mensagem) {
  if (!configurado()) {
    log.writeLine(`[ALERTA - WhatsApp não configurado, só registado] ${mensagem}`);
    return false;
  }
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(process.env.WHATSAPP_PHONE)}&text=${encodeURIComponent(mensagem)}&apikey=${encodeURIComponent(process.env.WHATSAPP_APIKEY)}`;
    const res = await fetch(url);
    if (!res.ok) {
      log.writeLine(`Aviso: falha ao enviar alerta WhatsApp (HTTP ${res.status}).`);
      return false;
    }
    return true;
  } catch (err) {
    log.writeLine(`Aviso: falha ao enviar alerta WhatsApp: ${err.message}`);
    return false;
  }
}

// Ponto único de alerta - usar isto em todo o código para sinalizar erros
// diversos (secção 4/Riscos), não só o de preço zero.
async function alertar(titulo, detalhe) {
  const mensagem = `⚠️ Clássico Desportivo: ${titulo}\n${detalhe}`;
  log.writeLine(`ALERTA: ${titulo} - ${detalhe}`);
  await enviarWhatsApp(mensagem);
}

module.exports = { alertar, configurado };
