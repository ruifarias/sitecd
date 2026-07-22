// Mesmo hostname da página (não fixo a "localhost") - permite abrir o site
// por IP da rede local (ex: no telemóvel) e continuar a chegar à API certa.
const API_BASE = `http://${window.location.hostname}:3001/api`;

// Header Authorization: Bearer <token> em todos os pedidos quando existe uma
// sessão de cliente (localStorage 'clienteToken' - ver auth.js). Rotas públicas
// ignoram o header, por isso não há necessidade de o omitir condicionalmente.
function headersAuth(extra = {}) {
  const token = localStorage.getItem('clienteToken');
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function apiGet(caminho, noCache = false) {
  const url = noCache ? `${API_BASE}${caminho}${caminho.includes('?') ? '&' : '?'}_t=${Date.now()}` : `${API_BASE}${caminho}`;
  const res = await fetch(url, { cache: 'no-store', headers: headersAuth() });
  if (!res.ok) throw new Error((await res.json()).erro || 'Erro na API');
  return res.json();
}

// Descarrega um ficheiro (ex: PDF) enviando o header Authorization - um <a href>
// simples não envia esse header, por isso é preciso ir buscar via fetch e criar
// um URL temporário para o browser descarregar.
async function apiDownload(caminho, nomeFicheiro) {
  const res = await fetch(`${API_BASE}${caminho}`, { headers: headersAuth() });
  if (!res.ok) throw new Error((await res.json()).erro || 'Erro na API');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFicheiro;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function apiPost(caminho, corpo) {
  const res = await fetch(`${API_BASE}${caminho}`, {
    method: 'POST',
    headers: headersAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(corpo),
  });
  const dados = await res.json();
  if (!res.ok) throw Object.assign(new Error(dados.erro || 'Erro na API'), { dados });
  return dados;
}

async function apiPut(caminho, corpo) {
  const res = await fetch(`${API_BASE}${caminho}`, {
    method: 'PUT',
    headers: headersAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(corpo),
  });
  if (!res.ok) throw new Error((await res.json()).erro || 'Erro na API');
  return res.json();
}

async function apiDelete(caminho) {
  const res = await fetch(`${API_BASE}${caminho}`, { method: 'DELETE', headers: headersAuth() });
  if (!res.ok) throw new Error((await res.json()).erro || 'Erro na API');
  return res.json();
}

function formatarPreco(valor) {
  if (valor == null) return '';
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(valor);
}

function formatarDesconto(precoOriginal, precoComDesconto) {
  if (!precoOriginal) return '';
  const percentagem = Math.round((1 - precoComDesconto / precoOriginal) * 100);
  return `-${percentagem}%`;
}

// Lightbox simples: clicar numa imagem amplia-a num overlay ao centro do
// ecrã; clicar de novo na imagem, no fundo do overlay ou premir Escape
// fecha-o. Quando há mais do que uma imagem (ex: galeria da ficha de
// artigo, passada em opcoes.imagens), mostra setas de navegação (e aceita
// as teclas ←/→) para percorrer as imagens sem fechar o lightbox. Partilhado
// por qualquer página que inclua este ficheiro.
let lightboxImagens = [];
let lightboxIndice = 0;

function actualizarImagemLightbox() {
  const overlay = document.getElementById('lightbox-imagem');
  const item = lightboxImagens[lightboxIndice];
  if (!overlay || !item) return;
  const img = overlay.querySelector('img');
  img.src = item.src;
  img.alt = item.alt || '';
  overlay.querySelector('.lightbox-contador').textContent = `${lightboxIndice + 1}/${lightboxImagens.length}`;
  overlay.classList.toggle('tem-navegacao', lightboxImagens.length > 1);
}

function navegarImagemLightbox(delta) {
  if (lightboxImagens.length < 2) return;
  lightboxIndice = (lightboxIndice + delta + lightboxImagens.length) % lightboxImagens.length;
  actualizarImagemLightbox();
}

function mostrarImagemAmpliada(src, alt, opcoes = {}) {
  lightboxImagens = opcoes.imagens && opcoes.imagens.length > 0 ? opcoes.imagens : [{ src, alt }];
  lightboxIndice = Math.max(0, lightboxImagens.findIndex((img) => img.src === src));

  let overlay = document.getElementById('lightbox-imagem');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'lightbox-imagem';
    overlay.className = 'lightbox-imagem';
    overlay.innerHTML = `
      <div class="lightbox-conteudo">
        <img alt="">
        <span class="lightbox-contador"></span>
        <button type="button" class="lightbox-seta lightbox-seta-esq" aria-label="Imagem anterior">‹</button>
        <button type="button" class="lightbox-seta lightbox-seta-dir" aria-label="Imagem seguinte">›</button>
      </div>
    `;
    overlay.addEventListener('click', fecharImagemAmpliada);
    overlay.querySelector('.lightbox-seta-esq').addEventListener('click', (e) => { e.stopPropagation(); navegarImagemLightbox(-1); });
    overlay.querySelector('.lightbox-seta-dir').addEventListener('click', (e) => { e.stopPropagation(); navegarImagemLightbox(1); });
    document.addEventListener('keydown', (e) => {
      if (!overlay.classList.contains('aberta')) return;
      if (e.key === 'Escape') fecharImagemAmpliada();
      else if (e.key === 'ArrowLeft') navegarImagemLightbox(-1);
      else if (e.key === 'ArrowRight') navegarImagemLightbox(1);
    });
    document.body.appendChild(overlay);
  }
  actualizarImagemLightbox();
  overlay.classList.add('aberta');
}

function fecharImagemAmpliada() {
  const overlay = document.getElementById('lightbox-imagem');
  if (overlay) overlay.classList.remove('aberta');
}

function mensagemPeriodoOutlet() {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  const formatar = (d) => d.toLocaleDateString('pt-PT');
  return `Artigos de Outlet com desconto de ${formatar(primeiroDia)} a ${formatar(ultimoDia)}`;
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

// Mostra no rodapé (abaixo do aviso legal), no mesmo formato do site anterior
// ("DD/MM/AAAA às HH:MM"): a última vez que os dados mudaram de facto
// (#ultima-actualizacao) e a última vez que o serviço de sincronização correu
// com sucesso (#ultima-sincronizacao, avança mesmo sem nada para actualizar).
function formatarDataHora(iso) {
  const d = new Date(iso);
  const data = d.toLocaleDateString('pt-PT');
  const hora = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  return `${data} às ${hora}`;
}

async function actualizarUltimaSincronizacao() {
  const elActualizacao = document.getElementById('ultima-actualizacao');
  const elSincronizacao = document.getElementById('ultima-sincronizacao');
  if (!elActualizacao && !elSincronizacao) return;
  try {
    const { ultimaActualizacao, ultimaSincronizacao } = await apiGet('/ultima-sincronizacao');
    if (elActualizacao && ultimaActualizacao) {
      elActualizacao.textContent = `Última actualização: ${formatarDataHora(ultimaActualizacao)}`;
    }
    if (elSincronizacao && ultimaSincronizacao) {
      elSincronizacao.textContent = `Última sincronização: ${formatarDataHora(ultimaSincronizacao)}`;
    }
  } catch (_) { /* silencioso */ }
}

document.addEventListener('DOMContentLoaded', actualizarUltimaSincronizacao);
