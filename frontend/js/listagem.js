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
  const params = new URLSearchParams(window.location.search);
  estado.separador = params.get('separador') || 'todos';
  estado.marca = params.get('marca') || null;
  estado.marcaText = params.get('marcaText') || null;
  estado.modalidade = params.get('modalidade') || null;
  estado.genero = params.get('genero') || null;
  estado.q = params.get('q') || null;
  estado.cor = params.get('cor') || null;
  estado.tamanho = params.get('tamanho') || null;
  estado.ordenar = params.get('ordenar') || 'preco_desc';
  estado.page = parseInt(params.get('page'), 10) || 1;
  estado.familiaGrau1 = params.get('familiaGrau1') || null;
  estado.familiaGrau2 = params.get('familiaGrau2') || null;
  estado.familiaGrau3 = params.get('familiaGrau3') || null;
  estado.familiaGrau4 = params.get('familiaGrau4') || null;
  estado.familia = params.get('familia') || null;

  if (estado.q) document.getElementById('pesquisa-input').value = estado.q;
  if (estado.marcaText) document.getElementById('pesquisa-marca').value = estado.marcaText;
  if (estado.cor) document.getElementById('pesquisa-cor').value = estado.cor;
  if (estado.tamanho) document.getElementById('pesquisa-tamanho').value = estado.tamanho;
  document.getElementById('ordenar').value = estado.ordenar;
}

function actualizarURL() {
  const params = new URLSearchParams();
  if (estado.separador && estado.separador !== 'todos') params.set('separador', estado.separador);
  if (estado.marca) params.set('marca', estado.marca);
  if (estado.marcaText) params.set('marcaText', estado.marcaText);
  if (estado.modalidade) params.set('modalidade', estado.modalidade);
  if (estado.genero) params.set('genero', estado.genero);
  if (estado.q) params.set('q', estado.q);
  if (estado.cor) params.set('cor', estado.cor);
  if (estado.tamanho) params.set('tamanho', estado.tamanho);
  if (estado.ordenar !== 'preco_desc') params.set('ordenar', estado.ordenar);
  if (estado.familiaGrau1) params.set('familiaGrau1', estado.familiaGrau1);
  if (estado.familiaGrau2) params.set('familiaGrau2', estado.familiaGrau2);
  if (estado.familiaGrau3) params.set('familiaGrau3', estado.familiaGrau3);
  if (estado.familiaGrau4) params.set('familiaGrau4', estado.familiaGrau4);
  if (estado.familia) params.set('familia', estado.familia);
  if (estado.page > 1) params.set('page', estado.page);
  const query = params.toString();
  window.history.replaceState({}, '', query ? `?${query}` : window.location.pathname);
}

function renderSeparadores() {
  const container = document.getElementById('separadores');
  const opcoes = [
    { valor: 'todos', rotulo: 'Todos os Artigos' },
    { valor: 'novidades', rotulo: 'Novidades' },
    { valor: 'outlet', rotulo: 'Outlet' },
  ];
  container.innerHTML = opcoes.map((o) => `
    <button data-separador="${o.valor}" class="${estado.separador === o.valor ? 'activo' : ''}">${o.rotulo}</button>
  `).join('');
  container.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      estado.separador = btn.dataset.separador;
      estado.page = 1;
      actualizarURL();
      carregarArtigos();
      renderSeparadores();
    });
  });
}

async function renderFiltroMarca() {
  const { principais, outras } = await apiGet('/marcas', true);
  const container = document.getElementById('filtro-marca');

  let html = '';

  // Marcas principais
  if (principais && principais.length > 0) {
    html += principais.map((m) => `
      <li><label><input type="radio" name="marca" value="${m.codigo}" ${estado.marca === m.codigo ? 'checked' : ''}> ${m.nome}</label></li>
    `).join('');
  }

  // Outras marcas (collapse)
  if (outras && outras.length > 0) {
    const expandidoOutras = document.querySelector('[data-expandido-outras]')?.dataset.expandidoOutras === 'true';
    html += `
      <li class="marca-outras-toggle">
        <button id="toggle-outras-marcas" class="botao-outras-marcas">+ Outras Marcas (${outras.length})</button>
      </li>
      <div id="outras-marcas-container" class="outras-marcas-container" style="display: ${expandidoOutras ? 'block' : 'none'};" data-expandido-outras="${expandidoOutras}">
        ${outras.map((m) => `
          <li><label><input type="radio" name="marca" value="${m.codigo}" ${estado.marca === m.codigo ? 'checked' : ''}> ${m.nome}</label></li>
        `).join('')}
      </div>
    `;
  }

  container.innerHTML = html;

  // Event listener para toggle
  const toggleBtn = document.getElementById('toggle-outras-marcas');
  const outrasContainer = document.getElementById('outras-marcas-container');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const estaVisivel = outrasContainer.style.display !== 'none';
      outrasContainer.style.display = estaVisivel ? 'none' : 'block';
      outrasContainer.dataset.expandidoOutras = !estaVisivel;
      toggleBtn.textContent = estaVisivel
        ? `+ Outras Marcas (${outras.length})`
        : `- Outras Marcas (${outras.length})`;
    });
  }

  // Event listeners para radio buttons
  container.querySelectorAll('input').forEach((input) => {
    input.addEventListener('click', (e) => {
      if (e.target.checked && estado.marca === input.value) {
        e.target.checked = false;
        estado.marca = null;
      } else {
        estado.marca = input.value;
      }
      estado.page = 1;
      actualizarURL();
      carregarArtigos();
    });
  });
}

async function renderFiltroModalidade() {
  const modalidades = await apiGet('/modalidades');
  const container = document.getElementById('filtro-modalidade');
  container.innerHTML = modalidades.map((m) => `
    <li><label><input type="radio" name="modalidade" value="${m.tag}" ${estado.modalidade === m.tag ? 'checked' : ''}> ${m.titulo}</label></li>
  `).join('');
  container.querySelectorAll('input').forEach((input) => {
    input.addEventListener('click', (e) => {
      if (e.target.checked && estado.modalidade === input.value) {
        // Se já estava selecionado, desseleccionar
        e.target.checked = false;
        estado.modalidade = null;
      } else {
        // Seleccionar
        estado.modalidade = input.value;
      }
      estado.page = 1;
      actualizarURL();
      carregarArtigos();
    });
  });
}

async function renderFiltroGenero() {
  const generos = await apiGet('/generos');
  const container = document.getElementById('filtro-genero');
  container.innerHTML = generos.map((g) => `
    <li><label><input type="radio" name="genero" value="${g.tag}" ${estado.genero === g.tag ? 'checked' : ''}> ${g.titulo}</label></li>
  `).join('');
  container.querySelectorAll('input').forEach((input) => {
    input.addEventListener('click', (e) => {
      if (e.target.checked && estado.genero === input.value) {
        // Se já estava selecionado, desseleccionar
        e.target.checked = false;
        estado.genero = null;
      } else {
        // Seleccionar
        estado.genero = input.value;
      }
      estado.page = 1;
      actualizarURL();
      carregarArtigos();
    });
  });
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
  const params = new URLSearchParams();
  params.set('codigo', codigo);
  if (estado.q) params.set('q', estado.q);
  if (estado.marcaText) params.set('marcaText', estado.marcaText);
  if (estado.cor) params.set('cor', estado.cor);
  if (estado.tamanho) params.set('tamanho', estado.tamanho);
  if (estado.marca) params.set('marca', estado.marca);
  if (estado.genero) params.set('genero', estado.genero);
  if (estado.modalidade) params.set('modalidade', estado.modalidade);
  if (estado.familiaGrau4) params.set('familiaGrau4', estado.familiaGrau4);
  return `artigo.html?${params.toString()}`;
}

function renderProdutosSimples(artigos) {
  const grelha = document.getElementById('grelha-produtos');
  grelha.innerHTML = artigos.map((a) => `
    <a class="cartao-produto" href="${construirURLArtigo(a.codigo)}">
      <div class="imagem-wrap">
        ${a.emOutlet ? '<span class="tag-outlet">Outlet</span>' : ''}
        <img src="${a.imagem || ''}" alt="${a.descricao}" loading="lazy" onerror="this.style.opacity=0">
      </div>
      <div class="marca">${a.marca || ''} <span class="codigo-artigo">${a.codigo}</span></div>
      <div class="nome">${a.descricao}</div>
      <div class="precos">
        <span class="preco-actual">${formatarPreco(a.emOutlet ? a.precoOutlet : a.preco)}</span>
        ${a.emOutlet ? `<span class="preco-original">${formatarPreco(a.preco)}</span>` : ''}
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
          <img src="${a.imagem || ''}" alt="${a.descricao}" loading="lazy" onerror="this.style.opacity=0">
        </div>
        <div class="marca">${a.marca || ''} <span class="codigo-artigo">${a.codigo}</span></div>
        <div class="nome">${a.descricao}</div>
        <div class="precos">
          <span class="preco-actual">${formatarPreco(a.emOutlet ? a.precoOutlet : a.preco)}</span>
          ${a.emOutlet ? `<span class="preco-original">${formatarPreco(a.preco)}</span>` : ''}
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
          <img src="${a.imagem || ''}" alt="${a.descricao}" loading="lazy" onerror="this.style.opacity=0">
        </div>
        <div class="marca">${a.marca || ''} <span class="codigo-artigo">${a.codigo}</span></div>
        <div class="nome">${a.descricao}</div>
        <div class="precos">
          <span class="preco-actual">${formatarPreco(a.emOutlet ? a.precoOutlet : a.preco)}</span>
          ${a.emOutlet ? `<span class="preco-original">${formatarPreco(a.preco)}</span>` : ''}
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
      grupos[chave] = {
        grau1: a.familiaGrau1 || 'Sem Família',
        grau2: a.familiaGrau2 || '',
        grau3: a.familiaGrau3 || '',
        grau4: a.familiaGrau4 || '',
        artigos: [],
      };
    }
    grupos[chave].artigos.push(a);
  });

  // Renderizar com cabeçalhos de família
  let html = '';
  Object.keys(grupos).forEach((chave) => {
    const familia = grupos[chave];
    const familiaLabel = [familia.grau1, familia.grau2, familia.grau3, familia.grau4]
      .filter(g => g)
      .join(' > ');

    html += `<div class="grupo-titulo grupo-familia">${familiaLabel}</div>`;
    html += familia.artigos.map((a) => `
      <a class="cartao-produto" href="${construirURLArtigo(a.codigo)}">
        <div class="imagem-wrap">
          ${a.emOutlet ? '<span class="tag-outlet">Outlet</span>' : ''}
          <img src="${a.imagem || ''}" alt="${a.descricao}" loading="lazy" onerror="this.style.opacity=0">
        </div>
        <div class="marca">${a.marca || ''} <span class="codigo-artigo">${a.codigo}</span></div>
        <div class="nome">${a.descricao}</div>
        <div class="precos">
          <span class="preco-actual">${formatarPreco(a.emOutlet ? a.precoOutlet : a.preco)}</span>
          ${a.emOutlet ? `<span class="preco-original">${formatarPreco(a.preco)}</span>` : ''}
        </div>
      </a>
    `).join('');
  });

  grelha.innerHTML = html;
}

function renderPaginacao(pagina, totalPaginas) {
  const container = document.getElementById('paginacao');
  if (totalPaginas <= 1) { container.innerHTML = ''; return; }

  const paginas = [];
  const inicio = Math.max(1, pagina - 2);
  const fim = Math.min(totalPaginas, pagina + 2);
  for (let p = inicio; p <= fim; p++) paginas.push(p);

  container.innerHTML = `
    <button ${pagina === 1 ? 'disabled' : ''} data-page="${pagina - 1}">‹</button>
    ${paginas.map((p) => `<button class="${p === pagina ? 'activo' : ''}" data-page="${p}">${p}</button>`).join('')}
    <button ${pagina === totalPaginas ? 'disabled' : ''} data-page="${pagina + 1}">›</button>
  `;
  container.querySelectorAll('button[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      estado.page = parseInt(btn.dataset.page, 10);
      actualizarURL();
      carregarArtigos();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

async function carregarArtigos() {
  document.getElementById('contagem-resultados').textContent = 'A carregar...';
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
  params.set('pageSize', 24);

  try {
    const dados = await apiGet(`/artigos?${params.toString()}`);
    document.getElementById('contagem-resultados').textContent = `${dados.total} artigo${dados.total === 1 ? '' : 's'}`;
    renderProdutos(dados.artigos);
    renderPaginacao(dados.page, dados.totalPages);
  } catch (err) {
    document.getElementById('contagem-resultados').textContent = 'Erro ao carregar artigos.';
    document.getElementById('grelha-produtos').innerHTML = `<div class="vazio">${err.message}</div>`;
  }
}

// Gerir comboboxes em cascata de famílias
async function carregarFamiliasGrau1() {
  try {
    const familias = await apiGet('/familias/grau1');
    const select = document.getElementById('familia-grau1');
    select.innerHTML = '<option value="">Seleccionar Familia...</option>';
    familias.forEach((f) => {
      const option = document.createElement('option');
      option.value = f.codigo;
      option.textContent = `${f.codigo} - ${f.nome}`;
      select.appendChild(option);
    });
  } catch (err) {
    console.error('Erro ao carregar famílias Grau 1:', err);
  }
}

async function carregarFamiliasGrau2(grau1) {
  try {
    const familias = await apiGet(`/familias/grau2?grau1=${grau1}`);
    const select = document.getElementById('familia-grau2');
    select.innerHTML = '<option value="">Seleccionar Sub-Familia1...</option>';
    familias.forEach((f) => {
      const option = document.createElement('option');
      option.value = f.codigo;
      option.textContent = `${f.codigo} - ${f.nome}`;
      select.appendChild(option);
    });
    select.disabled = false;
    select.style.display = 'block';

    // Limpar Grau 3 e 4
    document.getElementById('familia-grau3').innerHTML = '<option value="">Seleccionar Sub-Familia2...</option>';
    document.getElementById('familia-grau3').disabled = true;
    document.getElementById('familia-grau3').style.display = 'none';
    document.getElementById('familia-grau4').innerHTML = '<option value="">Seleccionar Sub-Familia3...</option>';
    document.getElementById('familia-grau4').disabled = true;
    document.getElementById('familia-grau4').style.display = 'none';
  } catch (err) {
    console.error('Erro ao carregar famílias Grau 2:', err);
  }
}

async function carregarFamiliasGrau3(grau2) {
  try {
    const familias = await apiGet(`/familias/grau3?grau2=${grau2}`);
    const select = document.getElementById('familia-grau3');
    select.innerHTML = '<option value="">Seleccionar Sub-Familia2...</option>';
    familias.forEach((f) => {
      const option = document.createElement('option');
      option.value = f.codigo;
      option.textContent = `${f.codigo} - ${f.nome}`;
      select.appendChild(option);
    });
    select.disabled = false;
    select.style.display = 'block';

    // Limpar Grau 4
    document.getElementById('familia-grau4').innerHTML = '<option value="">Seleccionar Sub-Familia3...</option>';
    document.getElementById('familia-grau4').disabled = true;
    document.getElementById('familia-grau4').style.display = 'none';
  } catch (err) {
    console.error('Erro ao carregar famílias Grau 3:', err);
  }
}

async function carregarFamiliasGrau4(grau3) {
  try {
    const familias = await apiGet(`/familias/grau4?grau3=${grau3}`);
    const select = document.getElementById('familia-grau4');
    select.innerHTML = '<option value="">Seleccionar Sub-Familia3...</option>';
    familias.forEach((f) => {
      const option = document.createElement('option');
      option.value = f.codigo;
      option.textContent = `${f.codigo} - ${f.nome}`;
      select.appendChild(option);
    });
    select.disabled = false;
    select.style.display = 'block';
  } catch (err) {
    console.error('Erro ao carregar famílias Grau 4:', err);
  }
}

// Event listeners para comboboxes de famílias
document.getElementById('familia-grau1').addEventListener('change', (e) => {
  estado.familiaGrau1 = e.target.value;
  estado.familiaGrau2 = null;
  estado.familiaGrau3 = null;
  estado.familiaGrau4 = null;
  estado.familia = e.target.value || null;
  estado.page = 1;

  if (estado.familiaGrau1) {
    carregarFamiliasGrau2(estado.familiaGrau1);
  } else {
    document.getElementById('familia-grau2').style.display = 'none';
    document.getElementById('familia-grau3').style.display = 'none';
    document.getElementById('familia-grau4').style.display = 'none';
  }

  actualizarURL();
  carregarArtigos();
});

document.getElementById('familia-grau2').addEventListener('change', (e) => {
  estado.familiaGrau2 = e.target.value;
  estado.familiaGrau3 = null;
  estado.familiaGrau4 = null;
  estado.familia = e.target.value || null;
  estado.page = 1;

  if (estado.familiaGrau2) {
    carregarFamiliasGrau3(estado.familiaGrau2);
  } else {
    document.getElementById('familia-grau3').style.display = 'none';
    document.getElementById('familia-grau4').style.display = 'none';
  }

  actualizarURL();
  carregarArtigos();
});

document.getElementById('familia-grau3').addEventListener('change', (e) => {
  estado.familiaGrau3 = e.target.value;
  estado.familiaGrau4 = null;
  estado.familia = e.target.value || null;
  estado.page = 1;

  if (estado.familiaGrau3) {
    carregarFamiliasGrau4(estado.familiaGrau3);
  } else {
    document.getElementById('familia-grau4').style.display = 'none';
  }

  actualizarURL();
  carregarArtigos();
});

document.getElementById('familia-grau4').addEventListener('change', (e) => {
  estado.familiaGrau4 = e.target.value;
  estado.familia = e.target.value || null;
  estado.page = 1;

  actualizarURL();
  carregarArtigos();
});

document.getElementById('ordenar').addEventListener('change', (e) => {
  estado.ordenar = e.target.value;
  estado.page = 1;

  actualizarURL();
  carregarArtigos();
});

function limparTodosFiltros() {
  estado.marca = null;
  estado.marcaText = null;
  estado.modalidade = null;
  estado.genero = null;
  estado.q = null;
  estado.cor = null;
  estado.tamanho = null;
  estado.familiaGrau1 = null;
  estado.familiaGrau2 = null;
  estado.familiaGrau3 = null;
  estado.familiaGrau4 = null;
  estado.familia = null;
  estado.page = 1;
  document.getElementById('pesquisa-input').value = '';
  document.getElementById('pesquisa-marca').value = '';
  document.getElementById('pesquisa-cor').value = '';
  document.getElementById('pesquisa-tamanho').value = '';
  document.querySelectorAll('.filtro-lista input:checked').forEach((i) => { i.checked = false; });
  document.getElementById('familia-grau1').value = '';
  document.getElementById('familia-grau2').value = '';
  document.getElementById('familia-grau3').value = '';
  document.getElementById('familia-grau4').value = '';
  document.getElementById('familia-grau2').style.display = 'none';
  document.getElementById('familia-grau3').style.display = 'none';
  document.getElementById('familia-grau4').style.display = 'none';
  document.getElementById('familia-grau2').disabled = true;
  document.getElementById('familia-grau3').disabled = true;
  document.getElementById('familia-grau4').disabled = true;
  actualizarURL();
  carregarArtigos();
}

document.getElementById('limpar-filtros').addEventListener('click', limparTodosFiltros);
document.getElementById('limpar-filtros-header').addEventListener('click', limparTodosFiltros);

let debouncePesquisa;
document.getElementById('pesquisa-input').addEventListener('input', (e) => {
  clearTimeout(debouncePesquisa);
  debouncePesquisa = setTimeout(() => {
    estado.q = e.target.value.trim() || null;
    estado.page = 1;
    actualizarURL();
    carregarArtigos();
  }, 350);
});

let debounceCor;
document.getElementById('pesquisa-cor').addEventListener('input', (e) => {
  clearTimeout(debounceCor);
  debounceCor = setTimeout(() => {
    estado.cor = e.target.value.trim() || null;
    estado.page = 1;
    actualizarURL();
    carregarArtigos();
  }, 350);
});

let debounceTamanho;
document.getElementById('pesquisa-tamanho').addEventListener('input', (e) => {
  clearTimeout(debounceTamanho);
  debounceTamanho = setTimeout(() => {
    estado.tamanho = e.target.value.trim() || null;
    estado.page = 1;
    actualizarURL();
    carregarArtigos();
  }, 350);
});

let debounceMarca;
document.getElementById('pesquisa-marca').addEventListener('input', (e) => {
  clearTimeout(debounceMarca);
  debounceMarca = setTimeout(() => {
    estado.marcaText = e.target.value.trim() || null;
    estado.page = 1;
    actualizarURL();
    carregarArtigos();
  }, 350);
});

(async function init() {
  lerParametrosURL();
  renderSeparadores();
  await Promise.all([renderFiltroGenero(), renderFiltroMarca(), renderFiltroModalidade()]);

  // Sempre carregar e restaurar o estado dos comboboxes de famílias
  await carregarFamiliasGrau1();

  if (estado.familiaGrau1) {
    document.getElementById('familia-grau1').value = estado.familiaGrau1;
    await carregarFamiliasGrau2(estado.familiaGrau1);

    if (estado.familiaGrau2) {
      document.getElementById('familia-grau2').value = estado.familiaGrau2;
      await carregarFamiliasGrau3(estado.familiaGrau2);

      if (estado.familiaGrau3) {
        document.getElementById('familia-grau3').value = estado.familiaGrau3;
        await carregarFamiliasGrau4(estado.familiaGrau3);

        if (estado.familiaGrau4) {
          document.getElementById('familia-grau4').value = estado.familiaGrau4;
        }
      }
    }
  }

  await carregarArtigos();
})();
