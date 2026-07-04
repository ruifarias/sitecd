let varianteSeleccionada = null;
let disponivelSeleccionada = 0;
let quantidade = 1;
let artigoActual = null;

function obterCodigoDaURL() {
  return new URLSearchParams(window.location.search).get('codigo');
}

function construirURLListagem() {
  const urlParams = new URLSearchParams(window.location.search);
  const filtros = new URLSearchParams();

  // Passar todos os filtros que vieram da listagem de volta
  if (urlParams.get('q')) filtros.set('q', urlParams.get('q'));
  if (urlParams.get('marcaText')) filtros.set('marcaText', urlParams.get('marcaText'));
  if (urlParams.get('cor')) filtros.set('cor', urlParams.get('cor'));
  if (urlParams.get('tamanho')) filtros.set('tamanho', urlParams.get('tamanho'));
  if (urlParams.get('marca')) filtros.set('marca', urlParams.get('marca'));
  if (urlParams.get('genero')) filtros.set('genero', urlParams.get('genero'));
  if (urlParams.get('modalidade')) filtros.set('modalidade', urlParams.get('modalidade'));
  if (urlParams.get('familiaGrau4')) filtros.set('familiaGrau4', urlParams.get('familiaGrau4'));

  return `index.html${filtros.toString() ? '?' + filtros.toString() : ''}`;
}

async function renderArtigo(a) {
  const imagemPrincipal = a.imagens[0] || '';

  // Ler filtros da URL
  const urlParams = new URLSearchParams(window.location.search);
  const qParam = urlParams.get('q') || '';
  const marcaTextParam = urlParams.get('marcaText') || '';
  const corParam = urlParams.get('cor') || '';
  const tamanhoParam = urlParams.get('tamanho') || '';
  const marcaParam = urlParams.get('marca') || '';
  const generoParam = urlParams.get('genero') || '';
  const modalidadeParam = urlParams.get('modalidade') || '';

  // Carregar artigos da mesma sub-família com filtros passados da listagem
  let artigosMesmaSub = [];
  let familiaInfo = null;
  try {
    const params = new URLSearchParams();
    if (qParam) params.append('q', qParam);
    if (marcaTextParam) params.append('marcaText', marcaTextParam);
    if (corParam) params.append('cor', corParam);
    if (tamanhoParam) params.append('tamanho', tamanhoParam);
    if (marcaParam) params.append('marca', marcaParam);
    if (generoParam) params.append('genero', generoParam);
    if (modalidadeParam) params.append('modalidade', modalidadeParam);

    const resultado = await apiGet(`/artigos/${a.codigo}/mesma-subfamilia${params.toString() ? '?' + params.toString() : ''}`);
    artigosMesmaSub = resultado.artigos || [];
    familiaInfo = {
      grau1: resultado.familiaGrau1,
      grau2: resultado.familiaGrau2,
      grau3: resultado.familiaGrau3,
      grau4: resultado.familiaGrau4,
      codigoGrau1: resultado.codigoFamiliaGrau1,
      codigoGrau2: resultado.codigoFamiliaGrau2,
      codigoGrau3: resultado.codigoFamiliaGrau3,
      codigoGrau4: resultado.codigoFamiliaGrau4,
    };
  } catch (err) {
    console.error('Erro ao carregar artigos da mesma sub-família:', err);
  }

  document.getElementById('layout-artigo').innerHTML = `
    <div class="galeria-principal">
      <img src="${imagemPrincipal}" alt="${a.descricao}" id="imagem-principal" onerror="this.style.opacity=0">
    </div>
    <div class="info-artigo">
      <a href="${construirURLListagem()}" class="botao-voltar">← Voltar</a>
      ${a.emOutlet ? '<span class="badge-outlet">Outlet</span>' : ''}
      <div class="marca">${a.marca || ''} <span class="codigo-artigo">${a.codigo}</span></div>
      <h1>${a.descricao}</h1>
      <div class="precos">
        <span class="preco-actual">${formatarPreco(a.emOutlet ? a.precoOutlet : a.preco)}</span>
        ${a.emOutlet ? `<span class="preco-original">${formatarPreco(a.preco)}</span>` : ''}
      </div>

      <div class="selector-variante">
        <div class="selector-header">
          <h4>Seleccione uma Cor/Tamanho</h4>
          ${a.variantes.some(v => v.disponivel <= 0) ? '<button class="botao-mostrar-sem-stock" id="mostrar-sem-stock">Mostrar sem stock</button>' : ''}
        </div>
        <div class="opcoes-variante" id="opcoes-variante">
          ${a.variantes.map((v) => `
            <span class="opcao-variante ${v.disponivel <= 0 ? 'esgotada variante-sem-stock' : ''}" data-lote="${v.codigoLote}" data-disponivel="${v.disponivel}" title="${v.descricao}">
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

      ${a.descricaoLonga ? `<div class="descricao-longa">${a.descricaoLonga}</div>` : ''}
    </div>
    ${familiaInfo && familiaInfo.grau4 ? `
      <div class="secao-familia">
        <h4>
          Ver todos: <a href="index.html?familiaGrau1=${encodeURIComponent(familiaInfo.codigoGrau1)}&familiaGrau2=${encodeURIComponent(familiaInfo.codigoGrau2)}&familiaGrau3=${encodeURIComponent(familiaInfo.codigoGrau3)}&familiaGrau4=${encodeURIComponent(familiaInfo.codigoGrau4)}" class="titulo-familia-link">
            ${[familiaInfo.grau1, familiaInfo.grau2, familiaInfo.grau3, familiaInfo.grau4].filter(g => g).join(' > ')}
          </a>
        </h4>
        ${artigosMesmaSub.length > 0 ? `
          <div class="carousel-container">
            <button class="carousel-arrow carousel-arrow-esq" id="carousel-prev">‹</button>
            <div class="artigos-mesma-sub-scroll" id="artigos-carousel">
              ${artigosMesmaSub.map((art) => {
                const urlParams = new URLSearchParams();
                urlParams.set('codigo', art.codigo);
                if (qParam) urlParams.set('q', qParam);
                if (marcaTextParam) urlParams.set('marcaText', marcaTextParam);
                if (corParam) urlParams.set('cor', corParam);
                if (tamanhoParam) urlParams.set('tamanho', tamanhoParam);
                if (marcaParam) urlParams.set('marca', marcaParam);
                if (generoParam) urlParams.set('genero', generoParam);
                if (modalidadeParam) urlParams.set('modalidade', modalidadeParam);
                const urlArtigo = `artigo.html?${urlParams.toString()}`;
                return `
                <a href="${urlArtigo}" class="link-artigo-sub-scroll">
                  <div class="imagem-sub" style="background-image: url('${art.imagem || ''}'); background-size: cover; background-position: center;"></div>
                  <span class="nome-sub">${art.descricao}</span>
                  <span class="preco-sub">${formatarPreco(art.emOutlet ? art.precoOutlet : art.preco)}</span>
                </a>
              `;
              }).join('')}
            </div>
            <button class="carousel-arrow carousel-arrow-dir" id="carousel-next">›</button>
          </div>
        ` : '<p class="sem-alternativas">Sem alternativas com os filtros seleccionados</p>'}
      </div>
    ` : ''}
  `;

  // Carousel controls
  const carouselPrev = document.getElementById('carousel-prev');
  const carouselNext = document.getElementById('carousel-next');
  const carouselContainer = document.getElementById('artigos-carousel');

  if (carouselPrev && carouselNext && carouselContainer) {
    const scrollAmount = 300; // pixels to scroll per click
    carouselPrev.addEventListener('click', () => {
      carouselContainer.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    });
    carouselNext.addEventListener('click', () => {
      carouselContainer.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    });
  }

  // Botão para mostrar/ocultar variantes sem stock
  const botaoMostrarSemStock = document.getElementById('mostrar-sem-stock');
  const opcoesList = document.getElementById('opcoes-variante');
  if (botaoMostrarSemStock) {
    botaoMostrarSemStock.addEventListener('click', () => {
      opcoesList.classList.toggle('mostrar-sem-stock');
      botaoMostrarSemStock.textContent = opcoesList.classList.contains('mostrar-sem-stock') ? 'Ocultar sem stock' : 'Mostrar sem stock';
    });
  }

  document.querySelectorAll('.opcao-variante').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.classList.contains('esgotada')) return; // Não permitir selecionar esgotadas
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
