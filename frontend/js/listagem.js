const estado = {
  familia: null,
  marca: null,
  marcaText: null,
  modalidade: null,
  genero: null,
  q: null,
  cor: null,
  tamanho: null,
  separador: 'todos',
  ordenar: 'preco_desc',
  page: 1,
  familiaGrau1: null,
  familiaGrau2: null,
  familiaGrau3: null,
  familiaGrau4: null,
};

function lerParametrosURL() {
  Object.assign(estado, lerEstadoFiltrosDaURL());

  if (estado.q) document.getElementById('pesquisa-input').value = estado.q;
  if (estado.marcaText) document.getElementById('pesquisa-marca').value = estado.marcaText;
  if (estado.cor) document.getElementById('pesquisa-cor').value = estado.cor;
  if (estado.tamanho) document.getElementById('pesquisa-tamanho').value = estado.tamanho;
  document.getElementById('ordenar').value = estado.ordenar;
}

function actualizarURL() {
  const query = paramsFiltros(estado).toString();
  window.history.replaceState({}, '', query ? `?${query}` : window.location.pathname);
}

function aoMudarFiltro() {
  estado.page = 1;
  actualizarURL();
  carregarArtigos();
}

function renderProdutos(artigos) {
  const grelha = document.getElementById('grelha-produtos');
  if (artigos.length === 0) {
    grelha.innerHTML = '<div class="vazio">Sem artigos para os filtros seleccionados.</div>';
    return;
  }

  // Se a ordenação é por família, género ou modalidade, agrupar
  if (estado.ordenar === 'familia') {
    renderProdutosAgrupadosPorFamilia(artigos);
  } else if (estado.ordenar === 'genero') {
    renderProdutosAgrupadosPorGenero(artigos);
  } else if (estado.ordenar === 'modalidade') {
    renderProdutosAgrupadosPorModalidade(artigos);
  } else {
    renderProdutosSimples(artigos);
  }
}

function construirURLArtigo(codigo) {
  const params = paramsFiltros(estado);
  params.set('codigo', codigo);
  return `artigo.html?${params.toString()}`;
}

function renderProdutosSimples(artigos) {
  const grelha = document.getElementById('grelha-produtos');
  grelha.innerHTML = artigos.map((a) => `
    <a class="cartao-produto" href="${construirURLArtigo(a.codigo)}">
      <div class="imagem-wrap">
        ${a.emOutlet ? '<span class="tag-outlet">Outlet</span>' : ''}
        ${a.emNovidade ? '<span class="tag-novidade">NEW</span>' : ''}
        <img src="${a.imagem || ''}" alt="${a.descricao}" loading="lazy" onerror="this.style.opacity=0">
      </div>
      <div class="marca">${a.marca || ''} <span class="codigo-artigo">${a.codigo}</span></div>
      <div class="nome">${a.descricao}</div>
      <div class="precos">
        <span class="preco-actual">${formatarPreco(a.emOutlet ? a.precoOutlet : a.preco)}</span>
        ${a.emOutlet ? `<span class="preco-original">${formatarPreco(a.preco)}</span><span class="desconto-percentagem">${formatarDesconto(a.preco, a.precoOutlet)}</span>` : ''}
      </div>
    </a>
  `).join('');
}

function renderProdutosAgrupadosPorGenero(artigos) {
  const grelha = document.getElementById('grelha-produtos');

  // Agrupar artigos por género
  const grupos = {};
  artigos.forEach((a) => {
    const genero = a.genero || 'Sem género';
    if (!grupos[genero]) {
      grupos[genero] = [];
    }
    grupos[genero].push(a);
  });

  // Renderizar com cabeçalhos
  let html = '';
  Object.keys(grupos).forEach((genero) => {
    html += `<div class="grupo-titulo">${genero}</div>`;
    html += grupos[genero].map((a) => `
      <a class="cartao-produto" href="${construirURLArtigo(a.codigo)}">
        <div class="imagem-wrap">
          ${a.emOutlet ? '<span class="tag-outlet">Outlet</span>' : ''}
        ${a.emNovidade ? '<span class="tag-novidade">NEW</span>' : ''}
          <img src="${a.imagem || ''}" alt="${a.descricao}" loading="lazy" onerror="this.style.opacity=0">
        </div>
        <div class="marca">${a.marca || ''} <span class="codigo-artigo">${a.codigo}</span></div>
        <div class="nome">${a.descricao}</div>
        <div class="precos">
          <span class="preco-actual">${formatarPreco(a.emOutlet ? a.precoOutlet : a.preco)}</span>
          ${a.emOutlet ? `<span class="preco-original">${formatarPreco(a.preco)}</span><span class="desconto-percentagem">${formatarDesconto(a.preco, a.precoOutlet)}</span>` : ''}
        </div>
      </a>
    `).join('');
  });

  grelha.innerHTML = html;
}

function renderProdutosAgrupadosPorModalidade(artigos) {
  const grelha = document.getElementById('grelha-produtos');

  // Agrupar artigos por modalidade
  const grupos = {};
  artigos.forEach((a) => {
    const modalidade = a.modalidade || 'Sem modalidade';
    if (!grupos[modalidade]) {
      grupos[modalidade] = [];
    }
    grupos[modalidade].push(a);
  });

  // Renderizar com cabeçalhos
  let html = '';
  Object.keys(grupos).forEach((modalidade) => {
    html += `<div class="grupo-titulo">${modalidade}</div>`;
    html += grupos[modalidade].map((a) => `
      <a class="cartao-produto" href="${construirURLArtigo(a.codigo)}">
        <div class="imagem-wrap">
          ${a.emOutlet ? '<span class="tag-outlet">Outlet</span>' : ''}
        ${a.emNovidade ? '<span class="tag-novidade">NEW</span>' : ''}
          <img src="${a.imagem || ''}" alt="${a.descricao}" loading="lazy" onerror="this.style.opacity=0">
        </div>
        <div class="marca">${a.marca || ''} <span class="codigo-artigo">${a.codigo}</span></div>
        <div class="nome">${a.descricao}</div>
        <div class="precos">
          <span class="preco-actual">${formatarPreco(a.emOutlet ? a.precoOutlet : a.preco)}</span>
          ${a.emOutlet ? `<span class="preco-original">${formatarPreco(a.preco)}</span><span class="desconto-percentagem">${formatarDesconto(a.preco, a.precoOutlet)}</span>` : ''}
        </div>
      </a>
    `).join('');
  });

  grelha.innerHTML = html;
}

function renderProdutosAgrupadosPorFamilia(artigos) {
  const grelha = document.getElementById('grelha-produtos');

  // Agrupar artigos por família (Grau1 > Grau2 > Grau3 > Grau4)
  const grupos = {};
  artigos.forEach((a) => {
    const chave = `${a.familiaGrau1 || 'Sem Família'}|${a.familiaGrau2 || ''}|${a.familiaGrau3 || ''}|${a.familiaGrau4 || ''}`;
    if (!grupos[chave]) {
      const codigoFamilia = a.codigoFamilia || '';
      grupos[chave] = {
        grau1: a.familiaGrau1 || 'Sem Família',
        grau2: a.familiaGrau2 || '',
        grau3: a.familiaGrau3 || '',
        grau4: a.familiaGrau4 || '',
        // Códigos por nível derivados por prefixo do código completo, tal
        // como no resto do site (ver /familias/grauN e mesma-subfamilia).
        codigoGrau1: codigoFamilia.substring(0, 1),
        codigoGrau2: codigoFamilia.substring(0, 2),
        codigoGrau3: codigoFamilia.substring(0, 3),
        codigoGrau4: codigoFamilia,
        artigos: [],
      };
    }
    grupos[chave].artigos.push(a);
  });

  // Renderizar com cabeçalhos de família (um link por grau, tal como nas
  // "Alternativas" da ficha de artigo - ver construirBreadcrumbFamilia em cabecalho.js)
  let html = '';
  Object.keys(grupos).forEach((chave) => {
    const familia = grupos[chave];
    const familiaLabel = familia.grau1 === 'Sem Família'
      ? 'Sem Família'
      : construirBreadcrumbFamilia(familia);

    html += `<div class="grupo-titulo grupo-familia">${familiaLabel}</div>`;
    html += familia.artigos.map((a) => `
      <a class="cartao-produto" href="${construirURLArtigo(a.codigo)}">
        <div class="imagem-wrap">
          ${a.emOutlet ? '<span class="tag-outlet">Outlet</span>' : ''}
        ${a.emNovidade ? '<span class="tag-novidade">NEW</span>' : ''}
          <img src="${a.imagem || ''}" alt="${a.descricao}" loading="lazy" onerror="this.style.opacity=0">
        </div>
        <div class="marca">${a.marca || ''} <span class="codigo-artigo">${a.codigo}</span></div>
        <div class="nome">${a.descricao}</div>
        <div class="precos">
          <span class="preco-actual">${formatarPreco(a.emOutlet ? a.precoOutlet : a.preco)}</span>
          ${a.emOutlet ? `<span class="preco-original">${formatarPreco(a.preco)}</span><span class="desconto-percentagem">${formatarDesconto(a.preco, a.precoOutlet)}</span>` : ''}
        </div>
      </a>
    `).join('');
  });

  grelha.innerHTML = html;
}

function renderBotaoCarregarMais(pagina, totalPaginas) {
  const container = document.getElementById('carregar-mais-container');
  if (pagina >= totalPaginas) {
    container.innerHTML = artigosCarregados.length > 0
      ? '<p class="fim-listagem">FIM DE LISTAGEM - Reveja os filtros!</p>'
      : '';
    return;
  }

  container.innerHTML = `<button class="botao-carregar-mais" id="btn-carregar-mais">Carregar Mais Artigos</button>`;
  document.getElementById('btn-carregar-mais').addEventListener('click', (e) => {
    e.target.disabled = true;
    e.target.textContent = 'A carregar...';
    estado.page += 1;
    carregarArtigos(true);
  });
}

const TAMANHO_PAGINA = 98;
let artigosCarregados = [];

async function carregarArtigos(acumular = false) {
  if (!acumular) {
    estado.page = 1;
    artigosCarregados = [];
    document.getElementById('contagem-resultados').textContent = 'A carregar...';
  }
  const params = new URLSearchParams();
  if (estado.familia) params.set('familia', estado.familia);
  if (estado.marca) params.set('marca', estado.marca);
  if (estado.marcaText) params.set('marcaText', estado.marcaText);
  if (estado.modalidade) params.set('modalidade', estado.modalidade);
  if (estado.genero) params.set('genero', estado.genero);
  if (estado.q) params.set('q', estado.q);
  if (estado.cor) params.set('cor', estado.cor);
  if (estado.tamanho) params.set('tamanho', estado.tamanho);
  if (estado.separador !== 'todos') params.set('separador', estado.separador);
  params.set('ordenar', estado.ordenar);
  params.set('page', estado.page);
  params.set('pageSize', TAMANHO_PAGINA);

  try {
    const dados = await apiGet(`/artigos?${params.toString()}`);
    artigosCarregados = acumular ? artigosCarregados.concat(dados.artigos) : dados.artigos;
    document.getElementById('contagem-resultados').textContent = artigosCarregados.length < dados.total
      ? `${artigosCarregados.length} de ${dados.total} artigos`
      : `${dados.total} artigo${dados.total === 1 ? '' : 's'}`;
    renderProdutos(artigosCarregados);
    renderBotaoCarregarMais(dados.page, dados.totalPages);
  } catch (err) {
    document.getElementById('contagem-resultados').textContent = 'Erro ao carregar artigos.';
    document.getElementById('grelha-produtos').innerHTML = `<div class="vazio">${err.message}</div>`;
  }
}

document.getElementById('ordenar').addEventListener('change', (e) => {
  estado.ordenar = e.target.value;
  aoMudarFiltro();
});

let debouncePesquisa;
document.getElementById('pesquisa-input').addEventListener('input', (e) => {
  clearTimeout(debouncePesquisa);
  debouncePesquisa = setTimeout(() => {
    estado.q = e.target.value.trim() || null;
    aoMudarFiltro();
  }, 350);
});

let debounceCor;
document.getElementById('pesquisa-cor').addEventListener('input', (e) => {
  clearTimeout(debounceCor);
  debounceCor = setTimeout(() => {
    estado.cor = e.target.value.trim() || null;
    aoMudarFiltro();
  }, 350);
});

let debounceTamanho;
document.getElementById('pesquisa-tamanho').addEventListener('input', (e) => {
  clearTimeout(debounceTamanho);
  debounceTamanho = setTimeout(() => {
    estado.tamanho = e.target.value.trim() || null;
    aoMudarFiltro();
  }, 350);
});

let debounceMarca;
document.getElementById('pesquisa-marca').addEventListener('input', (e) => {
  clearTimeout(debounceMarca);
  debounceMarca = setTimeout(() => {
    estado.marcaText = e.target.value.trim() || null;
    aoMudarFiltro();
  }, 350);
});

// Ao abrir a ficha de um artigo, guardar a posição da listagem para a repor
// quando o utilizador fizer "Voltar" (navegação completa, sem history.back()).
document.getElementById('grelha-produtos').addEventListener('click', (e) => {
  if (!e.target.closest('a.cartao-produto')) return;
  sessionStorage.setItem('listagemPosicao', JSON.stringify({
    filtros: paramsFiltros(estado).toString(),
    page: estado.page,
    scrollY: window.scrollY,
  }));
});

function lerPosicaoGuardada() {
  const bruto = sessionStorage.getItem('listagemPosicao');
  if (!bruto) return null;
  sessionStorage.removeItem('listagemPosicao');
  try {
    return JSON.parse(bruto);
  } catch {
    return null;
  }
}

(async function init() {
  lerParametrosURL();
  document.getElementById('aviso-outlet').textContent = mensagemPeriodoOutlet();
  await inicializarCabecalho(estado, aoMudarFiltro);
  await carregarArtigos();

  const guardado = lerPosicaoGuardada();
  if (guardado && guardado.filtros === paramsFiltros(estado).toString()) {
    for (let p = 2; p <= guardado.page; p++) {
      estado.page = p;
      await carregarArtigos(true);
    }
    requestAnimationFrame(() => window.scrollTo(0, guardado.scrollY));
  }
})();
