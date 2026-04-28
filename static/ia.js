/* ================================================
   ANÁLISE IA — ia.js
   Funções específicas para gerenciar o agente IA
   de trading e análise de performance.
   
   Este arquivo contém:
   - invokeAgent(): Função principal que chama API 
                   para gerar análise do agente IA
   - copyAnalysisToClipboard(): Copia resultado para
                                área de transferência
   - downloadAnalysis(): Baixa análise em arquivo
   - restoreLastAnalysis(): Recupera análise anterior
   - clearAnalysis(): Limpa análise atual
   
   Integração:
   - Incluído no planilha.html via <script src="">
   - Usa STATE global do planilha.js
   - Acessa API helper do planilha.js
   - Aba dedicada: #tab-ia com id="tab-ia"
   - Botão de sidebar: data-tab="ia"
   ================================================ */

'use strict';

// ─── ESTADO GLOBAL DA IA ──────────────────────────
const IA_STATE = {
  lastResult: null,
  lastTimestamp: null,
  isLoading: false,
};

// ─── INVOCAR AGENTE DE IA ──────────────────────────
async function invokeAgent() {
  const btn = document.getElementById('invokeAgentBtn');
  const textarea = document.getElementById('agentResponse');
  const status = document.getElementById('agentStatus');
  const timestamp = document.getElementById('agentTimestamp');

  if (!btn || !textarea || !status) return;

  // Verifica se já há requisição pendente
  if (btn.disabled || IA_STATE.isLoading) return;

  btn.disabled = true;
  btn.style.opacity = '0.6';
  IA_STATE.isLoading = true;
  status.textContent = '⏳ Gerando análise...';
  status.className = 'save-status loading';
  textarea.value = '';
  timestamp.textContent = '';

  try {
    const response = await API.post('/api/agent/invoke/', {});

    if (response.success) {
      textarea.value = response.result || 'Nenhuma resposta retornada.';
      const date = new Date(response.created_at);
      timestamp.textContent = `Gerado em ${date.toLocaleString('pt-BR')}`;
      status.textContent = '✓ Análise concluída';
      status.className = 'save-status ok';

      // Armazena resultado no estado
      IA_STATE.lastResult = response.result;
      IA_STATE.lastTimestamp = response.created_at;
    } else {
      throw new Error(response.error || 'Erro desconhecido');
    }
  } catch (error) {
    console.error('Erro ao invocar agente:', error);
    textarea.value = `❌ Erro ao gerar análise:\n\n${error.message}`;
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

// ─── COPY ANÁLISE PARA CLIPBOARD ──────────────────
function copyAnalysisToClipboard() {
  const textarea = document.getElementById('agentResponse');
  if (!textarea || !textarea.value) {
    alert('Nenhuma análise para copiar.');
    return;
  }

  navigator.clipboard.writeText(textarea.value)
    .then(() => {
      const btn = document.querySelector('[data-action="copy-analysis"]');
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = '✓ Copiado!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      }
    })
    .catch(err => console.error('Erro ao copiar:', err));
}

// ─── BAIXAR ANÁLISE COMO ARQUIVO ──────────────────
function downloadAnalysis() {
  const textarea = document.getElementById('agentResponse');
  if (!textarea || !textarea.value) {
    alert('Nenhuma análise para baixar.');
    return;
  }

  const timestamp = document.getElementById('agentTimestamp').textContent || new Date().toLocaleString('pt-BR');
  const filename = `analise-ia-${STATE.month || 'geral'}-${new Date().getTime()}.txt`;
  
  const content = `ANÁLISE IA - TRADING
Gerado em: ${timestamp}
Mês: ${STATE.month || '—'}

${textarea.value}`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ─── INIT IA ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Vincula eventos dos botões de IA
  const invokeBtn = document.getElementById('invokeAgentBtn');
  if (invokeBtn) {
    invokeBtn.addEventListener('click', invokeAgent);
  }

  // Restaura última análise se existir
  restoreLastAnalysis();
});

// ─── OBSERVER PARA MUDANÇA DE MÊS ─────────────────
// Monitora mudança de mês para limpar análise anterior
const originalLoadAll = window.loadAll || function() {};
window.loadAll = async function(month) {
  // Limpa análise quando muda de mês (sem pedir confirmação)
  if (STATE.month && STATE.month !== month) {
    const textarea = document.getElementById('agentResponse');
    const timestamp = document.getElementById('agentTimestamp');
    if (textarea) textarea.value = '';
    if (timestamp) timestamp.textContent = '';
  }
  // Chama a função original
  return originalLoadAll.call(this, month);
};

// ─── RESTAURAR ÚLTIMA ANÁLISE ──────────────────────
function restoreLastAnalysis() {
  if (IA_STATE.lastResult && IA_STATE.lastTimestamp) {
    const textarea = document.getElementById('agentResponse');
    const timestamp = document.getElementById('agentTimestamp');
    
    if (textarea) textarea.value = IA_STATE.lastResult;
    if (timestamp) {
      const date = new Date(IA_STATE.lastTimestamp);
      timestamp.textContent = `Última análise: ${date.toLocaleString('pt-BR')}`;
    }
  }
}

// ─── LIMPAR ANÁLISE ──────────────────────────────
function clearAnalysis() {
  if (confirm('Deseja limpar a análise atual?')) {
    const textarea = document.getElementById('agentResponse');
    const timestamp = document.getElementById('agentTimestamp');
    
    if (textarea) textarea.value = '';
    if (timestamp) timestamp.textContent = '';
    
    IA_STATE.lastResult = null;
    IA_STATE.lastTimestamp = null;
  }
}
