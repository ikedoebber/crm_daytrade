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
// Formatação pontual de UI que não é cálculo de domínio.
// Para formatação de valores financeiros, use fmt.brl() / fmt.pct() de calculos.js.

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
  renderProjecaoTable();
  renderOpsTable();
  renderOpsDetalhada();
  renderCharts();
  renderDiario();
  renderRegras();
  // calculos.js escreve todos os campos calculados de uma só vez
  atualizarCampos();
  applyNegativeValueStyling();
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
    if (el && c[f] !== undefined && c[f] !== null) el.value = c[f];
  });
}

function getConfigFromInputs() {
  const n  = id => parseFloat(document.getElementById(id)?.value) || 0;
  const s  = id => document.getElementById(id)?.value || '';
  const ni = id => parseInt(document.getElementById(id)?.value) || 0;
  return {
    month:                       STATE.month,
    banca_inicial:               n('cfg_banca_inicial'),
    objetivo_diario:             n('cfg_objetivo_diario'),
    dias_uteis:                  ni('cfg_dias_uteis') || 20,
    plano_meta_aprovacao:        n('cfg_plano_meta_aprovacao'),
    plano_perda_max_total:       n('cfg_plano_perda_max_total'),
    plano_perda_diaria_aprovacao:n('cfg_plano_perda_diaria_aprovacao'),
    plano_risco1:                s('cfg_plano_risco1'),
    plano_start:                 s('cfg_plano_start'),
    plano_capital:               n('cfg_plano_capital'),
    plano_meta:                  n('cfg_plano_meta'),
    plano_ativos:                s('cfg_plano_ativos'),
    plano_maxentradas:           ni('cfg_plano_maxentradas') || 5,
    plano_stop:                  n('cfg_plano_stop'),
  };
}

// ─── DASHBOARD ────────────────────────────────────
// Apenas preenchimento de UI; todos os valores vêm de calc.* (calculos.js).
function renderDashboard() {
  const c    = STATE.config;
  const dias = parseInt(c.dias_uteis) || 20;

  // Progresso
  const diasFeitos = STATE.projecao.filter(d => d.realizado !== null && d.realizado !== '').length;
  const pctVal     = dias > 0 ? Math.min(100, (diasFeitos / dias) * 100) : 0;
  const el         = document.getElementById('progressBar');
  if (el) el.style.width = pctVal + '%';
  const elPct = document.getElementById('progressPct');
  if (elPct) elPct.textContent = pctVal.toFixed(0) + '%';

  const setEl = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };

  setEl('totalDiasDisp',     dias);
  setEl('diasPercorridos',   diasFeitos);

  // Exibe capital_final do backend se disponível
  if (STATE.capital_atual?.capital_final !== undefined) {
    setEl('capitalAtualFromDB', fmt.brl(STATE.capital_atual.capital_final));
  }

  // Stats de operações (contagens puras, sem cálculo monetário)
  const ops    = STATE.operacoes;
  const gains  = ops.filter(o => o.status === 'GAIN').length;
  const losses = ops.filter(o => o.status === 'LOSS').length;
  const zeros  = ops.filter(o => o.status === 'ZERADA').length;

  setEl('sumGain',  gains);
  setEl('sumLoss',  losses);
  setEl('sumZero',  zeros);
  setEl('sumTotal', ops.length);
  setEl('sumWR',    (gains + losses) > 0 ? ((gains / (gains + losses)) * 100).toFixed(1) + '%' : '—');

  setEl('dashMetaAprovacao',       fmt.brl(c.plano_meta_aprovacao));
  setEl('dashPerdaMaxTotal',       fmt.brl(c.plano_perda_max_total));
  setEl('dashPerdaDiariaAprovacao',fmt.brl(c.plano_perda_diaria_aprovacao));

  // Os demais campos monetários/percentuais são escritos por atualizarCampos()
}

// ─── PROJEÇÃO DIÁRIA ──────────────────────────────
function renderProjecaoTable() {
  const c    = STATE.config;
  const banca = parseFloat(c.banca_inicial)  || 0;
  const meta  = parseFloat(c.objetivo_diario) || 0;
  const dias  = parseInt(c.dias_uteis)        || 20;
  const tbody = document.getElementById('projecaoBody');
  tbody.innerHTML = '';

  let capitalCorrido = banca;
  const hoje = new Date();
  const [y, m] = STATE.month.split('-').map(Number);

  for (let d = 1; d <= dias; d++) {
    const projecaoDia = banca + meta * d;
    const dadoDia     = STATE.projecao.find(p => p.dia === d) || {};
    const realizado   = dadoDia.realizado    ?? '';
    const custoOp     = dadoDia.custo_op     ?? 0;
    const impostoRet  = dadoDia.imposto_retido ?? 0;

    const dataLinha = new Date(y, m - 1, d);
    const isHoje    = dataLinha.toDateString() === hoje.toDateString();
    const isPassado = dataLinha < hoje && !isHoje;

    let capitalFinal = capitalCorrido;
    let pctMeta      = '—';
    let retorno      = '—';

    if (realizado !== '' && realizado !== null) {
      const r = parseFloat(realizado) || 0;
      const c2 = parseFloat(custoOp)  || 0;
      const i  = parseFloat(impostoRet) || 0;
      capitalFinal    = capitalCorrido + r - c2 - i;
      pctMeta         = meta > 0 ? ((r / meta) * 100).toFixed(0) + '%' : '—';
      retorno         = banca > 0 ? (((capitalFinal - banca) / banca) * 100).toFixed(2) + '%' : '—';
      capitalCorrido  = capitalFinal;
    }

    const rowClass  = isHoje ? 'row-hoje' : isPassado ? 'row-passado' : 'row-futuro';
    const realClass = (realizado !== '' && realizado !== null)
      ? (parseFloat(realizado) >= 0 ? 'val-positive' : 'val-negative') : '';

    const tr = document.createElement('tr');
    tr.className  = rowClass;
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
      <td>${pctMeta}</td>
      <td style="color:var(--neon2);font-weight:600">${(realizado !== '' && realizado !== null) ? fmt.brl(capitalFinal) : '—'}</td>
      <td>${retorno}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ─── OPERAÇÕES (tabela resumo por dia) ────────────
function renderOpsTable() {
  const tbody = document.getElementById('opsBody');
  tbody.innerHTML = '';

  const dias = parseInt(STATE.config.dias_uteis) || 20;
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

  // Performance cards — win rate de contagem (sem duplicar calc.winRate)
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
    <td><input class="tbl-input" type="number" name="entrada"     value="${op.entrada||''}"     step="0.01" placeholder="0.00"></td>
    <td><input class="tbl-input" type="number" name="saida"       value="${op.saida||''}"       step="0.01" placeholder="0.00"></td>
    <td><input class="tbl-input" type="number" name="contratos"   value="${op.contratos||1}"    step="1"    style="width:55px"></td>
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
// Pequena lógica de conveniência de UI — pontos e resultado derivados
// de entrada/saída informados pelo usuário na tabela.
// Não confundir com calc.* que opera sobre STATE já salvo.
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
      dia:         parseInt(g('dia'))       || 1,
      tipo:        g('tipo')                || 'COMPRA',
      ativo:       g('ativo')               || 'WIN',
      entrada:     parseFloat(g('entrada')) || 0,
      saida:       parseFloat(g('saida'))   || 0,
      contratos:   parseInt(g('contratos')) || 1,
      valor_ponto: parseFloat(g('valor_ponto')) || 0,
      pontos:      parseFloat(g('pontos'))   || 0,
      resultado:   parseFloat(g('resultado'))|| 0,
      status:      g('status')              || 'GAIN',
      month:       STATE.month,
    };
  });
}

// ─── CHARTS ───────────────────────────────────────
const CHARTS = {};

function destroyChart(id) {
  if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; }
}

function renderCharts() {
  const banca = parseFloat(STATE.config.banca_inicial)   || 0;
  const meta  = parseFloat(STATE.config.objetivo_diario) || 0;
  const dias  = parseInt(STATE.config.dias_uteis)        || 20;
  const labels = Array.from({ length: dias }, (_, i) => `D${i+1}`);

  const projecaoData = labels.map((_, i) => banca + meta * (i + 1));

  // Realizado acumulado
  let cap = banca;
  const realizadoData = [];
  for (let d = 1; d <= dias; d++) {
    const pDia = STATE.projecao.find(p => p.dia === d);
    if (pDia && pDia.realizado !== null && pDia.realizado !== '') {
      cap += (parseFloat(pDia.realizado) || 0)
           - (parseFloat(pDia.custo_op) || 0)
           - (parseFloat(pDia.imposto_retido) || 0);
      realizadoData.push(cap);
    } else {
      realizadoData.push(null);
    }
  }

  buildLineChart('chartBanca', labels, [
    { label: 'Projeção',  data: projecaoData,  borderColor: '#6c8cff', fill: false },
    { label: 'Realizado', data: realizadoData, borderColor: '#1ee8b7', fill: false, spanGaps: false },
  ]);

  buildLineChart('chartCapitalVsProjecao', labels, [
    { label: 'Projeção',    data: projecaoData,  borderColor: '#6c8cff', fill: false },
    { label: 'Capital Real',data: realizadoData, borderColor: '#1ee8b7', fill: false, spanGaps: false },
  ]);

  // Win rate acumulado por dia
  const wrData = [];
  let totalG = 0; let totalL = 0;
  for (let d = 1; d <= dias; d++) {
    const dayOps = STATE.operacoes.filter(o => o.dia === d);
    totalG += dayOps.filter(o => o.status === 'GAIN').length;
    totalL += dayOps.filter(o => o.status === 'LOSS').length;
    wrData.push((totalG + totalL) > 0 ? (totalG / (totalG + totalL) * 100) : null);
  }
  buildLineChart('chartWinRateEvolution', labels, [
    { label: 'Win Rate %', data: wrData, borderColor: '#f7c948', fill: false, spanGaps: false },
  ]);

  // Pontos por dia (WIN e WDO)
  const pontosWinDia = [], pontosWdoDia = [];
  for (let d = 1; d <= dias; d++) {
    const dayOps = STATE.operacoes.filter(o => o.dia === d);
    pontosWinDia.push(dayOps.filter(o => o.ativo === 'WIN').reduce((a,o) => a + (parseFloat(o.pontos)||0), 0) || null);
    pontosWdoDia.push(dayOps.filter(o => o.ativo === 'WDO').reduce((a,o) => a + (parseFloat(o.pontos)||0), 0) || null);
  }
  buildBarChart('chartPontosDetalhados', labels, [
    { label: 'WIN (pts)', data: pontosWinDia, backgroundColor: 'rgba(30,232,183,0.5)' },
    { label: 'WDO (pts)', data: pontosWdoDia, backgroundColor: 'rgba(247,201,72,0.5)' },
  ]);

  // Drawdown acumulado — usa calc para consistência
  const ddAcum = [];
  let capDD = banca; let peakDD = banca;
  for (let d = 1; d <= dias; d++) {
    const pDia = STATE.projecao.find(p => p.dia === d);
    if (pDia && pDia.realizado !== null && pDia.realizado !== '') {
      capDD += (parseFloat(pDia.realizado)||0) - (parseFloat(pDia.custo_op)||0) - (parseFloat(pDia.imposto_retido)||0);
      if (capDD > peakDD) peakDD = capDD;
      ddAcum.push(peakDD > 0 ? -((peakDD - capDD) / peakDD * 100) : 0);
    } else {
      ddAcum.push(null);
    }
  }
  buildLineChart('chartDrawdown', labels, [
    { label: 'Drawdown %', data: ddAcum, borderColor: '#ff4c6a', fill: true, backgroundColor: 'rgba(255,76,106,0.08)', spanGaps: false },
  ]);

  // Resultado financeiro por dia
  const resultDia = [];
  for (let d = 1; d <= dias; d++) {
    const dayOps = STATE.operacoes.filter(o => o.dia === d);
    resultDia.push(dayOps.length ? dayOps.reduce((a,o) => a + (parseFloat(o.resultado)||0), 0) : null);
  }
  buildBarChart('chartResultadoDetalhados', labels, [
    {
      label: 'Resultado R$',
      data:  resultDia,
      backgroundColor: resultDia.map(v => (v ?? 0) >= 0 ? 'rgba(34,217,135,0.5)' : 'rgba(255,76,106,0.5)'),
    },
  ]);

  buildWinLossChart('chartWinGanhosPerdidos', 'WIN');
  buildWinLossChart('chartWdoGanhosPerdidos', 'WDO');

  const gainTotal = STATE.operacoes.filter(o => o.status === 'GAIN').reduce((a,o) => a + (parseFloat(o.resultado)||0), 0);
  const lossTotal = Math.abs(STATE.operacoes.filter(o => o.status === 'LOSS').reduce((a,o) => a + (parseFloat(o.resultado)||0), 0));
  buildDoughnut('chartGainVsLoss', ['Ganhos','Perdas'], [gainTotal, lossTotal], ['rgba(34,217,135,0.7)','rgba(255,76,106,0.7)']);
}

function buildWinLossChart(canvasId, ativo) {
  const dias   = parseInt(STATE.config.dias_uteis) || 20;
  const labels = Array.from({ length: dias }, (_, i) => `D${i+1}`);
  const ganhos = [], perdas = [];
  for (let d = 1; d <= dias; d++) {
    const dayOps = STATE.operacoes.filter(o => o.dia === d && o.ativo === ativo);
    ganhos.push(dayOps.filter(o => (parseFloat(o.pontos)||0) > 0).reduce((a,o) => a + (parseFloat(o.pontos)||0), 0) || null);
    perdas.push(dayOps.filter(o => (parseFloat(o.pontos)||0) < 0).reduce((a,o) => a + (parseFloat(o.pontos)||0), 0) || null);
  }
  buildBarChart(canvasId, labels, [
    { label: 'Ganhos (pts)', data: ganhos, backgroundColor: 'rgba(34,217,135,0.5)' },
    { label: 'Perdas (pts)', data: perdas, backgroundColor: 'rgba(255,76,106,0.5)' },
  ]);
}

function buildLineChart(id, labels, datasets) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  datasets.forEach(ds => {
    ds.tension      = ds.tension     ?? 0.3;
    ds.pointRadius  = ds.pointRadius ?? 3;
    ds.pointHoverRadius = 5;
    ds.borderWidth  = ds.borderWidth ?? 2;
  });
  CHARTS[id] = new Chart(ctx, { type: 'line', data: { labels, datasets }, options: chartOptions() });
}

function buildBarChart(id, labels, datasets) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  CHARTS[id] = new Chart(ctx, { type: 'bar', data: { labels, datasets }, options: chartOptions() });
}

function buildDoughnut(id, labels, data, colors) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  CHARTS[id] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#b8cfe0', font: { family: 'Space Mono', size: 11 } } },
        tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt.brl(c.parsed)}` } },
      },
    },
  });
}

function chartOptions() {
  return {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#b8cfe0', font: { family: 'Space Mono', size: 10 } } },
      tooltip: { backgroundColor: '#0c1624', borderColor: 'rgba(30,232,183,0.2)', borderWidth: 1 },
    },
    scales: {
      x: { ticks: { color: '#3d5470', font: { family: 'Space Mono', size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#3d5470', font: { family: 'Space Mono', size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
    },
  };
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
    renderDashboard();
    renderProjecaoTable();
    atualizarCampos();
    applyNegativeValueStyling();
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
      const dia  = parseInt(tr.dataset.dia);
      const real = tr.querySelector('.proj-realizado')?.value;
      const custo= tr.querySelector('.proj-custo')?.value;
      const imp  = tr.querySelector('.proj-imposto')?.value;
      return {
        month:          STATE.month,
        dia,
        realizado:      real !== '' ? (parseFloat(real) || null) : null,
        custo_op:       parseFloat(custo) || 0,
        imposto_retido: parseFloat(imp)   || 0,
      };
    });
    const result    = await API.post('/api/projecao/bulk/', items);
    STATE.projecao  = result;
    renderDashboard();
    renderCharts();
    atualizarCampos();
    applyNegativeValueStyling();
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
    renderOpsDetalhada();
    renderOpsTable();
    renderDashboard();
    renderCharts();
    atualizarCampos();
    applyNegativeValueStyling();
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

  // Inputs numéricos
  document.querySelectorAll('input[type="number"]').forEach(input => {
    const val = parseFloat(input.value);
    if (isNaN(val)) return;
    applyClass(input, val);
    input.addEventListener('input', function () {
      const v = parseFloat(this.value);
      if (!isNaN(v)) applyClass(this, v);
    }, { once: false });
  });

  // Células/textos
  document.querySelectorAll('td, div, span').forEach(el => {
    if (el.tagName === 'INPUT' || el.children.length > 0) return;
    const text = el.textContent.trim();
    if (!text || !/\d/.test(text)) return;
    const val = extractNum(text);
    if (isNaN(val)) return;
    const pText   = el.parentElement?.textContent || '';
    const forceR  = isAlwaysRed(pText);
    const isCurr  = text.includes('R$');
    if (forceR) {
      applyClass(el, -1); // força negativo
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