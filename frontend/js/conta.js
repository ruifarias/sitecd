// Estados da Nota de Devolução (ver api/src/constants/encomendaEstados.js)
const ESTADOS_DEVOLUCAO = ['NotaDevolucaoEmitida', 'DevolucaoRecebidaAceite', 'DevolucaoRecebidaNaoAceite', 'DevolucaoPaga'];
const ESTADO_RECEBIDA_CONFORME = 'RecebidaSemDevolucao';
function ehEstadoDevolucao(estado) {
  return ESTADOS_DEVOLUCAO.includes(estado);
}

// ========== PERFIL ==========
async function carregarPerfil() {
  const container = document.getElementById('dados-perfil');
  try {
    const perfil = await apiGet('/conta/perfil');
    container.innerHTML = `
      <form class="checkout" id="form-perfil">
        <fieldset>
          <legend>Os Meus Dados</legend>
          <label>Código de Cliente</label>
          <input type="text" value="${perfil.codigoCliente || ''}" disabled>
          <label>Nome *</label>
          <input type="text" name="nome" value="${perfil.nome || ''}" required>
          <label>Email</label>
          <input type="email" value="${perfil.email || ''}" disabled>
          <label>Telefone</label>
          <input type="tel" name="telefone" value="${perfil.telefone || ''}">
          <label>NIF</label>
          <input type="text" name="nif" value="${perfil.nif || ''}">
        </fieldset>
        <fieldset>
          <legend>Morada de Entrega</legend>
          <label>Morada</label>
          <input type="text" name="morada" value="${perfil.morada || ''}">
          <label>Código Postal</label>
          <input type="text" name="codigoPostal" placeholder="0000-000" value="${perfil.codigoPostal || ''}">
          <label>Localidade</label>
          <input type="text" name="localidade" value="${perfil.localidade || ''}">
        </fieldset>
        <fieldset>
          <legend>Dados Bancários para Reembolso (opcional)</legend>
          <label>IBAN</label>
          <input type="text" name="iban" placeholder="PT50 0000 0000 0000 0000 0000 0" value="${perfil.iban || ''}">
          <label>Nome do 1º Titular da Conta</label>
          <input type="text" name="nomeTitularConta" value="${perfil.nomeTitularConta || ''}">
        </fieldset>
        <button type="submit" class="botao-principal">Guardar Alterações</button>
        <span id="msg-perfil" class="mensagem"></span>
      </form>
    `;
    document.getElementById('form-perfil').addEventListener('submit', guardarPerfil);
  } catch (err) {
    container.innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
  }
}

async function guardarPerfil(e) {
  e.preventDefault();
  const form = e.target;
  const botao = form.querySelector('button[type="submit"]');
  const msg = document.getElementById('msg-perfil');
  botao.disabled = true;
  msg.textContent = 'A guardar...';
  msg.className = 'mensagem';

  try {
    await apiPut('/conta/perfil', {
      nome: form.nome.value,
      telefone: form.telefone.value || undefined,
      nif: form.nif.value || undefined,
      morada: form.morada.value || undefined,
      localidade: form.localidade.value || undefined,
      codigoPostal: form.codigoPostal.value || undefined,
      iban: form.iban.value || undefined,
      nomeTitularConta: form.nomeTitularConta.value || undefined,
    });
    msg.textContent = '✓ Guardado com sucesso!';
    msg.className = 'mensagem sucesso';
  } catch (err) {
    msg.textContent = '✗ ' + err.message;
    msg.className = 'mensagem erro';
  } finally {
    botao.disabled = false;
    setTimeout(() => { msg.textContent = ''; }, 3000);
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
      <div class="tabela-scroll-painel lista-encomendas-compacta">
        <table class="sync-table">
          <thead>
            <tr><th>Data</th><th>Número</th><th>Estado</th><th>Total</th><th>Pontos</th><th>Acções</th></tr>
          </thead>
          <tbody>
            ${encomendas.map((e) => `
              <tr>
                <td>${new Date(e.data).toLocaleDateString('pt-PT')}</td>
                <td>${e.numero}</td>
                <td><span class="badge-estado ${e.estado}">${e.estadoLabel}</span></td>
                <td>${formatarPreco(e.total)}</td>
                <td>${e.pontosGanhos} ${e.estado !== ESTADO_RECEBIDA_CONFORME && e.estado !== 'Anulada' && !ehEstadoDevolucao(e.estado) ? '<small>(pendente)</small>' : ''}</td>
                <td>
                  <div class="acoes-encomenda">
                    <button class="botao-secundario btn-ver-encomenda" data-numero="${e.numero}">Ver detalhe</button>
                    ${e.podeConfirmarRecepcao ? `<button class="botao-principal btn-confirmar-recepcao-lista" data-numero="${e.numero}">Confirmar Receção da Encomenda</button>` : ''}
                    ${e.podeDevolver ? `<button class="botao-secundario btn-devolver-encomenda" data-numero="${e.numero}">Devolução</button>` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    container.querySelectorAll('.btn-ver-encomenda').forEach((btn) => {
      btn.addEventListener('click', () => verDetalheEncomenda(btn.dataset.numero));
    });
    container.querySelectorAll('.btn-devolver-encomenda').forEach((btn) => {
      btn.addEventListener('click', () => abrirDevolucaoCliente(btn.dataset.numero));
    });
    container.querySelectorAll('.btn-confirmar-recepcao-lista').forEach((btn) => {
      btn.addEventListener('click', () => confirmarRecepcaoEncomendaLista(btn.dataset.numero, btn));
    });
  } catch (err) {
    container.innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
  }
}

async function verDetalheEncomenda(numero) {
  const container = document.getElementById('detalhe-encomenda');
  try {
    const e = await apiGet(`/conta/encomendas/${numero}`);
    const devolucoes = await apiGet(`/conta/encomendas/${numero}/devolucoes`);
    container.innerHTML = `
      <div class="form-group" style="margin-top:20px;border-top:1px solid #ddd;padding-top:16px">
        <h3>Encomenda ${e.numero} — <span class="badge-estado ${e.estado}">${e.estadoLabel}</span></h3>
        ${e.estado === 'Anulada' && e.motivoAnulacao ? `<p class="mensagem-erro">Motivo da anulação: ${e.motivoAnulacao}</p>` : ''}
        <table class="sync-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Artigo</th>
              <th>Qtd.</th>
              <th style="text-align:right">Preço Venda</th>
              <th style="text-align:right">Desconto</th>
              <th style="text-align:right">Valor Líquido</th>
            </tr>
          </thead>
          <tbody>
            ${e.linhas.map((l) => `
              <tr>
                <td>${l.codigoArtigo}</td>
                <td>${l.nome}${l.variante ? `<br><span class="texto-variante">${l.variante}</span>` : ''}</td>
                <td>${l.quantidade}</td>
                <td style="text-align:right">${formatarPreco(l.precoVenda)}</td>
                <td style="text-align:right">${l.descontoPercentagem > 0 ? '-' + l.descontoPercentagem + '%' : '0%'}</td>
                <td style="text-align:right">${formatarPreco(l.valorLiquido)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="resumo-encomenda-totais">
          <div><span>Sub-total dos Artigos</span><span>${formatarPreco(e.totalProdutos)}</span></div>
          <div><span>Portes${e.tipoEnvio ? ` (${e.tipoEnvio})` : ''}</span><span>${formatarPreco(e.portes)}</span></div>
          ${e.valeDesconto > 0 ? `<div><span>Vale aplicado (${e.valeCodigo})</span><span>-${formatarPreco(e.valeDesconto)}</span></div>` : ''}
          <div class="resumo-total-final"><span>Total</span><span>${formatarPreco(e.total)}</span></div>
        </div>
        <p>Pontos desta encomenda: ${e.pontosGanhos} ${e.estado === ESTADO_RECEBIDA_CONFORME ? '(já atribuídos)' : e.estado === 'Anulada' ? '(anulados)' : ehEstadoDevolucao(e.estado) ? '(estornados)' : '(pendentes até confirmar a receção da encomenda)'}</p>

        ${e.devolucao ? `
          <div class="form-group" style="margin-top:16px">
            <h4>Dados Bancários para Reembolso</h4>
            <p class="descricao">IBAN: ${e.devolucao.iban || '-'}<br>Nome do 1º Titular da Conta: ${e.devolucao.nomeTitular || '-'}</p>
            ${e.devolucao.motivo ? `<h4 style="margin-top:12px">Razão da Devolução</h4><p class="descricao">${e.devolucao.motivo}</p>` : ''}
          </div>
        ` : ''}

        ${e.estado === 'Enviada' && !e.podeConfirmarRecepcao ? `
          <p class="descricao">Pode confirmar a receção desta encomenda a partir de ${new Date(e.dataDisponivelConfirmacao).toLocaleDateString('pt-PT')}.</p>
        ` : ''}

        <button class="botao-secundario" id="btn-pdf-encomenda">Exportar PDF</button>
        ${e.podeConfirmarRecepcao ? `
          <button class="botao-principal" id="btn-confirmar-recepcao">Confirmar Receção da Encomenda</button>
          <span id="msg-confirmar-recepcao" class="mensagem"></span>
        ` : ''}

        ${devolucoes.length > 0 ? `
          <h4 style="margin-top:20px">Devoluções Registadas</h4>
          <table class="sync-table">
            <thead><tr><th>Data</th><th>Artigos</th><th>Valor</th><th>Pontos Estornados</th><th>IBAN</th><th>Titular</th><th>Razão</th></tr></thead>
            <tbody>
              ${devolucoes.map((d) => `
                <tr>
                  <td>${new Date(d.data).toLocaleDateString('pt-PT')}</td>
                  <td>${d.linhas.map((l) => `${l.quantidade}× ${l.descricao}`).join('<br>')}</td>
                  <td>${formatarPreco(d.valorDevolvido)}</td>
                  <td>-${d.pontosEstornados}</td>
                  <td>${d.iban || '-'}</td>
                  <td>${d.nomeTitular || '-'}</td>
                  <td>${d.motivo || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}
      </div>
    `;
    document.getElementById('btn-pdf-encomenda').addEventListener('click', () => {
      apiDownload(`/conta/encomendas/${numero}/pdf`, `${numero}.pdf`).catch((err) => alert('Erro ao gerar PDF: ' + err.message));
    });
    const btnConfirmarRecepcao = document.getElementById('btn-confirmar-recepcao');
    if (btnConfirmarRecepcao) {
      btnConfirmarRecepcao.addEventListener('click', () => confirmarRecepcaoEncomenda(numero));
    }
  } catch (err) {
    container.innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
  }
}

// Variante de confirmarRecepcaoEncomenda() para a lista "As Minhas
// Encomendas": ali pode haver uma linha por encomenda elegível, por isso
// opera sobre o botão clicado em vez de ids fixos (#btn-confirmar-recepcao só
// existe uma vez, no detalhe).
async function confirmarRecepcaoEncomendaLista(numero, btn) {
  const confirmado = confirm(
    `Confirma a receção da encomenda ${numero}?\n\n` +
    `Esta confirmação irá disponibilizar de imediato os pontos relativos a esta encomenda.`
  );
  if (!confirmado) return;

  btn.disabled = true;
  btn.textContent = 'A processar...';
  try {
    await apiPut(`/conta/encomendas/${numero}/confirmar-recepcao`, {});
    await carregarEncomendas();
  } catch (err) {
    alert('Erro: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Confirmar Receção da Encomenda';
  }
}

async function confirmarRecepcaoEncomenda(numero) {
  const confirmado = confirm(
    `Confirma a receção da encomenda ${numero}?\n\n` +
    `Esta confirmação irá disponibilizar de imediato os pontos relativos a esta encomenda.`
  );
  if (!confirmado) return;

  const btn = document.getElementById('btn-confirmar-recepcao');
  const msg = document.getElementById('msg-confirmar-recepcao');
  btn.disabled = true;
  msg.textContent = 'A processar...';
  msg.className = 'mensagem';

  try {
    await apiPut(`/conta/encomendas/${numero}/confirmar-recepcao`, {});
    msg.textContent = '✓ Receção confirmada! Os pontos desta compra já estão disponíveis.';
    msg.className = 'mensagem sucesso';
    await carregarEncomendas();
    await verDetalheEncomenda(numero);
  } catch (err) {
    msg.textContent = '✗ Erro: ' + err.message;
    msg.className = 'mensagem erro';
    btn.disabled = false;
  }
}

// Devolução: acção separada da consulta do detalhe - abre directamente o
// formulário para picar os artigos a devolver, sem misturar com o resto do
// detalhe da encomenda.
async function abrirDevolucaoCliente(numero) {
  const container = document.getElementById('detalhe-encomenda');
  try {
    const [e, perfil, condicoes] = await Promise.all([
      apiGet(`/conta/encomendas/${numero}`),
      apiGet('/conta/perfil'),
      apiGet('/paginas/devolucoes-trocas'),
    ]);
    container.innerHTML = `
      <div class="form-group" style="margin-top:20px;border-top:1px solid #ddd;padding-top:16px">
        <h3>Devolução — Encomenda ${e.numero}</h3>
        <p class="descricao">Indique a quantidade a devolver de cada artigo (0 = não devolver este artigo). Os portes de envio nunca são devolvidos.</p>
        <table class="sync-table">
          <thead><tr><th>Artigo</th><th>Já devolvida</th><th>Disponível p/ devolver</th><th>Qtd. a devolver</th></tr></thead>
          <tbody>
            ${e.linhas.map((l) => `
              <tr>
                <td>${l.descricao}</td>
                <td>${l.quantidadeDevolvida}</td>
                <td>${l.quantidadeDevolvivel}</td>
                <td><input type="number" class="input-qtd-devolver-cliente" data-codigo-artigo="${l.codigoArtigo}" data-codigo-lote="${l.codigoLote}" min="0" max="${l.quantidadeDevolvivel}" value="0" style="width:70px" ${l.quantidadeDevolvivel === 0 ? 'disabled' : ''}></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="form-group" style="margin-top:16px">
          <label>IBAN *</label>
          <input type="text" id="input-iban-devolucao-cliente" placeholder="PT50 0000 0000 0000 0000 0000 0" value="${perfil.iban || ''}" required>
          <label>Nome do 1º Titular da Conta *</label>
          <input type="text" id="input-titular-devolucao-cliente" value="${perfil.nomeTitularConta || ''}" required>
          <label>Razão da Devolução *</label>
          <textarea id="input-motivo-devolucao-cliente" rows="3" required></textarea>
        </div>
        <div class="form-group" style="margin-top:16px">
          <h4>Condições de Devolução</h4>
          <div class="pagina-conteudo" style="max-height:300px;overflow-y:auto;border:1px solid var(--cinza-medio,#ccc);padding:12px;border-radius:4px">
            ${condicoes.conteudo}
          </div>
        </div>
        <div class="acoes">
          <button id="btn-confirmar-devolucao-cliente" class="botao-principal">Li e Aceito as condições de devolução!</button>
          <button id="btn-cancelar-devolucao-cliente" class="botao-secundario">Cancelar</button>
          <span id="msg-devolucao-cliente" class="mensagem"></span>
        </div>
      </div>
    `;
    document.getElementById('btn-confirmar-devolucao-cliente').addEventListener('click', () => submeterDevolucaoCliente(numero));
    document.getElementById('btn-cancelar-devolucao-cliente').addEventListener('click', () => verDetalheEncomenda(numero));
  } catch (err) {
    container.innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
  }
}

async function submeterDevolucaoCliente(numero) {
  const inputs = document.querySelectorAll('.input-qtd-devolver-cliente');
  const linhas = [];
  inputs.forEach((input) => {
    const quantidade = parseInt(input.value, 10) || 0;
    if (quantidade > 0) {
      linhas.push({ codigoArtigo: input.dataset.codigoArtigo, codigoLote: input.dataset.codigoLote, quantidade });
    }
  });

  const msg = document.getElementById('msg-devolucao-cliente');
  if (linhas.length === 0) {
    msg.textContent = '✗ Indique pelo menos um artigo a devolver';
    msg.className = 'mensagem erro';
    return;
  }

  const iban = document.getElementById('input-iban-devolucao-cliente').value.trim();
  const nomeTitular = document.getElementById('input-titular-devolucao-cliente').value.trim();
  const motivo = document.getElementById('input-motivo-devolucao-cliente').value.trim();
  if (!iban || !nomeTitular || !motivo) {
    msg.textContent = '✗ O IBAN, o nome do 1º titular da conta e a razão da devolução são obrigatórios';
    msg.className = 'mensagem erro';
    return;
  }

  if (!confirm(`Confirma a devolução de ${linhas.length} artigo(s) da encomenda ${numero}?`)) return;

  const btn = document.getElementById('btn-confirmar-devolucao-cliente');
  btn.disabled = true;
  msg.textContent = 'A processar...';
  msg.className = 'mensagem';

  try {
    const resultado = await apiPost(`/conta/encomendas/${numero}/devolucao`, { linhas, iban, nomeTitular, motivo });
    msg.textContent = `✓ Devolução registada (${resultado.numeroDevolucao})! Valor: ${formatarPreco(resultado.valorDevolvido)}, Pontos estornados: ${resultado.pontosEstornados}`;
    msg.className = 'mensagem sucesso';
    await carregarEncomendas();
    await verDetalheEncomenda(numero);
  } catch (err) {
    msg.textContent = '✗ Erro: ' + err.message;
    msg.className = 'mensagem erro';
    btn.disabled = false;
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
      ${pontos.pontosPendentes > 0 ? `<p class="descricao">+ ${pontos.pontosPendentes} pontos pendentes (atribuídos assim que confirmar a receção da(s) encomenda(s))</p>` : ''}
      <button id="btn-trocar-vale" class="botao-principal">Trocar pontos por vale</button>
      <span id="msg-trocar-vale" class="mensagem"></span>
    `;
    document.getElementById('btn-trocar-vale').addEventListener('click', trocarPontosPorVale);

    let acumulado = pontos.saldo;
    const historicoComAcumulado = pontos.historico.map((h) => {
      const linha = { ...h, acumulado };
      acumulado -= h.pontos;
      return linha;
    });

    historicoEl.innerHTML = pontos.historico.length === 0 ? '<p class="descricao">Sem movimentos.</p>' : `
      <table class="sync-table">
        <thead><tr><th>Data</th><th>Tipo</th><th>Pontos</th><th>Acumulado</th><th>Descrição</th></tr></thead>
        <tbody>
          ${historicoComAcumulado.map((h) => `
            <tr><td>${new Date(h.data).toLocaleDateString('pt-PT')}</td><td>${h.tipo}</td><td>${h.pontos}</td><td>${h.acumulado}</td><td>${h.descricao || '-'}</td></tr>
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
            <tr><td>${v.codigo}</td><td>${formatarPreco(v.valor)}</td><td>${v.estadoLabel}</td><td>${new Date(v.data).toLocaleDateString('pt-PT')}</td></tr>
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
  // só os itens de secção - o link Backoffice (a.menu-item) navega para admin.html
  const items = document.querySelectorAll('.menu-item[data-secao]');

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
// O perfil de conta (/conta/perfil) não expõe IsAdmin - é /auth/perfil que o
// devolve (o mesmo que o admin.html usa para validar o acesso).
async function mostrarBotaoBackofficeSeAdmin() {
  try {
    const perfil = await apiGet('/auth/perfil');
    if (perfil.isAdmin) document.getElementById('btn-backoffice').style.display = '';
  } catch {
    // sem sessão válida ou erro de rede - o botão simplesmente não aparece
  }
}

function mostrarAreaAutenticada() {
  document.getElementById('auth-conta').style.display = 'none';
  document.getElementById('conteudo-autenticado').style.display = 'block';
  inicializarMenu();
  mostrarBotaoBackofficeSeAdmin();

  // permite chegar directamente à secção Pontos e Vales via link externo
  // (ex: conta.html#pontos, usado no Checkout) - por omissão fica Encomendas
  if (window.location.hash === '#pontos') {
    document.querySelectorAll('.menu-item').forEach((i) => i.classList.toggle('activo', i.dataset.secao === 'pontos'));
    document.querySelectorAll('.secao').forEach((s) => s.classList.toggle('activa', s.id === 'secao-pontos'));
    carregarPontosEVales();
  } else {
    carregarEncomendas();
  }
}

(async function init() {
  document.getElementById('btn-terminar-sessao').addEventListener('click', () => {
    if (!confirm('Deseja terminar a sessão?')) return;
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
