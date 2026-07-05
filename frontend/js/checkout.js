let portesEnvio = 0;

async function obterPortesEnvio() {
  try {
    const config = await apiGet('/config-publico');
    return parseFloat(config.PortesEnvio) || 0;
  } catch (_) {
    return 0;
  }
}

async function renderResumo() {
  const { linhas, total } = await apiGet(`/carrinho/${obterSessaoId()}`);
  if (linhas.length === 0) {
    document.getElementById('resumo-checkout').innerHTML = '';
    document.getElementById('conteudo-checkout').innerHTML = '<div class="vazio">O carrinho está vazio. <a href="index.html" style="text-decoration:underline">Continuar a comprar</a>.</div>';
    return false;
  }

  portesEnvio = await obterPortesEnvio();
  const totalComPortes = total + portesEnvio;

  document.getElementById('resumo-checkout').innerHTML = `
    <fieldset style="margin-bottom:16px">
      <legend>Resumo (${linhas.length} artigo${linhas.length === 1 ? '' : 's'})</legend>
      ${linhas.map((l) => `
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0">
          <span>${l.quantidade}× ${l.descricao} (${l.variante || l.codigoLote})</span>
          <span>${formatarPreco(l.subtotal)}</span>
        </div>
      `).join('')}
      <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:#555">
        <span>Portes de envio</span>
        <span>${formatarPreco(portesEnvio)}</span>
      </div>
      <div class="resumo-total"><span>Total</span><span id="valor-total-resumo">${formatarPreco(totalComPortes)}</span></div>
      <p style="font-size:11px;color:#999;margin-top:6px">Se aplicar um vale, o desconto é calculado ao confirmar a encomenda.</p>
    </fieldset>
  `;
  return true;
}

async function renderFormulario() {
  let perfil = {};
  try {
    perfil = await apiGet('/conta/perfil');
  } catch (_) {
    // sem morada guardada no perfil - fica em branco, o cliente preenche à mão
  }

  document.getElementById('conteudo-checkout').innerHTML = `
    <form class="checkout" id="form-checkout">
      <div id="erro-checkout"></div>

      <fieldset>
        <legend>Morada de Entrega</legend>
        <label>Morada *</label>
        <input type="text" name="morada" value="${perfil.morada || ''}" required>
        <label>Localidade *</label>
        <input type="text" name="localidade" value="${perfil.localidade || ''}" required>
        <label>Código Postal *</label>
        <input type="text" name="codigoPostal" placeholder="0000-000" value="${perfil.codigoPostal || ''}" required>
      </fieldset>

      <fieldset>
        <legend>Vale de Desconto</legend>
        <label>Código do vale (opcional)</label>
        <input type="text" name="valeCodigo" placeholder="VALE-XXXXXXXX">
      </fieldset>

      <fieldset>
        <legend>Método de Pagamento</legend>
        <label class="metodo-pagamento">
          <input type="radio" name="metodoPagamento" value="Dinheiro" checked>
          <span><strong>A Dinheiro</strong> — pago na entrega/levantamento (modo de teste)</span>
        </label>
        <label class="metodo-pagamento desactivado">
          <input type="radio" disabled> <span>MB WAY (brevemente)</span>
        </label>
        <label class="metodo-pagamento desactivado">
          <input type="radio" disabled> <span>Cartão de Crédito (brevemente)</span>
        </label>
        <label class="metodo-pagamento desactivado">
          <input type="radio" disabled> <span>PayPal (brevemente)</span>
        </label>
      </fieldset>

      <button type="submit" class="botao-principal">Confirmar Encomenda</button>
    </form>
  `;

  document.getElementById('form-checkout').addEventListener('submit', submeterEncomenda);
}

async function submeterEncomenda(e) {
  e.preventDefault();
  const form = e.target;
  const botao = form.querySelector('button[type="submit"]');
  botao.disabled = true;
  botao.textContent = 'A processar...';
  document.getElementById('erro-checkout').innerHTML = '';

  const dados = {
    sessaoId: obterSessaoId(),
    morada: {
      morada: form.morada.value,
      localidade: form.localidade.value,
      codigoPostal: form.codigoPostal.value,
    },
    metodoPagamento: form.metodoPagamento.value,
    valeCodigo: form.valeCodigo.value.trim() || undefined,
  };

  try {
    const encomenda = await apiPost('/encomendas', dados);
    document.getElementById('resumo-checkout').innerHTML = '';
    document.getElementById('conteudo-checkout').innerHTML = `
      <div class="mensagem-sucesso">
        <h2 style="margin-bottom:10px">Encomenda confirmada!</h2>
        <p><strong>Número:</strong> ${encomenda.numero}</p>
        <p><strong>Portes:</strong> ${formatarPreco(encomenda.portes)}</p>
        ${encomenda.valeDesconto > 0 ? `<p><strong>Desconto de vale:</strong> -${formatarPreco(encomenda.valeDesconto)}</p>` : ''}
        <p><strong>Total:</strong> ${formatarPreco(encomenda.total)}</p>
        <p><strong>Pontos ganhos:</strong> ${encomenda.pontosGanhos}</p>
        <p style="margin-top:10px">${encomenda.mensagemPagamento}</p>
        <a href="conta.html" style="display:inline-block;margin-top:16px;text-decoration:underline">Ver as minhas encomendas</a><br>
        <a href="index.html" style="display:inline-block;margin-top:8px;text-decoration:underline">Continuar a comprar</a>
      </div>
    `;
    actualizarBadgeCarrinho();
  } catch (err) {
    document.getElementById('erro-checkout').innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
    botao.disabled = false;
    botao.textContent = 'Confirmar Encomenda';
  }
}

async function iniciarCheckout() {
  const temItens = await renderResumo();
  if (temItens) await renderFormulario();
}

(async function init() {
  if (!estaAutenticado()) {
    document.getElementById('resumo-checkout').innerHTML = '';
    document.getElementById('conteudo-checkout').innerHTML = '<p class="descricao" style="text-align:center;margin-bottom:16px">Inicie sessão ou crie uma conta para finalizar a compra.</p><div id="auth-checkout"></div>';
    renderFormularioAuth(document.getElementById('auth-checkout'), iniciarCheckout);
    return;
  }
  await iniciarCheckout();
})();
