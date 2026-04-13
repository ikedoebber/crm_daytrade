/* ================================================
   PLANILHA DO TRADER — planilha.js
   UI, render, eventos e integração com DRF.
   Toda lógica numérica está em calculos.js.
   ================================================ */

'use strict';

// ─── ESTADO GLOBAL ──────────────────────────────
const STATE = {
  month:        '',
  config:       {},
  projecao:     [],   // [{dia, realizado, custo_op, imposto_retido}]
  operacoes:    [],   // [{id, dia, tipo, ativo, entrada, saida, contratos, valor_ponto, pontos, resultado, status}]
  diario:       [],   // [{id, conteudo, created_at_fmt}]
  regras:       [],   // [{id, texto, ordem}]
  capital_atual:{},   // dados do endpoint /api/projecao/capital-atual/
};

// ─── DEFAULTS DE CONFIGURAÇÃO ────────────────────
const CONFIG_DEFAULTS = {
  banca_inicial:                1,
  objetivo_diario:              350,
  dias_uteis:                   18,
  plano_meta_aprovacao:         1600,
  plano_perda_max_total:        2750,
  plano_perda_diaria_aprovacao: 825,
  plano_capital:                100,
  plano_meta:                   600,
  plano_maxentradas:            5,
  plano_stop:                   600,
};

// ─── API HELPER ──────────────────────────────────
const API = {
  headers() {
    return {
      'Content-Type': 'application/json',
      'X-CSRFToken': window.CSRF_TOKEN,
    };
  },
  async get(url) {
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
    return r.json();
  },
  async post(url, data) {
    const r = await fetch(url, {
      method: 'POST', headers: this.headers(),
      body: JSON.stringify(data), credentials: 'same-origin',
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(JSON.stringify(e));
    }
    return r.json();
  },
  async put(url, data) {
    const r = await fetch(url, {
      method: 'PUT', headers: this.headers(),
      body: JSON.stringify(data), credentials: 'same-origin',
    });
    if (!r.ok) throw new Error(`PUT ${url} → ${r.status}`);
    return r.json();
  },
  async patch(url, data) {
    const r = await fetch(url, {
      method: 'PATCH', headers: this.headers(),
      body: JSON.stringify(data), credentials: 'same-origin',
    });
    if (!r.ok) throw new Error(`PATCH ${url} → ${r.status}`);
    return r.json();
  },
  async del(url) {
    const r = await fetch(url, { method: 'DELETE', headers: this.headers(), credentials: 'same-origin' });
    if (!r.ok) throw new Error(`DELETE ${url} → ${r.status}`);
  },
};

// ─── HELPERS DE UI ────────────────────────────────
function statusBadge(s) {
  const cls = s === 'GAIN' ? 'badge-gain' : s === 'LOSS' ? 'badge-loss' : 'badge-zerada';
  return `<span class="badge ${cls}">${s}</span>`;
}

function setStatus(id, msg, type = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'save-status ' + type;
  if (type === 'ok') setTimeout(() => { el.textContent = ''; el.className = 'save-status'; }, 3000);
}

// ─── MÊS ─────────────────────────────────────────
function buildMonthSelector() {
  const sel = document.getElementById('monthSelect');
  const now  = new Date();
  const months = [];
  for (let i = -3; i <= 12; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const lbl = d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
                  .replace('. de ', '/').replace('.', '');
    months.push({ val, lbl });
  }
  months.forEach(m => {
    const o = document.createElement('option');
    o.value = m.val; o.textContent = m.lbl;
    sel.appendChild(o);
  });
  const cur = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  sel.value  = cur;
  STATE.month = cur;
}

// ─── CARREGAR TUDO DA API ─────────────────────────
async function loadAll(month) {
  try {
    const [configs, projecao, operacoes, diario, regras, capitalAtual] = await Promise.all([
      API.get(`/api/config/?month=${month}`),
      API.get(`/api/projecao/?month=${month}`),
      API.get(`/api/operacoes/?month=${month}`),
      API.get(`/api/diario/?month=${month}`),
      API.get(`/api/regras/`),
      API.get(`/api/projecao/capital-atual/?month=${month}`),
    ]);

    STATE.config        = configs.length ? configs[0] : {};
    STATE.projecao      = projecao;
    STATE.operacoes     = operacoes;
    STATE.diario        = diario;
    STATE.regras        = regras;
    STATE.capital_atual = capitalAtual || {};

    renderAll();
  } catch (e) {
    console.error('Erro ao carregar dados:', e);
  }
}

// ─── RENDER TODOS OS COMPONENTES ──────────────────
function renderAll() {
  fillConfigInputs();
  renderDashboard();
  renderCalendar();
  renderProjecaoTable();
  renderOpsTable();
  renderOpsDetalhada();
  renderCharts();
  renderDiario();
  renderRegras();
  atualizarCampos();
  applyNegativeValueStyling();
}

// ─── POST-SAVE RENDER ─────────────────────────────
async function postSaveRender() {
  try {
    const [capitalAtual, projecao] = await Promise.all([
      API.get(`/api/projecao/capital-atual/?month=${STATE.month}`),
      API.get(`/api/projecao/?month=${STATE.month}`),
    ]);
    STATE.capital_atual = capitalAtual || {};
    STATE.projecao      = projecao;
  } catch (e) {
    console.error('Erro ao recarregar dados pós-save:', e);
  }
  renderAll();
}

// ─── CONFIG INPUTS ────────────────────────────────
function fillConfigInputs() {
  const c = STATE.config;
  const fields = [
    'banca_inicial', 'objetivo_diario', 'dias_uteis',
    'plano_meta_aprovacao', 'plano_perda_max_total', 'plano_perda_diaria_aprovacao',
    'plano_risco1', 'plano_start', 'plano_capital', 'plano_meta',
    'plano_ativos', 'plano_maxentradas', 'plano_stop',
  ];
  fields.forEach(f => {
    const el = document.getElementById('cfg_' + f);
    if (!el) return;
    const val = c[f];
    // Aceita 0 como valor válido — apenas undefined/null/'' caem no default
    const hasValue = val !== undefined && val !== null && val !== '';
    el.value = hasValue ? val : (CONFIG_DEFAULTS[f] ?? '');
  });
}

function getConfigFromInputs() {
  const n  = id => parseFloat(document.getElementById(id)?.value);
  const s  = id => document.getElementById(id)?.value || '';
  const ni = id => parseInt(document.getElementById(id)?.value);
  const d  = CONFIG_DEFAULTS;

  // Lê banca_inicial aceitando 0 explicitamente
  const bancaRaw = n('cfg_banca_inicial');

  return {
    month:                       STATE.month,
    banca_inicial:               isNaN(bancaRaw) ? d.banca_inicial : bancaRaw,
    objetivo_diario:             n('cfg_objetivo_diario')             || d.objetivo_diario,
    dias_uteis:                  ni('cfg_dias_uteis')                 || d.dias_uteis,
    plano_meta_aprovacao:        n('cfg_plano_meta_aprovacao')        || 0,
    plano_perda_max_total:       n('cfg_plano_perda_max_total')       || 0,
    plano_perda_diaria_aprovacao:n('cfg_plano_perda_diaria_aprovacao')|| 0,
    plano_risco1:                s('cfg_plano_risco1'),
    plano_start:                 s('cfg_plano_start'),
    plano_capital:               n('cfg_plano_capital')               || 0,
    plano_meta:                  n('cfg_plano_meta')                  || 0,
    plano_ativos:                s('cfg_plano_ativos'),
    plano_maxentradas:           ni('cfg_plano_maxentradas')          || d.plano_maxentradas,
    plano_stop:                  n('cfg_plano_stop')                  || 0,
  };
}

// ─── DASHBOARD ────────────────────────────────────
function renderDashboard() {
  const c    = STATE.config;
  const dias = parseInt(c.dias_uteis) || CONFIG_DEFAULTS.dias_uteis;

  const diasFeitos = STATE.projecao.filter(d => d.realizado !== null && d.realizado !== '').length;
  const pctVal     = dias > 0 ? Math.min(100, (diasFeitos / dias) * 100) : 0;
  const el         = document.getElementById('progressBar');
  if (el) el.style.width = pctVal + '%';
  const elPct = document.getElementById('progressPct');
  if (elPct) elPct.textContent = pctVal.toFixed(0) + '%';

  const setEl = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };

  setEl('totalDiasDisp',     dias);
  setEl('diasPercorridos',   diasFeitos);

  if (STATE.capital_atual?.capital_final !== undefined) {
    setEl('capitalAtualFromDB', fmt.brl(STATE.capital_atual.capital_final));
  }

  setEl('lucroLiquidoDash', fmt.brl(calc.lucroLiquido()));

  const ops    = STATE.operacoes;
  const gains  = ops.filter(o => o.status === 'GAIN').length;
  const losses = ops.filter(o => o.status === 'LOSS').length;
  const zeros  = ops.filter(o => o.status === 'ZERADA').length;

  setEl('sumGain',  gains);
  setEl('sumLoss',  losses);
  setEl('sumZero',  zeros);
  setEl('sumTotal', ops.length);
  setEl('sumWR',    (gains + losses) > 0 ? ((gains / (gains + losses)) * 100).toFixed(1) + '%' : '—');

  // ── Pontos por ativo ──
  const pontosWin = get.pontos_win();
  const pontosWdo = get.pontos_wdo();
  setEl('totalPontosWIN', pontosWin);
  setEl('totalPontosWDO', pontosWdo);

  // ── Lucro Bruto ──
  const lucroBruto = calc.lucroBruto();
  setEl('totalLucroBruto', fmt.brl(lucroBruto));

  // ── Max e Média Ops por Dia ──
  if (ops.length > 0) {
    const opsPorDia = {};
    ops.forEach(op => {
      const dia = op.dia || 1;
      opsPorDia[dia] = (opsPorDia[dia] || 0) + 1;
    });
    const maxOps = Math.max(...Object.values(opsPorDia));
    const diasComOps = Object.keys(opsPorDia).length;
    const mediaOps = (diasComOps > 0 ? (ops.length / diasComOps) : 0).toFixed(1);
    
    setEl('maxOpsPorDia', maxOps);
    setEl('mediaOpsPorDia', mediaOps);
  } else {
    setEl('maxOpsPorDia', 0);
    setEl('mediaOpsPorDia', '—');
  }

  setEl('dashMetaAprovacao',        fmt.brl(c.plano_meta_aprovacao));
  setEl('dashPerdaMaxTotal',        fmt.brl(c.plano_perda_max_total));
  setEl('dashPerdaDiariaAprovacao', fmt.brl(c.plano_perda_diaria_aprovacao));
}

// ─── CALENDÁRIO DE PERFORMANCE ────────────────────
function renderCalendar() {
  const container = document.getElementById('calendarContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  const c    = STATE.config;
  const meta = parseFloat(c.objetivo_diario) || CONFIG_DEFAULTS.objetivo_diario;
  const [y, m] = STATE.month.split('-').map(Number);
  
  // Pega total de dias do mês (independente de dias_uteis)
  const diasDoMes = new Date(y, m, 0).getDate();
  
  // Pega primeiro dia da semana (0=domingo)
  const firstDay = new Date(y, m - 1, 1).getDay();
  
  // Adiciona "dias vazios" antes do primeiro dia do mês
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day';
    empty.style.opacity = '0';
    empty.style.pointerEvents = 'none';
    container.appendChild(empty);
  }
  
  // Cria todos os dias do mês
  for (let d = 1; d <= diasDoMes; d++) {
    const dadoDia = STATE.projecao.find(p => p.dia === d);
    const realizado = dadoDia?.realizado;
    const capitalFinal = dadoDia?.capital_final;
    
    const dia = document.createElement('div');
    dia.className = 'calendar-day';
    
    let status = 'neutral';
    let icon = '◯';
    
    // Determina classe e ícone
    if (realizado === null || realizado === undefined || realizado === '') {
      status = 'neutral';
      icon = '◯';
    } else {
      const val = parseFloat(realizado);
      const pctMeta = meta > 0 ? (val / meta) * 100 : 0;
      
      if (val > 0) {
        status = 'positive';
        icon = pctMeta >= 100 ? '✓' : '↗';
      } else if (val < 0) {
        status = 'negative';
        icon = '✕';
      } else {
        status = 'neutral';
        icon = '═';
      }
    }
    
    dia.classList.add(status);
    
    // Estrutura do dia melhorada
    const header = document.createElement('div');
    header.className = 'calendar-day-header';
    header.innerHTML = `<span class="calendar-day-icon">${icon}</span><span class="calendar-day-num">${d}</span>`;
    dia.appendChild(header);
    
    // Valor em BRL
    if (realizado !== null && realizado !== undefined && realizado !== '') {
      const value = document.createElement('div');
      value.className = 'calendar-day-value';
      const val = parseFloat(realizado);
      value.textContent = fmt.brl(val);
      dia.appendChild(value);
    }
    
    // Tooltip interativo com mais detalhes
    if (realizado !== null && realizado !== undefined && realizado !== '') {
      const tooltip = document.createElement('div');
      tooltip.className = 'calendar-tooltip';
      
      const val = parseFloat(realizado);
      const pctMeta = meta > 0 ? ((val / meta) * 100).toFixed(0) : 0;
      const capitalStr = capitalFinal ? fmt.brl(capitalFinal) : '—';
      
      tooltip.innerHTML = `
        <div style="font-weight:600;margin-bottom:4px">${fmt.brl(val)}</div>
        <div style="font-size:9px;opacity:0.8">Meta: ${pctMeta}%</div>
        <div style="font-size:9px;opacity:0.8">Capital: ${capitalStr}</div>
      `;
      dia.appendChild(tooltip);
    }
    
    container.appendChild(dia);
  }
}

// ─── PROJEÇÃO DIÁRIA ──────────────────────────────
// Colunas (índice):
//  0  DIA
//  1  BANCA PROJ.
//  2  META DIA
//  3  REALIZADO      (input)
//  4  CUSTO OP.      (input)
//  5  IMPOSTO RETIDO (input)
//  6  RESULTADO DIA  ← novo
//  7  % META
//  8  CAPITAL FINAL
//  9  RETORNO
function renderProjecaoTable() {
  // ── Salva foco antes de reconstruir o DOM ──
  const focusedDia   = document.activeElement?.dataset?.dia;
  const focusedClass = document.activeElement?.classList?.contains('proj-realizado') ? 'proj-realizado'
                     : document.activeElement?.classList?.contains('proj-custo')     ? 'proj-custo'
                     : document.activeElement?.classList?.contains('proj-imposto')   ? 'proj-imposto'
                     : null;

  const c     = STATE.config;
  const banca = parseFloat(c.banca_inicial)   ?? CONFIG_DEFAULTS.banca_inicial;
  const meta  = parseFloat(c.objetivo_diario) || CONFIG_DEFAULTS.objetivo_diario;
  const dias  = parseInt(c.dias_uteis)        || CONFIG_DEFAULTS.dias_uteis;
  
  const tbody = document.getElementById('projecaoBody');
  tbody.innerHTML = '';

  let capitalFinalAnterior = banca;
  let ultimoCapitalNaoZero = banca;
  const hoje = new Date();
  const [y, m] = STATE.month.split('-').map(Number);

  for (let d = 1; d <= dias; d++) {
    const dadoDia    = STATE.projecao.find(p => p.dia === d) || {};
    const realizado  = dadoDia.realizado      ?? '';
    const custoOp    = dadoDia.custo_op       ?? 0;
    const impostoRet = dadoDia.imposto_retido ?? 0;

    // ── Projeção: Dia 1 só investimento; Dia 2+ acumula com meta ──
    let projecaoDia;
    if (d === 1) {
      projecaoDia = capitalFinalAnterior;  // Investimento inicial
    } else {
      projecaoDia = capitalFinalAnterior + meta;  // Acumula com meta
    }

    const dataLinha = new Date(y, m - 1, d);
    const isHoje    = dataLinha.toDateString() === hoje.toDateString();
    const isPassado = dataLinha < hoje && !isHoje;

    let capitalFinal      = capitalFinalAnterior;
    let pctMeta           = '—';
    let retorno           = '—';
    let resultadoDia      = '—';
    let resultadoDiaClass = '';

    if (realizado !== '' && realizado !== null) {
      const r  = parseFloat(realizado) || 0;
      const c2 = parseFloat(custoOp)   || 0;
      const i  = parseFloat(impostoRet) || 0;
      const net       = r - c2 - i;
      capitalFinal    = capitalFinalAnterior + net;
      pctMeta         = meta > 0 ? ((r / meta) * 100).toFixed(0) + '%' : '—';
      retorno         = banca > 0 ? (((capitalFinal - banca) / banca) * 100).toFixed(2) + '%' : '—';
      resultadoDia    = fmt.brl(net);
      resultadoDiaClass = net >= 0 ? 'val-positive' : 'val-negative';
    } else if (d > 2) {
      // Sem realizado: projeta com meta (apenas a partir do dia 3)
      capitalFinal = projecaoDia;
    }
    
    // Se capitalFinal for 0, usa anterior não-zero
    if (capitalFinal === 0 || capitalFinal === null) {
      capitalFinal = ultimoCapitalNaoZero;
    } else {
      ultimoCapitalNaoZero = capitalFinal;
    }
    
    // Para próxima linha: capital final desta é a base
    capitalFinalAnterior = capitalFinal;

    const rowClass  = isHoje ? 'row-hoje' : isPassado ? 'row-passado' : 'row-futuro';
    const realClass = (realizado !== '' && realizado !== null)
      ? (parseFloat(realizado) >= 0 ? 'val-positive' : 'val-negative') : '';

    const capitalFinalCell = (realizado !== '' && realizado !== null)
      ? fmt.brl(capitalFinal)
      : (d > 1)
        ? `<span style="opacity:0.45">${fmt.brl(capitalFinal)}</span>`
        : '—';

    const tr = document.createElement('tr');
    tr.className   = rowClass;
    tr.dataset.dia = d;
    
    tr.innerHTML = `
      <td style="color:var(--neon);font-weight:700">${d}${isHoje ? ' 🔵' : ''}</td>
      <td>${fmt.brl(projecaoDia)}</td>
      <td style="color:var(--neon3)">${fmt.brl(meta)}</td>
      <td class="${realClass}">
        <input class="tbl-input proj-realizado" type="number" data-dia="${d}"
               value="${realizado !== null && realizado !== '' ? realizado : ''}"
               placeholder="0.00" step="0.01">
      </td>
      <td>
        <input class="tbl-input proj-custo" type="number" data-dia="${d}"
               value="${custoOp || ''}" placeholder="0" step="0.01">
      </td>
      <td>
        <input class="tbl-input proj-imposto" type="number" data-dia="${d}"
               value="${impostoRet || ''}" placeholder="0" step="0.01">
      </td>
      <td class="${resultadoDiaClass}" style="font-weight:600">${resultadoDia}</td>
      <td>${pctMeta}</td>
      <td style="color:var(--neon2);font-weight:600">${capitalFinalCell}</td>
      <td>${retorno}</td>
    `;
    tbody.appendChild(tr);
  }

  // ── Restaura foco após reconstrução do DOM ──
  if (focusedDia && focusedClass) {
    const el = tbody.querySelector(`.${focusedClass}[data-dia="${focusedDia}"]`);
    if (el) {
      el.focus();
      const len = el.value?.length ?? 0;
      el.setSelectionRange(len, len);
    }
  }
}

// ─── ATUALIZA SÓ AS CÉLULAS CALCULADAS DA PROJEÇÃO ──
// Não toca nos inputs — evita reset de cursor durante digitação.
// Mapa de colunas:
//  0  DIA | 1  BANCA PROJ | 2  META DIA | 3  REALIZADO(input)
//  4  CUSTO(input) | 5  IMPOSTO(input)
//  6  RESULTADO DIA | 7  % META | 8  CAPITAL FINAL | 9  RETORNO
function updateProjecaoComputedCells() {
  const c     = STATE.config;
  const banca = parseFloat(c.banca_inicial)   ?? CONFIG_DEFAULTS.banca_inicial;
  const meta  = parseFloat(c.objetivo_diario) || CONFIG_DEFAULTS.objetivo_diario;
  const rows  = document.querySelectorAll('#projecaoBody tr');

  let capitalFinalAnterior = banca;
  let ultimoCapitalNaoZero = banca;

  rows.forEach(tr => {
    const d          = parseInt(tr.dataset.dia);
    const dadoDia    = STATE.projecao.find(p => p.dia === d) || {};
    const realizado  = dadoDia.realizado      ?? '';
    const custoOp    = dadoDia.custo_op       ?? 0;
    const impostoRet = dadoDia.imposto_retido ?? 0;

    // ── Projeção: Dia 1 só investimento; Dia 2+ acumula com meta ──
    let projecaoDia;
    if (d === 1) {
      projecaoDia = capitalFinalAnterior;  // Investimento inicial
    } else {
      projecaoDia = capitalFinalAnterior + meta;  // Acumula com meta
    }

    const cells = tr.querySelectorAll('td');

    // col 1 — Banca Proj
    if (cells[1]) cells[1].textContent = fmt.brl(projecaoDia);

    let capitalFinal      = capitalFinalAnterior;
    let pctMeta           = '—';
    let retorno           = '—';
    let resultadoDia      = '—';
    let resultadoDiaClass = '';

    if (realizado !== '' && realizado !== null) {
      const r  = parseFloat(realizado) || 0;
      const c2 = parseFloat(custoOp)   || 0;
      const i  = parseFloat(impostoRet) || 0;
      const net    = r - c2 - i;
      capitalFinal = capitalFinalAnterior + net;
      pctMeta      = meta > 0 ? ((r / meta) * 100).toFixed(0) + '%' : '—';
      retorno      = banca > 0 ? (((capitalFinal - banca) / banca) * 100).toFixed(2) + '%' : '—';
      resultadoDia      = fmt.brl(net);
      resultadoDiaClass = net >= 0 ? 'val-positive' : 'val-negative';

      // Cor da td que envolve o input de realizado
      const realTd = tr.querySelector('.proj-realizado')?.closest('td');
      if (realTd) realTd.className = parseFloat(realizado) >= 0 ? 'val-positive' : 'val-negative';
    } else if (d > 2) {
      // Sem realizado: projeta com meta (apenas a partir do dia 3)
      capitalFinal = projecaoDia;
    }
    
    // Se capitalFinal for 0, usa anterior não-zero
    if (capitalFinal === 0 || capitalFinal === null) {
      capitalFinal = ultimoCapitalNaoZero;
    } else {
      ultimoCapitalNaoZero = capitalFinal;
    }
    
    // Para próxima linha: capital final desta é a base
    capitalFinalAnterior = capitalFinal;

    // col 6 — Resultado Dia
    if (cells[6]) {
      cells[6].textContent = resultadoDia;
      cells[6].className   = resultadoDiaClass;
      if (resultadoDiaClass) cells[6].style.fontWeight = '600';
    }

    // col 7 — % Meta
    if (cells[7]) cells[7].textContent = pctMeta;

    // col 8 — Capital Final
    if (cells[8]) {
      if (realizado !== '' && realizado !== null) {
        cells[8].innerHTML = fmt.brl(capitalFinal);
      } else if (d > 1) {
        cells[8].innerHTML = `<span style="opacity:0.45">${fmt.brl(capitalFinal)}</span>`;
      } else {
        cells[8].textContent = '—';
      }
    }

    // col 9 — Retorno
    if (cells[9]) cells[9].textContent = retorno;
  });
}

// ─── OPERAÇÕES (tabela resumo por dia) ────────────
function renderOpsTable() {
  const tbody = document.getElementById('opsBody');
  tbody.innerHTML = '';

  const dias = parseInt(STATE.config.dias_uteis) || CONFIG_DEFAULTS.dias_uteis;
  const tots = { indGain:0, indLoss:0, indZero:0, dolGain:0, dolLoss:0, dolZero:0, all:0 };

  for (let d = 1; d <= dias; d++) {
    const dayOps = STATE.operacoes.filter(o => o.dia === d);
    if (!dayOps.length) continue;

    const indGain  = dayOps.filter(o => o.ativo === 'WIN' && o.status === 'GAIN').length;
    const indLoss  = dayOps.filter(o => o.ativo === 'WIN' && o.status === 'LOSS').length;
    const indZero  = dayOps.filter(o => o.ativo === 'WIN' && o.status === 'ZERADA').length;
    const dolGain  = dayOps.filter(o => o.ativo === 'WDO' && o.status === 'GAIN').length;
    const dolLoss  = dayOps.filter(o => o.ativo === 'WDO' && o.status === 'LOSS').length;
    const dolZero  = dayOps.filter(o => o.ativo === 'WDO' && o.status === 'ZERADA').length;
    const totalDia = dayOps.length;

    tots.indGain += indGain; tots.indLoss += indLoss; tots.indZero += indZero;
    tots.dolGain += dolGain; tots.dolLoss += dolLoss; tots.dolZero += dolZero;
    tots.all     += totalDia;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--neon);font-weight:700">Dia ${d}</td>
      <td class="val-positive">${indGain}</td>
      <td class="val-negative">${indLoss}</td>
      <td class="val-neutral">${indZero}</td>
      <td class="val-positive">${dolGain}</td>
      <td class="val-negative">${dolLoss}</td>
      <td class="val-neutral">${dolZero}</td>
      <td style="color:var(--neon2)">${totalDia}</td>
    `;
    tbody.appendChild(tr);
  }

  const ids  = ['totIndGain','totIndLoss','totIndZero','totDolGain','totDolLoss','totDolZero','totAllOps'];
  const vals = [tots.indGain, tots.indLoss, tots.indZero, tots.dolGain, tots.dolLoss, tots.dolZero, tots.all];
  ids.forEach((id, i) => { const el = document.getElementById(id); if (el) el.textContent = vals[i]; });

  const gains  = STATE.operacoes.filter(o => o.status === 'GAIN').length;
  const losses = STATE.operacoes.filter(o => o.status === 'LOSS').length;
  const elG = document.getElementById('perf_gain');  if (elG) elG.textContent = gains;
  const elL = document.getElementById('perf_loss');  if (elL) elL.textContent = losses;
  const elW = document.getElementById('perf_wr');
  if (elW) elW.textContent = (gains + losses) > 0 ? ((gains / (gains + losses)) * 100).toFixed(1) + '%' : '—';
}

// ─── OPERAÇÕES DETALHADAS ─────────────────────────
function renderOpsDetalhada() {
  const tbody = document.getElementById('opsDetalhadaBody');
  tbody.innerHTML = '';
  STATE.operacoes.forEach((op, idx) => tbody.appendChild(buildOpsRow(op, idx)));
}

function buildOpsRow(op, idx) {
  const tr = document.createElement('tr');
  tr.dataset.idx = idx;

  const resultClass = (parseFloat(op.resultado) || 0) >= 0 ? 'val-positive' : 'val-negative';

  tr.innerHTML = `
    <td><input class="tbl-input" type="number" name="dia" value="${op.dia||1}" min="1" max="31" style="width:50px"></td>
    <td>
      <select class="tbl-select" name="tipo">
        <option value="COMPRA" ${op.tipo==='COMPRA'?'selected':''}>COMPRA</option>
        <option value="VENDA"  ${op.tipo==='VENDA' ?'selected':''}>VENDA</option>
      </select>
    </td>
    <td>
      <select class="tbl-select" name="ativo">
        <option value="WIN" ${op.ativo==='WIN'?'selected':''}>WIN</option>
        <option value="WDO" ${op.ativo==='WDO'?'selected':''}>WDO</option>
        <option value="BIT" ${op.ativo==='BIT'?'selected':''}>BIT</option>
      </select>
    </td>
    <td><input class="tbl-input" type="number" name="entrada"     value="${op.entrada||''}"       step="0.01" placeholder="0.00"></td>
    <td><input class="tbl-input" type="number" name="saida"       value="${op.saida||''}"         step="0.01" placeholder="0.00"></td>
    <td><input class="tbl-input" type="number" name="contratos"   value="${op.contratos||1}"      step="1"    style="width:55px"></td>
    <td><input class="tbl-input" type="number" name="valor_ponto" value="${op.valor_ponto||0.20}" step="0.01" style="width:60px"></td>
    <td class="${(parseFloat(op.pontos)||0)>=0?'val-positive':'val-negative'}">
      <input class="tbl-input" type="number" name="pontos"    value="${op.pontos||''}"    step="0.01" placeholder="0">
    </td>
    <td class="${resultClass}">
      <input class="tbl-input" type="number" name="resultado" value="${op.resultado||''}" step="0.01" placeholder="0.00">
    </td>
    <td>
      <select class="tbl-select" name="status">
        <option value="GAIN"   ${op.status==='GAIN'  ?'selected':''}>GAIN</option>
        <option value="LOSS"   ${op.status==='LOSS'  ?'selected':''}>LOSS</option>
        <option value="ZERADA" ${op.status==='ZERADA'?'selected':''}>ZERADA</option>
      </select>
    </td>
    <td>
      <button type="button" class="btn-delete ops-del-btn" data-idx="${idx}">✕</button>
    </td>
  `;

  const autoCalcTriggers = tr.querySelectorAll(
    'input[name="entrada"], input[name="saida"], input[name="contratos"], input[name="valor_ponto"], select[name="ativo"], select[name="status"]'
  );
  autoCalcTriggers.forEach(inp => inp.addEventListener('change', () => autoCalcRow(tr)));
  tr.querySelector('.ops-del-btn').addEventListener('click', () => deleteOpsRow(idx));

  return tr;
}

// ─── AUTO-CÁLCULO DE LINHA DE OPERAÇÃO ─────────────
function autoCalcRow(tr) {
  const g = name => tr.querySelector(`[name="${name}"]`)?.value;

  const entrada   = parseFloat(g('entrada'))   || 0;
  const saida     = parseFloat(g('saida'))     || 0;
  const contratos = parseFloat(g('contratos')) || 1;
  const ativo     = g('ativo');

  const valorPontoMap = { WIN: 0.20, WDO: 10.00, BIT: 0.01 };
  const vpEl = tr.querySelector('[name="valor_ponto"]');
  if (!vpEl.value || vpEl.dataset.auto !== 'false') {
    vpEl.value = valorPontoMap[ativo] || 0.20;
    vpEl.dataset.auto = 'true';
  }
  const vp = parseFloat(vpEl.value) || 0;

  const diff      = saida - entrada;
  const pontos    = ativo === 'WDO' ? diff * 1000 : diff;
  const resultado = pontos * contratos * vp;

  const pontosEl    = tr.querySelector('[name="pontos"]');
  const resultadoEl = tr.querySelector('[name="resultado"]');

  if (entrada && saida) {
    pontosEl.value    = pontos.toFixed(2);
    resultadoEl.value = resultado.toFixed(2);
    resultadoEl.closest('td').className = resultado >= 0 ? 'val-positive' : 'val-negative';
    const statusSel = tr.querySelector('[name="status"]');
    statusSel.value = resultado > 0 ? 'GAIN' : resultado < 0 ? 'LOSS' : 'ZERADA';
  }
}

function deleteOpsRow(idx) {
  STATE.operacoes.splice(idx, 1);
  renderOpsDetalhada();
  renderOpsTable();
  atualizarCampos();
}

function addNewOpsRow() {
  STATE.operacoes.push({
    dia: 1, tipo: 'COMPRA', ativo: 'WIN',
    entrada: '', saida: '', contratos: 1,
    valor_ponto: 0.20, pontos: '', resultado: '', status: 'GAIN',
  });
  renderOpsDetalhada();
  document.getElementById('opsDetalhadaBody')?.lastElementChild
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function collectOpsFromTable() {
  return Array.from(document.querySelectorAll('#opsDetalhadaBody tr')).map(tr => {
    const g = name => tr.querySelector(`[name="${name}"]`)?.value;
    return {
      dia:         parseInt(g('dia'))           || 1,
      tipo:        g('tipo')                    || 'COMPRA',
      ativo:       g('ativo')                   || 'WIN',
      entrada:     parseFloat(g('entrada'))     || 0,
      saida:       parseFloat(g('saida'))       || 0,
      contratos:   parseInt(g('contratos'))     || 1,
      valor_ponto: parseFloat(g('valor_ponto')) || 0,
      pontos:      parseFloat(g('pontos'))      || 0,
      resultado:   parseFloat(g('resultado'))   || 0,
      status:      g('status')                  || 'GAIN',
      month:       STATE.month,
    };
  });
}

// ─── CHARTS ───────────────────────────────────────
const CHARTS = {};

function destroyChart(id) {
  if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; }
}

const CHART_COLORS = {
  proj:    '#6c8cff',
  real:    '#1ee8b7',
  win:     '#f7c948',
  gain:    '#22d987',
  loss:    '#ff4c6a',
  wdo:     '#fb923c',
  grid:    'rgba(148,163,184,0.07)',
  tooltip: 'rgba(15,23,42,0.94)',
};

function chartOptions(yFmt) {
  const fmtY = yFmt === 'pct'
    ? v => v.toFixed(1).replace('.', ',') + '%'
    : v => 'R$\u00a0' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return {
    responsive: true,
    maintainAspectRatio: true,
    animation: { duration: 550, easing: 'easeOutCubic' },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: CHART_COLORS.tooltip,
        borderColor: 'rgba(100,116,139,0.25)',
        borderWidth: 1,
        padding: { x: 12, y: 9 },
        titleColor: '#94a3b8',
        bodyColor: '#e2e8f0',
        titleFont:  { family: 'Space Mono', size: 10, weight: '500' },
        bodyFont:   { family: 'Space Mono', size: 11, weight: '500' },
        cornerRadius: 6,
        usePointStyle: true,
        pointStyle: 'circle',
        boxWidth: 7,
        boxHeight: 7,
      },
      filler: { propagate: true },
    },
    scales: {
      x: {
        ticks: {
          color: '#4e6278',
          font: { family: 'Space Mono', size: 9 },
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 10,
        },
        grid:   { color: CHART_COLORS.grid, drawBorder: false },
        border: { display: false },
      },
      y: {
        ticks: {
          color: '#4e6278',
          font: { family: 'Space Mono', size: 9 },
          callback: fmtY,
        },
        grid:         { color: CHART_COLORS.grid, drawBorder: false },
        border:       { display: false },
        beginAtZero:  false,
      },
    },
  };
}

function _lineDataset(label, data, color, dashed, filled) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: filled ? color + '12' : 'transparent',
    fill: filled,
    borderWidth: dashed ? 1.5 : 2,
    borderDash: dashed ? [5, 5] : [],
    pointRadius: data.map(v => v !== null ? 3 : 0),
    pointHoverRadius: 5,
    pointBackgroundColor: color,
    pointBorderWidth: 0,
    tension: 0.4,
    spanGaps: false,
  };
}

function buildLineChart(id, labels, datasets) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;

  const palette = [CHART_COLORS.proj, CHART_COLORS.real, CHART_COLORS.win, CHART_COLORS.wdo];
  const isPct   = datasets.some(d => (d.label || '').includes('%'));

  const builtDatasets = datasets.map((ds, i) => {
    const color  = ds.borderColor || palette[i % palette.length];
    const dashed = i === 0 && datasets.length > 1;
    const filled = !!ds.fill;
    return _lineDataset(ds.label || '', ds.data, color, dashed, filled);
  });

  CHARTS[id] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: builtDatasets },
    options: chartOptions(isPct ? 'pct' : 'brl'),
  });
}

function buildBarChart(id, labels, datasets) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;

  const builtDatasets = datasets.map(ds => ({
    ...ds,
    borderRadius:  5,
    borderSkipped: false,
    borderWidth:   0,
  }));

  CHARTS[id] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: builtDatasets },
    options: chartOptions('brl'),
  });
}

function buildDoughnut(id, labels, data, colors) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;

  const wrapper = ctx.parentElement;
  const old = wrapper?.querySelector('.doughnut-legend');
  if (old) old.remove();

  const total = data.reduce((a, b) => a + b, 0);
  const legendDiv = document.createElement('div');
  legendDiv.className = 'doughnut-legend';
  legendDiv.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-top:10px;';
  labels.forEach((lbl, i) => {
    const pct  = total > 0 ? ((data[i] / total) * 100).toFixed(1) : '0';
    const item = document.createElement('span');
    item.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:11px;color:#64748b;font-family:Space Mono,monospace';
    item.innerHTML = `<span style="width:8px;height:8px;border-radius:2px;background:${colors[i]};display:inline-block;flex-shrink:0;"></span>${lbl}&nbsp;<strong style="color:#94a3b8;font-weight:500">${pct}%</strong>`;
    legendDiv.appendChild(item);
  });
  if (wrapper) wrapper.appendChild(legendDiv);

  CHARTS[id] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: 'transparent',
        borderWidth: 0,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '68%',
      animation: { animateRotate: true, animateScale: false, duration: 600 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: CHART_COLORS.tooltip,
          borderColor: 'rgba(100,116,139,0.25)',
          borderWidth: 1,
          padding: { x: 12, y: 9 },
          titleColor: '#94a3b8',
          bodyColor: '#e2e8f0',
          titleFont:  { family: 'Space Mono', size: 10 },
          bodyFont:   { family: 'Space Mono', size: 11 },
          cornerRadius: 6,
          callbacks: { label: c => ` ${c.label}: ${fmt.brl(c.parsed)}` },
        },
      },
    },
  });
}

// ─── RENDER CHARTS ────────────────────────────────
function renderCharts() {
  const banca  = parseFloat(STATE.config.banca_inicial)   ?? CONFIG_DEFAULTS.banca_inicial;
  const meta   = parseFloat(STATE.config.objetivo_diario) || CONFIG_DEFAULTS.objetivo_diario;
  const dias   = parseInt(STATE.config.dias_uteis)        || CONFIG_DEFAULTS.dias_uteis;
  const labels = Array.from({ length: dias }, (_, i) => `D${i + 1}`);

  const projecaoData = labels.map((_, i) => banca + meta * (i + 1));

  let cap = banca;
  const realizadoData = [];
  for (let d = 1; d <= dias; d++) {
    const pDia = STATE.projecao.find(p => p.dia === d);
    if (pDia && pDia.realizado !== null && pDia.realizado !== '') {
      cap += (parseFloat(pDia.realizado) || 0)
           - (parseFloat(pDia.custo_op)       || 0)
           - (parseFloat(pDia.imposto_retido)  || 0);
      realizadoData.push(cap);
    } else {
      realizadoData.push(null);
    }
  }

  buildLineChart('chartBanca', labels, [
    { label: 'Projeção',  data: projecaoData,  borderColor: CHART_COLORS.proj },
    { label: 'Realizado', data: realizadoData, borderColor: CHART_COLORS.real },
  ]);

  buildLineChart('chartCapitalVsProjecao', labels, [
    { label: 'Projeção',     data: projecaoData,  borderColor: CHART_COLORS.proj },
    { label: 'Capital Real', data: realizadoData, borderColor: CHART_COLORS.real },
  ]);

  const wrData = [];
  let totalG = 0; let totalL = 0;
  for (let d = 1; d <= dias; d++) {
    const dayOps = STATE.operacoes.filter(o => o.dia === d);
    totalG += dayOps.filter(o => o.status === 'GAIN').length;
    totalL += dayOps.filter(o => o.status === 'LOSS').length;
    wrData.push((totalG + totalL) > 0 ? (totalG / (totalG + totalL) * 100) : null);
  }
  buildLineChart('chartWinRateEvolution', labels, [
    { label: 'Win Rate %', data: wrData, borderColor: CHART_COLORS.win },
  ]);

  const pontosWinDia = [], pontosWdoDia = [];
  for (let d = 1; d <= dias; d++) {
    const dayOps = STATE.operacoes.filter(o => o.dia === d);
    pontosWinDia.push(dayOps.filter(o => o.ativo === 'WIN').reduce((a, o) => a + (parseFloat(o.pontos) || 0), 0) || null);
    pontosWdoDia.push(dayOps.filter(o => o.ativo === 'WDO').reduce((a, o) => a + (parseFloat(o.pontos) || 0), 0) || null);
  }
  buildBarChart('chartPontosDetalhados', labels, [
    { label: 'WIN (pts)', data: pontosWinDia, backgroundColor: CHART_COLORS.real + 'cc' },
    { label: 'WDO (pts)', data: pontosWdoDia, backgroundColor: CHART_COLORS.win  + 'cc' },
  ]);

  const ddAcum = [];
  let capDD = banca; let peakDD = banca;
  for (let d = 1; d <= dias; d++) {
    const pDia = STATE.projecao.find(p => p.dia === d);
    if (pDia && pDia.realizado !== null && pDia.realizado !== '') {
      capDD += (parseFloat(pDia.realizado)       || 0)
             - (parseFloat(pDia.custo_op)         || 0)
             - (parseFloat(pDia.imposto_retido)   || 0);
      if (capDD > peakDD) peakDD = capDD;
      ddAcum.push(peakDD > 0 ? -((peakDD - capDD) / peakDD * 100) : 0);
    } else {
      ddAcum.push(null);
    }
  }
  buildLineChart('chartDrawdown', labels, [
    { label: 'Drawdown %', data: ddAcum, borderColor: CHART_COLORS.loss, fill: true },
  ]);

  const resultDia = [];
  for (let d = 1; d <= dias; d++) {
    const dayOps = STATE.operacoes.filter(o => o.dia === d);
    resultDia.push(dayOps.length ? dayOps.reduce((a, o) => a + (parseFloat(o.resultado) || 0), 0) : null);
  }
  buildBarChart('chartResultadoDetalhados', labels, [
    {
      label: 'Resultado R$',
      data:  resultDia,
      backgroundColor: resultDia.map(v => (v ?? 0) >= 0 ? CHART_COLORS.gain + 'bf' : CHART_COLORS.loss + 'bf'),
    },
  ]);

  buildWinLossChart('chartWinGanhosPerdidos', 'WIN');
  buildWinLossChart('chartWdoGanhosPerdidos', 'WDO');

  const gainTotal = STATE.operacoes.filter(o => o.status === 'GAIN').reduce((a, o) => a + (parseFloat(o.resultado) || 0), 0);
  const lossTotal = Math.abs(STATE.operacoes.filter(o => o.status === 'LOSS').reduce((a, o) => a + (parseFloat(o.resultado) || 0), 0));
  buildDoughnut('chartGainVsLoss', ['Ganhos', 'Perdas'], [gainTotal, lossTotal], [CHART_COLORS.gain + 'cc', CHART_COLORS.loss + 'cc']);
}

function buildWinLossChart(canvasId, ativo) {
  const dias   = parseInt(STATE.config.dias_uteis) || CONFIG_DEFAULTS.dias_uteis;
  const labels = Array.from({ length: dias }, (_, i) => `D${i + 1}`);
  const ganhos = [], perdas = [];
  for (let d = 1; d <= dias; d++) {
    const dayOps = STATE.operacoes.filter(o => o.dia === d && o.ativo === ativo);
    ganhos.push(dayOps.filter(o => (parseFloat(o.pontos) || 0) > 0).reduce((a, o) => a + (parseFloat(o.pontos) || 0), 0) || null);
    perdas.push(dayOps.filter(o => (parseFloat(o.pontos) || 0) < 0).reduce((a, o) => a + (parseFloat(o.pontos) || 0), 0) || null);
  }
  buildBarChart(canvasId, labels, [
    { label: 'Ganhos (pts)', data: ganhos, backgroundColor: CHART_COLORS.gain + 'bf' },
    { label: 'Perdas (pts)', data: perdas, backgroundColor: CHART_COLORS.loss + 'bf' },
  ]);
}

// ─── DIÁRIO ───────────────────────────────────────
function renderDiario() {
  const container = document.getElementById('diarioHistorico');
  container.innerHTML = '';
  if (!STATE.diario.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:12px;font-family:var(--mono)">Nenhuma anotação registrada ainda.</p>';
    return;
  }
  STATE.diario.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'diario-entry-card';
    div.innerHTML = `
      <div class="entry-date">📅 ${entry.created_at_fmt || ''} · Mês ${entry.month}</div>
      <div class="entry-content">${entry.conteudo.replace(/</g, '&lt;')}</div>
      <div style="margin-top:8px;text-align:right">
        <button class="btn-delete diario-del" data-id="${entry.id}" style="font-size:10px;padding:3px 8px">Excluir</button>
      </div>
    `;
    div.querySelector('.diario-del').addEventListener('click', () => deleteDiarioEntry(entry.id));
    container.appendChild(div);
  });
}

async function saveDiario() {
  const texto = document.getElementById('plano_diario')?.value.trim();
  if (!texto) { setStatus('saveDiarioStatus', 'Digite algo antes de salvar.', 'err'); return; }
  setStatus('saveDiarioStatus', 'Salvando...');
  try {
    const entry = await API.post('/api/diario/', { month: STATE.month, conteudo: texto });
    STATE.diario.unshift(entry);
    document.getElementById('plano_diario').value = '';
    renderDiario();
    setStatus('saveDiarioStatus', '✓ Salvo!', 'ok');
  } catch {
    setStatus('saveDiarioStatus', 'Erro ao salvar.', 'err');
  }
}

async function deleteDiarioEntry(id) {
  if (!confirm('Excluir esta anotação?')) return;
  try {
    await API.del(`/api/diario/${id}/`);
    STATE.diario = STATE.diario.filter(e => e.id !== id);
    renderDiario();
  } catch {
    alert('Erro ao excluir anotação.');
  }
}

// ─── REGRAS ───────────────────────────────────────
function renderRegras() {
  const container = document.getElementById('planoRegras');
  container.innerHTML = '';
  STATE.regras.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'regra-item';
    div.innerHTML = `
      <span style="color:var(--neon);font-size:12px">${i+1}.</span>
      <input type="text" value="${r.texto.replace(/"/g, '&quot;')}" placeholder="Descreva a regra..." data-idx="${i}">
      <button class="btn-delete regra-del" data-idx="${i}" style="padding:3px 8px;font-size:10px">✕</button>
    `;
    div.querySelector('.regra-del').addEventListener('click', () => {
      STATE.regras.splice(i, 1);
      renderRegras();
    });
    div.querySelector('input').addEventListener('input', e => {
      STATE.regras[i].texto = e.target.value;
    });
    container.appendChild(div);
  });
}

function addRegra() {
  STATE.regras.push({ texto: '', ordem: STATE.regras.length });
  renderRegras();
  const inputs = document.querySelectorAll('#planoRegras input[type="text"]');
  if (inputs.length) inputs[inputs.length - 1].focus();
}

async function saveRegras() {
  const regrasList = STATE.regras.map((r, i) => ({ texto: r.texto, ordem: i }));
  await API.post('/api/regras/bulk-sync/', regrasList);
  const refreshed = await API.get('/api/regras/');
  STATE.regras = refreshed;
  renderRegras();
}

// ─── SALVAR ───────────────────────────────────────
async function saveConfig(statusId) {
  setStatus(statusId, 'Salvando...');
  try {
    const data   = getConfigFromInputs();
    const result = await API.post('/api/config/upsert/', data);
    STATE.config  = result;
    await postSaveRender();
    setStatus(statusId, '✓ Salvo!', 'ok');
  } catch (e) {
    console.error(e);
    setStatus(statusId, 'Erro!', 'err');
  }
}

async function saveProjecao() {
  setStatus('saveProjecaoStatus', 'Salvando...');
  try {
    const items = Array.from(document.querySelectorAll('#projecaoBody tr')).map(tr => {
      const dia   = parseInt(tr.dataset.dia);
      const real  = tr.querySelector('.proj-realizado')?.value;
      const custo = tr.querySelector('.proj-custo')?.value;
      const imp   = tr.querySelector('.proj-imposto')?.value;
      return {
        month:          STATE.month,
        dia,
        realizado:      real !== '' ? (parseFloat(real) || null) : null,
        custo_op:       parseFloat(custo) || 0,
        imposto_retido: parseFloat(imp)   || 0,
      };
    });
    const result   = await API.post('/api/projecao/bulk/', items);
    STATE.projecao = result;
    await postSaveRender();
    setStatus('saveProjecaoStatus', '✓ Salvo!', 'ok');
  } catch (e) {
    console.error(e);
    setStatus('saveProjecaoStatus', 'Erro!', 'err');
  }
}

async function saveOperacoes() {
  setStatus('saveOpsStatus', 'Salvando...');
  try {
    const ops       = collectOpsFromTable();
    const result    = await API.post('/api/operacoes/bulk-sync/', { month: STATE.month, operacoes: ops });
    STATE.operacoes = result;
    await postSaveRender();
    setStatus('saveOpsStatus', '✓ Salvo!', 'ok');
  } catch (e) {
    console.error(e);
    setStatus('saveOpsStatus', 'Erro!', 'err');
  }
}

async function savePlano() {
  setStatus('savePlanoStatus', 'Salvando...');
  try {
    await saveConfig('savePlanoStatus');
    await saveRegras();
    setStatus('savePlanoStatus', '✓ Salvo!', 'ok');
  } catch {
    setStatus('savePlanoStatus', 'Erro!', 'err');
  }
}

// ─── ESTILIZAÇÃO DE VALORES NEGATIVOS ─────────────
function applyNegativeValueStyling() {
  const alwaysRedKeywords = ['CUSTO', 'IMPOSTO', 'PREJUÍZO', 'PERDA', 'TAXA', 'RETIDO'];

  const isAlwaysRed = text => {
    const upper = text.toUpperCase();
    if (upper.includes('LUCRO LÍQUIDO') || upper.includes('LUCRO LIQUIDO')) return false;
    return alwaysRedKeywords.some(k => upper.includes(k));
  };

  const extractNum = text => {
    let clean = text.trim().replace(/[R$%\s]/g, '');
    if (clean.includes('.') && clean.includes(',')) clean = clean.replace('.','').replace(',','.');
    else if (clean.includes(',')) clean = clean.replace(',','.');
    return parseFloat(clean);
  };

  const applyClass = (el, val, forceRed = false) => {
    if (forceRed) {
      el.classList.add('is-negative');
      el.classList.remove('is-positive-currency');
    } else if (val < 0) {
      el.classList.add('is-negative');
      el.classList.remove('is-positive-currency');
    } else if (val > 0) {
      el.classList.add('is-positive-currency');
      el.classList.remove('is-negative');
    } else {
      el.classList.remove('is-negative', 'is-positive-currency');
    }
  };

  document.querySelectorAll('input[type="number"]').forEach(input => {
    const val = parseFloat(input.value);
    if (isNaN(val)) return;
    applyClass(input, val);
    input.addEventListener('input', function () {
      const v = parseFloat(this.value);
      if (!isNaN(v)) applyClass(this, v);
    }, { once: false });
  });

  document.querySelectorAll('td, div, span').forEach(el => {
    if (el.tagName === 'INPUT' || el.children.length > 0) return;
    const text = el.textContent.trim();
    if (!text || !/\d/.test(text)) return;
    const val = extractNum(text);
    if (isNaN(val)) return;
    const pText  = el.parentElement?.textContent || '';
    const forceR = isAlwaysRed(pText);
    const isCurr = text.includes('R$');
    if (forceR) {
      applyClass(el, -1);
    } else if (val < 0 || (val > 0 && isCurr)) {
      applyClass(el, val);
    }
  });
}

// ─── TABS ─────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab)?.classList.add('active');
    });
  });
}

// ─── DATA ATUAL ───────────────────────────────────
function setCurrentDate() {
  const el = document.getElementById('currentDate');
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ─── EVENTOS ──────────────────────────────────────
function bindEvents() {
  document.getElementById('monthSelect')?.addEventListener('change', e => {
    STATE.month = e.target.value;
    loadAll(STATE.month);
  });

  ['cfg_banca_inicial','cfg_objetivo_diario','cfg_dias_uteis'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      STATE.config = { ...STATE.config, ...getConfigFromInputs() };
      renderDashboard();
      renderProjecaoTable();
      renderCharts();
      atualizarCampos();
    });
  });

  // ── Refresh em tempo real na tabela de projeção ──
  let _debProjecao = null;
  document.getElementById('projecaoBody')?.addEventListener('input', e => {
    const input = e.target;
    const dia   = parseInt(input.dataset.dia);
    if (!dia) return;

    let entry = STATE.projecao.find(p => p.dia === dia);
    if (!entry) {
      entry = { dia, realizado: null, custo_op: 0, imposto_retido: 0 };
      STATE.projecao.push(entry);
    }

    if (input.classList.contains('proj-realizado')) {
      entry.realizado = input.value !== '' ? parseFloat(input.value) : null;
    } else if (input.classList.contains('proj-custo')) {
      entry.custo_op = parseFloat(input.value) || 0;
    } else if (input.classList.contains('proj-imposto')) {
      entry.imposto_retido = parseFloat(input.value) || 0;
    }

    updateProjecaoComputedCells();
    renderDashboard();
    atualizarCampos();

    clearTimeout(_debProjecao);
    _debProjecao = setTimeout(renderCharts, 500);
  });

  document.getElementById('saveProjecaoBtn')?.addEventListener('click', saveProjecao);
  document.getElementById('saveDashboardBtn')?.addEventListener('click', () => saveConfig('saveDashboardStatus'));
  document.getElementById('saveOpsBtn')?.addEventListener('click', saveOperacoes);
  document.getElementById('addOpsDetalhadaRow')?.addEventListener('click', addNewOpsRow);
  document.getElementById('saveRelatoriosBtn')?.addEventListener('click', () => saveConfig('saveRelatoriosStatus'));
  document.getElementById('savePlanoBtn')?.addEventListener('click', savePlano);
  document.getElementById('saveDiarioButton')?.addEventListener('click', saveDiario);
  document.getElementById('plano_diario')?.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'Enter') saveDiario();
  });
  document.getElementById('addRegraButton')?.addEventListener('click', addRegra);
}

// ─── INIT ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setCurrentDate();
  buildMonthSelector();
  initTabs();
  bindEvents();
  loadAll(STATE.month);
});
