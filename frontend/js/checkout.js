let portesEnvio = 0;
let totalProdutosCheckout = 0;
let tiposEnvioDisponiveis = [];
// Preenchida por configurarLimiteVales() - chamada também quando o tipo de
// envio muda, para o "Valor a pagar" (com desconto de vales) acompanhar o
// novo valor de portes.
let actualizarResumoPagamento = () => {};

async function obterTiposEnvio() {
  try {
    return await apiGet('/tipos-envio');
  } catch (_) {
    return [];
  }
}

async function renderResumo() {
  const { linhas, total } = await apiGet(`/carrinho/${obterSessaoId()}`);
  if (linhas.length === 0) {
    document.getElementById('resumo-checkout').innerHTML = '';
    document.getElementById('conteudo-checkout').innerHTML = '<div class="vazio">O carrinho está vazio. <a href="index.html" style="text-decoration:underline">Continuar a comprar</a>.</div>';
    return false;
  }

  tiposEnvioDisponiveis = await obterTiposEnvio();
  totalProdutosCheckout = total;
  portesEnvio = tiposEnvioDisponiveis.length > 0 ? parseFloat(tiposEnvioDisponiveis[0].custo) || 0 : 0;
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
      <div style="display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:4px 0;color:#555">
        <span class="linha-portes-envio">
          <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
          <span>Portes de envio<span id="designacao-tipo-envio-resumo">${tiposEnvioDisponiveis.length > 0 ? ` (${tiposEnvioDisponiveis[0].designacao})` : ''}</span></span>
        </span>
        <span id="valor-portes-resumo" style="flex-shrink:0;white-space:nowrap">${formatarPreco(portesEnvio)}</span>
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

  // Métodos de pagamento geridos no Backoffice (activo/designação/ordem) -
  // ver secção "Métodos de Pagamento". "MBWAY" é o único com um campo extra
  // (telemóvel) e integração automática; os restantes são só informativos.
  let metodosPagamento = [];
  try {
    metodosPagamento = await apiGet('/metodos-pagamento');
  } catch (_) { /* checkout falha na validação do servidor se não houver métodos */ }

  document.getElementById('conteudo-checkout').innerHTML = `
    <form class="checkout" id="form-checkout">
      <div id="erro-checkout"></div>

      <fieldset>
        <legend>Tipo de Envio</legend>
        ${tiposEnvioDisponiveis.map((t, i) => `
          <label class="metodo-pagamento">
            <input type="radio" name="tipoEnvio" value="${t.codigo}" data-custo="${t.custo}" ${i === 0 ? 'checked' : ''}>
            <span><strong>${t.designacao}</strong> — ${formatarPreco(t.custo)}</span>
          </label>
        `).join('')}
      </fieldset>

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
        <p class="descricao">Você tem <strong>${saldoPontos} pontos</strong>. Vá a <a href="conta.html#pontos" target="_blank" class="link-destaque">Pontos e Vales</a> para criar novos vales.</p>
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
        ${metodosPagamento.map((m, i) => `
          <label class="metodo-pagamento">
            <input type="radio" name="metodoPagamento" value="${m.codigo}" ${i === 0 ? 'checked' : ''}>
            <span><strong>${m.designacao}</strong>${m.detalhe ? ` — ${m.detalhe}` : ''}</span>
          </label>
          ${m.codigo === 'MBWAY' ? `
            <div id="campo-telemovel-mbway" class="campo-telemovel-mbway" hidden>
              <label>Número de Telemóvel (MB WAY) *</label>
              <input type="tel" name="telemovel" placeholder="9XXXXXXXX" maxlength="9">
            </div>
          ` : ''}
        `).join('')}
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
  configurarMetodoPagamento();
  configurarTipoEnvio();
  document.getElementById('form-checkout').addEventListener('submit', submeterEncomenda);
}

// Ao trocar o tipo de envio, o valor dos portes muda - actualiza o resumo
// (portes e total) e, se houver vales seleccionados, o "Valor a pagar".
function configurarTipoEnvio() {
  document.querySelectorAll('input[name="tipoEnvio"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      portesEnvio = parseFloat(radio.dataset.custo) || 0;
      const tipoSeleccionado = tiposEnvioDisponiveis.find((t) => t.codigo === radio.value);
      document.getElementById('valor-portes-resumo').textContent = formatarPreco(portesEnvio);
      document.getElementById('designacao-tipo-envio-resumo').textContent = tipoSeleccionado ? ` (${tipoSeleccionado.designacao})` : '';
      document.getElementById('valor-total-resumo').textContent = formatarPreco(totalProdutosCheckout + portesEnvio);
      actualizarResumoPagamento();
    });
  });
}

// Mostra/exige o campo de telemóvel só quando MB WAY (Ifthenpay) está
// seleccionado - só existe se esse método estiver activo no Backoffice.
function configurarMetodoPagamento() {
  const campoTelemovel = document.getElementById('campo-telemovel-mbway');
  const inputTelemovel = document.querySelector('input[name="telemovel"]');
  if (!campoTelemovel || !inputTelemovel) return;
  document.querySelectorAll('input[name="metodoPagamento"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const ehMbway = radio.value === 'MBWAY' && radio.checked;
      campoTelemovel.hidden = !ehMbway;
      inputTelemovel.required = ehMbway;
    });
  });
}

// Impede seleccionar mais vales do que a regra permite (1 por cada 50€):
// ao atingir o limite, desactiva as caixas ainda não marcadas. Actualiza o
// desconto/valor a pagar a cada alteração - o "Total" do resumo (artigos +
// portes) nunca muda aqui, só o "Valor a pagar" reflecte o desconto de vales.
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
  };

  checkboxes.forEach((cb) => cb.addEventListener('change', actualizar));
  actualizarResumoPagamento = actualizar;
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
    tipoEnvio: form.tipoEnvio.value,
    metodoPagamento: form.metodoPagamento.value,
    telemovel: form.metodoPagamento.value === 'MBWAY' ? form.telemovel.value.trim() : undefined,
    valeCodigos: valeCodigos.length > 0 ? valeCodigos : undefined,
  };

  try {
    const encomenda = await apiPost('/encomendas', dados);
    document.getElementById('resumo-checkout').innerHTML = '';
    document.getElementById('conteudo-checkout').innerHTML = `
      <div class="mensagem-sucesso">
        <h2 style="margin-bottom:10px">Encomenda confirmada!</h2>
        <p><strong>Número:</strong> ${encomenda.numero}</p>
        <p><strong>Tipo de Envio:</strong> ${encomenda.tipoEnvio}</p>
        <p><strong>Portes:</strong> ${formatarPreco(encomenda.portes)}</p>
        ${encomenda.valeDesconto > 0 ? `<p><strong>Desconto de vale${encomenda.valesAplicados.length === 1 ? '' : 's'} (${encomenda.valesAplicados.join(', ')}):</strong> -${formatarPreco(encomenda.valeDesconto)}</p>` : ''}
        <p><strong>Total:</strong> ${formatarPreco(encomenda.total)}</p>
        <p><strong>Pontos ganhos:</strong> ${encomenda.pontosGanhos}</p>
        <p style="margin-top:10px">${encomenda.mensagemPagamento}</p>
        ${encomenda.metodoPagamento === 'MBWAY' ? '<div id="estado-mbway" style="margin-top:10px"></div>' : ''}
        <a href="conta.html" style="display:inline-block;margin-top:16px;text-decoration:underline">Ver as minhas encomendas</a><br>
        <a href="index.html" style="display:inline-block;margin-top:8px;text-decoration:underline">Continuar a comprar</a>
      </div>
    `;
    if (encomenda.metodoPagamento === 'MBWAY') acompanharPagamentoMbway(encomenda.numero, encomenda.mbway);
    actualizarBadgeCarrinho();
  } catch (err) {
    document.getElementById('erro-checkout').innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
    botao.disabled = false;
    botao.textContent = 'Confirmar Encomenda';
  }
}

// Acompanha o pagamento MB WAY depois da encomenda criada: se o pedido inicial
// falhou, oferece "Reenviar"; caso contrário, consulta periodicamente
// /mbway/estado até o cliente confirmar (ou o pedido expirar/ser rejeitado) na
// app - a app MB WAY dá ao cliente cerca de 4 minutos para aceitar.
const INTERVALO_POLLING_MBWAY_MS = 3000;
const MAX_TENTATIVAS_POLLING_MBWAY = 100; // ~5 minutos

function acompanharPagamentoMbway(numero, mbway) {
  const container = document.getElementById('estado-mbway');
  if (!container) return;

  function renderAguardar() {
    container.innerHTML = '<p>📱 Aceite o pedido na app MB WAY para confirmar o pagamento (tem cerca de 4 minutos)...</p>';
  }

  function renderErro(mensagem) {
    container.innerHTML = `
      <div class="mensagem-erro">${mensagem}</div>
      <button type="button" id="btn-reenviar-mbway" class="botao-principal" style="margin-top:8px">Reenviar Pedido MB WAY</button>
    `;
    document.getElementById('btn-reenviar-mbway').addEventListener('click', async () => {
      container.innerHTML = '<p>A reenviar...</p>';
      try {
        await apiPost(`/encomendas/${numero}/mbway/reenviar`, {});
        renderAguardar();
        iniciarPolling();
      } catch (err) {
        renderErro(err.message);
      }
    });
  }

  function iniciarPolling() {
    let tentativas = 0;
    const intervalo = setInterval(async () => {
      tentativas++;
      try {
        const { estadoPagamento } = await apiGet(`/encomendas/${numero}/mbway/estado`);
        if (estadoPagamento === 'Pago') {
          clearInterval(intervalo);
          container.innerHTML = '<p class="mensagem-sucesso-inline">✅ Pagamento confirmado! Obrigado.</p>';
        } else if (estadoPagamento === 'Rejeitado') {
          clearInterval(intervalo);
          renderErro('Pagamento rejeitado na app MB WAY. Pode tentar novamente.');
        } else if (estadoPagamento === 'Expirado') {
          clearInterval(intervalo);
          renderErro('O pedido expirou (tempo esgotado na app MB WAY). Pode tentar novamente.');
        } else if (estadoPagamento === 'Recusado') {
          clearInterval(intervalo);
          renderErro('Pagamento recusado. Verifique o número de telemóvel e tente novamente.');
        } else if (tentativas >= MAX_TENTATIVAS_POLLING_MBWAY) {
          clearInterval(intervalo);
          renderErro('Não foi possível confirmar o pagamento a tempo. Pode tentar novamente.');
        }
      } catch (err) {
        console.error('Erro ao consultar estado MB WAY:', err.message); // falha pontual de rede - não pára o polling
      }
    }, INTERVALO_POLLING_MBWAY_MS);
  }

  if (mbway && mbway.enviado === false) {
    renderErro(mbway.erro || 'Não foi possível enviar o pedido de pagamento MB WAY.');
  } else {
    renderAguardar();
    iniciarPolling();
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
