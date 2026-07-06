// Estados da Nota de Devolução (ver api/src/constants/encomendaEstados.js)
const ESTADOS_DEVOLUCAO = ['NotaDevolucaoEmitida', 'DevolucaoRecebidaAceite', 'DevolucaoRecebidaNaoAceite', 'DevolucaoPaga'];
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
          <label>Localidade</label>
          <input type="text" name="localidade" value="${perfil.localidade || ''}">
          <label>Código Postal</label>
          <input type="text" name="codigoPostal" placeholder="0000-000" value="${perfil.codigoPostal || ''}">
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
      <div class="tabela-scroll-painel">
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
                <td>${e.pontosGanhos} ${e.estado !== 'Enviada' && !ehEstadoDevolucao(e.estado) ? '<small>(pendente)</small>' : ''}</td>
                <td>
                  <div class="acoes-encomenda">
                    <button class="botao-secundario btn-ver-encomenda" data-numero="${e.numero}">Ver detalhe</button>
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
          <div><span>Portes</span><span>${formatarPreco(e.portes)}</span></div>
          ${e.valeDesconto > 0 ? `<div><span>Vale aplicado (${e.valeCodigo})</span><span>-${formatarPreco(e.valeDesconto)}</span></div>` : ''}
          <div class="resumo-total-final"><span>Total</span><span>${formatarPreco(e.total)}</span></div>
        </div>
        <p>Pontos desta encomenda: ${e.pontosGanhos} ${e.estado === 'Enviada' ? '(já atribuídos)' : e.estado === 'Anulada' ? '(anulados)' : ehEstadoDevolucao(e.estado) ? '(estornados)' : '(pendentes até a encomenda ser enviada)'}</p>
        <button class="botao-secundario" id="btn-pdf-encomenda">Exportar PDF</button>

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
      </div>
    `;
    document.getElementById('btn-pdf-encomenda').addEventListener('click', () => {
      apiDownload(`/conta/encomendas/${numero}/pdf`, `${numero}.pdf`).catch((err) => alert('Erro ao gerar PDF: ' + err.message));
    });
  } catch (err) {
    container.innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
  }
}

// Devolução: acção separada da consulta do detalhe - abre directamente o
// formulário para picar os artigos a devolver, sem misturar com o resto do
// detalhe da encomenda.
async function abrirDevolucaoCliente(numero) {
  const container = document.getElementById('detalhe-encomenda');
  try {
    const e = await apiGet(`/conta/encomendas/${numero}`);
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
        <div class="form-group" style="max-width:400px;margin-top:16px">
          <label>IBAN *</label>
          <input type="text" id="input-iban-devolucao-cliente" placeholder="PT50 0000 0000 0000 0000 0000 0" required>
          <label>Nome do 1º Titular da Conta *</label>
          <input type="text" id="input-titular-devolucao-cliente" required>
        </div>
        <div class="acoes">
          <button id="btn-confirmar-devolucao-cliente" class="botao-principal">Confirmar Devolução</button>
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
  if (!iban || !nomeTitular) {
    msg.textContent = '✗ O IBAN e o nome do 1º titular da conta são obrigatórios';
    msg.className = 'mensagem erro';
    return;
  }

  if (!confirm(`Confirma a devolução de ${linhas.length} artigo(s) da encomenda ${numero}?`)) return;

  const btn = document.getElementById('btn-confirmar-devolucao-cliente');
  btn.disabled = true;
  msg.textContent = 'A processar...';
  msg.className = 'mensagem';

  try {
    const resultado = await apiPost(`/conta/encomendas/${numero}/devolucao`, { linhas, iban, nomeTitular });
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
      ${pontos.pontosPendentes > 0 ? `<p class="descricao">+ ${pontos.pontosPendentes} pontos pendentes (atribuídos assim que a(s) encomenda(s) for(em) enviada(s))</p>` : ''}
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
  carregarEncomendas();
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
