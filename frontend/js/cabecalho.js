// Cabeçalho de filtros (separadores, género, marca, modalidade, família) -
// partilhado entre a listagem (index.html) e a ficha de artigo (artigo.html),
// para que as duas páginas mostrem sempre o mesmo cabeçalho e para que os
// filtros sobrevivam à navegação entre elas (ex: "← Voltar" não pode perder
// o separador "Novidades" que estava seleccionado na listagem).
//
// Cada página mantém o seu próprio objecto `estado` e define uma função
// `aoMudar()` que decide o que fazer quando um filtro muda: a listagem
// recarrega a grelha no local; a ficha de artigo navega para a listagem já
// com esse filtro aplicado (não há grelha nesta página para actualizar).

// Link para um grau específico da família (ex: clicar em "CACHECOL" no
// breadcrumb "ACESSORIOS TEXTIL > CACHECOL > ..." vai directo a esse grau,
// sem arrastar os graus mais profundos que o utilizador ainda não escolheu).
// Usado nas "Alternativas" da ficha de artigo e nos cabeçalhos de grupo da
// listagem quando ordenada por Família.
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

function lerEstadoFiltrosDaURL() {
  const params = new URLSearchParams(window.location.search);
  return {
    separador: params.get('separador') || 'todos',
    marca: params.get('marca') || null,
    marcaText: params.get('marcaText') || null,
    modalidade: params.get('modalidade') || null,
    genero: params.get('genero') || null,
    q: params.get('q') || null,
    cor: params.get('cor') || null,
    tamanho: params.get('tamanho') || null,
    ordenar: params.get('ordenar') || 'preco_desc',
    familiaGrau1: params.get('familiaGrau1') || null,
    familiaGrau2: params.get('familiaGrau2') || null,
    familiaGrau3: params.get('familiaGrau3') || null,
    familiaGrau4: params.get('familiaGrau4') || null,
    familia: params.get('familia') || null,
  };
}

function paramsFiltros(estado) {
  const params = new URLSearchParams();
  if (estado.separador && estado.separador !== 'todos') params.set('separador', estado.separador);
  if (estado.marca) params.set('marca', estado.marca);
  if (estado.marcaText) params.set('marcaText', estado.marcaText);
  if (estado.modalidade) params.set('modalidade', estado.modalidade);
  if (estado.genero) params.set('genero', estado.genero);
  if (estado.q) params.set('q', estado.q);
  if (estado.cor) params.set('cor', estado.cor);
  if (estado.tamanho) params.set('tamanho', estado.tamanho);
  if (estado.ordenar && estado.ordenar !== 'preco_desc') params.set('ordenar', estado.ordenar);
  if (estado.familiaGrau1) params.set('familiaGrau1', estado.familiaGrau1);
  if (estado.familiaGrau2) params.set('familiaGrau2', estado.familiaGrau2);
  if (estado.familiaGrau3) params.set('familiaGrau3', estado.familiaGrau3);
  if (estado.familiaGrau4) params.set('familiaGrau4', estado.familiaGrau4);
  if (estado.familia) params.set('familia', estado.familia);
  return params;
}

function renderSeparadores(estado, aoMudar) {
  const container = document.getElementById('separadores');
  const opcoes = [
    { valor: 'todos', rotulo: 'Todos os Artigos' },
    { valor: 'novidades', rotulo: 'Novidades' },
    { valor: 'outlet', rotulo: 'Outlet' },
  ];
  container.innerHTML = opcoes.map((o) => `
    <button data-separador="${o.valor}" class="nav-link ${estado.separador === o.valor ? 'activo' : ''}">${o.rotulo}</button>
  `).join('');
  container.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      estado.separador = btn.dataset.separador;
      aoMudar();
      renderSeparadores(estado, aoMudar);
    });
  });
}

async function renderFiltroMarca(estado, aoMudar) {
  const { principais, outras } = await apiGet('/marcas', true);
  const container = document.getElementById('painel-marca');

  let html = '<ul class="filtro-lista">';

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

  html += '</ul>';
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
      aoMudar();
      container.classList.remove('aberto');
    });
  });
}

async function renderFiltroModalidade(estado, aoMudar) {
  const modalidades = await apiGet('/modalidades');
  const container = document.getElementById('painel-modalidade');
  container.innerHTML = `<ul class="filtro-lista">${modalidades.map((m) => `
    <li><label><input type="radio" name="modalidade" value="${m.tag}" ${estado.modalidade === m.tag ? 'checked' : ''}> ${m.titulo}</label></li>
  `).join('')}</ul>`;
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
      aoMudar();
      container.classList.remove('aberto');
    });
  });
}

async function renderFiltroGenero(estado, aoMudar) {
  const generos = await apiGet('/generos');
  const container = document.getElementById('genero-pills');
  container.innerHTML = generos.map((g) => `
    <button type="button" class="genero-pill ${estado.genero === g.tag ? 'activo' : ''}" data-genero="${g.tag}">${g.titulo}</button>
  `).join('');
  container.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      estado.genero = estado.genero === btn.dataset.genero ? null : btn.dataset.genero;
      container.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('activo', b.dataset.genero === estado.genero);
      });
      aoMudar();
    });
  });
}

// Dropdowns de Marca/Modalidade: em dispositivos com rato (desktop) abrem ao
// passar por cima; em touch (sem hover fiável) alternam com um clique no
// botão - só um dos dois mecanismos fica activo, para o clique não fechar
// imediatamente um painel que o próprio "mouseenter" acabou de abrir.
function configurarDropdown(dropdownId) {
  const dropdown = document.getElementById(dropdownId);
  const trigger = dropdown.querySelector('.nav-dropdown-trigger');
  const painel = dropdown.querySelector('.nav-dropdown-painel');
  const suportaHover = window.matchMedia('(hover: hover)').matches;

  if (suportaHover) {
    dropdown.addEventListener('mouseenter', () => painel.classList.add('aberto'));
    dropdown.addEventListener('mouseleave', () => painel.classList.remove('aberto'));
  } else {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      painel.classList.toggle('aberto');
    });
  }
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) painel.classList.remove('aberto');
  });
}

// Em ecrã de telemóvel, os filtros (Família, Marca, Modalidade, Género,
// pesquisas) ficam escondidos atrás do botão "Filtros" - só o essencial
// (logo, separadores, ícones) fica sempre visível. Marca/Modalidade vivem
// normalmente no topo-linha1 (nav-principal); em ecrã pequeno são movidos
// (os mesmos elementos, não uma cópia) para dentro do painel de filtros
// colapsável, entre "Família" e os pills de Género - e voltam para o sítio
// original em ecrã grande. Página sem estes elementos (ex: carrinho.html)
// sai logo, sem efeito.
function configurarFiltrosResponsivos() {
  const filtrosColapsaveis = document.getElementById('filtros-colapsaveis');
  const btnToggle = document.getElementById('btn-toggle-filtros');
  const navPrincipal = document.getElementById('nav-principal');
  const dropdownFamilia = document.getElementById('dropdown-familia');
  const dropdownMarca = document.getElementById('dropdown-marca');
  const dropdownModalidade = document.getElementById('dropdown-modalidade');
  if (!filtrosColapsaveis || !navPrincipal || !dropdownFamilia || !dropdownMarca || !dropdownModalidade) return;

  const mql = window.matchMedia('(max-width: 800px)');

  function reposicionar(ehMobile) {
    if (ehMobile) {
      dropdownFamilia.insertAdjacentElement('afterend', dropdownModalidade);
      dropdownFamilia.insertAdjacentElement('afterend', dropdownMarca);
    } else {
      navPrincipal.appendChild(dropdownMarca);
      navPrincipal.appendChild(dropdownModalidade);
      filtrosColapsaveis.classList.remove('aberto');
    }
  }

  reposicionar(mql.matches);
  mql.addEventListener('change', (e) => reposicionar(e.matches));

  if (btnToggle) {
    btnToggle.addEventListener('click', () => filtrosColapsaveis.classList.toggle('aberto'));
  }
}

function limparTodosFiltros(estado, aoMudar) {
  estado.separador = 'todos';
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
  document.getElementById('pesquisa-input').value = '';
  document.getElementById('pesquisa-marca').value = '';
  document.getElementById('pesquisa-cor').value = '';
  document.getElementById('pesquisa-tamanho').value = '';
  document.querySelectorAll('.filtro-lista input:checked').forEach((i) => { i.checked = false; });
  document.querySelectorAll('#genero-pills button.activo').forEach((b) => { b.classList.remove('activo'); });
  document.querySelector('#dropdown-familia .nav-dropdown-trigger')?.classList.remove('activo');
  aoMudar();
  renderSeparadores(estado, aoMudar);
}

// Ponto de entrada único: renderiza separadores, dropdowns de marca/modalidade
// e pills de género - igual em qualquer página que inclua este ficheiro antes
// do seu próprio script de inicialização. O menu "Família" em cascata
// inicializa-se sozinho (ver familia-flyout.js).
async function inicializarCabecalho(estado, aoMudar) {
  renderSeparadores(estado, aoMudar);
  configurarDropdown('dropdown-marca');
  configurarDropdown('dropdown-modalidade');
  configurarFiltrosResponsivos();
  await Promise.all([
    renderFiltroGenero(estado, aoMudar),
    renderFiltroMarca(estado, aoMudar),
    renderFiltroModalidade(estado, aoMudar),
  ]);
  document.getElementById('limpar-filtros-header').addEventListener('click', () => limparTodosFiltros(estado, aoMudar));
}

// Para páginas sem grelha própria (ficha de artigo, páginas institucionais):
// mudar qualquer filtro do cabeçalho navega para a listagem já com esse
// filtro aplicado, em vez de recarregar conteúdo no local.
function criarNavegacaoParaListagem() {
  const estado = lerEstadoFiltrosDaURL();
  function aoMudarFiltro() {
    const query = paramsFiltros(estado).toString();
    window.location.href = `index.html${query ? '?' + query : ''}`;
  }
  return { estado, aoMudarFiltro };
}

function configurarPesquisaInputsNavegacao(estado, aoMudarFiltro) {
  document.getElementById('pesquisa-input').value = estado.q || '';
  document.getElementById('pesquisa-marca').value = estado.marcaText || '';
  document.getElementById('pesquisa-cor').value = estado.cor || '';
  document.getElementById('pesquisa-tamanho').value = estado.tamanho || '';

  ['pesquisa-input', 'pesquisa-marca', 'pesquisa-cor', 'pesquisa-tamanho'].forEach((id) => {
    document.getElementById(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        estado.q = document.getElementById('pesquisa-input').value.trim() || null;
        estado.marcaText = document.getElementById('pesquisa-marca').value.trim() || null;
        estado.cor = document.getElementById('pesquisa-cor').value.trim() || null;
        estado.tamanho = document.getElementById('pesquisa-tamanho').value.trim() || null;
        aoMudarFiltro();
      }
    });
  });
}
