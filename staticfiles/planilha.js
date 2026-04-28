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

// ─── PROTEÇÃO GLOBAL CONTRA MULTIPLE REQUESTS ────
const REQUEST_GUARD = {
  pending: new Set(),  // URls com requisição em andamento
  
  canRequest(url) {
    return !this.pending.has(url);
  },
  
  markPending(url) {
    this.pending.add(url);
  },
  
  markComplete(url) {
    this.pending.delete(url);
  }
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
  if (!sel) {
    // Guard: set a default month if selector not found
    const now = new Date();
    STATE.month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    return;
  }
  const now  = new Date();
  const months = [];
  for (let i = -3; i <= 12; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    // FIX: usa Intl.DateTimeFormat para evitar dependência de locale no replace
    const lbl = d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
                  .replace(/\.\s*de\s*/i, '/').replace(/\.$/, '');
    months.push({ val, lbl });
  }
  months.forEach(m => {
    const o = document.createElement('option');
    o.value = m.val; o.textContent = m.lbl;
    sel.appendChild(o);
  });
  const cur = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const saved = localStorage.getItem('selectedMonth');
  const validOption = Array.from(sel.options).some(o => o.value === saved);
  sel.value   = (saved && validOption) ? saved : cur;
  STATE.month = sel.value;
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

async function postSaveRender() {
  try {
    const [capitalAtual, projecao, operacoes] = await Promise.all([
      API.get(`/api/projecao/capital-atual/?month=${STATE.month}`),
      API.get(`/api/projecao/?month=${STATE.month}`),
      API.get(`/api/operacoes/?month=${STATE.month}`),
    ]);
    STATE.capital_atual = capitalAtual || {};
    STATE.projecao      = projecao;
    STATE.operacoes     = operacoes;
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

  // FIX: usa nullish coalescing para preservar 0 como valor válido em todos os campos numéricos
  const safeNum = (val, def) => (isNaN(val) ? def : val);
  const safeInt = (val, def) => (isNaN(val) ? def : val);

  return {
    month:                       STATE.month,
    banca_inicial:               isNaN(bancaRaw) ? d.banca_inicial : bancaRaw,
    objetivo_diario:             safeNum(n('cfg_objetivo_diario'),              d.objetivo_diario),
    dias_uteis:                  safeInt(ni('cfg_dias_uteis'),                  d.dias_uteis),
    plano_meta_aprovacao:        safeNum(n('cfg_plano_meta_aprovacao'),         0),
    plano_perda_max_total:       safeNum(n('cfg_plano_perda_max_total'),        0),
    plano_perda_diaria_aprovacao:safeNum(n('cfg_plano_perda_diaria_aprovacao'), 0),
    plano_risco1:                s('cfg_plano_risco1'),
    plano_start:                 s('cfg_plano_start'),
    plano_capital:               safeNum(n('cfg_plano_capital'),                0),
    plano_meta:                  safeNum(n('cfg_plano_meta'),                   0),
    plano_ativos:                s('cfg_plano_ativos'),
    plano_maxentradas:           safeInt(ni('cfg_plano_maxentradas'),           d.plano_maxentradas),
    plano_stop:                  safeNum(n('cfg_plano_stop'),                   0),
  };
}

// ─── DASHBOARD ────────────────────────────────────
function renderDashboard() {
  const c    = STATE.config;
  const dias = parseInt(c.dias_uteis) || CONFIG_DEFAULTS.dias_uteis;

  const diasFeitos = STATE.projecao.filter(d => d.realizado !== null && d.realizado !== '').length;
  const pctVal     = dias > 0 ? Math.min(100, (diasFeitos / dias) * 100) : 0;

  const el = document.getElementById('progressBar');
  if (el) el.style.width = pctVal + '%';

  const elPct = document.getElementById('progressPct');
  if (elPct) elPct.textContent = pctVal.toFixed(0) + '%';

  const setEl = (id, val) => {
    const e = document.getElementById(id);
    if (e) e.textContent = val;
  };

  setEl('totalDiasDisp',   dias);
  setEl('diasPercorridos', diasFeitos);

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
  setEl(
    'sumWR',
    (gains + losses) > 0
      ? ((gains / (gains + losses)) * 100).toFixed(1) + '%'
      : '—'
  );

  // ── Pontos por ativo ──
  setEl('totalPontosWIN', get.pontos_win());
  setEl('totalPontosWDO', get.pontos_wdo());

  // ── Lucro Bruto ──
  setEl('totalLucroBruto', fmt.brl(calc.lucroBruto()));

  // ── Max e Média Ops por Dia ──
  if (ops.length > 0) {
    const opsPorDia = {};

    ops.forEach(op => {
      const dia = op.dia || 1;
      opsPorDia[dia] = (opsPorDia[dia] || 0) + 1;
    });

    const maxOps     = Math.max(...Object.values(opsPorDia));
    const diasComOps = Object.keys(opsPorDia).length;
    const mediaOps   = (ops.length / diasComOps).toFixed(1);

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


// ─── RENDER DIA ────────────────────────────────────
function renderDia(dia, numEl, dateEl, linhaCalc, capitalFinal, meta, realizado, net, temDado) {

  if (!temDado) return;

  const r      = parseFloat(realizado) || 0;
  const netVal = net !== null ? net : r;

  // Cores
  const colorNet = netVal > 0 ? '#22d987' : netVal < 0 ? '#ff4c6a' : '#8892a4';

  const colorBg =
    netVal > 0
      ? 'linear-gradient(145deg,rgba(34,217,135,0.15) 0%,rgba(34,217,135,0.05) 100%)'
      : netVal < 0
      ? 'linear-gradient(145deg,rgba(255,76,106,0.15) 0%,rgba(255,76,106,0.05) 100%)'
      : 'linear-gradient(145deg,rgba(136,146,164,0.1) 0%,rgba(136,146,164,0.04) 100%)';

  const colorBorder =
    netVal > 0
      ? 'rgba(34,217,135,0.3)'
      : netVal < 0
      ? 'rgba(255,76,106,0.28)'
      : 'rgba(136,146,164,0.2)';

  dia.style.background  = colorBg;
  dia.style.borderColor = colorBorder;
  numEl.style.color     = colorNet;
  dateEl.style.color =
    netVal > 0
      ? 'rgba(34,217,135,0.7)'
      : netVal < 0
      ? 'rgba(255,76,106,0.65)'
      : '#8892a4';

  // ── Bruto ──
  if (linhaCalc.custoOp || linhaCalc.impostoRet) {
    const colorBruto = r > 0 ? '#22d987' : r < 0 ? '#ff4c6a' : '#8892a4';

    const brutoEl = document.createElement('span');
    brutoEl.textContent = `Bruto: ${fmt.brl(r)}`;
    brutoEl.style.cssText = `font-size:9px;color:${colorBruto};display:block;margin-top:3px;`;
    dia.appendChild(brutoEl);

    if (linhaCalc.custoOp) {
      const custoEl = document.createElement('span');
      custoEl.textContent = `Custo: -${fmt.brl(linhaCalc.custoOp)}`;
      custoEl.style.cssText = 'font-size:9px;color:#fff;display:block;';
      dia.appendChild(custoEl);
    }

    if (linhaCalc.impostoRet) {
      const impEl = document.createElement('span');
      impEl.textContent = `Imposto: -${fmt.brl(linhaCalc.impostoRet)}`;
      impEl.style.cssText = 'font-size:9px;color:#fff;display:block;';
      dia.appendChild(impEl);
    }
  }

  // ── Líquido ──
  const resEl = document.createElement('span');
  resEl.textContent = `${netVal >= 0 ? '+' : ''}${fmt.brl(netVal)}`;
  resEl.style.cssText = `font-size:11px;font-weight:700;color:${colorNet};display:block;margin-top:3px;`;
  dia.appendChild(resEl);

  // ── Capital ──
  if (capitalFinal !== null) {
    const capEl = document.createElement('span');
    capEl.textContent = fmt.brl(capitalFinal);
    capEl.style.cssText = 'font-size:9.5px;color:#fff;font-weight:700;display:block;';
    dia.appendChild(capEl);
  }

  // ── Meta ──
  if (meta > 0) {
    const pctVal = ((r / meta) * 100).toFixed(0);

    const metaEl = document.createElement('span');
    metaEl.textContent = `Meta: ${pctVal}%`;
    metaEl.style.cssText = 'font-size:9px;color:#fff;display:block;';
    dia.appendChild(metaEl);
  }
}


// ─── CAPITAL POR DIA ──────────────────────────────
function calcCapitalPorDia() {
  const c     = STATE.config;
  const banca = parseFloat(c.banca_inicial)   ?? CONFIG_DEFAULTS.banca_inicial;
  const meta  = parseFloat(c.objetivo_diario) || CONFIG_DEFAULTS.objetivo_diario;
  const dias  = parseInt(c.dias_uteis)        || CONFIG_DEFAULTS.dias_uteis;

  const resultado = [];
  let capitalAtual = banca;
  let ultimoCapReal = banca;
  let ultimoDiaReal = 0;

  for (let d = 1; d <= dias; d++) {
    const dadoDia = STATE.projecao.find(p => p.dia === d) || {};

    const realizado  = dadoDia.realizado ?? '';
    const custoOp    = parseFloat(dadoDia.custo_op)       || 0;
    const impostoRet = parseFloat(dadoDia.imposto_retido) || 0;

    const temResultado = realizado !== '' && realizado !== null;

    let projecaoDia;
    let capitalFinal = null;
    let net          = null;
    let pctMeta      = '—';
    let retorno      = '—';

    if (temResultado) {
      projecaoDia  = capitalAtual;

      const r = parseFloat(realizado) || 0;
      net          = r - custoOp - impostoRet;
      capitalFinal = capitalAtual + net;

      pctMeta = meta > 0 ? ((r / meta) * 100).toFixed(0) + '%' : '—';
      retorno = banca > 0 ? (((capitalFinal - banca) / banca) * 100).toFixed(2) + '%' : '—';

      capitalAtual  = capitalFinal;
      ultimoCapReal = capitalFinal;
      ultimoDiaReal = d;

    } else {
      const passos = d - ultimoDiaReal;
      projecaoDia  = ultimoCapReal + meta * passos;
    }

    resultado.push({
      d,
      projecaoDia,
      capitalFinal,
      net,
      pctMeta,
      retorno,
      realizado,
      custoOp,
      impostoRet
    });
  }

  return resultado;
}

function renderCalendar() {
  const container = document.getElementById('calendarContainer');
  if (!container) return;
  container.innerHTML = '';

  const c    = STATE.config;
  const meta = parseFloat(c.objetivo_diario) || CONFIG_DEFAULTS.objetivo_diario;
  const dias = parseInt(c.dias_uteis)        || CONFIG_DEFAULTS.dias_uteis;
  const [y, m] = STATE.month.split('-').map(Number);
  const diasDoMes = new Date(y, m, 0).getDate();
  const firstDay  = new Date(y, m - 1, 1).getDay();
  const hoje      = new Date();

  const calDayToWorkDay = {};
  for (let d = 1; d <= dias; d++) {
    const opDoDia = STATE.operacoes.find(op => op.dia === d);
    if (opDoDia?.data_cal) {
      const diaDoMes = parseInt(opDoDia.data_cal.split('-')[2], 10);
      calDayToWorkDay[diaDoMes] = d;
    }
  }

  const linhasCapital = calcCapitalPorDia();

  // ── Header ──
  const header = document.createElement('div');
  header.style.cssText = `
    display:grid;grid-template-columns:repeat(7,1fr);
    gap:6px;margin-bottom:10px;
  `;
  ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].forEach((label, i) => {
    const s = document.createElement('span');
    s.textContent = label;
    s.style.cssText = `
      text-align:center;
      font-size:9px;
      font-family:var(--font-mono);
      font-weight:600;
      letter-spacing:.14em;
      text-transform:uppercase;
      padding:6px 0;
      color:${i === 0 || i === 6 ? 'var(--t-dim)' : 'var(--t-muted)'};
    `;
    header.appendChild(s);
  });
  container.appendChild(header);

  // ── Grid ──
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:6px';

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.style.cssText = 'min-height:80px';
    grid.appendChild(empty);
  }

  for (let calDay = 1; calDay <= diasDoMes; calDay++) {
    const dataLinha  = new Date(y, m - 1, calDay);
    const isHoje     = dataLinha.toDateString() === hoje.toDateString();
    const diaSemana  = dataLinha.getDay();
    const isFimSemana = diaSemana === 0 || diaSemana === 6;

    const workDay   = calDayToWorkDay[calDay];
    const dadoDia   = workDay ? (STATE.projecao.find(p => p.dia === workDay) || {}) : {};
    const linhaCalc = workDay ? (linhasCapital.find(l => l.d === workDay) || {}) : {};

    const realizado = dadoDia.realizado;
    const net       = linhaCalc.net ?? null;
    const temDado   = realizado !== null && realizado !== undefined && realizado !== '';

    // ── Esquema de cor ──
    let bgColor, borderColor, numColor, accentBar;

    if (temDado && net !== null) {
      if (net > 0) {
        bgColor     = 'rgba(0,200,122,0.18)';
        borderColor = 'rgba(0,200,122,0.35)';
        numColor    = 'var(--c-green)';
        accentBar   = 'var(--c-green)';
      } else if (net < 0) {
        bgColor     = 'rgba(240,77,94,0.18)';
        borderColor = 'rgba(240,77,94,0.35)';
        numColor    = 'var(--c-red)';
        accentBar   = 'var(--c-red)';
      } else {
        bgColor     = 'var(--c-bg3)';
        borderColor = 'var(--b-medium)';
        numColor    = 'var(--t-muted)';
        accentBar   = 'var(--t-muted)';
      }
    } else {
      bgColor     = isFimSemana ? 'transparent' : 'var(--c-bg2)';
      borderColor = isFimSemana ? 'var(--b-soft)' : 'var(--b-soft)';
      numColor    = isFimSemana ? 'var(--t-dim)' : 'var(--t-muted)';
      accentBar   = null;
    }

    if (isHoje) borderColor = 'var(--c-cyan)';

    // ── Célula ──
    const cell = document.createElement('div');
    cell.style.cssText = `
      min-height:80px;
      padding:0;
      display:flex;
      flex-direction:column;
      position:relative;
      border-radius:var(--r-md);
      border:1px solid ${borderColor};
      background:${bgColor};
      font-family:var(--font-mono);
      overflow:hidden;
      transition:border-color .15s, transform .15s;
      opacity:${isFimSemana && !temDado ? '.35' : '1'};
    `;

    // ── Barra de acento no topo ──
    if (accentBar) {
      const bar = document.createElement('div');
      bar.style.cssText = `
        height:2px;
        width:100%;
        background:${accentBar};
        flex-shrink:0;
        opacity:.7;
      `;
      cell.appendChild(bar);
    }

    // ── Inner padding wrapper ──
    const inner = document.createElement('div');
    inner.style.cssText = `
      flex:1;
      display:flex;
      flex-direction:column;
      padding:7px 9px 8px;
      gap:5px;
    `;

    // ── Número do dia ──
    const numEl = document.createElement('span');
    numEl.textContent = calDay;
    numEl.style.cssText = `
      font-size:12px;
      font-weight:700;
      color:${isHoje ? 'var(--c-cyan)' : numColor};
      line-height:1;
    `;
    inner.appendChild(numEl);

    // ── Badge "hoje" ──
    if (isHoje) {
      const todayBadge = document.createElement('span');
      todayBadge.textContent = 'HOJE';
      todayBadge.style.cssText = `
        font-size:7px;
        font-weight:700;
        letter-spacing:.14em;
        color:var(--c-cyan);
        opacity:.7;
        line-height:1;
      `;
      inner.appendChild(todayBadge);
    }

    if (temDado && net !== null) {
      const netVal = net;
      const sign   = netVal >= 0 ? '+' : '';
      const r      = parseFloat(realizado);

      // ── Spacer ──
      const spacer = document.createElement('div');
      spacer.style.cssText = 'flex:1';
      inner.appendChild(spacer);

      // ── Resultado líquido ──
      const netEl = document.createElement('span');
      netEl.textContent = `${sign}${fmt.brl(netVal)}`;
      netEl.style.cssText = `
        font-size:14px;
        font-weight:700;
        color:${numColor};
        line-height:1.2;
        letter-spacing:-.2px;
      `;
      inner.appendChild(netEl);

      // ── % da meta ──
      if (meta > 0) {
        const pct    = ((r / meta) * 100).toFixed(0);
        const metaEl = document.createElement('span');
        metaEl.textContent = `${pct}% meta`;
        metaEl.style.cssText = `
          font-size:10px;
          font-weight:500;
          color:${numColor};
          opacity:.6;
          line-height:1;
          letter-spacing:.04em;
        `;
        inner.appendChild(metaEl);
      }
    }

    cell.appendChild(inner);
    grid.appendChild(cell);
  }

  container.appendChild(grid);
}

      // ─── PROJEÇÃO DIÁRIA ──────────────────────────────
      function renderProjecaoTable() {
        const focusedDia   = document.activeElement?.dataset?.dia;
        const focusedClass = document.activeElement?.classList?.contains('proj-custo')    ? 'proj-custo'
                          : document.activeElement?.classList?.contains('proj-imposto')  ? 'proj-imposto'
                          : null;

        const c    = STATE.config;
        const meta = parseFloat(c.objetivo_diario) || CONFIG_DEFAULTS.objetivo_diario;

        const tbody = document.getElementById('projecaoBody');
        tbody.innerHTML = '';

        const hoje   = new Date();
        const [y, m] = STATE.month.split('-').map(Number);
        const linhas = calcCapitalPorDia();

        linhas.forEach(({ d, projecaoDia, capitalFinal, net, pctMeta, retorno, realizado }) => {
          const dataLinha = new Date(y, m - 1, d);
          const isHoje    = dataLinha.toDateString() === hoje.toDateString();
          const isPassado = dataLinha < hoje && !isHoje;

          const rowClass  = isHoje ? 'row-hoje' : isPassado ? 'row-passado' : 'row-futuro';

          const dadoDia    = STATE.projecao.find(p => p.dia === d) || {};
          const custoOp    = dadoDia.custo_op       ?? 0;
          const impostoRet = dadoDia.imposto_retido ?? 0;

          const realClass = (realizado !== null && realizado !== '')
            ? (parseFloat(realizado) >= 0 ? 'val-positive' : 'val-negative') : '';

          let resultadoDia      = '—';
          let resultadoDiaClass = '';
          if (net !== null) {
            resultadoDia      = fmt.brl(net);
            resultadoDiaClass = net >= 0 ? 'val-positive' : 'val-negative';
          }

          const capitalFinalCell = capitalFinal !== null ? fmt.brl(capitalFinal) : '—';

          // ── DATA: busca data_cal na primeira operação do dia ──
          const opDoDia = STATE.operacoes.find(op => op.dia === d);
          const dataCal = opDoDia?.data_cal || '';
          const dataFmt = dataCal ? dataCal.split('-').reverse().join('/') : '—';

          const tr = document.createElement('tr');
          tr.className   = rowClass;
          tr.dataset.dia = d;

          tr.innerHTML = `
          <td style="color:#ffffff;font-weight:700">
            ${d}${isHoje ? ' 🔵' : ''}
          </td>

          <td style="color:#ffffff;font-size:11px;font-family:var(--mono)">
            ${dataFmt}
          </td>

          <td style="color:#f7c948">
            ${fmt.brl(meta)}
          </td>
          <td style="color:var(--text)">${fmt.brl(projecaoDia)}</td>
          <td class="${realClass}" style="font-weight:600">
            ${realizado !== null && realizado !== '' ? fmt.brl(parseFloat(realizado)) : '—'}
          </td>
          <td>
            <input class="tbl-input proj-custo" type="number" data-dia="${d}"
                  value="${custoOp !== null && custoOp !== '' ? custoOp : ''}"
                  placeholder="0" step="0.01" style="color:#ff4c6a">
          </td>
          <td>
            <input class="tbl-input proj-imposto" type="number" data-dia="${d}"
                  value="${impostoRet !== null && impostoRet !== '' ? impostoRet : ''}"
                  placeholder="0" step="0.01" style="color:#ff4c6a">
          </td>
          <td class="${resultadoDiaClass}" style="font-weight:600">${resultadoDia}</td>
          <td style="color:var(--text)">${pctMeta}</td>
          <td style="color:var(--neon2);font-weight:600">${capitalFinalCell}</td>
          <td style="color:var(--text)">${retorno}</td>
          `;

          tbody.appendChild(tr);

          if (focusedDia && focusedClass) {
            const el = tbody.querySelector(`.${focusedClass}[data-dia="${focusedDia}"]`);
            if (el) {
              el.focus();
              const len = el.value?.length ?? 0;
              if (typeof el.setSelectionRange === 'function') {
                el.setSelectionRange(len, len);
              }
            }
          }
        });
      }

        function updateProjecaoComputedCells() {
          const linhas = calcCapitalPorDia();
          const c      = STATE.config;
          const meta   = parseFloat(c.objetivo_diario) || CONFIG_DEFAULTS.objetivo_diario;
          const rows   = document.querySelectorAll('#projecaoBody tr');

          rows.forEach(tr => {
            const d    = parseInt(tr.dataset.dia);
            const info = linhas.find(l => l.d === d);
            if (!info) return;

            const { projecaoDia, capitalFinal, net, pctMeta, retorno, realizado } = info;
            const cells = tr.querySelectorAll('td');

            // col 3 — Banca Proj
            if (cells[3]) cells[3].textContent = fmt.brl(projecaoDia);

            // col 7 — Resultado Dia
            if (cells[7]) {
              if (net !== null) {
                cells[7].textContent      = fmt.brl(net);
                cells[7].className        = net >= 0 ? 'val-positive' : 'val-negative';
                cells[7].style.fontWeight = '600';
              } else {
                cells[7].textContent = '—';
                cells[7].className   = '';
              }
            }

            // col 8 — % Meta
            if (cells[8]) cells[8].textContent = pctMeta;

            // col 9 — Capital Final
            if (cells[9]) {
              if (realizado !== '' && realizado !== null) {
                cells[9].innerHTML = fmt.brl(capitalFinal);
              } else if (d > 1) {
                cells[9].innerHTML = `<span style="opacity:0.45">${fmt.brl(capitalFinal)}</span>`;
              } else {
                cells[9].textContent = '—';
              }
            }

            // col 10 — Retorno
            if (cells[10]) cells[10].textContent = retorno;
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

    const diaNum = op.dia || 1;

    // ─── FIX: usa data_cal salva se existir; só reconstrói como fallback ───
    const dataCal = op.data_cal || `${STATE.month}-${String(diaNum).padStart(2,'0')}`;

    const resultClass = (parseFloat(op.resultado) || 0) >= 0 ? 'val-positive' : 'val-negative';

    tr.innerHTML = `
      <td><input class="tbl-input" type="number" name="dia" value="${diaNum}" min="1" max="31" style="width:50px"></td>
      <td>
        <input class="tbl-input" type="date" name="data_cal"
              value="${dataCal}"
              style="width:130px;color:var(--neon);font-family:var(--mono);font-size:11px">
      </td>
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
        <span class="status-badge ${op.status === 'GAIN' ? 'gain' : op.status === 'LOSS' ? 'loss' : 'zerada'}">${op.status || 'ZERADA'}</span>
      </td>
      <td>
        <button type="button" class="btn-delete ops-del-btn" data-idx="${idx}">✕</button>
      </td>
    `;

    const autoCalcTriggers = tr.querySelectorAll(
        'input[name="entrada"], input[name="saida"], input[name="contratos"], input[name="valor_ponto"], select[name="ativo"], select[name="tipo"]'
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
    const tipo      = g('tipo');  // FIX: lê o tipo (COMPRA/VENDA) para cálculo correto

    const valorPontoMap = { WIN: 0.20, WDO: 10.00, BIT: 0.01 };
    const vpEl = tr.querySelector('[name="valor_ponto"]');
    if (!vpEl.value || vpEl.dataset.auto !== 'false') {
      vpEl.value = valorPontoMap[ativo] || 0.20;
      vpEl.dataset.auto = 'true';
    }
    const vp = parseFloat(vpEl.value) || 0;
    const diffBruto = saida - entrada;
    const diff      = tipo === 'VENDA' ? -diffBruto : diffBruto;
    const pontos    = ativo === 'WDO' ? diff * 1000 : diff;
    const resultado = pontos * contratos * vp;

    const pontosEl    = tr.querySelector('[name="pontos"]');
    const resultadoEl = tr.querySelector('[name="resultado"]');

    if (entrada && saida) {
      pontosEl.value    = pontos.toFixed(2);
      resultadoEl.value = resultado.toFixed(2);
      resultadoEl.closest('td').className = resultado >= 0 ? 'val-positive' : 'val-negative';

      // FIX: atualiza td de pontos também
      pontosEl.closest('td').className = pontos >= 0 ? 'val-positive' : 'val-negative';

      const newStatus = resultado > 0 ? 'GAIN' : resultado < 0 ? 'LOSS' : 'ZERADA';
      const statusSpan = tr.querySelector('.status-badge');
      if (statusSpan) {
        statusSpan.textContent = newStatus;
        statusSpan.className = 'status-badge ' + (newStatus === 'GAIN' ? 'gain' : newStatus === 'LOSS' ? 'loss' : 'zerada');
      }
    }
  }

  function deleteOpsRow(idx) {
    STATE.operacoes.splice(idx, 1);
    renderOpsDetalhada();
    renderOpsTable();
    // FIX: atualiza dashboard e charts ao deletar operação
    renderDashboard();
    renderCharts();
    atualizarCampos();
  }

  function addNewOpsRow() {
    STATE.operacoes.push({
      dia: 1, tipo: 'COMPRA', ativo: 'WIN',
      entrada: '', saida: '', contratos: 1,
      valor_ponto: 0.20, pontos: '', resultado: '', status: 'GAIN',
      data_cal: '',  // vazio — buildOpsRow usará o fallback do mês atual
    });
    renderOpsDetalhada();
    document.getElementById('opsDetalhadaBody')?.lastElementChild
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function collectOpsFromTable() {
    return Array.from(document.querySelectorAll('#opsDetalhadaBody tr')).map(tr => {
      const g = name => tr.querySelector(`[name="${name}"]`)?.value;
      // FIX: contratos mínimo 1 (nunca 0), mas preserva o valor digitado se >= 1
      const contratosRaw = parseInt(g('contratos'));
      const diaVal       = parseInt(g('dia')) || 1;

      // ─── FIX: coleta data_cal do DOM — preserva o valor editado pelo usuário ───
      const dataCal = g('data_cal') || `${STATE.month}-${String(diaVal).padStart(2,'0')}`;

      return {
        dia:         diaVal,
        data_cal:    dataCal,
        tipo:        g('tipo')                    || 'COMPRA',
        ativo:       g('ativo')                   || 'WIN',
        entrada:     parseFloat(g('entrada'))     || 0,
        saida:       parseFloat(g('saida'))       || 0,
        contratos:   isNaN(contratosRaw) || contratosRaw < 1 ? 1 : contratosRaw,
        valor_ponto: parseFloat(g('valor_ponto')) || 0,
        pontos:      parseFloat(g('pontos'))      || 0,
        resultado:   parseFloat(g('resultado'))   || 0,
        status: tr.querySelector('.status-badge')?.textContent.trim() || 'GAIN',
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
  const c     = STATE.config;
  const banca = parseFloat(c.banca_inicial)   ?? CONFIG_DEFAULTS.banca_inicial;
  const meta  = parseFloat(c.objetivo_diario) || CONFIG_DEFAULTS.objetivo_diario;
  const dias  = parseInt(c.dias_uteis)        || CONFIG_DEFAULTS.dias_uteis;
  const labels = Array.from({ length: dias }, (_, i) => `D${i + 1}`);

  // FIX: projecaoData consistente com calcCapitalPorDia — Dia 1 = banca, Dia N = banca + meta*(N-1)
  const projecaoData = labels.map((_, i) => i === 0 ? banca : banca + meta * i);

  // FIX: usa calcCapitalPorDia() para dados realizados, garantindo consistência com a tabela
  const linhas = calcCapitalPorDia();
  const realizadoData = linhas.map(l =>
    (l.realizado !== '' && l.realizado !== null) ? l.capitalFinal : null
  );

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

  // FIX: usa realizadoData de calcCapitalPorDia para drawdown (consistente com tabela)
  const ddAcum = [];
  let peakDD = banca;
  linhas.forEach(l => {
    if (l.realizado !== '' && l.realizado !== null) {
      if (l.capitalFinal > peakDD) peakDD = l.capitalFinal;
      ddAcum.push(peakDD > 0 ? -((peakDD - l.capitalFinal) / peakDD * 100) : 0);
    } else {
      ddAcum.push(null);
    }
  });
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
  const url = '/api/diario/';
  
  const texto = document.getElementById('plano_diario')?.value.trim();
  if (!texto) { setStatus('saveDiarioStatus', 'Digite algo antes de salvar.', 'err'); return; }
  
  if (!REQUEST_GUARD.canRequest(url)) {
    console.warn('⚠️ Salvar Diário já em andamento, ignorando...');
    return;
  }
  
  REQUEST_GUARD.markPending(url);
  setStatus('saveDiarioStatus', 'Salvando...');
  
  try {
    const entry = await API.post(url, { month: STATE.month, conteudo: texto });
    STATE.diario.unshift(entry);
    document.getElementById('plano_diario').value = '';
    renderDiario();
    setStatus('saveDiarioStatus', '✓ Salvo!', 'ok');
  } catch {
    setStatus('saveDiarioStatus', 'Erro ao salvar.', 'err');
  } finally {
    REQUEST_GUARD.markComplete(url);
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
  const url = '/api/regras/bulk-sync/';
  
  if (!REQUEST_GUARD.canRequest(url)) {
    console.warn('⚠️ Salvar Regras já em andamento, ignorando...');
    return;
  }
  
  REQUEST_GUARD.markPending(url);
  
  try {
    const regrasList = STATE.regras.map((r, i) => ({ texto: r.texto, ordem: i }));
    const refreshed  = await API.post(url, regrasList);
    STATE.regras = refreshed;
    renderRegras();
  } finally {
    REQUEST_GUARD.markComplete(url);
  }
}

// ─── DEBOUNCE HELPER ──────────────────────────────
const debounceMap = new Map();

function debounce(key, fn, delay = 500) {
  if (debounceMap.has(key)) clearTimeout(debounceMap.get(key));
  const timeout = setTimeout(() => {
    fn();
    debounceMap.delete(key);
  }, delay);
  debounceMap.set(key, timeout);
}

// ─── SALVAR ───────────────────────────────────────
async function saveConfig(statusId) {
  const url = '/api/config/upsert/';
  
  // 🚫 PROTEÇÃO: Se já há request em andamento, ignora
  if (!REQUEST_GUARD.canRequest(url)) {
    console.warn('⚠️ Salvar Config já em andamento, ignorando...');
    return;
  }
  
  REQUEST_GUARD.markPending(url);
  setStatus(statusId, 'Salvando...');
  
  try {
    const data   = getConfigFromInputs();
    const result = await API.post(url, data);
    STATE.config  = result;
    await postSaveRender();
    setStatus(statusId, '✓ Salvo!', 'ok');
  } catch (e) {
    console.error(e);
    setStatus(statusId, 'Erro!', 'err');
  } finally {
    REQUEST_GUARD.markComplete(url);
  }
}

async function saveProjecao() {
  const url = '/api/projecao/bulk/';

  if (!REQUEST_GUARD.canRequest(url)) {
    console.warn('⚠️ Salvar Projeção já em andamento, ignorando...');
    return;
  }

  REQUEST_GUARD.markPending(url);
  setStatus('saveProjecaoStatus', 'Salvando...');

  try {
    const items = Array.from(document.querySelectorAll('#projecaoBody tr')).map(tr => {
      const dia = parseInt(tr.dataset.dia);

      // Lê custo e imposto dos inputs do DOM (existem na tabela)
      const custo = tr.querySelector('.proj-custo')?.value;
      const imp   = tr.querySelector('.proj-imposto')?.value;

      // ✅ FIX: lê realizado do STATE — não há input .proj-realizado no DOM,
      // o valor é exibido como texto estático. Ler do DOM sempre retornaria null.
      const dadoDia = STATE.projecao.find(p => p.dia === dia) || {};

      return {
        month:          STATE.month,
        dia,
        realizado:      dadoDia.realizado !== undefined && dadoDia.realizado !== ''
                          ? dadoDia.realizado
                          : null,
        custo_op:       parseFloat(custo) || 0,
        imposto_retido: parseFloat(imp)   || 0,
      };
    });

    const result   = await API.post(url, items);
    STATE.projecao = result;
    await postSaveRender();
    setStatus('saveProjecaoStatus', '✓ Salvo!', 'ok');
  } catch (e) {
    console.error(e);
    setStatus('saveProjecaoStatus', 'Erro!', 'err');
  } finally {
    REQUEST_GUARD.markComplete(url);
  }
}

async function saveOperacoes() {
  const url = '/api/operacoes/bulk-sync/';
  
  if (!REQUEST_GUARD.canRequest(url)) {
    console.warn('⚠️ Salvar Operações já em andamento, ignorando...');
    return;
  }
  
  REQUEST_GUARD.markPending(url);
  setStatus('saveOpsStatus', 'Salvando...');
  
  try {
    const ops       = collectOpsFromTable();
    const result    = await API.post(url, { month: STATE.month, operacoes: ops });
    STATE.operacoes = result;
    await postSaveRender();
    setStatus('saveOpsStatus', '✓ Salvo!', 'ok');
  } catch (e) {
    console.error(e);
    setStatus('saveOpsStatus', 'Erro!', 'err');
  } finally {
    REQUEST_GUARD.markComplete(url);
  }
}

// Versão debounced para evitar múltiplas chamadas seguidas
function savOperacoesDebounced() {
  debounce('save-operacoes', saveOperacoes, 800);
}

async function savePlano() {
  const url = '/api/config/upsert/';  // config e regras usam URLs separadas
  
  if (!REQUEST_GUARD.canRequest(url)) {
    console.warn('⚠️ Salvar Plano já em andamento, ignorando...');
    return;
  }
  
  REQUEST_GUARD.markPending(url);
  setStatus('savePlanoStatus', 'Salvando...');
  
  try {
    // FIX: salva config e regras em paralelo para evitar duplo postSaveRender
    const configData = getConfigFromInputs();
    const regrasList = STATE.regras.map((r, i) => ({ texto: r.texto, ordem: i }));
    const [configResult, regrasResult] = await Promise.all([
      API.post(url, configData),
      API.post('/api/regras/bulk-sync/', regrasList),
    ]);
    STATE.config = configResult;
    STATE.regras = regrasResult;
    await postSaveRender();
    renderRegras();
    setStatus('savePlanoStatus', '✓ Salvo!', 'ok');
  } catch (e) {
    console.error(e);
    setStatus('savePlanoStatus', 'Erro!', 'err');
  } finally {
    REQUEST_GUARD.markComplete(url);
  }
}

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

    // 🚫 IGNORA custo e imposto (sempre vermelho via CSS)
    if (
      input.classList.contains('proj-custo') ||
      input.classList.contains('proj-imposto')
    ) return;

    const val = parseFloat(input.value);
    if (isNaN(val)) return;

    applyClass(input, val);

    input.addEventListener('input', function () {
      const v = parseFloat(this.value);
      if (!isNaN(v)) applyClass(this, v);
    });
  });

  document.querySelectorAll('td, div, span').forEach(el => {
    const hasElementChildren = Array.from(el.children).some(c => c.nodeType === Node.ELEMENT_NODE);
    if (hasElementChildren) return;

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
  localStorage.setItem('selectedMonth', STATE.month);
  STATE.operacoes = [];
  STATE.projecao  = [];
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

  // ─── GESTÃO DE RISCO ──────────────────────
  const valuePerPointMap = { WIN: 0.20, WDO: 10.00 };
  let gestaoAtivoAtual = 'WIN';

  function gestaoAtualizarAtivoDisplay() {
    document.getElementById('gestaoAtivoDisplay').textContent = gestaoAtivoAtual;
    document.getElementById('abaWinBtn').classList.toggle('active', gestaoAtivoAtual === 'WIN');
    document.getElementById('abaWdoBtn').classList.toggle('active', gestaoAtivoAtual === 'WDO');

    // Atualiza estilos dos botões
    document.getElementById('abaWinBtn').style.background = gestaoAtivoAtual === 'WIN' 
      ? 'rgba(0,255,127,.2)' : 'rgba(255,255,255,.08)';
    document.getElementById('abaWinBtn').style.color = gestaoAtivoAtual === 'WIN' 
      ? 'var(--neon)' : 'var(--muted)';
    document.getElementById('abaWdoBtn').style.background = gestaoAtivoAtual === 'WDO' 
      ? 'rgba(0,255,127,.2)' : 'rgba(255,255,255,.08)';
    document.getElementById('abaWdoBtn').style.color = gestaoAtivoAtual === 'WDO' 
      ? 'var(--neon)' : 'var(--muted)';
  }

  function gestaoCalcularContratos() {
    const risco = parseFloat(document.getElementById('gestaoRiscoFinanceiro').value) || 500;
    const stop = parseFloat(document.getElementById('gestaoStopPontos').value) || 150;
    const valorPorPonto = valuePerPointMap[gestaoAtivoAtual] || 0.20;

    if (stop <= 0 || risco <= 0 || valorPorPonto <= 0) {
      document.getElementById('gestaoContratoRec').textContent = '—';
      document.getElementById('gestaoExatoMsg').textContent = '';
      document.getElementById('gestaoRiscoPorContrato').textContent = '—';
      document.getElementById('gestaoRiscoEfetivo').textContent = '—';
      document.getElementById('gestaoEconomiaRisco').textContent = '—';
      document.getElementById('gestaoAlertaMsg').style.display = 'none';
      return;
    }

    // Calcula risco por contrato: stop (pontos) * valor_por_ponto * 1 contrato
    const riscoPorContrato = stop * valorPorPonto;

    // Calcula número de contratos: risco_financeiro / risco_por_contrato
    const contratoExato = risco / riscoPorContrato;
    const contratoRec = Math.floor(contratoExato);
    const contratoProx = Math.ceil(contratoExato);

    // Calcula riscos efetivos
    const riscoEfetivoRec = contratoRec * riscoPorContrato;
    const riscoEfetivoProx = contratoProx * riscoPorContrato;

    // Economia de risco para a recomendação
    const economiaRisco = risco - riscoEfetivoRec;

    // Atualiza display
    document.getElementById('gestaoContratoRec').textContent = contratoRec;
    document.getElementById('gestaoExatoMsg').textContent = 
      contratoExato === contratoRec 
        ? contratoRec + ' exato'
        : `${contratoRec} exato → arredondado para baixo`;
    
    document.getElementById('gestaoRiscoPorContrato').textContent = fmt.brl(riscoPorContrato);
    document.getElementById('gestaoRiscoEfetivo').textContent = fmt.brl(riscoEfetivoRec);
    document.getElementById('gestaoEconomiaRisco').textContent = fmt.brl(economiaRisco);

    // Mostra alerta se próximo contrato ultrapassaria o limite
    const alerta = document.getElementById('gestaoAlertaMsg');
    if (riscoEfetivoProx > risco) {
      alerta.style.display = 'block';
      document.getElementById('gestaoAlertaTxt').textContent = 
        `⚠️ ${contratoProx} contratos ultrapassaria R$ ${fmt.brl(riscoEfetivoProx - risco)}`;
    } else {
      alerta.style.display = 'none';
    }

    // Renderiza tabela prática
    gestaoRenderizarTabelaPratica(risco);
  }

 function gestaoRenderizarTabelaPratica(riscoFixo) {
  const valorPorPonto = valuePerPointMap[gestaoAtivoAtual] || 0.20;
  const stops = [50, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000];
  
  const tbody = document.getElementById('gestaoTabelaBody');
  tbody.innerHTML = '';

  document.getElementById('gestaoTabelaRiscoLabel').textContent = riscoFixo.toFixed(0);

  stops.forEach(stopPontos => {
    const riscoPorContrato = stopPontos * valorPorPonto;

    if (riscoPorContrato <= 0) return;

    // 🔥 NOVA LÓGICA (baixo vs cima)
    const contratosBaixo = Math.floor(riscoFixo / riscoPorContrato);
    const contratosCima = Math.ceil(riscoFixo / riscoPorContrato);

    const riscoBaixo = contratosBaixo * riscoPorContrato;
    const riscoCima = contratosCima * riscoPorContrato;

    let status = '';
    let contratos = contratosBaixo;
    let riscoTotal = riscoBaixo;

    if (riscoBaixo === riscoFixo) {
      status = '✓ Exato';
    } else if ((riscoFixo - riscoBaixo) <= (riscoCima - riscoFixo)) {
      status = '↘️ Abaixo (seguro)';
    } else {
      status = '↗️ Acima (agressivo)';
      contratos = contratosCima;
      riscoTotal = riscoCima;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family:var(--mono);color:var(--neon2)">${stopPontos}</td>
      <td style="font-family:var(--mono);color:var(--neon2)">${fmt.brl(riscoPorContrato)}</td>
      <td style="font-family:var(--mono);color:var(--neon2);font-weight:600">${contratos}</td>
      <td style="font-family:var(--mono);color:var(--neon2)">${fmt.brl(riscoTotal)}</td>
      <td style="text-align:center">
        <span style="padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600;${
          status === '✓ Exato' 
            ? 'background:rgba(0,255,127,.2);color:var(--neon)' 
            : status.includes('Abaixo')
            ? 'background:rgba(0,200,255,.2);color:var(--neon3)'
            : 'background:rgba(255,100,100,.2);color:#ff6464'
        }">${status}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

  // Eventos da Gestão de Risco
  document.getElementById('abaWinBtn')?.addEventListener('click', () => {
    gestaoAtivoAtual = 'WIN';
    gestaoAtualizarAtivoDisplay();
    gestaoCalcularContratos();
  });

  document.getElementById('abaWdoBtn')?.addEventListener('click', () => {
    gestaoAtivoAtual = 'WDO';
    gestaoAtualizarAtivoDisplay();
    gestaoCalcularContratos();
  });

  document.getElementById('gestaoRiscoFinanceiro')?.addEventListener('input', gestaoCalcularContratos);
  document.getElementById('gestaoStopPontos')?.addEventListener('input', gestaoCalcularContratos);
  document.getElementById('calcularRiscoBtn')?.addEventListener('click', gestaoCalcularContratos);

  // Inicializa com valores padrão
  gestaoAtualizarAtivoDisplay();
  gestaoCalcularContratos();
}

  // ─── INIT ─────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    setCurrentDate();
    buildMonthSelector();  // STATE.month definido aqui
    bindEvents();
    initSidebar();         // initSidebar chama switchTab → loadAll com mês correto
  });

  function initSidebar() {
    const sidebar      = document.querySelector('.sidebar');
    const mainContent  = document.querySelector('.main-content');
    const toggleBtn    = document.getElementById('sidebarToggle');
    const sidebarItems = document.querySelectorAll('.sidebar-nav-item');

    if (!sidebar) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);

    const mobileTrigger = document.createElement('button');
    mobileTrigger.className = 'sidebar-mobile-trigger';
    mobileTrigger.setAttribute('aria-label', 'Open menu');
    mobileTrigger.innerHTML = '<span></span><span></span><span></span>';
    document.body.appendChild(mobileTrigger);

    const STORAGE_KEY = 'sidebar_collapsed';
    let isCollapsed = localStorage.getItem(STORAGE_KEY) === 'true';
    let isMobile    = window.innerWidth <= 900;

    sidebarItems.forEach(item => {
      const label = item.querySelector('.label');
      if (label) item.setAttribute('data-label', label.textContent.trim());
    });

    function applyCollapse(collapsed) {
      if (isMobile) return;
      isCollapsed = collapsed;
      sidebar.classList.toggle('collapsed', collapsed);
      mainContent.style.marginLeft = collapsed ? '60px' : '220px';
      localStorage.setItem(STORAGE_KEY, collapsed);
    }

    function initState() {
      isMobile = window.innerWidth <= 900;
      if (isMobile) {
        sidebar.classList.remove('collapsed');
        mainContent.style.marginLeft = '0';
      } else {
        applyCollapse(isCollapsed);
      }
    }

    initState();

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (isMobile) openMobile();
        else applyCollapse(!isCollapsed);
      });
    }

    function openMobile() {
      sidebar.classList.add('mobile-open');
      backdrop.classList.add('visible');
      document.body.style.overflow = 'hidden';
    }

    function closeMobile() {
      sidebar.classList.remove('mobile-open');
      backdrop.classList.remove('visible');
      document.body.style.overflow = '';
    }

    mobileTrigger.addEventListener('click', openMobile);
    backdrop.addEventListener('click', closeMobile);

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const wasMobile = isMobile;
        isMobile = window.innerWidth <= 900;
        if (wasMobile !== isMobile) {
          if (!isMobile) { closeMobile(); applyCollapse(isCollapsed); }
          else { sidebar.classList.remove('collapsed'); mainContent.style.marginLeft = '0'; }
        }
      }, 100);
    });

    const topTabs     = document.querySelectorAll('nav .tab[data-tab]');
    const allContents = document.querySelectorAll('.tab-content');

    function switchTab(tabName) {
      allContents.forEach(el => el.classList.remove('active'));
      topTabs.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
      sidebarItems.forEach(item => item.classList.toggle('active', item.dataset.tab === tabName));
      const panel = document.getElementById('tab-' + tabName);
      if (panel) {
        panel.classList.add('active');
        mainContent.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (tabName === 'dashboard' && STATE.month) loadAll(STATE.month);
      if (isMobile) closeMobile();
    }

    sidebarItems.forEach(item => {
      item.addEventListener('click', () => switchTab(item.dataset.tab));
    });

    topTabs.forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    const activeTopTab = document.querySelector('nav .tab.active');
    if (activeTopTab) switchTab(activeTopTab.dataset.tab);
    else switchTab('dashboard');
  }