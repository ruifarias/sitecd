function obterTokenDaURL() {
  return new URLSearchParams(window.location.search).get('token');
}

async function confirmarEmail(token) {
  const container = document.getElementById('conteudo-confirmar');
  container.innerHTML = '<p class="descricao">A confirmar...</p>';

  try {
    const resultado = await apiPost('/auth/confirmar-email', { token });
    container.innerHTML = `
      <div class="mensagem-sucesso">${resultado.jaConfirmado ? 'Esta conta já estava confirmada.' : 'A sua conta foi activada com sucesso!'}</div>
      <p style="margin-top:16px"><a href="conta.html" style="text-decoration:underline">Iniciar Sessão</a></p>
    `;
  } catch (err) {
    container.innerHTML = `<div class="mensagem-erro">${err.message}</div>`;
  }
}

(function init() {
  const token = obterTokenDaURL();
  if (!token) {
    document.getElementById('conteudo-confirmar').innerHTML = '<div class="mensagem-erro">Link de confirmação inválido.</div>';
    return;
  }
  confirmarEmail(token);
})();
