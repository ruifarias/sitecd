// ========== MARCAS PRINCIPAIS ==========
async function carregarMarcas() {
  const loader = document.getElementById('loader-marcas');
  const grid = document.getElementById('marcas-grid');

  loader.style.display = 'block';
  grid.innerHTML = '';

  try {
    const marcas = await apiGet('/admin/marcas-principais');

    grid.innerHTML = marcas.map((m) => `
      <label class="marca-card ${m.principal ? 'seleccionada' : ''}" data-marca="${m.nome}">
        <input type="checkbox" name="marca" value="${m.nome}" ${m.principal ? 'checked' : ''}>
        <div class="marca-nome">${m.nome}</div>
      </label>
    `).join('');

    // Event listeners - sincronizar checkbox com visual
    document.querySelectorAll('.marca-card input').forEach((input) => {
      input.addEventListener('change', function() {
        this.parentElement.classList.toggle('seleccionada', this.checked);
      });
      // Sincronizar visual inicial
      if (input.checked) {
        input.parentElement.classList.add('seleccionada');
      }
    });
  } catch (err) {
    grid.innerHTML = `<div style="color:red;">Erro ao carregar marcas: ${err.message}</div>`;
  } finally {
    loader.style.display = 'none';
  }
}

async function guardarMarcas() {
  const marcasSelecionadas = Array.from(
    document.querySelectorAll('.marca-card input:checked')
  ).map(input => input.value);

  const btn = document.getElementById('btn-guardar-marcas');
  const msg = document.getElementById('msg-marcas');

  btn.disabled = true;
  msg.textContent = 'A guardar...';
  msg.className = 'mensagem';

  try {
    await apiPut('/admin/marcas-principais', {
      marcas: marcasSelecionadas
    });

    msg.textContent = '✓ Guardado com sucesso!';
    msg.className = 'mensagem sucesso';
  } catch (err) {
    msg.textContent = '✗ Erro: ' + err.message;
    msg.className = 'mensagem erro';
  } finally {
    btn.disabled = false;
    setTimeout(() => { msg.textContent = ''; }, 3000);
  }
}

// ========== CONFIGURAÇÃO NOVIDADES ==========
async function carregarConfigNovidades() {
  try {
    const config = await apiGet('/admin/config');
    const dias = config.NovidadesDias || 180;
    document.getElementById('dias-novidades').value = dias;
  } catch (err) {
    console.error('Erro ao carregar config:', err);
  }
}

async function guardarNovidades() {
  const dias = document.getElementById('dias-novidades').value;
  const btn = document.getElementById('btn-guardar-novidades');
  const msg = document.getElementById('msg-novidades');

  if (!dias || dias < 1 || dias > 365) {
    msg.textContent = '✗ Valor inválido (1-365)';
    msg.className = 'mensagem erro';
    return;
  }

  btn.disabled = true;
  msg.textContent = 'A guardar...';
  msg.className = 'mensagem';

  try {
    await apiPut('/admin/config/NovidadesDias', { valor: dias });
    msg.textContent = '✓ Guardado com sucesso!';
    msg.className = 'mensagem sucesso';
  } catch (err) {
    msg.textContent = '✗ Erro: ' + err.message;
    msg.className = 'mensagem erro';
  } finally {
    btn.disabled = false;
    setTimeout(() => { msg.textContent = ''; }, 3000);
  }
}

// ========== VISIBILIDADE DE FAMÍLIAS ==========
async function carregarFamilias() {
  const loader = document.getElementById('loader-familias');
  const tbody = document.getElementById('familias-tbody');

  loader.style.display = 'block';
  tbody.innerHTML = '';

  try {
    const familias = await apiGet('/admin/familias-visibilidade');

    if (familias.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Sem famílias</td></tr>';
      return;
    }

    tbody.innerHTML = familias.map((f) => `
      <tr>
        <td>${f.codigo}</td>
        <td>${f.nome}</td>
        <td><input type="checkbox" class="familia-visivel" data-codigo="${f.codigo}" ${f.visivel ? 'checked' : ''}></td>
        <td><button class="btn-guardar-familia" data-codigo="${f.codigo}">Guardar</button></td>
      </tr>
    `).join('');

    // Event listeners
    document.querySelectorAll('.btn-guardar-familia').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const codigo = btn.dataset.codigo;
        const checkbox = document.querySelector(`.familia-visivel[data-codigo="${codigo}"]`);
        const visivel = checkbox.checked;

        btn.disabled = true;
        try {
          await apiPut(`/admin/familia/${codigo}/visibilidade`, { visivel });
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = 'Guardar'; btn.disabled = false; }, 2000);
        } catch (err) {
          alert('Erro: ' + err.message);
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="color:red;">Erro: ${err.message}</td></tr>`;
  } finally {
    loader.style.display = 'none';
  }
}

// ========== FAMÍLIAS POR CLASSIFICAR ==========
async function carregarFamiliasClassificar() {
  const loader = document.getElementById('loader-classificar');
  const tbody = document.getElementById('classificar-tbody');

  loader.style.display = 'block';
  tbody.innerHTML = '';

  try {
    const [familias, modalidades, generos] = await Promise.all([
      apiGet('/admin/familias-por-classificar'),
      apiGet('/modalidades'),
      apiGet('/generos'),
    ]);

    if (familias.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--cinza-texto);">Todas as famílias estão classificadas!</td></tr>';
      return;
    }

    tbody.innerHTML = familias.map((f) => `
      <tr>
        <td><strong>${f.codigoFamilia}</strong></td>
        <td>${f.familia}</td>
        <td>${f.categoria}</td>
        <td>${f.numArtigos}</td>
        <td>
          <select class="select-modalidade" data-codigo="${f.codigoFamilia}">
            <option value="">—</option>
            ${modalidades.map(m => `
              <option value="${m.id}" ${f.modalidadeTituloActual === m.titulo ? 'selected' : ''}>
                ${m.titulo}
              </option>
            `).join('')}
          </select>
        </td>
        <td>
          <select class="select-genero" data-codigo="${f.codigoFamilia}">
            <option value="">—</option>
            ${generos.map(g => `
              <option value="${g.id}" ${f.generoTituloActual === g.titulo ? 'selected' : ''}>
                ${g.titulo}
              </option>
            `).join('')}
          </select>
        </td>
        <td><button class="btn-gravar-classificacao" data-codigo="${f.codigoFamilia}">GRAVAR</button></td>
      </tr>
    `).join('');

    // Event listeners
    document.querySelectorAll('.btn-gravar-classificacao').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const codigo = btn.dataset.codigo;
        const modalidadeSelect = document.querySelector(`.select-modalidade[data-codigo="${codigo}"]`);
        const generoSelect = document.querySelector(`.select-genero[data-codigo="${codigo}"]`);

        const modalidadeId = modalidadeSelect.value || null;
        const generoId = generoSelect.value || null;

        if (!modalidadeId && !generoId) {
          alert('Selecciona pelo menos Modalidade ou Género');
          return;
        }

        btn.disabled = true;
        try {
          await apiPut(`/admin/familia/${codigo}/classificacao`, {
            modalidadeId: modalidadeId ? parseInt(modalidadeId) : null,
            generoId: generoId ? parseInt(generoId) : null,
          });
          btn.textContent = '✓';
          setTimeout(() => {
            btn.textContent = 'GRAVAR';
            btn.disabled = false;
          }, 2000);
        } catch (err) {
          alert('Erro: ' + err.message);
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:red;">Erro: ${err.message}</td></tr>`;
  } finally {
    loader.style.display = 'none';
  }
}

// ========== SYNC LOG ==========
let syncLogData = [];

async function carregarSyncLog() {
  const loader = document.getElementById('loader-sync');
  const tbody = document.getElementById('sync-log-body');

  loader.style.display = 'block';
  tbody.innerHTML = '';

  try {
    syncLogData = await apiGet('/admin/sync-log?limite=100');

    if (syncLogData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--cinza-texto);">Sem registos de sincronização</td></tr>';
      return;
    }

    renderSyncLog();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:red;">Erro ao carregar log: ${err.message}</td></tr>`;
  } finally {
    loader.style.display = 'none';
  }
}

function renderSyncLog() {
  const tbody = document.getElementById('sync-log-body');
  const filtroErros = document.getElementById('filtro-erros-only').checked;

  const dadosFiltrados = filtroErros ? syncLogData.filter(l => !l.sucesso) : syncLogData;

  if (dadosFiltrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--cinza-texto);">Nenhum registo encontrado</td></tr>';
    return;
  }

  tbody.innerHTML = dadosFiltrados.map((l) => `
    <tr class="${!l.sucesso ? 'erro-row' : ''}">
      <td>${new Date(l.dataHora).toLocaleString('pt-PT')}</td>
      <td>${l.tipo}</td>
      <td class="${l.sucesso ? 'status-sucesso' : 'status-erro'}">${l.sucesso ? '✓ OK' : '✗ ERRO'}</td>
      <td>${l.registos || 0}</td>
      <td title="${l.mensagem || '-'}">${l.mensagem || '-'}</td>
    </tr>
  `).join('');
}

// ========== MENU LATERAL ==========
function inicializarMenu() {
  const items = document.querySelectorAll('.menu-item');

  items.forEach((item) => {
    item.addEventListener('click', function() {
      // Remover activo de todos
      items.forEach((i) => i.classList.remove('activo'));
      // Adicionar activo ao clicado
      this.classList.add('activo');

      // Esconder todas as secções
      document.querySelectorAll('.secao').forEach((s) => s.classList.remove('activa'));

      // Mostrar a secção correspondente
      const secao = this.dataset.secao;
      document.getElementById(`secao-${secao}`).classList.add('activa');

      // Carregar dados da secção
      switch (secao) {
        case 'marcas-principais':
          carregarMarcas();
          break;
        case 'config-novidades':
          carregarConfigNovidades();
          break;
        case 'visibilidade-familias':
          carregarFamilias();
          break;
        case 'familias-classificar':
          carregarFamiliasClassificar();
          break;
        case 'sync-log':
          carregarSyncLog();
          break;
      }
    });
  });
}

// ========== EVENT LISTENERS ==========
function inicializarEventos() {
  document.getElementById('btn-guardar-marcas').addEventListener('click', guardarMarcas);
  document.getElementById('btn-guardar-novidades').addEventListener('click', guardarNovidades);
  document.getElementById('filtro-erros-only').addEventListener('change', renderSyncLog);
  document.getElementById('btn-atualizar-log').addEventListener('click', carregarSyncLog);
}

// ========== INIT ==========
(async function init() {
  inicializarMenu();
  inicializarEventos();

  // Carregar dados iniciais da primeira secção
  carregarMarcas();
})();
