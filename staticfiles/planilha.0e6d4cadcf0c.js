/* ================================================
   PLANILHA DO TRADER — planilha.js
   Toda a lógica do frontend + integração com DRF
   ================================================ */

'use strict';

// ─── ESTADO GLOBAL ──────────────────────────────
const STATE = {
  month:    '',
  config:   {},
  projecao: [],   // [{dia, realizado, custo_op, imposto_retido}]
  operacoes:[],   // [{id, dia, tipo, ativo, entrada, saida, contratos, valor_ponto, pontos, resultado, status}]
  diario:   [],   // [{id, conteudo, created_at_fmt}]
  regras:   [],   // [{id, texto, ordem}]
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
    const r = await fetch(url, { method: 'POST', headers: this.headers(), body: JSON.stringify(data), credentials: 'same-origin' });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(JSON.stringify(e)); }
    return r.json();
  },
  async put(url, data) {
    const r = await fetch(url, { method: 'PUT', headers: this.headers(), body: JSON.stringify(data), credentials: 'same-origin' });
    if (!r.ok) throw new Error(`PUT ${url} → ${r.status}`);
    return r.json();
  },
  async patch(url, data) {
    const r = await fetch(url, { method: 'PATCH', headers: this.headers(), body: JSON.stringify(data), credentials: 'same-origin' });
    if (!r.ok) throw new Error(`PATCH ${url} → ${r.status}`);
    return r.json();
  },
  async del(url) {
    const r = await fetch(url, { method: 'DELETE', headers: this.headers(), credentials: 'same-origin' });
    if (!r.ok) throw new Error(`DELETE ${url} → ${r.status}`);
  },
};

// ─── HELPERS DE FORMATAÇÃO ────────────────────────
function brl(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function pct(v, decimals = 1) {
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  return n.toFixed(decimals) + '%';
}
function num(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return 0;
  return n;
}
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
  const now = new Date();
  const months = [];
  // 3 meses atrás até 12 meses à frente
  for (let i = -3; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const lbl = d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
                  .replace('. de ', '/').replace('.','');
    months.push({ val, lbl });
  }
  months.forEach(m => {
    const o = document.createElement('option');
    o.value = m.val; o.textContent = m.lbl;
    sel.appendChild(o);
  });
  // Mês atual como padrão
  const cur = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  sel.value = cur;
  STATE.month = cur;
}

// ─── CARREGAR TUDO DA API ─────────────────────────
async function loadAll(month) {
  try {
    const [configs, projecao, operacoes, diario, regras] = await Promise.all([
      API.get(`/api/config/?month=${month}`),
      API.get(`/api/projecao/?month=${month}`),
      API.get(`/api/operacoes/?month=${month}`),
      API.get(`/api/diario/?month=${month}`),
      API.get(`/api/regras/`),
    ]);

    STATE.config   = configs.length ? configs[0] : {};
    STATE.projecao = projecao;
    STATE.operacoes= operacoes;
    STATE.diario   = diario;
    STATE.regras   = regras;

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
  renderRelatorios();
  renderDiario();
  renderRegras();
  renderCharts();
  applyNegativeValueStyling();
}

// ─── CONFIG INPUTS ────────────────────────────────
function fillConfigInputs() {
  const c = STATE.config;
  const fields = [
    'banca_inicial','objetivo_diario','dias_uteis',
    'plano_meta_aprovacao','plano_perda_max_total','plano_perda_diaria_aprovacao',
    'plano_risco1','plano_start','plano_capital','plano_meta',
    'plano_ativos','plano_maxentradas','plano_stop',
  ];
  fields.forEach(f => {
    const el = document.getElementById('cfg_' + f);
    if (el && c[f] !== undefined && c[f] !== null) el.value = c[f];
  });
}

function getConfigFromInputs() {
  return {
    month: STATE.month,
    banca_inicial:               num(document.getElementById('cfg_banca_inicial')?.value),
    objetivo_diario:             num(document.getElementById('cfg_objetivo_diario')?.value),
    dias_uteis:                  parseInt(document.getElementById('cfg_dias_uteis')?.value) || 20,
    plano_meta_aprovacao:        num(document.getElementById('cfg_plano_meta_aprovacao')?.value),
    plano_perda_max_total:       num(document.getElementById('cfg_plano_perda_max_total')?.value),
    plano_perda_diaria_aprovacao:num(document.getElementById('cfg_plano_perda_diaria_aprovacao')?.value),
    plano_risco1:                document.getElementById('cfg_plano_risco1')?.value || '',
    plano_start:                 document.getElementById('cfg_plano_start')?.value || '',
    plano_capital:               num(document.getElementById('cfg_plano_capital')?.value),
    plano_meta:                  num(document.getElementById('cfg_plano_meta')?.value),
    plano_ativos:                document.getElementById('cfg_plano_ativos')?.value || '',
    plano_maxentradas:           parseInt(document.getElementById('cfg_plano_maxentradas')?.value) || 5,
    plano_stop:                  num(document.getElementById('cfg_plano_stop')?.value),
  };
}

// ─── DASHBOARD ────────────────────────────────────
function renderDashboard() {
  const c = STATE.config;
  const banca   = num(c.banca_inicial)    || 0;
  const meta    = num(c.objetivo_diario)  || 0;
  const dias    = parseInt(c.dias_uteis)  || 20;

  const bancaFinal = banca + meta * dias;
  document.getElementById('bancaFinal').textContent = brl(bancaFinal);
  document.getElementById('planoBancaFinal').textContent = brl(bancaFinal);
  document.getElementById('totalDiasDisp').textContent = dias;

  // Progresso: dias com realizado preenchido
  const diasFeitos = STATE.projecao.filter(d => d.realizado !== null && d.realizado !== '').length;
  const capitalAtual = calcCapitalAtual();
  document.getElementById('diasPercorridos').textContent = diasFeitos;
  document.getElementById('capitalAtualDisp').textContent = brl(capitalAtual);

  const pctVal = dias > 0 ? Math.min(100, (diasFeitos / dias) * 100) : 0;
  document.getElementById('progressBar').style.width = pctVal + '%';
  document.getElementById('progressPct').textContent = pctVal.toFixed(0) + '%';

  // Stats de operações
  const ops = STATE.operacoes;
  const gains  = ops.filter(o => o.status === 'GAIN').length;
  const losses = ops.filter(o => o.status === 'LOSS').length;
  const zeros  = ops.filter(o => o.status === 'ZERADA').length;
  const total  = ops.length;
  const wr     = (gains + losses) > 0 ? (gains / (gains + losses) * 100).toFixed(1) + '%' : '—';

  const pontosWIN = ops.filter(o=>o.ativo==='WIN').reduce((a,o)=>a+num(o.pontos),0);
  const pontosWDO = ops.filter(o=>o.ativo==='WDO').reduce((a,o)=>a+num(o.pontos),0);
  const resultTotal = ops.reduce((a,o)=>a+num(o.resultado),0);

  const opsPorDia = {};
  ops.forEach(o => { opsPorDia[o.dia] = (opsPorDia[o.dia] || 0) + 1; });
  const diasComOps = Object.values(opsPorDia);
  const maxOps  = diasComOps.length ? Math.max(...diasComOps) : 0;
  const mediaOps= diasComOps.length ? (diasComOps.reduce((a,b)=>a+b,0)/diasComOps.length).toFixed(1) : '—';

  document.getElementById('sumGain').textContent  = gains;
  document.getElementById('sumLoss').textContent  = losses;
  document.getElementById('sumZero').textContent  = zeros;
  document.getElementById('sumTotal').textContent = total;
  document.getElementById('sumWR').textContent    = wr;
  document.getElementById('totalPontosWIN').textContent = pontosWIN.toFixed(0);
  document.getElementById('totalPontosWDO').textContent = pontosWDO.toFixed(0);
  document.getElementById('totalResultadoDetalhado').textContent = brl(resultTotal);
  document.getElementById('maxOpsPorDia').textContent  = maxOps;
  document.getElementById('mediaOpsPorDia').textContent= mediaOps;

  document.getElementById('dashMetaAprovacao').textContent      = brl(c.plano_meta_aprovacao);
  document.getElementById('dashPerdaMaxTotal').textContent      = brl(c.plano_perda_max_total);
  document.getElementById('dashPerdaDiariaAprovacao').textContent = brl(c.plano_perda_diaria_aprovacao);
}

function calcCapitalAtual() {
  const banca = num(STATE.config.banca_inicial) || 0;
  let capital = banca;
  STATE.projecao.forEach(d => {
    if (d.realizado !== null && d.realizado !== '') {
      capital += num(d.realizado) - num(d.custo_op) - num(d.imposto_retido);
    }
  });
  return capital;
}

// ─── PROJEÇÃO DIÁRIA ──────────────────────────────
function renderProjecaoTable() {
  const c      = STATE.config;
  const banca  = num(c.banca_inicial)   || 0;
  const meta   = num(c.objetivo_diario) || 0;
  const dias   = parseInt(c.dias_uteis) || 20;
  const tbody  = document.getElementById('projecaoBody');
  tbody.innerHTML = '';

  let capitalCorrido = banca;
  const hoje = new Date();
  const [y, m] = STATE.month.split('-').map(Number);

  for (let d = 1; d <= dias; d++) {
    const projecaoDia = banca + meta * d;
    const dadoDia = STATE.projecao.find(p => p.dia === d) || {};
    const realizado    = dadoDia.realizado    !== undefined ? dadoDia.realizado    : '';
    const custoOp      = dadoDia.custo_op     !== undefined ? dadoDia.custo_op     : 0;
    const impostoRet   = dadoDia.imposto_retido !== undefined ? dadoDia.imposto_retido : 0;

    const dataLinha = new Date(y, m - 1, d);
    const isHoje    = dataLinha.toDateString() === hoje.toDateString();
    const isPassado = dataLinha < hoje && !isHoje;

    let capitalFinal = capitalCorrido;
    let pctMeta = '—';
    let retorno = '—';

    if (realizado !== '' && realizado !== null) {
      const r = num(realizado);
      const c2= num(custoOp);
      const i = num(impostoRet);
      capitalFinal = capitalCorrido + r - c2 - i;
      pctMeta = meta > 0 ? ((r / meta) * 100).toFixed(0) + '%' : '—';
      retorno = banca > 0 ? (((capitalFinal - banca) / banca) * 100).toFixed(2) + '%' : '—';
      capitalCorrido = capitalFinal;
    }

    const rowClass = isHoje ? 'row-hoje' : isPassado ? 'row-passado' : 'row-futuro';
    const realClass = realizado !== '' && realizado !== null
      ? (num(realizado) >= 0 ? 'val-positive' : 'val-negative') : '';

    const tr = document.createElement('tr');
    tr.className = rowClass;
    tr.dataset.dia = d;
    tr.innerHTML = `
      <td style="color:var(--neon);font-weight:700">${d}${isHoje ? ' 🔵' : ''}</td>
      <td>${brl(projecaoDia)}</td>
      <td style="color:var(--neon3)">${brl(meta)}</td>
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
      <td style="color:var(--neon2);font-weight:600">${realizado !== '' && realizado !== null ? brl(capitalFinal) : '—'}</td>
      <td class="${num(retorno) >= 0 ? 'val-positive' : 'val-negative'}">${retorno}</td>
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

    const indGain  = dayOps.filter(o=>o.ativo==='WIN'&&o.status==='GAIN').length;
    const indLoss  = dayOps.filter(o=>o.ativo==='WIN'&&o.status==='LOSS').length;
    const indZero  = dayOps.filter(o=>o.ativo==='WIN'&&o.status==='ZERADA').length;
    const dolGain  = dayOps.filter(o=>o.ativo==='WDO'&&o.status==='GAIN').length;
    const dolLoss  = dayOps.filter(o=>o.ativo==='WDO'&&o.status==='LOSS').length;
    const dolZero  = dayOps.filter(o=>o.ativo==='WDO'&&o.status==='ZERADA').length;
    const totalDia = dayOps.length;

    tots.indGain+=indGain; tots.indLoss+=indLoss; tots.indZero+=indZero;
    tots.dolGain+=dolGain; tots.dolLoss+=dolLoss; tots.dolZero+=dolZero;
    tots.all += totalDia;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--neon);font-weight:700">Dia ${d}</td>
      <td class="val-positive">${indGain||0}</td>
      <td class="val-negative">${indLoss||0}</td>
      <td class="val-neutral">${indZero||0}</td>
      <td class="val-positive">${dolGain||0}</td>
      <td class="val-negative">${dolLoss||0}</td>
      <td class="val-neutral">${dolZero||0}</td>
      <td style="color:var(--neon2)">${totalDia}</td>
    `;
    tbody.appendChild(tr);
  }

  // Totais no footer
  ['totIndGain','totIndLoss','totIndZero','totDolGain','totDolLoss','totDolZero','totAllOps'].forEach((id, i) => {
    const vals = [tots.indGain, tots.indLoss, tots.indZero, tots.dolGain, tots.dolLoss, tots.dolZero, tots.all];
    const el = document.getElementById(id);
    if (el) el.textContent = vals[i];
  });

  // Performance cards
  const gains  = STATE.operacoes.filter(o=>o.status==='GAIN').length;
  const losses = STATE.operacoes.filter(o=>o.status==='LOSS').length;
  const wr     = (gains+losses) > 0 ? ((gains/(gains+losses))*100).toFixed(1)+'%' : '—';
  document.getElementById('perf_gain').textContent = gains;
  document.getElementById('perf_loss').textContent = losses;
  document.getElementById('perf_wr').textContent   = wr;
}

// ─── OPERAÇÕES DETALHADAS ─────────────────────────
function renderOpsDetalhada() {
  const tbody = document.getElementById('opsDetalhadaBody');
  tbody.innerHTML = '';

  STATE.operacoes.forEach((op, idx) => {
    tbody.appendChild(buildOpsRow(op, idx));
  });
}

function buildOpsRow(op, idx) {
  const tr = document.createElement('tr');
  tr.dataset.idx = idx;

  const resultClass = num(op.resultado) >= 0 ? 'val-positive' : 'val-negative';

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
    <td><input class="tbl-input" type="number" name="entrada"   value="${op.entrada||''}"   step="0.01" placeholder="0.00"></td>
    <td><input class="tbl-input" type="number" name="saida"     value="${op.saida||''}"     step="0.01" placeholder="0.00"></td>
    <td><input class="tbl-input" type="number" name="contratos" value="${op.contratos||1}"  step="1"    style="width:55px"></td>
    <td><input class="tbl-input" type="number" name="valor_ponto" value="${op.valor_ponto||0.20}" step="0.01" style="width:60px"></td>
    <td class="${num(op.pontos)>=0?'val-positive':'val-negative'}">
      <input class="tbl-input" type="number" name="pontos" value="${op.pontos||''}" step="0.01" placeholder="0">
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

  // Auto-calcula resultado ao mudar campos
  const inputs = tr.querySelectorAll('input[name="entrada"], input[name="saida"], input[name="contratos"], input[name="valor_ponto"], select[name="ativo"], select[name="status"]');
  inputs.forEach(inp => inp.addEventListener('change', () => autoCalcRow(tr)));

  tr.querySelector('.ops-del-btn').addEventListener('click', () => deleteOpsRow(idx));

  return tr;
}

function autoCalcRow(tr) {
  const g = name => tr.querySelector(`[name="${name}"]`)?.value;
  const entrada   = num(g('entrada'));
  const saida     = num(g('saida'));
  const contratos = num(g('contratos')) || 1;
  const ativo     = g('ativo');
  const status    = g('status');

  // valor_ponto padrão por ativo
  const valorPontoMap = { WIN: 0.20, WDO: 10.00, BIT: 0.01 };
  const vpEl = tr.querySelector('[name="valor_ponto"]');
  if (!vpEl.value || vpEl.dataset.auto !== 'false') {
    vpEl.value = valorPontoMap[ativo] || 0.20;
    vpEl.dataset.auto = 'true';
  }
  const vp = num(vpEl.value);

  const diff   = saida - entrada;
  const pontos = ativo === 'WDO' ? diff * 1000 : diff;  // WDO em ticks×1000
  const resultado = pontos * contratos * vp;

  const pontosEl    = tr.querySelector('[name="pontos"]');
  const resultadoEl = tr.querySelector('[name="resultado"]');
  if (entrada && saida) {
    pontosEl.value    = pontos.toFixed(2);
    resultadoEl.value = resultado.toFixed(2);
  }

  // Cor resultado
  const rClass = resultado >= 0 ? 'val-positive' : 'val-negative';
  resultadoEl.closest('td').className = rClass;

  // Auto-status
  if (entrada && saida) {
    const statusSel = tr.querySelector('[name="status"]');
    if (resultado > 0) statusSel.value = 'GAIN';
    else if (resultado < 0) statusSel.value = 'LOSS';
    else statusSel.value = 'ZERADA';
  }
}

function deleteOpsRow(idx) {
  STATE.operacoes.splice(idx, 1);
  renderOpsDetalhada();
  renderOpsTable();
}

function addNewOpsRow() {
  STATE.operacoes.push({
    dia: 1, tipo: 'COMPRA', ativo: 'WIN',
    entrada: '', saida: '', contratos: 1,
    valor_ponto: 0.20, pontos: '', resultado: '', status: 'GAIN',
  });
  renderOpsDetalhada();
  // Scroll para o fim da tabela
  const tbody = document.getElementById('opsDetalhadaBody');
  tbody.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function collectOpsFromTable() {
  const rows = document.querySelectorAll('#opsDetalhadaBody tr');
  const result = [];
  rows.forEach(tr => {
    const g = name => tr.querySelector(`[name="${name}"]`)?.value;
    result.push({
      dia:         parseInt(g('dia'))      || 1,
      tipo:        g('tipo')               || 'COMPRA',
      ativo:       g('ativo')              || 'WIN',
      entrada:     num(g('entrada')),
      saida:       num(g('saida')),
      contratos:   parseInt(g('contratos'))|| 1,
      valor_ponto: num(g('valor_ponto')),
      pontos:      num(g('pontos')),
      resultado:   num(g('resultado')),
      status:      g('status')             || 'GAIN',
      month:       STATE.month,
    });
  });
  return result;
}

// ─── RELATÓRIOS ───────────────────────────────────
function renderRelatorios() {
  const ops = STATE.operacoes;
  const projecao = STATE.projecao;
  const banca = num(STATE.config.banca_inicial) || 0;

  const totalCustos  = projecao.reduce((a,d) => a + num(d.custo_op), 0);
  const totalImposto = projecao.reduce((a,d) => a + num(d.imposto_retido), 0);

  const gainsOps  = ops.filter(o => o.status === 'GAIN');
  const lossesOps = ops.filter(o => o.status === 'LOSS');
  const zerasOps  = ops.filter(o => o.status === 'ZERADA');

  const lucroBruto   = gainsOps.reduce((a,o)  => a + num(o.resultado), 0);
  const perdaBruta   = Math.abs(lossesOps.reduce((a,o) => a + num(o.resultado), 0));
  const prejuizoBruto= perdaBruta + totalCustos + totalImposto;
  const lucroLiquido = lucroBruto - prejuizoBruto;

  const ir = lucroBruto > 20000 ? (lucroBruto - 20000) * 0.20 : 0;
  const roi = banca > 0 ? ((lucroLiquido / banca) * 100) : 0;
  const fator = perdaBruta > 0 ? (lucroBruto / perdaBruta) : lucroBruto > 0 ? 999 : 0;
  const margem = lucroBruto > 0 ? (lucroLiquido / lucroBruto * 100) : 0;

  // Patrimônio máximo (capital acumulado dia a dia)
  let cap = banca; let peak = banca;
  projecao.forEach(d => {
    if (d.realizado !== null && d.realizado !== '') {
      cap += num(d.realizado) - num(d.custo_op) - num(d.imposto_retido);
      if (cap > peak) peak = cap;
    }
  });

  // Volatilidade (desvio padrão dos retornos diários)
  const retornos = projecao.filter(d => d.realizado !== null && d.realizado !== '')
                            .map(d => num(d.realizado));
  const media = retornos.length ? retornos.reduce((a,b)=>a+b,0)/retornos.length : 0;
  const variancia = retornos.length > 1
    ? retornos.reduce((a,r) => a + Math.pow(r - media, 2), 0) / (retornos.length - 1) : 0;
  const vol = Math.sqrt(variancia);

  // Drawdown
  let { ddValor, ddPct, ddTrade, ddTradePct } = calcDrawdown();

  // Máx contratos
  const maxContratos = ops.length ? Math.max(...ops.map(o => parseInt(o.contratos) || 0)) : 0;

  // Maior seq vencedora / perdedora
  const { maior_win, maior_loss } = calcSequencias(ops);

  const avgGain = gainsOps.length ? lucroBruto / gainsOps.length : 0;
  const avgLoss = lossesOps.length ? -perdaBruta / lossesOps.length : 0;
  const maiorWin = gainsOps.length ? Math.max(...gainsOps.map(o=>num(o.resultado))) : 0;
  const maiorLoss= lossesOps.length ? Math.min(...lossesOps.map(o=>num(o.resultado))) : 0;
  const avgAll   = ops.length ? (lucroBruto - perdaBruta) / ops.length : 0;

  const pctWin = (gainsOps.length + lossesOps.length) > 0
    ? (gainsOps.length / (gainsOps.length + lossesOps.length) * 100).toFixed(1) + '%' : '—';

  // Renderizar
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  set('totalCustosOperacionais',  brl(totalCustos));
  set('totalImpostoFonte',        brl(totalImposto));
  set('impostoRendaCalculado',    brl(ir));
  set('roiTotal',                 pct(roi));
  set('totalRealizado',           brl(lucroBruto));
  set('prejuizoBruto',            brl(prejuizoBruto));
  set('lucroLiquido',             brl(lucroLiquido));
  set('fatorLucro',               fator ? fator.toFixed(2) : '—');
  set('margemLiquida',            pct(margem));
  set('retornoCapitalInicial',    pct(roi));
  set('patrimonioMaximo',         brl(peak));
  set('volatilidade',             brl(vol));
  set('totalOperacoes',           ops.length);
  set('operacoesVencedoras',      gainsOps.length);
  set('operacoesPerdedoras',      lossesOps.length);
  set('operacoesZeradas',         zerasOps.length);
  set('pctOperacoesVencedoras',   pctWin);
  set('mediaLucroPrejuizo',       brl(avgAll));
  set('mediaOpsVencedoras',       brl(avgGain));
  set('maiorOpVencedora',         brl(maiorWin));
  set('mediaOpsPerdedoras',       brl(avgLoss));
  set('maiorOpPerdedora',         brl(maiorLoss));
  set('maiorSequenciaVencedora',  maior_win);
  set('maiorSequenciaPerdedora',  maior_loss);
  set('maxAcoesContratos',        maxContratos || '—');
  set('drawdownMaximoValor',      brl(ddValor));
  set('drawdownMaximoPct',        pct(ddPct));
  set('drawdownTradeValor',       brl(ddTrade));
  set('drawdownTradePct',         pct(ddTradePct));
}

function calcDrawdown() {
  const projecao = STATE.projecao;
  const banca = num(STATE.config.banca_inicial) || 0;

  let cap = banca; let peak = banca;
  let ddValor = 0; let ddPct = 0;

  projecao.forEach(d => {
    if (d.realizado !== null && d.realizado !== '') {
      cap += num(d.realizado) - num(d.custo_op) - num(d.imposto_retido);
      if (cap > peak) peak = cap;
      const dd = peak - cap;
      const ddP= peak > 0 ? (dd / peak * 100) : 0;
      if (dd > ddValor) { ddValor = dd; ddPct = ddP; }
    }
  });

  // Trade a trade
  const ops = STATE.operacoes;
  let runCap = banca; let runPeak = banca;
  let ddTrade = 0; let ddTradePct = 0;
  ops.forEach(o => {
    runCap += num(o.resultado);
    if (runCap > runPeak) runPeak = runCap;
    const dd = runPeak - runCap;
    const ddP = runPeak > 0 ? (dd / runPeak * 100) : 0;
    if (dd > ddTrade) { ddTrade = dd; ddTradePct = ddP; }
  });

  return { ddValor, ddPct, ddTrade, ddTradePct };
}

function calcSequencias(ops) {
  let cur_win = 0; let cur_loss = 0;
  let maior_win = 0; let maior_loss = 0;
  ops.forEach(o => {
    if (o.status === 'GAIN') {
      cur_win++; cur_loss = 0;
      if (cur_win > maior_win) maior_win = cur_win;
    } else if (o.status === 'LOSS') {
      cur_loss++; cur_win = 0;
      if (cur_loss > maior_loss) maior_loss = cur_loss;
    } else {
      cur_win = 0; cur_loss = 0;
    }
  });
  return { maior_win, maior_loss };
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
      <div class="entry-content">${entry.conteudo.replace(/</g,'&lt;')}</div>
      <div style="margin-top:8px;text-align:right">
        <button class="btn-delete diario-del" data-id="${entry.id}" style="font-size:10px;padding:3px 8px">Excluir</button>
      </div>
    `;
    div.querySelector('.diario-del').addEventListener('click', () => deleteDiarioEntry(entry.id));
    container.appendChild(div);
  });
}

async function saveDiario() {
  const texto = document.getElementById('plano_diario').value.trim();
  if (!texto) { setStatus('saveDiarioStatus', 'Digite algo antes de salvar.', 'err'); return; }
  setStatus('saveDiarioStatus', 'Salvando...');
  try {
    const entry = await API.post('/api/diario/', { month: STATE.month, conteudo: texto });
    STATE.diario.unshift(entry);
    document.getElementById('plano_diario').value = '';
    renderDiario();
    setStatus('saveDiarioStatus', '✓ Salvo!', 'ok');
  } catch (e) {
    setStatus('saveDiarioStatus', 'Erro ao salvar.', 'err');
  }
}

async function deleteDiarioEntry(id) {
  if (!confirm('Excluir esta anotação?')) return;
  try {
    await API.del(`/api/diario/${id}/`);
    STATE.diario = STATE.diario.filter(e => e.id !== id);
    renderDiario();
  } catch (e) {
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
      <input type="text" value="${r.texto.replace(/"/g,'&quot;')}" placeholder="Descreva a regra..." data-idx="${i}">
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

// ─── CHARTS ───────────────────────────────────────
const CHARTS = {};

function destroyChart(id) {
  if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; }
}

const CHART_DEFAULTS = {
  color: '#b8cfe0',
  borderColor: 'rgba(30,232,183,0.12)',
  grid: { color: 'rgba(255,255,255,0.04)' },
};

function renderCharts() {
  const banca  = num(STATE.config.banca_inicial) || 0;
  const meta   = num(STATE.config.objetivo_diario) || 0;
  const dias   = parseInt(STATE.config.dias_uteis) || 20;
  const labels = Array.from({ length: dias }, (_, i) => `D${i+1}`);

  // Projeção
  const projecaoData = labels.map((_, i) => banca + meta * (i + 1));

  // Realizado acumulado
  let cap = banca;
  const realizadoData = [];
  for (let d = 1; d <= dias; d++) {
    const pDia = STATE.projecao.find(p => p.dia === d);
    if (pDia && pDia.realizado !== null && pDia.realizado !== '') {
      cap += num(pDia.realizado) - num(pDia.custo_op) - num(pDia.imposto_retido);
      realizadoData.push(cap);
    } else {
      realizadoData.push(null);
    }
  }

  buildLineChart('chartBanca', labels, [
    { label: 'Projeção', data: projecaoData, borderColor: '#6c8cff', fill: false },
    { label: 'Realizado', data: realizadoData, borderColor: '#1ee8b7', fill: false, spanGaps: false },
  ]);

  buildLineChart('chartCapitalVsProjecao', labels, [
    { label: 'Projeção', data: projecaoData, borderColor: '#6c8cff', fill: false },
    { label: 'Capital Real', data: realizadoData, borderColor: '#1ee8b7', fill: false, spanGaps: false },
  ]);

  // Win rate evolution por dia
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
    pontosWinDia.push(dayOps.filter(o=>o.ativo==='WIN').reduce((a,o)=>a+num(o.pontos),0) || null);
    pontosWdoDia.push(dayOps.filter(o=>o.ativo==='WDO').reduce((a,o)=>a+num(o.pontos),0) || null);
  }
  buildBarChart('chartPontosDetalhados', labels, [
    { label: 'WIN (pts)', data: pontosWinDia, backgroundColor: 'rgba(30,232,183,0.5)' },
    { label: 'WDO (pts)', data: pontosWdoDia, backgroundColor: 'rgba(247,201,72,0.5)' },
  ]);

  // Drawdown acumulado
  let capDD = banca; let peakDD = banca;
  const ddData = [];
  for (let d = 1; d <= dias; d++) {
    const pDia = STATE.projecao.find(p => p.dia === d);
    if (pDia && pDia.realizado !== null && pDia.realizado !== '') {
      capDD += num(pDia.realizado) - num(pDia.custo_op) - num(pDia.imposto_retido);
      if (capDD > peakDD) peakDD = capDD;
      ddData.push(peakDD > 0 ? -((peakDD - capDD) / peakDD * 100) : 0);
    } else ddData.push(null);
  }
  buildLineChart('chartDrawdown', labels, [
    { label: 'Drawdown %', data: ddData, borderColor: '#ff4c6a', fill: true, backgroundColor: 'rgba(255,76,106,0.08)', spanGaps: false },
  ]);

  // Resultado financeiro por dia
  const resultDia = [];
  for (let d = 1; d <= dias; d++) {
    const dayOps = STATE.operacoes.filter(o => o.dia === d);
    resultDia.push(dayOps.length ? dayOps.reduce((a,o)=>a+num(o.resultado),0) : null);
  }
  buildBarChart('chartResultadoDetalhados', labels, [
    {
      label: 'Resultado R$',
      data: resultDia,
      backgroundColor: resultDia.map(v => v >= 0 ? 'rgba(34,217,135,0.5)' : 'rgba(255,76,106,0.5)'),
    },
  ]);

  // WIN Ganhos vs Perdas (pontos positivos/negativos separados)
  buildWinLossChart('chartWinGanhosPerdidos', 'WIN');
  buildWinLossChart('chartWdoGanhosPerdidos', 'WDO');

  // Gain vs Loss monetário total
  const gainTotal = STATE.operacoes.filter(o=>o.status==='GAIN').reduce((a,o)=>a+num(o.resultado),0);
  const lossTotal = Math.abs(STATE.operacoes.filter(o=>o.status==='LOSS').reduce((a,o)=>a+num(o.resultado),0));
  buildDoughnut('chartGainVsLoss', ['Ganhos', 'Perdas'], [gainTotal, lossTotal], ['rgba(34,217,135,0.7)', 'rgba(255,76,106,0.7)']);
}

function buildWinLossChart(canvasId, ativo) {
  const dias = parseInt(STATE.config.dias_uteis) || 20;
  const labels = Array.from({ length: dias }, (_, i) => `D${i+1}`);
  const ganhos = [], perdas = [];
  for (let d = 1; d <= dias; d++) {
    const dayOps = STATE.operacoes.filter(o => o.dia === d && o.ativo === ativo);
    ganhos.push(dayOps.filter(o=>num(o.pontos)>0).reduce((a,o)=>a+num(o.pontos),0) || null);
    perdas.push(dayOps.filter(o=>num(o.pontos)<0).reduce((a,o)=>a+num(o.pontos),0) || null);
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
    ds.tension = ds.tension ?? 0.3;
    ds.pointRadius = 3;
    ds.pointHoverRadius = 5;
    ds.borderWidth = ds.borderWidth ?? 2;
  });
  CHARTS[id] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: chartOptions(),
  });
}

function buildBarChart(id, labels, datasets) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  CHARTS[id] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: chartOptions(),
  });
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
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${brl(ctx.parsed)}`,
          },
        },
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
      x: {
        ticks: { color: '#3d5470', font: { family: 'Space Mono', size: 10 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
      },
      y: {
        ticks: { color: '#3d5470', font: { family: 'Space Mono', size: 10 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
      },
    },
  };
}

// ─── SALVAR ───────────────────────────────────────
async function saveConfig(statusId) {
  setStatus(statusId, 'Salvando...');
  try {
    const data = getConfigFromInputs();
    const result = await API.post('/api/config/upsert/', data);
    STATE.config = result;
    renderDashboard();
    renderProjecaoTable();
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
    const rows = document.querySelectorAll('#projecaoBody tr');
    const items = [];
    rows.forEach(tr => {
      const dia  = parseInt(tr.dataset.dia);
      const real = tr.querySelector('.proj-realizado')?.value;
      const custo= tr.querySelector('.proj-custo')?.value;
      const imp  = tr.querySelector('.proj-imposto')?.value;
      items.push({
        month: STATE.month,
        dia,
        realizado:     real !== '' ? num(real) : null,
        custo_op:      num(custo),
        imposto_retido:num(imp),
      });
    });
    const result = await API.post('/api/projecao/bulk/', items);
    STATE.projecao = result;
    renderDashboard();
    renderRelatorios();
    renderCharts();
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
    const ops = collectOpsFromTable();
    const result = await API.post('/api/operacoes/bulk-sync/', { month: STATE.month, operacoes: ops });
    STATE.operacoes = result;
    renderOpsDetalhada();
    renderOpsTable();
    renderDashboard();
    renderRelatorios();
    renderCharts();
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
  } catch (e) {
    setStatus('savePlanoStatus', 'Erro!', 'err');
  }
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
  const d = new Date();
  document.getElementById('currentDate').textContent =
    d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── EVENTOS ──────────────────────────────────────
// ─── MONITOR NEGATIVE VALUES ──────────────────────
function applyNegativeValueStyling() {
  // Helper to extract numeric value from text (handles R$, %, etc)
  const extractNumericValue = (text) => {
    // Remove currency, percentage, spaces
    let clean = text.trim().replace(/[R$%\s]/g, '');
    // Handle both . and , as decimal separators
    // If it has both . and ,, the last one is decimal
    if (clean.includes('.') && clean.includes(',')) {
      clean = clean.replace('.', '').replace(',', '.');
    } else if (clean.includes(',')) {
      clean = clean.replace(',', '.');
    }
    return parseFloat(clean);
  };

  // Helper to check if text is monetary (contains R$)
  const IsCurrency = (text) => {
    return text.includes('R$');
  };

  // Keywords that should ALWAYS be red (costs, losses, fees)
  const alwaysRedKeywords = [
    'CUSTO',           // costs
    'IMPOSTO',         // taxes
    'PREJUÍZO',        // loss/prejudice
    'PERDA',           // loss
    'TAXA',            // fee
    'RETIDO',          // withheld
  ];

  const isAlwaysRedField = (text) => {
    return alwaysRedKeywords.some(keyword => 
      text.toUpperCase().includes(keyword)
    );
  };

  // 1. Monitor number inputs (always treat as currency if in monetary context)
  document.querySelectorAll('input[type="number"]').forEach(input => {
    const val = parseFloat(input.value);
    if (!isNaN(val)) {
      if (val < 0) {
        input.classList.add('is-negative');
        input.classList.remove('is-positive-currency');
      } else if (val > 0) {
        // Check parent context - if it's a monetary field, make it green
        const parentText = input.parentElement?.textContent || '';
        const isCurrencyField = parentText.includes('R$') || 
                                input.classList.contains('cfg-input') ||
                                input.id?.includes('banca') ||
                                input.id?.includes('objetivo') ||
                                input.id?.includes('meta') ||
                                input.id?.includes('perda') ||
                                input.id?.includes('capital') ||
                                input.id?.includes('plano') ||
                                input.className?.includes('proj-realizado') ||
                                input.className?.includes('proj-custo') ||
                                input.className?.includes('proj-imposto');
        
        if (isCurrencyField) {
          input.classList.add('is-positive-currency');
          input.classList.remove('is-negative');
        } else {
          input.classList.remove('is-negative');
          input.classList.remove('is-positive-currency');
        }
      } else {
        // Zero values - no special color
        input.classList.remove('is-negative');
        input.classList.remove('is-positive-currency');
      }
    }
    // Add event listeners
    input.addEventListener('input', function() {
      const v = parseFloat(this.value);
      if (!isNaN(v)) {
        if (v < 0) {
          this.classList.add('is-negative');
          this.classList.remove('is-positive-currency');
        } else if (v > 0) {
          const parentText = this.parentElement?.textContent || '';
          const isCurrencyField = parentText.includes('R$') || 
                                  this.classList.contains('cfg-input') ||
                                  this.id?.includes('banca') ||
                                  this.id?.includes('objetivo') ||
                                  this.id?.includes('meta') ||
                                  this.id?.includes('perda') ||
                                  this.id?.includes('capital') ||
                                  this.id?.includes('plano') ||
                                  this.className?.includes('proj-realizado') ||
                                  this.className?.includes('proj-custo') ||
                                  this.className?.includes('proj-imposto');
          
          if (isCurrencyField) {
            this.classList.add('is-positive-currency');
            this.classList.remove('is-negative');
          } else {
            this.classList.remove('is-negative');
            this.classList.remove('is-positive-currency');
          }
        } else {
          this.classList.remove('is-negative');
          this.classList.remove('is-positive-currency');
        }
      }
    });
  });

  // 2. Monitor all text content in table cells, divs, spans
  document.querySelectorAll('td, div, span').forEach(el => {
    // Skip if it's an input or has children
    if (el.tagName === 'INPUT' || el.children.length > 0) return;
    
    const text = el.textContent.trim();
    if (!text) return;
    
    // Check if text looks like a number (contains digits and possibly - R$ %)
    if (/[-R$%\d,.]/.test(text) && /\d/.test(text)) {
      const val = extractNumericValue(text);
      const isCurrency = IsCurrency(text);
      
      // Check if this element or its parent is a cost/loss field
      const parentText = el.parentElement?.textContent || el.textContent;
      const isAlwaysRed = isAlwaysRedField(parentText);
      
      if (!isNaN(val)) {
        if (isAlwaysRed) {
          // Always red for costs, taxes, losses
          el.classList.add('is-negative');
          el.classList.remove('is-positive-currency');
        } else if (val < 0) {
          el.classList.add('is-negative');
          el.classList.remove('is-positive-currency');
        } else if (val > 0 && isCurrency) {
          // Positive currency = green
          el.classList.add('is-positive-currency');
          el.classList.remove('is-negative');
        } else {
          // Positive % or other values = white (default color)
          el.classList.remove('is-negative');
          el.classList.remove('is-positive-currency');
        }
      }
    }
  });
}

function initNegativeValueMonitoring() {
  // Initial pass
  applyNegativeValueStyling();
}

function bindEvents() {
  // Troca de mês
  document.getElementById('monthSelect').addEventListener('change', e => {
    STATE.month = e.target.value;
    loadAll(STATE.month);
  });

  // Config inputs — recalcula ao sair do campo
  ['cfg_banca_inicial','cfg_objetivo_diario','cfg_dias_uteis'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      STATE.config = { ...STATE.config, ...getConfigFromInputs() };
      renderDashboard();
      renderProjecaoTable();
      renderCharts();
    });
  });

  // Salvar projeção
  document.getElementById('saveProjecaoBtn')?.addEventListener('click', saveProjecao);

  // Salvar operações
  document.getElementById('saveOpsBtn')?.addEventListener('click', saveOperacoes);

  // Adicionar operação
  document.getElementById('addOpsDetalhadaRow')?.addEventListener('click', addNewOpsRow);

  // Salvar configurações de risco (relatórios)
  document.getElementById('saveRelatoriosBtn')?.addEventListener('click', () => saveConfig('saveRelatoriosStatus'));

  // Salvar plano
  document.getElementById('savePlanoBtn')?.addEventListener('click', savePlano);

  // Diário
  document.getElementById('saveDiarioButton')?.addEventListener('click', saveDiario);
  document.getElementById('plano_diario')?.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'Enter') saveDiario();
  });

  // Regras
  document.getElementById('addRegraButton')?.addEventListener('click', addRegra);
}

// ─── INIT ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setCurrentDate();
  buildMonthSelector();
  initTabs();
  initNegativeValueMonitoring();
  bindEvents();
  loadAll(STATE.month);
});
