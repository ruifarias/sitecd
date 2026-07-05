// ========== PERFIL ==========
async function carregarPerfil() {
  const container = document.getElementById('dados-perfil');
  try {
    const perfil = await apiGet('/conta/perfil');
    container.innerHTML = `
      <div class="form-group"><label>Nome:</label><p>${perfil.nome}</p></div>
      <div class="form-group"><label>Email:</label><p>${perfil.email}</p></div>
      <div class="form-group"><label>Telefone:</label><p>${perfil.telefone || '-'}</p></div>
      <div class="form-group"><label>NIF:</label><p>${perfil.nif || '-'}</p></div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
  }
}

// ========== ENCOMENDAS ==========
async function carregarEncomendas() {
  const container = document.getElementById('lista-encomendas');
  document.getElementById('detalhe-encomenda').innerHTML = '';
  try {
    const encomendas = await apiGet('/conta/encomendas');
    if (encomendas.length === 0) {
      container.innerHTML = '<p class="descricao">Ainda não fez nenhuma encomenda.</p>';
      return;
    }
    container.innerHTML = `
      <table class="sync-table">
        <thead>
          <tr><th>Número</th><th>Data</th><th>Estado</th><th>Total</th><th>Pontos</th><th></th></tr>
        </thead>
        <tbody>
          ${encomendas.map((e) => `
            <tr>
              <td>${e.numero}</td>
              <td>${new Date(e.data).toLocaleDateString('pt-PT')}</td>
              <td><span class="badge-estado ${e.estado}">${e.estadoLabel}</span></td>
              <td>${formatarPreco(e.total)}</td>
              <td>${e.pontosGanhos} ${e.estado !== 'Enviada' ? '<small>(pendente)</small>' : ''}</td>
              <td><button class="botao-secundario btn-ver-encomenda" data-numero="${e.numero}">Ver detalhe</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    container.querySelectorAll('.btn-ver-encomenda').forEach((btn) => {
      btn.addEventListener('click', () => verDetalheEncomenda(btn.dataset.numero));
    });
  } catch (err) {
    container.innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
  }
}

async function verDetalheEncomenda(numero) {
  const container = document.getElementById('detalhe-encomenda');
  try {
    const e = await apiGet(`/conta/encomendas/${numero}`);
    container.innerHTML = `
      <div class="form-group" style="margin-top:20px;border-top:1px solid #ddd;padding-top:16px">
        <h3>Encomenda ${e.numero} — <span class="badge-estado ${e.estado}">${e.estadoLabel}</span></h3>
        ${e.estado === 'Anulada' && e.motivoAnulacao ? `<p class="mensagem-erro">Motivo da anulação: ${e.motivoAnulacao}</p>` : ''}
        <table class="sync-table">
          <thead><tr><th>Artigo</th><th>Qtd.</th><th>Preço Unit.</th></tr></thead>
          <tbody>
            ${e.linhas.map((l) => `<tr><td>${l.descricao}</td><td>${l.quantidade}</td><td>${formatarPreco(l.precoUnitario)}</td></tr>`).join('')}
          </tbody>
        </table>
        <p style="margin-top:8px">Portes: ${formatarPreco(e.portes)}</p>
        ${e.valeDesconto > 0 ? `<p>Vale aplicado (${e.valeCodigo}): -${formatarPreco(e.valeDesconto)}</p>` : ''}
        <p><strong>Total: ${formatarPreco(e.total)}</strong></p>
        <p>Pontos desta encomenda: ${e.pontosGanhos} ${e.estado === 'Enviada' ? '(já atribuídos)' : e.estado === 'Anulada' ? '(anulados)' : '(pendentes até a encomenda ser enviada)'}</p>
        <button class="botao-secundario" id="btn-pdf-encomenda">Exportar PDF</button>
      </div>
    `;
    document.getElementById('btn-pdf-encomenda').addEventListener('click', () => {
      apiDownload(`/conta/encomendas/${numero}/pdf`, `${numero}.pdf`).catch((err) => alert('Erro ao gerar PDF: ' + err.message));
    });
  } catch (err) {
    container.innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
  }
}

// ========== PONTOS E VALES ==========
async function carregarPontosEVales() {
  const saldoEl = document.getElementById('saldo-pontos');
  const historicoEl = document.getElementById('historico-pontos');
  const valesEl = document.getElementById('lista-vales');

  try {
    const pontos = await apiGet('/conta/pontos');
    saldoEl.innerHTML = `
      <p style="font-size:20px"><strong>Saldo: ${pontos.saldo} pontos</strong></p>
      ${pontos.pontosPendentes > 0 ? `<p class="descricao">+ ${pontos.pontosPendentes} pontos pendentes (atribuídos assim que a(s) encomenda(s) for(em) enviada(s))</p>` : ''}
      <button id="btn-trocar-vale" class="botao-principal">Trocar pontos por vale</button>
      <span id="msg-trocar-vale" class="mensagem"></span>
    `;
    document.getElementById('btn-trocar-vale').addEventListener('click', trocarPontosPorVale);

    historicoEl.innerHTML = pontos.historico.length === 0 ? '<p class="descricao">Sem movimentos.</p>' : `
      <table class="sync-table">
        <thead><tr><th>Data</th><th>Tipo</th><th>Pontos</th><th>Descrição</th></tr></thead>
        <tbody>
          ${pontos.historico.map((h) => `
            <tr><td>${new Date(h.data).toLocaleDateString('pt-PT')}</td><td>${h.tipo}</td><td>${h.pontos}</td><td>${h.descricao || '-'}</td></tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    saldoEl.innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
  }

  try {
    const vales = await apiGet('/conta/vales');
    valesEl.innerHTML = vales.length === 0 ? '<p class="descricao">Ainda não tem vales.</p>' : `
      <table class="sync-table">
        <thead><tr><th>Código</th><th>Valor</th><th>Estado</th><th>Criado em</th></tr></thead>
        <tbody>
          ${vales.map((v) => `
            <tr><td>${v.codigo}</td><td>${formatarPreco(v.valor)}</td><td>${v.estado}</td><td>${new Date(v.data).toLocaleDateString('pt-PT')}</td></tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    valesEl.innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
  }
}

async function trocarPontosPorVale() {
  const btn = document.getElementById('btn-trocar-vale');
  const msg = document.getElementById('msg-trocar-vale');
  btn.disabled = true;
  msg.textContent = 'A processar...';
  msg.className = 'mensagem';

  try {
    const vale = await apiPost('/conta/vales/trocar', {});
    msg.textContent = `✓ Vale criado: ${vale.codigo} (${formatarPreco(vale.valor)})`;
    msg.className = 'mensagem sucesso';
    await carregarPontosEVales();
  } catch (err) {
    msg.textContent = '✗ ' + err.message;
    msg.className = 'mensagem erro';
    btn.disabled = false;
  }
}

// ========== MENU LATERAL ==========
function inicializarMenu() {
  const items = document.querySelectorAll('.menu-item');

  items.forEach((item) => {
    item.addEventListener('click', function () {
      items.forEach((i) => i.classList.remove('activo'));
      this.classList.add('activo');

      document.querySelectorAll('.secao').forEach((s) => s.classList.remove('activa'));
      const secao = this.dataset.secao;
      document.getElementById(`secao-${secao}`).classList.add('activa');

      switch (secao) {
        case 'dados':
          carregarPerfil();
          break;
        case 'encomendas':
          carregarEncomendas();
          break;
        case 'pontos':
          carregarPontosEVales();
          break;
      }
    });
  });
}

// ========== INIT ==========
function mostrarAreaAutenticada() {
  document.getElementById('auth-conta').style.display = 'none';
  document.getElementById('conteudo-autenticado').style.display = 'block';
  inicializarMenu();
  carregarPerfil();
}

(async function init() {
  document.getElementById('btn-terminar-sessao').addEventListener('click', () => {
    removerToken();
    window.location.href = 'index.html';
  });

  if (!estaAutenticado()) {
    document.getElementById('conteudo-autenticado').style.display = 'none';
    renderFormularioAuth(document.getElementById('auth-conta'), mostrarAreaAutenticada);
    return;
  }
  mostrarAreaAutenticada();
})();
