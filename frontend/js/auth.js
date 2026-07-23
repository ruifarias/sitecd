// Sessão de cliente autenticado (JWT em localStorage, enviado como Bearer token
// pelas funções apiGet/apiPost/etc. de api.js). Sem cookies - CORS actual não usa
// credentials, mantém-se o mesmo padrão do sessaoId do carrinho anónimo.
const CLIENTE_TOKEN_KEY = 'clienteToken';

function obterToken() {
  return localStorage.getItem(CLIENTE_TOKEN_KEY);
}

function guardarToken(token) {
  localStorage.setItem(CLIENTE_TOKEN_KEY, token);
}

function removerToken() {
  localStorage.removeItem(CLIENTE_TOKEN_KEY);
}

function estaAutenticado() {
  return !!obterToken();
}

// Renderiza um formulário partilhado de login/registo/recuperação de password
// dentro de `container`. Ao autenticar com sucesso, guarda o token e chama
// onSucesso().
function renderFormularioAuth(container, onSucesso) {
  let modo = 'login';

  function render() {
    container.innerHTML = `
      <div class="auth-caixa">
        <div class="auth-tabs">
          <button type="button" class="auth-tab ${modo === 'login' ? 'activa' : ''}" data-modo="login">Iniciar Sessão</button>
          <button type="button" class="auth-tab ${modo === 'registo' ? 'activa' : ''}" data-modo="registo">Criar Conta</button>
        </div>
        <div id="erro-auth"></div>
        ${modo === 'login' ? `
          <form class="checkout" id="form-auth">
            <fieldset>
              <legend>Iniciar Sessão</legend>
              <label>Email *</label>
              <input type="email" name="email" required>
              <label>Password *</label>
              <input type="password" name="password" required>
              <p style="margin-top:8px"><a href="#" id="link-recuperar-password" style="font-size:13px;text-decoration:underline">Esqueceu-se da password?</a></p>
            </fieldset>
            <button type="submit" class="botao-principal">Entrar</button>
          </form>
        ` : modo === 'recuperar' ? `
          <form class="checkout" id="form-auth">
            <fieldset>
              <legend>Recuperação de Password</legend>
              <p class="descricao" style="margin-bottom:12px">Indique o seu email. Se estiver registado, receberá um link para criar uma nova password.</p>
              <label>Email *</label>
              <input type="email" name="email" required>
            </fieldset>
            <button type="submit" class="botao-principal">Enviar Link de Recuperação</button>
            <p style="margin-top:8px"><a href="#" id="link-voltar-login" style="font-size:13px;text-decoration:underline">← Voltar ao Início de Sessão</a></p>
          </form>
        ` : `
          <form class="checkout" id="form-auth">
            <fieldset>
              <legend>Criar Conta</legend>
              <label>Nome *</label>
              <input type="text" name="nome" required>
              <label>Email *</label>
              <input type="email" name="email" required>
              <label>Password * (mín. 8 caracteres)</label>
              <input type="password" name="password" minlength="8" required>
              <label>Telefone *</label>
              <input type="tel" name="telefone" required>
              <label>NIF</label>
              <input type="text" name="nif" placeholder="Deixe em branco para Consumidor Final">
            </fieldset>
            <fieldset>
              <legend>Morada de Entrega (opcional, pode preencher depois)</legend>
              <label>Morada</label>
              <input type="text" name="morada">
              <label>Código Postal</label>
              <input type="text" name="codigoPostal" placeholder="0000-000">
              <label>Localidade</label>
              <input type="text" name="localidade">
            </fieldset>
            <button type="submit" class="botao-principal">Criar Conta</button>
          </form>
        `}
      </div>
    `;

    container.querySelectorAll('.auth-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        modo = btn.dataset.modo;
        render();
      });
    });

    document.getElementById('form-auth').addEventListener('submit', submeter);

    const linkRecuperar = document.getElementById('link-recuperar-password');
    if (linkRecuperar) {
      linkRecuperar.addEventListener('click', (e) => {
        e.preventDefault();
        modo = 'recuperar';
        render();
      });
    }
    const linkVoltar = document.getElementById('link-voltar-login');
    if (linkVoltar) {
      linkVoltar.addEventListener('click', (e) => {
        e.preventDefault();
        modo = 'login';
        render();
      });
    }
  }

  async function submeter(e) {
    e.preventDefault();
    const form = e.target;
    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;
    document.getElementById('erro-auth').innerHTML = '';

    try {
      if (modo === 'login') {
        const resultado = await apiPost('/auth/login', { email: form.email.value, password: form.password.value });
        guardarToken(resultado.token);
        onSucesso();
        return;
      }
      if (modo === 'recuperar') {
        const resultado = await apiPost('/auth/recuperar-password', { email: form.email.value });
        document.getElementById('erro-auth').innerHTML = `<div class="mensagem-sucesso">${resultado.mensagem}</div>`;
        botao.disabled = false;
        return;
      }
      const resultado = await apiPost('/auth/registo', {
        nome: form.nome.value,
        email: form.email.value,
        password: form.password.value,
        telefone: form.telefone.value,
        nif: form.nif.value || undefined,
        morada: form.morada.value || undefined,
        localidade: form.localidade.value || undefined,
        codigoPostal: form.codigoPostal.value || undefined,
      });
      guardarToken(resultado.token);
      onSucesso();
    } catch (err) {
      const erroEl = document.getElementById('erro-auth');
      if (err.dados?.codigo === 'EMAIL_NAO_CONFIRMADO') {
        erroEl.innerHTML = `
          <div class="mensagem-erro">${err.message}</div>
          <p style="margin-top:8px"><a href="#" id="link-reenviar-confirmacao" style="font-size:13px;text-decoration:underline">Reenviar email de confirmação</a></p>
        `;
        document.getElementById('link-reenviar-confirmacao').addEventListener('click', async (ev) => {
          ev.preventDefault();
          try {
            const resultado = await apiPost('/auth/reenviar-confirmacao', { email: form.email.value });
            erroEl.innerHTML = `<div class="mensagem-sucesso">${resultado.mensagem}</div>`;
          } catch (erroReenvio) {
            erroEl.innerHTML = `<div class="mensagem-erro">${erroReenvio.message}</div>`;
          }
        });
      } else {
        erroEl.innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
      }
      botao.disabled = false;
    }
  }

  render();
}
