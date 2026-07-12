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

function configurarFamiliaCascata(estado, aoMudar) {
  document.getElementById('familia-grau1').addEventListener('change', (e) => {
    estado.familiaGrau1 = e.target.value;
    estado.familiaGrau2 = null;
    estado.familiaGrau3 = null;
    estado.familiaGrau4 = null;
    estado.familia = e.target.value || null;

    if (estado.familiaGrau1) {
      carregarFamiliasGrau2(estado.familiaGrau1);
    } else {
      document.getElementById('familia-grau2').style.display = 'none';
      document.getElementById('familia-grau3').style.display = 'none';
      document.getElementById('familia-grau4').style.display = 'none';
      document.getElementById('familias-cascata-header').style.display = 'none';
    }

    aoMudar();
  });

  document.getElementById('familia-grau2').addEventListener('change', (e) => {
    estado.familiaGrau2 = e.target.value;
    estado.familiaGrau3 = null;
    estado.familiaGrau4 = null;
    estado.familia = e.target.value || null;

    if (estado.familiaGrau2) {
      carregarFamiliasGrau3(estado.familiaGrau2);
    } else {
      document.getElementById('familia-grau3').style.display = 'none';
      document.getElementById('familia-grau4').style.display = 'none';
    }

    aoMudar();
  });

  document.getElementById('familia-grau3').addEventListener('change', (e) => {
    estado.familiaGrau3 = e.target.value;
    estado.familiaGrau4 = null;
    estado.familia = e.target.value || null;

    if (estado.familiaGrau3) {
      carregarFamiliasGrau4(estado.familiaGrau3);
    } else {
      document.getElementById('familia-grau4').style.display = 'none';
    }

    aoMudar();
  });

  document.getElementById('familia-grau4').addEventListener('change', (e) => {
    estado.familiaGrau4 = e.target.value;
    estado.familia = e.target.value || null;
    aoMudar();
  });
}

async function inicializarFamiliaCascata(estado, aoMudar) {
  configurarFamiliaCascata(estado, aoMudar);
  await carregarFamiliasGrau1();

  // a barra de família (topo-linha3) só aparece quando já há uma família
  // seleccionada (vinda do menu "Família" ou do link "Alternativas" na ficha
  // de artigo) - antes disso fica escondida, ver limparTodosFiltros abaixo
  const barraFamilia = document.getElementById('familias-cascata-header');

  if (estado.familiaGrau1) {
    barraFamilia.style.display = 'flex';
    document.getElementById('familia-grau1').value = estado.familiaGrau1;
    estado.familia = estado.familiaGrau1;
    await carregarFamiliasGrau2(estado.familiaGrau1);

    if (estado.familiaGrau2) {
      document.getElementById('familia-grau2').value = estado.familiaGrau2;
      estado.familia = estado.familiaGrau2;
      await carregarFamiliasGrau3(estado.familiaGrau2);

      if (estado.familiaGrau3) {
        document.getElementById('familia-grau3').value = estado.familiaGrau3;
        estado.familia = estado.familiaGrau3;
        await carregarFamiliasGrau4(estado.familiaGrau3);

        if (estado.familiaGrau4) {
          document.getElementById('familia-grau4').value = estado.familiaGrau4;
          estado.familia = estado.familiaGrau4;
        }
      }
    }
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
  document.getElementById('familias-cascata-header').style.display = 'none';
  aoMudar();
  renderSeparadores(estado, aoMudar);
}

// Ponto de entrada único: renderiza separadores, dropdowns de marca/modalidade,
// pills de género e a cascata de família - igual em qualquer página que inclua
// este ficheiro antes do seu próprio script de inicialização.
async function inicializarCabecalho(estado, aoMudar) {
  renderSeparadores(estado, aoMudar);
  configurarDropdown('dropdown-marca');
  configurarDropdown('dropdown-modalidade');
  await Promise.all([
    renderFiltroGenero(estado, aoMudar),
    renderFiltroMarca(estado, aoMudar),
    renderFiltroModalidade(estado, aoMudar),
  ]);
  await inicializarFamiliaCascata(estado, aoMudar);
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
