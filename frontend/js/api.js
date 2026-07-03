const API_BASE = 'http://localhost:3001/api';

async function apiGet(caminho, noCache = false) {
  const url = noCache ? `${API_BASE}${caminho}${caminho.includes('?') ? '&' : '?'}_t=${Date.now()}` : `${API_BASE}${caminho}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error((await res.json()).erro || 'Erro na API');
  return res.json();
}

async function apiPost(caminho, corpo) {
  const res = await fetch(`${API_BASE}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const dados = await res.json();
  if (!res.ok) throw Object.assign(new Error(dados.erro || 'Erro na API'), { dados });
  return dados;
}

async function apiPut(caminho, corpo) {
  const res = await fetch(`${API_BASE}${caminho}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  if (!res.ok) throw new Error((await res.json()).erro || 'Erro na API');
  return res.json();
}

async function apiDelete(caminho) {
  const res = await fetch(`${API_BASE}${caminho}`, { method: 'DELETE' });
  if (!res.ok) throw new Error((await res.json()).erro || 'Erro na API');
  return res.json();
}

function formatarPreco(valor) {
  if (valor == null) return '';
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(valor);
}

function obterSessaoId() {
  let id = localStorage.getItem('sessaoId');
  if (!id) {
    id = 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('sessaoId', id);
  }
  return id;
}

async function actualizarBadgeCarrinho() {
  const badge = document.getElementById('carrinho-badge');
  if (!badge) return;
  try {
    const { linhas } = await apiGet(`/carrinho/${obterSessaoId()}`);
    const total = linhas.reduce((s, l) => s + l.quantidade, 0);
    badge.textContent = total;
    badge.style.display = total > 0 ? 'inline-block' : 'none';
  } catch (_) { /* silencioso */ }
}

document.addEventListener('DOMContentLoaded', actualizarBadgeCarrinho);
