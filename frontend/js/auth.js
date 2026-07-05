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

// Renderiza um formulário partilhado de login/registo dentro de `container`.
// Ao autenticar com sucesso, guarda o token e chama onSucesso().
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
            </fieldset>
            <button type="submit" class="botao-principal">Entrar</button>
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
              <label>Telefone</label>
              <input type="tel" name="telefone">
              <label>NIF</label>
              <input type="text" name="nif">
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
  }

  async function submeter(e) {
    e.preventDefault();
    const form = e.target;
    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;
    document.getElementById('erro-auth').innerHTML = '';

    try {
      let resultado;
      if (modo === 'login') {
        resultado = await apiPost('/auth/login', { email: form.email.value, password: form.password.value });
      } else {
        resultado = await apiPost('/auth/registo', {
          nome: form.nome.value,
          email: form.email.value,
          password: form.password.value,
          telefone: form.telefone.value || undefined,
          nif: form.nif.value || undefined,
        });
      }
      guardarToken(resultado.token);
      onSucesso();
    } catch (err) {
      document.getElementById('erro-auth').innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
      botao.disabled = false;
    }
  }

  render();
}
