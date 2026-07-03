let varianteSeleccionada = null;
let disponivelSeleccionada = 0;
let quantidade = 1;
let artigoActual = null;

function obterCodigoDaURL() {
  return new URLSearchParams(window.location.search).get('codigo');
}

async function renderArtigo(a) {
  const imagemPrincipal = a.imagens[0] || '';

  // Carregar artigos da mesma sub-família
  let artigosMesmaSub = [];
  try {
    artigosMesmaSub = await apiGet(`/artigos/${a.codigo}/mesma-subfamilia`);
  } catch (err) {
    console.error('Erro ao carregar artigos da mesma sub-família:', err);
  }

  document.getElementById('layout-artigo').innerHTML = `
    <div class="galeria-principal">
      <img src="${imagemPrincipal}" alt="${a.descricao}" id="imagem-principal" onerror="this.style.opacity=0">
    </div>
    <div class="info-artigo">
      ${a.emOutlet ? '<span class="badge-outlet">Outlet</span>' : ''}
      <div class="marca">${a.marca || ''}</div>
      <h1>${a.descricao}</h1>
      <div class="precos">
        <span class="preco-actual">${formatarPreco(a.emOutlet ? a.precoOutlet : a.preco)}</span>
        ${a.emOutlet ? `<span class="preco-original">${formatarPreco(a.preco)}</span>` : ''}
      </div>

      <div class="selector-variante">
        <h4>Seleccione uma Cor/Tamanho</h4>
        <div class="opcoes-variante" id="opcoes-variante">
          ${a.variantes.map((v) => `
            <span class="opcao-variante ${v.disponivel <= 0 ? 'esgotada' : ''}" data-lote="${v.codigoLote}" data-disponivel="${v.disponivel}" title="${v.descricao}">
              ${v.descricao}${v.disponivel > 0 ? ` <span class="qtd-disponivel-variante">(${v.disponivel} disp.)</span>` : ''}
            </span>
          `).join('')}
        </div>
      </div>

      <div class="qtd-selector">
        <button id="qtd-menos">−</button>
        <span id="qtd-valor">1</span>
        <button id="qtd-mais">+</button>
        <span id="qtd-limite-aviso" class="qtd-limite-aviso"></span>
      </div>

      <div id="mensagem-carrinho"></div>
      <button class="botao-principal" id="btn-adicionar" disabled>Selecciona uma Cor/Tamanho</button>

      ${a.familiaGrau3 || a.familiaGrau4 ? `
        <div class="secao-familia">
          <h4>Artigos da mesma Familia</h4>
          <div class="familia-info">
            ${a.familiaGrau3 ? `<div class="familia-linha">${a.familiaGrau3}</div>` : ''}
            ${a.familiaGrau4 ? `<div class="familia-linha"><strong>${a.familiaGrau4}</strong></div>` : ''}
          </div>
          ${artigosMesmaSub.length > 0 ? `
            <div class="artigos-mesma-sub">
              ${artigosMesmaSub.slice(0, 5).map((art) => `
                <a href="artigo.html?codigo=${art.codigo}" class="link-artigo-sub">
                  <span class="nome-sub">${art.descricao}</span>
                  <span class="preco-sub">${formatarPreco(art.emOutlet ? art.precoOutlet : art.preco)}</span>
                </a>
              `).join('')}
            </div>
          ` : ''}
        </div>
      ` : ''}

      ${a.descricaoLonga ? `<div class="descricao-longa">${a.descricaoLonga}</div>` : ''}
    </div>
  `;

  document.querySelectorAll('.opcao-variante:not(.esgotada)').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.opcao-variante').forEach((o) => o.classList.remove('seleccionada'));
      el.classList.add('seleccionada');
      varianteSeleccionada = el.dataset.lote;
      disponivelSeleccionada = parseInt(el.dataset.disponivel, 10) || 0;
      quantidade = 1; // reinicia a quantidade ao trocar de variante, para nunca herdar um valor acima do novo stock
      document.getElementById('qtd-valor').textContent = quantidade;
      document.getElementById('btn-adicionar').disabled = false;
      document.getElementById('btn-adicionar').textContent = 'Adicionar ao Carrinho';
      actualizarLimiteQuantidade();
    });
  });

  document.getElementById('qtd-menos').addEventListener('click', () => {
    if (quantidade > 1) { quantidade--; document.getElementById('qtd-valor').textContent = quantidade; }
    actualizarLimiteQuantidade();
  });
  document.getElementById('qtd-mais').addEventListener('click', () => {
    if (quantidade < disponivelSeleccionada) {
      quantidade++;
      document.getElementById('qtd-valor').textContent = quantidade;
    }
    actualizarLimiteQuantidade();
  });

  document.getElementById('btn-adicionar').addEventListener('click', adicionarAoCarrinho);
  actualizarLimiteQuantidade();
}

function actualizarLimiteQuantidade() {
  const btnMais = document.getElementById('qtd-mais');
  const aviso = document.getElementById('qtd-limite-aviso');
  if (!btnMais || !aviso) return;
  const noLimite = varianteSeleccionada && quantidade >= disponivelSeleccionada;
  btnMais.disabled = noLimite;
  aviso.textContent = noLimite ? `Máximo em stock (${disponivelSeleccionada})` : '';
}

async function adicionarAoCarrinho() {
  const mensagem = document.getElementById('mensagem-carrinho');
  mensagem.innerHTML = '';
  if (!varianteSeleccionada) return;

  try {
    await apiPost('/carrinho', {
      sessaoId: obterSessaoId(),
      codigoArtigo: artigoActual.codigo,
      codigoLote: varianteSeleccionada,
      quantidade,
    });
    mensagem.innerHTML = '<div class="mensagem-sucesso" style="padding:10px;font-size:13px;">Adicionado ao carrinho.</div>';
    actualizarBadgeCarrinho();
  } catch (err) {
    mensagem.innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
  }
}

(async function init() {
  const codigo = obterCodigoDaURL();
  if (!codigo) {
    document.getElementById('layout-artigo').innerHTML = '<div class="vazio">Artigo não especificado.</div>';
    return;
  }
  try {
    artigoActual = await apiGet(`/artigos/${codigo}`);
    await renderArtigo(artigoActual);
  } catch (err) {
    document.getElementById('layout-artigo').innerHTML = `<div class="vazio">${err.message}</div>`;
  }
})();
