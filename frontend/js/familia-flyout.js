// Menu "Família" em cascata por hover (grau1 -> grau2 -> grau3 -> grau4),
// partilhado por todas as páginas que incluem o cabeçalho (ver cabecalho.js).
// Reutiliza os mesmos endpoints /familias/grauN já usados em cabecalho.js.

const NOME_PARAM_GRAU = { 1: 'familiaGrau1', 2: 'familiaGrau2', 3: 'familiaGrau3', 4: 'familiaGrau4' };
const ATRASO_HOVER_MS = 150;
// dá tempo ao rato de chegar ao submenu seguinte (posicionado à direita, com
// um pequeno espaço vazio pelo meio) sem este fechar por passar lá fora um instante
const ATRASO_FECHO_MS = 400;

// caminho = códigos de TODOS os níveis desde o Grau1 até ao item clicado
// (ex: clicar directamente em "FUTEBOL-FUTSAL-TURF" sem antes clicar em
// "CALÇADO" só passava por "CALÇADO" no hover, nunca no clique - por isso
// tem de vir o caminho completo, não só o código do nível clicado).
function irParaFamilia(caminho) {
  const params = new URLSearchParams(window.location.search);
  for (let g = 1; g <= 4; g++) {
    if (g <= caminho.length) params.set(NOME_PARAM_GRAU[g], caminho[g - 1]);
    else params.delete(NOME_PARAM_GRAU[g]);
  }
  params.set('familia', caminho[caminho.length - 1]);
  // ao filtrar por família via este menu, ordenar por família por defeito
  params.set('ordenar', 'familia');
  const queryActual = window.location.search.replace(/^\?/, '');
  const queryNova = params.toString();
  // se a query calculada for igual à actual, atribuir location.href não recarrega
  // nada (o browser ignora - é a mesma URL) - forçar reload explicitamente nesse caso
  if (queryNova === queryActual) {
    window.location.reload();
  } else {
    window.location.href = `index.html?${queryNova}`;
  }
}

async function obterFamiliasGrau(grau, codigoPai) {
  if (grau === 1) return apiGet('/familias/grau1');
  const chavePai = { 2: 'grau1', 3: 'grau2', 4: 'grau3' }[grau];
  return apiGet(`/familias/grau${grau}?${chavePai}=${encodeURIComponent(codigoPai)}`);
}

function renderNivelFamilia(itens, grau, caminhoPai) {
  const ul = document.createElement('ul');
  ul.className = `familia-flyout-nivel familia-flyout-nivel--${grau}`;
  // Sem rato (telemóvel/touch) não há "hover" - clicar num item com filhos
  // (grau < 4) abre/fecha a subfamília em vez de navegar logo; só um item-folha
  // (grau4, sem seta) navega ao clicar. Com rato, mantém-se o comportamento
  // actual: hover abre a subfamília, clique navega para qualquer nível.
  const suportaHover = window.matchMedia('(hover: hover)').matches;

  itens.forEach((f) => {
    const caminho = [...caminhoPai, f.codigo];

    const li = document.createElement('li');
    li.className = 'familia-flyout-item';
    li.dataset.codigo = f.codigo;
    li.dataset.grau = grau;

    const nome = document.createElement('span');
    nome.textContent = f.nome;
    li.appendChild(nome);

    let seta = null;
    if (grau < 4) {
      seta = document.createElement('span');
      seta.className = 'familia-flyout-seta';
      seta.textContent = '›';
      li.appendChild(seta);
    }

    let submenuAberto = null;

    async function abrirSubmenu() {
      try {
        const filhas = await obterFamiliasGrau(grau + 1, f.codigo);
        if (!li.isConnected || filhas.length === 0) return;
        // remove qualquer submenu anterior deste item (evita duplicar em re-abertura)
        li.querySelectorAll(':scope > .familia-flyout-nivel').forEach((n) => n.remove());
        submenuAberto = renderNivelFamilia(filhas, grau + 1, caminho);
        li.appendChild(submenuAberto);
        li.classList.add('aberto');
      } catch (err) {
        console.error(`Erro ao carregar famílias Grau ${grau + 1}:`, err);
      }
    }

    function fecharSubmenu() {
      li.classList.remove('aberto');
      if (submenuAberto) {
        submenuAberto.remove();
        submenuAberto = null;
      }
    }

    if (suportaHover) {
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        irParaFamilia(caminho);
      });

      let temporizadorAbrir = null;
      let temporizadorFechar = null;

      li.addEventListener('mouseenter', () => {
        clearTimeout(temporizadorFechar);
        if (grau >= 4) return;
        temporizadorAbrir = setTimeout(abrirSubmenu, ATRASO_HOVER_MS);
      });

      li.addEventListener('mouseleave', () => {
        clearTimeout(temporizadorAbrir);
        // só fecha passado ATRASO_FECHO_MS - se o rato voltar a entrar (neste
        // item ou no submenu, que é filho no DOM, não dispara mouseleave) a
        // tempo, este temporizador é cancelado e nada fecha
        temporizadorFechar = setTimeout(fecharSubmenu, ATRASO_FECHO_MS);
      });
    } else {
      // Sem rato: clicar no nome filtra sempre por esta família (mesmo
      // não sendo grau4); clicar na seta apenas expande/recolhe a
      // subfamília seguinte - assim ambas as acções ficam acessíveis
      // (antes, clicar no item de grau1-3 só abria o submenu e nunca
      // filtrava por esse grau).
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        irParaFamilia(caminho);
      });

      if (seta) {
        seta.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (li.classList.contains('aberto')) {
            fecharSubmenu();
          } else {
            await abrirSubmenu();
          }
        });
      }
    }

    ul.appendChild(li);
  });
  return ul;
}

async function inicializarFamiliaFlyout() {
  const dropdown = document.getElementById('dropdown-familia');
  const painel = document.getElementById('painel-familia');
  if (!dropdown || !painel) return;

  try {
    // realça o botão a vermelho enquanto houver um filtro de família activo
    const params = new URLSearchParams(window.location.search);
    if (params.get('familiaGrau1')) {
      dropdown.querySelector('.nav-dropdown-trigger').classList.add('activo');
    }

    const grau1 = await obterFamiliasGrau(1);
    const nivel1 = renderNivelFamilia(grau1, 1, []);
    nivel1.classList.add('familia-flyout-nivel--1');
    painel.appendChild(nivel1);

    const suportaHover = window.matchMedia('(hover: hover)').matches;
    if (suportaHover) {
      dropdown.addEventListener('mouseenter', () => nivel1.classList.add('aberto'));
      dropdown.addEventListener('mouseleave', () => nivel1.classList.remove('aberto'));
    } else {
      dropdown.querySelector('.nav-dropdown-trigger').addEventListener('click', (e) => {
        e.stopPropagation();
        nivel1.classList.toggle('aberto');
      });
      document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target)) nivel1.classList.remove('aberto');
      });
    }
  } catch (err) {
    console.error('Erro ao inicializar menu de família:', err);
  }
}

document.addEventListener('DOMContentLoaded', inicializarFamiliaFlyout);
