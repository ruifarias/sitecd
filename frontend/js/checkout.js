let portesEnvio = 0;
let totalProdutosCheckout = 0;

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
  totalProdutosCheckout = total;
  const totalComPortes = total + portesEnvio;

  document.getElementById('resumo-checkout').innerHTML = `
    <fieldset style="margin-bottom:16px">
      <legend>Resumo (${linhas.length} artigo${linhas.length === 1 ? '' : 's'})</legend>
      ${linhas.map((l) => `
        <div class="linha-resumo-checkout">
          <img src="${l.imagem || ''}" alt="${l.descricao}" class="miniatura-resumo-checkout" onerror="this.style.opacity=0">
          <span class="descricao-resumo-checkout">${l.quantidade}× ${l.descricao} (${l.variante || l.codigoLote})</span>
          <span>${formatarPreco(l.subtotal)}</span>
        </div>
      `).join('')}
      <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:#555">
        <span class="linha-portes-envio">
          <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
          Portes de envio
        </span>
        <span>${formatarPreco(portesEnvio)}</span>
      </div>
      <div class="resumo-total"><span>Total</span><span id="valor-total-resumo">${formatarPreco(totalComPortes)}</span></div>
    </fieldset>
  `;

  document.querySelectorAll('.miniatura-resumo-checkout').forEach((img) => {
    if (!img.getAttribute('src')) return;
    img.addEventListener('click', () => {
      const overlay = document.getElementById('lightbox-imagem');
      const jaAbertaComEstaImagem = overlay && overlay.classList.contains('aberta') && overlay.querySelector('img').src === img.src;
      if (jaAbertaComEstaImagem) {
        fecharImagemAmpliada();
      } else {
        mostrarImagemAmpliada(img.src, img.alt);
      }
    });
  });

  return true;
}

// Lightbox simples: clicar numa miniatura de artigo no resumo amplia a
// imagem num overlay; clicar de novo na miniatura, clicar no overlay ou
// premir Escape fecha-o.
function mostrarImagemAmpliada(src, alt) {
  let overlay = document.getElementById('lightbox-imagem');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'lightbox-imagem';
    overlay.className = 'lightbox-imagem';
    overlay.innerHTML = '<img alt="">';
    overlay.addEventListener('click', fecharImagemAmpliada);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') fecharImagemAmpliada();
    });
    document.body.appendChild(overlay);
  }
  overlay.querySelector('img').src = src;
  overlay.querySelector('img').alt = alt || '';
  overlay.classList.add('aberta');
}

function fecharImagemAmpliada() {
  const overlay = document.getElementById('lightbox-imagem');
  if (overlay) overlay.classList.remove('aberta');
}

async function renderFormulario() {
  let perfil = {};
  try {
    perfil = await apiGet('/conta/perfil');
  } catch (_) {
    // sem morada guardada no perfil - fica em branco, o cliente preenche à mão
  }

  let saldoPontos = 0;
  let valesActivos = [];
  try {
    const pontos = await apiGet('/conta/pontos');
    saldoPontos = pontos.saldo;
  } catch (_) { /* mostra 0 pontos se falhar */ }
  try {
    const vales = await apiGet('/conta/vales');
    valesActivos = vales.filter((v) => v.estado === 'Activo');
  } catch (_) { /* sem vales para mostrar se falhar */ }

  // regra de negócio: 1 vale por cada 50€ de compras (validado outra vez no
  // servidor ao gravar - isto é só para orientar a selecção no formulário)
  const maxVales = Math.floor(totalProdutosCheckout / 50);

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
        <legend>Pontos e Vales</legend>
        <p class="descricao">Você tem <strong>${saldoPontos} pontos</strong>. Vá a <a href="conta.html#pontos" target="_blank">Pontos e Vales</a> para criar novos vales.</p>
        ${valesActivos.length === 0 ? '<p class="descricao">Ainda não tem vales activos.</p>' : `
          <p class="descricao">Pode seleccionar até <strong>${maxVales}</strong> vale${maxVales === 1 ? '' : 's'} (1 por cada 50€ de compras).</p>
          <div id="lista-vales-checkout">
            ${valesActivos.map((v) => `
              <label class="opcao-vale-checkout">
                <input type="checkbox" name="valeSeleccionado" value="${v.codigo}" data-valor="${v.valor}">
                ${v.codigo} — ${formatarPreco(v.valor)}
              </label>
            `).join('')}
          </div>
          <p id="aviso-limite-vales" class="qtd-limite-aviso"></p>
        `}
      </fieldset>

      <div id="resumo-vale-pagamento" class="resumo-vale-pagamento"></div>

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

  configurarLimiteVales(maxVales);
  document.getElementById('form-checkout').addEventListener('submit', submeterEncomenda);
}

// Impede seleccionar mais vales do que a regra permite (1 por cada 50€):
// ao atingir o limite, desactiva as caixas ainda não marcadas. Também
// mantém o desconto/valor a pagar actualizados a cada alteração, antes do
// Método de Pagamento (e sincroniza o total no resumo do topo).
function configurarLimiteVales(maxVales) {
  const checkboxes = document.querySelectorAll('input[name="valeSeleccionado"]');
  const aviso = document.getElementById('aviso-limite-vales');

  const actualizar = () => {
    const marcadas = Array.from(document.querySelectorAll('input[name="valeSeleccionado"]:checked'));
    if (aviso) {
      aviso.textContent = marcadas.length >= maxVales ? `Limite de ${maxVales} vale${maxVales === 1 ? '' : 's'} atingido para esta compra.` : '';
    }
    checkboxes.forEach((cb) => { cb.disabled = !cb.checked && marcadas.length >= maxVales; });

    const descontoVales = marcadas.reduce((soma, cb) => soma + parseFloat(cb.dataset.valor), 0);
    const totalComPortes = totalProdutosCheckout + portesEnvio;
    const totalAPagar = Math.max(0, totalComPortes - descontoVales);

    document.getElementById('resumo-vale-pagamento').innerHTML = descontoVales > 0 ? `
      <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:#555">
        <span>Desconto de vales</span><span>-${formatarPreco(descontoVales)}</span>
      </div>
      <div class="resumo-total"><span>Valor a pagar</span><span>${formatarPreco(totalAPagar)}</span></div>
    ` : '';

    const valorTotalResumo = document.getElementById('valor-total-resumo');
    if (valorTotalResumo) valorTotalResumo.textContent = formatarPreco(totalAPagar);
  };

  checkboxes.forEach((cb) => cb.addEventListener('change', actualizar));
  actualizar();
}

async function submeterEncomenda(e) {
  e.preventDefault();
  if (!confirm('Quer gravar a encomenda?')) return;

  const form = e.target;
  const botao = form.querySelector('button[type="submit"]');
  botao.disabled = true;
  botao.textContent = 'A processar...';
  document.getElementById('erro-checkout').innerHTML = '';

  const valeCodigos = Array.from(form.querySelectorAll('input[name="valeSeleccionado"]:checked')).map((cb) => cb.value);

  const dados = {
    sessaoId: obterSessaoId(),
    morada: {
      morada: form.morada.value,
      localidade: form.localidade.value,
      codigoPostal: form.codigoPostal.value,
    },
    metodoPagamento: form.metodoPagamento.value,
    valeCodigos: valeCodigos.length > 0 ? valeCodigos : undefined,
  };

  try {
    const encomenda = await apiPost('/encomendas', dados);
    document.getElementById('resumo-checkout').innerHTML = '';
    document.getElementById('conteudo-checkout').innerHTML = `
      <div class="mensagem-sucesso">
        <h2 style="margin-bottom:10px">Encomenda confirmada!</h2>
        <p><strong>Número:</strong> ${encomenda.numero}</p>
        <p><strong>Portes:</strong> ${formatarPreco(encomenda.portes)}</p>
        ${encomenda.valeDesconto > 0 ? `<p><strong>Desconto de vale${encomenda.valesAplicados.length === 1 ? '' : 's'} (${encomenda.valesAplicados.join(', ')}):</strong> -${formatarPreco(encomenda.valeDesconto)}</p>` : ''}
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
