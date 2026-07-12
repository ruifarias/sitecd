let varianteSeleccionada = null;
let disponivelSeleccionada = 0;
let quantidade = 1;
let artigoActual = null;

// Mesmo objecto de estado e cabeçalho de filtros da listagem (ver
// cabecalho.js): aqui não há grelha para actualizar no local, por isso mudar
// um filtro navega directamente para a listagem já com esse filtro aplicado.
const { estado, aoMudarFiltro } = criarNavegacaoParaListagem();

function obterCodigoDaURL() {
  return new URLSearchParams(window.location.search).get('codigo');
}

function construirURLListagem() {
  const query = paramsFiltros(estado).toString();
  return `index.html${query ? '?' + query : ''}`;
}

// Link para um grau específico da família (ex: clicar em "CACHECOL" no
// breadcrumb "ACESSORIOS TEXTIL > CACHECOL > ..." vai directo a esse grau,
// sem arrastar os graus mais profundos que o utilizador ainda não escolheu).
function construirLinkFamiliaGrau(familiaInfo, ateGrau) {
  const params = new URLSearchParams();
  for (let g = 1; g <= ateGrau; g++) params.set(`familiaGrau${g}`, familiaInfo[`codigoGrau${g}`]);
  params.set('familia', familiaInfo[`codigoGrau${ateGrau}`]);
  params.set('ordenar', 'familia');
  return `index.html?${params.toString()}`;
}

function construirBreadcrumbFamilia(familiaInfo) {
  return [1, 2, 3, 4]
    .filter((g) => familiaInfo[`grau${g}`])
    .map((g) => `<a href="${construirLinkFamiliaGrau(familiaInfo, g)}" class="titulo-familia-link">${familiaInfo[`grau${g}`]}</a>`)
    .join(' <span class="separador-familia">&gt;</span> ');
}

async function renderArtigo(a) {
  const imagemPrincipal = a.imagens[0] || '';

  // Carregar artigos da mesma sub-família com filtros passados da listagem
  let artigosMesmaSub = [];
  let familiaInfo = null;
  try {
    const params = new URLSearchParams();
    if (estado.q) params.append('q', estado.q);
    if (estado.marcaText) params.append('marcaText', estado.marcaText);
    if (estado.cor) params.append('cor', estado.cor);
    if (estado.tamanho) params.append('tamanho', estado.tamanho);
    if (estado.marca) params.append('marca', estado.marca);
    if (estado.genero) params.append('genero', estado.genero);
    if (estado.modalidade) params.append('modalidade', estado.modalidade);

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
      ${a.emNovidade ? '<span class="badge-novidade">NEW</span>' : ''}
      ${a.emOutlet ? `<span class="badge-outlet">Outlet</span><span class="aviso-outlet">${mensagemPeriodoOutlet()}</span>` : ''}
      <div class="marca">${a.marca || ''} <span class="codigo-artigo">${a.codigo}</span></div>
      <h1>${a.descricao}</h1>
      <div class="precos">
        <span class="preco-actual">${formatarPreco(a.emOutlet ? a.precoOutlet : a.preco)}</span>
        ${a.emOutlet ? `<span class="preco-original">${formatarPreco(a.preco)}</span><span class="desconto-percentagem">${formatarDesconto(a.preco, a.precoOutlet)}</span>` : ''}
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

      <div class="linha-quantidade-acoes">
        <div class="qtd-selector">
          <button id="qtd-menos">−</button>
          <span id="qtd-valor">1</span>
          <button id="qtd-mais">+</button>
          <span id="qtd-limite-aviso" class="qtd-limite-aviso"></span>
        </div>
        <div class="botoes-info-artigo">
          ${a.descricaoLonga ? '<button type="button" class="botao-info-artigo" data-painel="especificacoes">Especificações</button>' : ''}
        </div>
      </div>

      <div id="mensagem-carrinho"></div>
      <button class="botao-principal" id="btn-adicionar" disabled>Selecciona uma Cor/Tamanho</button>

      ${a.descricaoLonga ? `<div class="descricao-longa" id="painel-especificacoes" hidden>${a.descricaoLonga}</div>` : ''}
    </div>
    ${familiaInfo && familiaInfo.grau4 ? `
      <div class="secao-familia">
        <h4>
          <span class="rotulo-alternativas">ALTERNATIVAS:</span> ${construirBreadcrumbFamilia(familiaInfo)}
        </h4>
        ${artigosMesmaSub.length > 0 ? `
          <div class="carousel-container">
            <button class="carousel-arrow carousel-arrow-esq" id="carousel-prev">‹</button>
            <div class="artigos-mesma-sub-scroll" id="artigos-carousel">
              ${artigosMesmaSub.map((art) => {
                const paramsArtigo = paramsFiltros(estado);
                paramsArtigo.set('codigo', art.codigo);
                const urlArtigo = `artigo.html?${paramsArtigo.toString()}`;
                return `
                <a href="${urlArtigo}" class="link-artigo-sub-scroll">
                  <div class="imagem-sub" style="background-image: url('${art.imagem || ''}'); background-size: cover; background-position: center;">
                    ${art.emNovidade ? '<span class="tag-novidade">NEW</span>' : ''}
                    ${art.emOutlet ? '<span class="tag-outlet">Outlet</span>' : ''}
                  </div>
                  <div class="marca-sub">${art.marca || ''} <span class="codigo-artigo">${art.codigo}</span></div>
                  <span class="nome-sub">${art.descricao}</span>
                  <div class="precos-sub">
                    <span class="preco-sub">${formatarPreco(art.emOutlet ? art.precoOutlet : art.preco)}</span>
                    ${art.emOutlet ? `<span class="preco-original">${formatarPreco(art.preco)}</span><span class="desconto-percentagem">${formatarDesconto(art.preco, art.precoOutlet)}</span>` : ''}
                  </div>
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

  // Clicar na imagem principal amplia-a num overlay ao centro do ecrã;
  // clicar de novo na imagem, no overlay ou premir Escape fecha-o.
  const imagemPrincipalEl = document.getElementById('imagem-principal');
  if (imagemPrincipalEl && imagemPrincipalEl.getAttribute('src')) {
    imagemPrincipalEl.addEventListener('click', () => {
      const overlay = document.getElementById('lightbox-imagem');
      const jaAbertaComEstaImagem = overlay && overlay.classList.contains('aberta') && overlay.querySelector('img').src === imagemPrincipalEl.src;
      if (jaAbertaComEstaImagem) {
        fecharImagemAmpliada();
      } else {
        mostrarImagemAmpliada(imagemPrincipalEl.src, imagemPrincipalEl.alt);
      }
    });
  }

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

  // Botões de informação (Especificações, e outros que venham a ser
  // adicionados) - cada botão tem data-painel="x" e mostra/esconde
  // #painel-x, fechando os restantes para não abrir vários ao mesmo tempo.
  document.querySelectorAll('.botao-info-artigo').forEach((botao) => {
    botao.addEventListener('click', () => {
      const painel = document.getElementById(`painel-${botao.dataset.painel}`);
      if (!painel) return;
      const aFechar = !painel.hidden;
      document.querySelectorAll('.botao-info-artigo').forEach((b) => b.classList.remove('activo'));
      document.querySelectorAll('.info-artigo [id^="painel-"]').forEach((p) => { p.hidden = true; });
      if (!aFechar) {
        painel.hidden = false;
        botao.classList.add('activo');
      }
    });
  });

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
  configurarPesquisaInputsNavegacao(estado, aoMudarFiltro);
  await inicializarCabecalho(estado, aoMudarFiltro);
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
