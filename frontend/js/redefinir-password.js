function obterTokenDaURL() {
  return new URLSearchParams(window.location.search).get('token');
}

function renderFormulario(token) {
  const container = document.getElementById('conteudo-redefinir');
  container.innerHTML = `
    <form class="checkout" id="form-redefinir">
      <div id="erro-redefinir"></div>
      <fieldset>
        <legend>Nova Password</legend>
        <label>Nova Password * (mín. 8 caracteres)</label>
        <input type="password" name="novaPassword" minlength="8" required>
        <label>Confirmar Nova Password *</label>
        <input type="password" name="confirmarPassword" minlength="8" required>
      </fieldset>
      <button type="submit" class="botao-principal">Redefinir Password</button>
    </form>
  `;

  document.getElementById('form-redefinir').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const botao = form.querySelector('button[type="submit"]');
    const erroEl = document.getElementById('erro-redefinir');
    erroEl.innerHTML = '';

    if (form.novaPassword.value !== form.confirmarPassword.value) {
      erroEl.innerHTML = '<div class="mensagem-erro">As passwords não coincidem.</div>';
      return;
    }

    botao.disabled = true;
    try {
      await apiPost('/auth/redefinir-password', { token, novaPassword: form.novaPassword.value });
      container.innerHTML = `
        <div class="mensagem-sucesso">Password redefinida com sucesso.</div>
        <p style="margin-top:16px"><a href="conta.html" style="text-decoration:underline">Iniciar Sessão</a></p>
      `;
    } catch (err) {
      erroEl.innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
      botao.disabled = false;
    }
  });
}

(function init() {
  const token = obterTokenDaURL();
  if (!token) {
    document.getElementById('conteudo-redefinir').innerHTML = '<div class="mensagem-erro">Link de recuperação inválido.</div>';
    return;
  }
  renderFormulario(token);
})();
