async function carregarCarrinho() {
  const container = document.getElementById('linhas-carrinho');
  const resumo = document.getElementById('resumo');
  try {
    const { linhas, total } = await apiGet(`/carrinho/${obterSessaoId()}`);
    if (linhas.length === 0) {
      container.innerHTML = '<div class="vazio">O carrinho está vazio. <a href="index.html" style="text-decoration:underline">Continuar a comprar</a>.</div>';
      resumo.innerHTML = '';
      return;
    }

    container.innerHTML = linhas.map((l) => `
      <div class="linha-carrinho">
        <img src="${l.imagem || ''}" alt="${l.descricao}" onerror="this.style.opacity=0">
        <div>
          <div class="nome">${l.descricao}</div>
          <div class="variante">${l.variante || l.codigoLote}</div>
          <div class="remover" data-id="${l.id}">Remover</div>
        </div>
        <div>
          <label style="font-size:12px">Qtd
            <input type="number" min="1" max="${l.disponivel}" value="${l.quantidade}" data-id="${l.id}" style="width:60px;padding:4px;margin-left:6px">
          </label>
          ${l.disponivel < l.quantidade ? '<div style="color:#e2001a;font-size:11px">Stock insuficiente</div>' : ''}
        </div>
        <div class="preco-actual">${formatarPreco(l.subtotal)}</div>
      </div>
    `).join('');

    resumo.innerHTML = `
      <div class="resumo-total"><span>Total</span><span>${formatarPreco(total)}</span></div>
      <button class="botao-principal" id="btn-checkout">Finalizar Compra</button>
    `;

    container.querySelectorAll('.remover').forEach((el) => {
      el.addEventListener('click', async () => {
        await apiDelete(`/carrinho/${el.dataset.id}`);
        actualizarBadgeCarrinho();
        carregarCarrinho();
      });
    });

    container.querySelectorAll('input[type="number"]').forEach((input) => {
      input.addEventListener('change', async () => {
        const valor = Math.max(1, parseInt(input.value, 10) || 1);
        try {
          await apiPut(`/carrinho/${input.dataset.id}`, { quantidade: valor });
        } catch (err) {
          alert(err.message);
        }
        actualizarBadgeCarrinho();
        carregarCarrinho();
      });
    });

    document.getElementById('btn-checkout').addEventListener('click', () => {
      window.location.href = 'checkout.html';
    });
  } catch (err) {
    container.innerHTML = `<div class="vazio">${err.message}</div>`;
  }
}

carregarCarrinho();
