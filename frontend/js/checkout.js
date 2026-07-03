async function renderResumo() {
  const { linhas, total } = await apiGet(`/carrinho/${obterSessaoId()}`);
  if (linhas.length === 0) {
    document.getElementById('resumo-checkout').innerHTML = '';
    document.getElementById('conteudo-checkout').innerHTML = '<div class="vazio">O carrinho está vazio. <a href="index.html" style="text-decoration:underline">Continuar a comprar</a>.</div>';
    return false;
  }
  document.getElementById('resumo-checkout').innerHTML = `
    <fieldset style="margin-bottom:16px">
      <legend>Resumo (${linhas.length} artigo${linhas.length === 1 ? '' : 's'})</legend>
      ${linhas.map((l) => `
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0">
          <span>${l.quantidade}× ${l.descricao} (${l.variante || l.codigoLote})</span>
          <span>${formatarPreco(l.subtotal)}</span>
        </div>
      `).join('')}
      <div class="resumo-total"><span>Total</span><span>${formatarPreco(total)}</span></div>
    </fieldset>
  `;
  return true;
}

function renderFormulario() {
  document.getElementById('conteudo-checkout').innerHTML = `
    <form class="checkout" id="form-checkout">
      <div id="erro-checkout"></div>

      <fieldset>
        <legend>Dados do Cliente</legend>
        <label>Nome *</label>
        <input type="text" name="nome" required>
        <label>Email *</label>
        <input type="email" name="email" required>
        <label>Telefone</label>
        <input type="tel" name="telefone">
      </fieldset>

      <fieldset>
        <legend>Morada de Entrega</legend>
        <label>Morada *</label>
        <input type="text" name="morada" required>
        <label>Localidade *</label>
        <input type="text" name="localidade" required>
        <label>Código Postal *</label>
        <input type="text" name="codigoPostal" placeholder="0000-000" required>
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
    cliente: {
      nome: form.nome.value,
      email: form.email.value,
      telefone: form.telefone.value || undefined,
    },
    morada: {
      morada: form.morada.value,
      localidade: form.localidade.value,
      codigoPostal: form.codigoPostal.value,
    },
    metodoPagamento: form.metodoPagamento.value,
  };

  try {
    const encomenda = await apiPost('/encomendas', dados);
    document.getElementById('resumo-checkout').innerHTML = '';
    document.getElementById('conteudo-checkout').innerHTML = `
      <div class="mensagem-sucesso">
        <h2 style="margin-bottom:10px">Encomenda confirmada!</h2>
        <p><strong>Número:</strong> ${encomenda.numero}</p>
        <p><strong>Total:</strong> ${formatarPreco(encomenda.total)}</p>
        <p style="margin-top:10px">${encomenda.mensagemPagamento}</p>
        <a href="index.html" style="display:inline-block;margin-top:16px;text-decoration:underline">Continuar a comprar</a>
      </div>
    `;
    actualizarBadgeCarrinho();
  } catch (err) {
    document.getElementById('erro-checkout').innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
    botao.disabled = false;
    botao.textContent = 'Confirmar Encomenda';
  }
}

(async function init() {
  const temItens = await renderResumo();
  if (temItens) renderFormulario();
})();
