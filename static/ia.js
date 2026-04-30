/* ================================================
   ANÁLISE IA — ia.js (VERSÃO MELHORADA)
   ================================================ */

'use strict';

// ─── FUNÇÕES AUXILIARES ────────────────────────────
function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === (name + '=')) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

// ─── ESTADO GLOBAL DA IA ──────────────────────────
const IA_STATE = {
  lastResult: null,
  lastTimestamp: null,
  isLoading: false,
};

// ─── VERIFICAR MARKED.JS ────────────────────────────
function waitForMarked(callback, maxAttempts = 50) {
  if (typeof marked !== 'undefined' && marked.parse) {
    callback();
  } else if (maxAttempts > 0) {
    setTimeout(() => waitForMarked(callback, maxAttempts - 1), 50);
  } else {
    console.error('marked.js não pode ser carregado');
  }
}

// ─── RENDERIZAR MARKDOWN ────────────────────────────
function renderMarkdown(markdown, container) {
  if (!container || !markdown) return;
  
  // Usa waitForMarked para garantir que marked está disponível
  waitForMarked(() => {
    try {
      if (typeof marked !== 'undefined' && marked.parse) {
        const html = marked.parse(markdown);
        container.innerHTML = html;
        container.classList.add('markdown-content');
        console.log('✓ Markdown renderizado com sucesso');
      } else {
        throw new Error('marked.parse não disponível');
      }
    } catch (err) {
      console.error('Erro ao renderizar markdown:', err);
      // Fallback: renderiza como texto plano se markdown falhar
      container.innerHTML = `<pre style="color: var(--t-secondary); line-height: 1.8; white-space: pre-wrap; word-wrap: break-word;">${escapeHtml(markdown)}</pre>`;
    }
  });
}

// ─── ESCAPE HTML (segurança) ────────────────────────
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── INVOCAR AGENTE DE IA ──────────────────────────
async function invokeAgent() {
  const btn = document.getElementById('invokeAgentBtn');
  const responseContainer = document.getElementById('agentResponse');
  const status = document.getElementById('agentStatus');
  const timestamp = document.getElementById('agentTimestamp');
  const imageInput = document.getElementById('imageUploadInput');

  if (!btn || !responseContainer || !status) return;

  // 🔒 proteção contra múltiplos cliques
  if (IA_STATE.isLoading) return;
  IA_STATE.isLoading = true;

  btn.disabled = true;
  btn.style.opacity = '0.6';

  status.textContent = '⏳ Gerando análise...';
  status.className = 'save-status loading';
  responseContainer.innerHTML = '<p style="color: var(--t-muted);">Aguardando resposta...</p>';
  timestamp.textContent = '';

  try {
    const formData = new FormData();

    // 📊 envia contexto do sistema (IMPORTANTE)
    formData.append('context', JSON.stringify({
      month: STATE?.month || null,
      trades: STATE?.trades || [],
    }));

    // 📎 envia imagem se existir
    if (imageInput && imageInput.files.length > 0) {
      formData.append('image', imageInput.files[0]);
    }

    // ⏱ timeout de segurança
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch('/api/agent/invoke/', {
      method: 'POST',
      headers: {
        'X-CSRFToken': getCookie('csrftoken'),
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // ❌ erro HTTP
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
    }

    // ❌ resposta inválida
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      throw new Error(`Resposta inválida: ${text.substring(0, 200)}`);
    }

    const data = await response.json();

    if (data.success) {
      const result = data.result || 'Nenhuma resposta retornada.';
      
      console.log('📝 Renderizando markdown da resposta IA...');
      
      // Renderiza markdown na resposta
      renderMarkdown(result, responseContainer);

      const date = new Date(data.created_at);
      timestamp.textContent = `Gerado em ${date.toLocaleString('pt-BR')}`;

      status.textContent = '✓ Análise concluída';
      status.className = 'save-status ok';

      IA_STATE.lastResult = result;
      IA_STATE.lastTimestamp = data.created_at;

      // limpa imagem
      if (imageInput) {
        imageInput.value = '';
        updateImagePreview();
      }

    } else {
      throw new Error(data.error || 'Erro desconhecido da API');
    }

  } catch (error) {
    console.error('🔥 Erro completo IA:', error);

    let message = error.message;

    if (error.name === 'AbortError') {
      message = 'Tempo de resposta excedido (timeout).';
    }

    responseContainer.innerHTML = `
      <p style="color: var(--c-red); margin: 10px 0;">❌ <strong>Erro ao gerar análise:</strong></p>
      <pre style="color: var(--c-red); background: rgba(240, 77, 94, 0.1); padding: 10px; border-radius: 4px; border-left: 3px solid var(--c-red); overflow-x: auto;">${escapeHtml(message)}</pre>
    `;
    status.textContent = '✗ Erro na requisição';
    status.className = 'save-status error';

  } finally {
    btn.disabled = false;
    btn.style.opacity = '1';
    IA_STATE.isLoading = false;

    setTimeout(() => {
      if (status.classList.contains('ok')) {
        status.textContent = '';
        status.className = 'save-status';
      }
    }, 3000);
  }
}

// ─── PREVIEW DE IMAGEM ─────────────────────────────
function updateImagePreview() {
  const imageInput = document.getElementById('imageUploadInput');
  const previewContainer = document.getElementById('imagePreviewContainer');

  if (!imageInput || !previewContainer) return;

  if (imageInput.files && imageInput.files[0]) {
    const file = imageInput.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
      previewContainer.innerHTML = `
        <div style="position: relative; max-width: 300px;">
          <img src="${e.target.result}" style="width: 100%; border-radius: 4px;">
          <button onclick="removeImage()" 
            style="position:absolute;top:5px;right:5px;background:red;color:#fff;border:none;padding:4px 8px;cursor:pointer;">
            ✕
          </button>
          <p style="font-size:12px;">${file.name}</p>
        </div>
      `;
    };

    reader.readAsDataURL(file);
  } else {
    previewContainer.innerHTML = '';
  }
}

// ─── REMOVER IMAGEM ──────────────────────────────
function removeImage() {
  const imageInput = document.getElementById('imageUploadInput');
  if (imageInput) {
    imageInput.value = '';
    updateImagePreview();
  }
}

// ─── COPIAR ANÁLISE ──────────────────────────────
function copyAnalysisToClipboard() {
  if (!IA_STATE.lastResult) {
    alert('Nenhuma análise para copiar.');
    return;
  }

  navigator.clipboard.writeText(IA_STATE.lastResult)
    .then(() => {
      alert('✓ Análise copiada para a área de transferência!');
    })
    .catch(err => {
      console.error('Erro ao copiar:', err);
      alert('Erro ao copiar. Tente novamente.');
    });
}

// ─── DOWNLOAD ────────────────────────────────────
function downloadAnalysis() {
  if (!IA_STATE.lastResult) {
    alert('Nada para baixar.');
    return;
  }

  const blob = new Blob([IA_STATE.lastResult], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `analise-ia-${new Date().toISOString().split('T')[0]}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── RESTORE ─────────────────────────────────────
function restoreLastAnalysis() {
  const responseContainer = document.getElementById('agentResponse');
  const timestamp = document.getElementById('agentTimestamp');

  if (IA_STATE.lastResult && responseContainer) {
    renderMarkdown(IA_STATE.lastResult, responseContainer);
  }

  if (IA_STATE.lastTimestamp && timestamp) {
    const date = new Date(IA_STATE.lastTimestamp);
    timestamp.textContent = `Última análise: ${date.toLocaleString('pt-BR')}`;
  }
}

// ─── LIMPAR ──────────────────────────────────────
function clearAnalysis() {
  if (!confirm('Limpar análise?')) return;

  const responseContainer = document.getElementById('agentResponse');
  if (responseContainer) {
    responseContainer.innerHTML = '<p style="color:var(--muted);font-style:italic;">Análise foi limpa. Clique em "Gerar Análise IA" para gerar uma nova.</p>';
  }

  const timestamp = document.getElementById('agentTimestamp');
  if (timestamp) {
    timestamp.textContent = '';
  }

  IA_STATE.lastResult = null;
  IA_STATE.lastTimestamp = null;
}

// ─── INIT ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  console.log('📦 Inicializando módulo IA...');
  
  // Aguarda marked.js estar pronto
  waitForMarked(() => {
    console.log('✓ marked.js carregado e pronto');
  });
  
  const btn = document.getElementById('invokeAgentBtn');
  if (btn) btn.addEventListener('click', invokeAgent);

  const input = document.getElementById('imageUploadInput');
  if (input) input.addEventListener('change', updateImagePreview);

  restoreLastAnalysis();
});

// ─── OBSERVER DE MÊS ─────────────────────────────
const originalLoadAll = window.loadAll || function() {};

window.loadAll = async function(month) {
  if (STATE.month && STATE.month !== month) {
    clearAnalysis();
  }
  return originalLoadAll.call(this, month);
};
