// ========== MODAL: LISTA DE ARTIGOS DE UMA MARCA ==========
function mostrarListaArtigosMarca(nomeMarca, artigos) {
  const existente = document.getElementById('modal-artigos-marca');
  if (existente) existente.remove();

  const overlay = document.createElement('div');
  overlay.id = 'modal-artigos-marca';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-caixa">
      <div class="modal-cabecalho">
        <h3>Artigos da marca "${nomeMarca}" (${artigos.length})</h3>
        <button type="button" class="modal-fechar" id="btn-fechar-modal-marca">&times;</button>
      </div>
      <div class="modal-corpo">
        <table class="sync-table">
          <thead><tr><th>Imagem</th><th>Código</th><th>Nome</th><th>Existência</th></tr></thead>
          <tbody>
            ${artigos.map((a) => `
              <tr>
                <td>${a.imagem ? `<img src="${a.imagem}" alt="" style="width:40px;height:40px;object-fit:contain">` : '-'}</td>
                <td>${a.codigo}</td>
                <td>${a.descricao}</td>
                <td>${a.existencia}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const fechar = () => overlay.remove();
  document.getElementById('btn-fechar-modal-marca').addEventListener('click', fechar);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });
}

// ========== LINKS ÚTEIS (páginas de conteúdo do rodapé) ==========
let paginaActualChave = null;

async function carregarListaPaginas() {
  const subMenu = document.getElementById('sub-menu-links-uteis');
  try {
    const paginas = await apiGet('/admin/paginas');
    subMenu.innerHTML = paginas.map((p, i) => `
      <button class="menu-item-pagina ${i === 0 ? 'activo' : ''}" data-chave="${p.chave}" style="background:${i === 0 ? 'var(--preto)' : 'transparent'};color:${i === 0 ? '#fff' : '#333'};border:none;padding:8px 14px;font-size:13px;border-radius:3px;cursor:pointer">${p.titulo}</button>
    `).join('');

    subMenu.querySelectorAll('.menu-item-pagina').forEach((btn) => {
      btn.addEventListener('click', () => {
        subMenu.querySelectorAll('.menu-item-pagina').forEach((b) => {
          b.style.background = 'transparent';
          b.style.color = '#333';
          b.classList.remove('activo');
        });
        btn.style.background = 'var(--preto)';
        btn.style.color = '#fff';
        btn.classList.add('activo');
        carregarPaginaConteudo(btn.dataset.chave);
      });
    });

    if (paginas.length > 0) {
      paginas[0] && carregarPaginaConteudo(paginas[0].chave);
    }
  } catch (err) {
    subMenu.innerHTML = `<span style="color:red">Erro: ${err.message}</span>`;
  }
}

async function carregarPaginaConteudo(chave) {
  paginaActualChave = chave;
  const loader = document.getElementById('loader-pagina-conteudo');
  loader.style.display = 'block';
  try {
    const pagina = await apiGet(`/admin/paginas/${chave}`);
    document.getElementById('pagina-titulo').value = pagina.titulo;
    document.getElementById('pagina-conteudo').value = pagina.conteudo;
  } catch (err) {
    alert('Erro ao carregar página: ' + err.message);
  } finally {
    loader.style.display = 'none';
  }
}

async function guardarPaginaConteudo() {
  if (!paginaActualChave) return;
  const titulo = document.getElementById('pagina-titulo').value.trim();
  const conteudo = document.getElementById('pagina-conteudo').value.trim();
  const btn = document.getElementById('btn-guardar-pagina');
  const msg = document.getElementById('msg-pagina');

  if (!titulo || !conteudo) {
    msg.textContent = '✗ Título e conteúdo são obrigatórios';
    msg.className = 'mensagem erro';
    return;
  }

  btn.disabled = true;
  msg.textContent = 'A guardar...';
  msg.className = 'mensagem';

  try {
    await apiPut(`/admin/paginas/${paginaActualChave}`, { titulo, conteudo });
    msg.textContent = '✓ Guardado com sucesso!';
    msg.className = 'mensagem sucesso';
    await carregarListaPaginas();
  } catch (err) {
    msg.textContent = '✗ Erro: ' + err.message;
    msg.className = 'mensagem erro';
  } finally {
    btn.disabled = false;
    setTimeout(() => { msg.textContent = ''; }, 3000);
  }
}

// ========== ENCOMENDAS ==========
async function carregarEncomendas() {
  const loader = document.getElementById('loader-encomendas');
  const tbody = document.getElementById('encomendas-tbody');
  document.getElementById('detalhe-encomenda-admin').innerHTML = '';

  loader.style.display = 'block';
  try {
    const encomendas = await apiGet('/admin/encomendas');
    if (encomendas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6">Ainda não há encomendas.</td></tr>';
      return;
    }
    tbody.innerHTML = encomendas.map((e) => `
      <tr>
        <td>${e.numero}</td>
        <td>${e.clienteNome || '-'}<br><small>${e.clienteEmail || ''}</small></td>
        <td>${new Date(e.data).toLocaleDateString('pt-PT')}</td>
        <td>${formatarPreco(e.total)}</td>
        <td><span class="badge-estado ${e.estado}">${e.estadoLabel}</span></td>
        <td>
          <div class="acoes-encomenda">
            <button class="botao-secundario btn-ver-detalhe-admin" data-numero="${e.numero}">Ver</button>
            ${e.proximoEstado ? `<button class="botao-principal btn-avancar-estado" data-numero="${e.numero}">Avançar</button>` : ''}
            ${e.podeAnular ? `<button class="botao-secundario btn-anular-encomenda" data-numero="${e.numero}">Anular</button>` : ''}
            ${e.podeDevolver ? `<button class="botao-secundario btn-devolver-encomenda" data-numero="${e.numero}">Devolução</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-ver-detalhe-admin').forEach((btn) => {
      btn.addEventListener('click', () => verDetalheEncomendaAdmin(btn.dataset.numero));
    });
    tbody.querySelectorAll('.btn-avancar-estado').forEach((btn) => {
      btn.addEventListener('click', () => avancarEstadoEncomenda(btn.dataset.numero));
    });
    tbody.querySelectorAll('.btn-anular-encomenda').forEach((btn) => {
      btn.addEventListener('click', () => anularEncomendaAdmin(btn.dataset.numero));
    });
    tbody.querySelectorAll('.btn-devolver-encomenda').forEach((btn) => {
      btn.addEventListener('click', () => verDetalheEncomendaAdmin(btn.dataset.numero, true));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:red">Erro: ${err.message}</td></tr>`;
  } finally {
    loader.style.display = 'none';
  }
}

async function verDetalheEncomendaAdmin(numero, focarDevolucao = false) {
  const container = document.getElementById('detalhe-encomenda-admin');
  try {
    const e = await apiGet(`/admin/encomendas/${numero}`);
    const devolucoes = await apiGet(`/admin/encomendas/${numero}/devolucoes`);

    container.innerHTML = `
      <div class="form-group" style="margin-top:20px;border-top:1px solid #ddd;padding-top:16px">
        <h3>Encomenda ${e.numero} — <span class="badge-estado ${e.estado}">${e.estadoLabel}</span></h3>
        <p>Cliente: ${e.clienteNome} (${e.clienteEmail})</p>
        ${e.estado === 'Anulada' && e.motivoAnulacao ? `<p class="mensagem-erro">Motivo da anulação: ${e.motivoAnulacao}</p>` : ''}
        <table class="sync-table">
          <thead><tr><th>Artigo</th><th>Qtd.</th><th>Preço Unit.</th>${e.podeDevolver ? '<th>Devolvida</th>' : ''}</tr></thead>
          <tbody>
            ${e.linhas.map((l) => `<tr><td>${l.descricao}</td><td>${l.quantidade}</td><td>${formatarPreco(l.precoUnitario)}</td>${e.podeDevolver ? `<td>${l.quantidadeDevolvida}</td>` : ''}</tr>`).join('')}
          </tbody>
        </table>
        <p style="margin-top:8px">Portes: ${formatarPreco(e.portes)}</p>
        ${e.valeDesconto > 0 ? `<p>Vale aplicado (${e.valeCodigo}): -${formatarPreco(e.valeDesconto)}</p>` : ''}
        <p><strong>Total: ${formatarPreco(e.total)}</strong></p>
        <p>Pontos desta encomenda: ${e.pontosGanhos} ${e.estado === 'Enviada' ? '(atribuídos)' : '(pendentes até envio)'}</p>
        <button class="botao-secundario" id="btn-pdf-encomenda-admin">Exportar PDF</button>

        ${devolucoes.length > 0 ? `
          <h4 style="margin-top:20px">Devoluções Registadas</h4>
          <table class="sync-table">
            <thead><tr><th>Data</th><th>Artigos</th><th>Valor</th><th>Pontos Estornados</th></tr></thead>
            <tbody>
              ${devolucoes.map((d) => `
                <tr>
                  <td>${new Date(d.data).toLocaleDateString('pt-PT')}</td>
                  <td>${d.linhas.map((l) => `${l.quantidade}× ${l.descricao}`).join('<br>')}</td>
                  <td>${formatarPreco(d.valorDevolvido)}</td>
                  <td>-${d.pontosEstornados}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}

        ${e.podeDevolver ? `
          <h4 id="secao-form-devolucao" style="margin-top:20px">Registar Devolução</h4>
          <p class="descricao">Indique a quantidade a devolver de cada artigo (0 = não devolver este artigo).</p>
          <table class="sync-table">
            <thead><tr><th>Artigo</th><th>Já devolvida</th><th>Disponível p/ devolver</th><th>Qtd. a devolver</th></tr></thead>
            <tbody>
              ${e.linhas.map((l, i) => `
                <tr>
                  <td>${l.descricao}</td>
                  <td>${l.quantidadeDevolvida}</td>
                  <td>${l.quantidadeDevolvivel}</td>
                  <td><input type="number" class="input-qtd-devolver" data-codigo-artigo="${l.codigoArtigo}" data-codigo-lote="${l.codigoLote}" min="0" max="${l.quantidadeDevolvivel}" value="0" style="width:70px" ${l.quantidadeDevolvivel === 0 ? 'disabled' : ''}></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="acoes">
            <button id="btn-confirmar-devolucao" class="botao-principal">Confirmar Devolução</button>
            <span id="msg-devolucao" class="mensagem"></span>
          </div>
        ` : ''}
      </div>
    `;
    document.getElementById('btn-pdf-encomenda-admin').addEventListener('click', () => {
      apiDownload(`/admin/encomendas/${numero}/pdf`, `${numero}.pdf`).catch((err) => alert('Erro ao gerar PDF: ' + err.message));
    });

    const btnDevolucao = document.getElementById('btn-confirmar-devolucao');
    if (btnDevolucao) {
      btnDevolucao.addEventListener('click', () => submeterDevolucao(numero));
    }
    if (focarDevolucao) {
      document.getElementById('secao-form-devolucao')?.scrollIntoView({ behavior: 'smooth' });
    }
  } catch (err) {
    container.innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
  }
}

async function submeterDevolucao(numero) {
  const inputs = document.querySelectorAll('.input-qtd-devolver');
  const linhas = [];
  inputs.forEach((input) => {
    const quantidade = parseInt(input.value, 10) || 0;
    if (quantidade > 0) {
      linhas.push({ codigoArtigo: input.dataset.codigoArtigo, codigoLote: input.dataset.codigoLote, quantidade });
    }
  });

  const msg = document.getElementById('msg-devolucao');
  if (linhas.length === 0) {
    msg.textContent = '✗ Indique pelo menos um artigo a devolver';
    msg.className = 'mensagem erro';
    return;
  }

  if (!confirm(`Confirma a devolução de ${linhas.length} artigo(s) da encomenda ${numero}?`)) return;

  const btn = document.getElementById('btn-confirmar-devolucao');
  btn.disabled = true;
  msg.textContent = 'A processar...';
  msg.className = 'mensagem';

  try {
    const resultado = await apiPost(`/admin/encomendas/${numero}/devolucao`, { linhas });
    msg.textContent = `✓ Devolução registada! Valor: ${formatarPreco(resultado.valorDevolvido)}, Pontos estornados: ${resultado.pontosEstornados}`;
    msg.className = 'mensagem sucesso';
    await verDetalheEncomendaAdmin(numero);
  } catch (err) {
    msg.textContent = '✗ Erro: ' + err.message;
    msg.className = 'mensagem erro';
    btn.disabled = false;
  }
}

async function avancarEstadoEncomenda(numero) {
  if (!confirm(`Avançar a encomenda ${numero} para o estado seguinte?`)) return;
  try {
    await apiPut(`/admin/encomendas/${numero}/avancar`, {});
    await carregarEncomendas();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

async function anularEncomendaAdmin(numero) {
  const motivo = prompt(`Motivo da anulação da encomenda ${numero}:`);
  if (motivo === null) return;
  if (!motivo.trim()) {
    alert('É obrigatório indicar o motivo da anulação.');
    return;
  }
  try {
    await apiPut(`/admin/encomendas/${numero}/anular`, { motivo: motivo.trim() });
    await carregarEncomendas();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

// ========== MARCAS PRINCIPAIS ==========
async function carregarMarcas() {
  const loader = document.getElementById('loader-marcas');
  const grid = document.getElementById('marcas-grid');

  loader.style.display = 'block';
  grid.innerHTML = '';

  try {
    const marcas = await apiGet('/admin/marcas-principais');

    grid.innerHTML = marcas.map((m) => `
      <label class="marca-card ${m.principal ? 'seleccionada' : ''} ${!m.activa ? 'inactiva' : ''}" data-marca="${m.nome}" data-codigo="${m.codigo}">
        <input type="checkbox" name="marca" value="${m.nome}" ${m.principal ? 'checked' : ''}>
        <button type="button" class="btn-toggle-activa" data-activa="${m.activa}" title="${m.activa ? 'Marca já não transaccionada? Clique para desactivar' : 'Clique para reactivar esta marca'}">${m.activa ? '●' : '⊘'}</button>
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

    // Toggle de activa/inactiva - independente do checkbox de "principal".
    // Ao DESACTIVAR, verifica primeiro se a marca tem artigos publicados e
    // avisa quantos são, com opção de ver a lista (imagem, código, existência).
    document.querySelectorAll('.btn-toggle-activa').forEach((btn) => {
      btn.addEventListener('click', async function (e) {
        e.preventDefault();
        e.stopPropagation();
        const card = this.closest('.marca-card');
        const estavaActiva = this.dataset.activa === 'true';

        if (estavaActiva) {
          // A ir desactivar: verificar artigos desta marca antes de aplicar o toggle
          try {
            const artigos = await apiGet(`/admin/marcas/${card.dataset.codigo}/artigos`);
            if (artigos.length > 0) {
              const verLista = confirm(`A marca "${card.dataset.marca}" tem ${artigos.length} artigo${artigos.length === 1 ? '' : 's'} publicado${artigos.length === 1 ? '' : 's'}. Deseja ver a lista?`);
              if (verLista) {
                mostrarListaArtigosMarca(card.dataset.marca, artigos);
              }
            }
          } catch (err) {
            alert('Erro ao verificar artigos da marca: ' + err.message);
          }
        }

        const novaActiva = !estavaActiva;
        this.dataset.activa = novaActiva;
        this.textContent = novaActiva ? '●' : '⊘';
        this.title = novaActiva ? 'Marca já não transaccionada? Clique para desactivar' : 'Clique para reactivar esta marca';
        card.classList.toggle('inactiva', !novaActiva);
      });
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

  const marcasInactivas = Array.from(
    document.querySelectorAll('.btn-toggle-activa')
  ).filter((btn) => btn.dataset.activa !== 'true')
    .map((btn) => btn.closest('.marca-card').dataset.codigo);

  const btn = document.getElementById('btn-guardar-marcas');
  const msg = document.getElementById('msg-marcas');

  btn.disabled = true;
  msg.textContent = 'A guardar...';
  msg.className = 'mensagem';

  try {
    await apiPut('/admin/marcas-principais', {
      marcas: marcasSelecionadas,
      inactivas: marcasInactivas,
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

// ========== PORTES DE ENVIO ==========
async function carregarConfigPortes() {
  try {
    const config = await apiGet('/admin/config');
    document.getElementById('valor-portes').value = config.PortesEnvio || 9.90;
  } catch (err) {
    console.error('Erro ao carregar config:', err);
  }
}

async function guardarPortes() {
  const valor = document.getElementById('valor-portes').value;
  const btn = document.getElementById('btn-guardar-portes');
  const msg = document.getElementById('msg-portes');

  if (valor === '' || valor < 0) {
    msg.textContent = '✗ Valor inválido';
    msg.className = 'mensagem erro';
    return;
  }

  btn.disabled = true;
  msg.textContent = 'A guardar...';
  msg.className = 'mensagem';

  try {
    await apiPut('/admin/config/PortesEnvio', { valor });
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

// ========== PONTOS E VALES ==========
async function carregarConfigPontos() {
  try {
    const config = await apiGet('/admin/config');
    document.getElementById('pontos-por-euro').value = config.PontosPorEuro || 1;
    document.getElementById('pontos-para-vale').value = config.PontosParaVale || 100;
    document.getElementById('valor-vale').value = config.ValorVale || 5.00;
  } catch (err) {
    console.error('Erro ao carregar config:', err);
  }
}

async function guardarPontos() {
  const pontosPorEuro = document.getElementById('pontos-por-euro').value;
  const pontosParaVale = document.getElementById('pontos-para-vale').value;
  const valorVale = document.getElementById('valor-vale').value;
  const btn = document.getElementById('btn-guardar-pontos');
  const msg = document.getElementById('msg-pontos');

  if (pontosPorEuro === '' || pontosParaVale === '' || valorVale === '' || pontosParaVale < 1) {
    msg.textContent = '✗ Valores inválidos';
    msg.className = 'mensagem erro';
    return;
  }

  btn.disabled = true;
  msg.textContent = 'A guardar...';
  msg.className = 'mensagem';

  try {
    await apiPut('/admin/config/PontosPorEuro', { valor: pontosPorEuro });
    await apiPut('/admin/config/PontosParaVale', { valor: pontosParaVale });
    await apiPut('/admin/config/ValorVale', { valor: valorVale });
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
        case 'encomendas':
          carregarEncomendas();
          break;
        case 'marcas-principais':
          carregarMarcas();
          break;
        case 'config-novidades':
          carregarConfigNovidades();
          break;
        case 'portes-envio':
          carregarConfigPortes();
          break;
        case 'pontos-vales':
          carregarConfigPontos();
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
        case 'links-uteis':
          carregarListaPaginas();
          break;
      }
    });
  });
}

// ========== EVENT LISTENERS ==========
function inicializarEventos() {
  document.getElementById('btn-guardar-marcas').addEventListener('click', guardarMarcas);
  document.getElementById('btn-guardar-novidades').addEventListener('click', guardarNovidades);
  document.getElementById('btn-guardar-portes').addEventListener('click', guardarPortes);
  document.getElementById('btn-guardar-pontos').addEventListener('click', guardarPontos);
  document.getElementById('filtro-erros-only').addEventListener('change', renderSyncLog);
  document.getElementById('btn-atualizar-log').addEventListener('click', carregarSyncLog);
  document.getElementById('btn-guardar-pagina').addEventListener('click', guardarPaginaConteudo);
  document.getElementById('btn-logout-admin').addEventListener('click', () => {
    removerToken();
    window.location.reload();
  });
}

// ========== ACESSO (só administradores) ==========
function mostrarBackoffice() {
  document.getElementById('auth-gate-admin').style.display = 'none';
  document.getElementById('backoffice-container').style.display = 'flex';
  inicializarMenu();
  inicializarEventos();
  carregarEncomendas();
}

async function verificarAcessoAdmin() {
  const gate = document.getElementById('auth-gate-admin');
  try {
    const perfil = await apiGet('/auth/perfil');
    if (!perfil.isAdmin) {
      gate.innerHTML = '<div class="mensagem-erro">Acesso reservado ao administrador do site.</div>';
      return;
    }
    mostrarBackoffice();
  } catch (err) {
    removerToken();
    renderFormularioAuth(gate, verificarAcessoAdmin);
  }
}

// ========== INIT ==========
(async function init() {
  const gate = document.getElementById('auth-gate-admin');
  if (!estaAutenticado()) {
    renderFormularioAuth(gate, verificarAcessoAdmin);
    return;
  }
  await verificarAcessoAdmin();
})();
