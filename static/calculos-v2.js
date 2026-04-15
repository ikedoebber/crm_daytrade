'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// CACHE E UTILIDADES INTERNAS
// ═══════════════════════════════════════════════════════════════════════════

const CACHE = {
  lastUpdate: 0,
  operacoesPorStatus: null,
  operacoesPorAtivo: null,
  operacoesPorDia: null,
  lucroBruto: null,
  perdaBruta: null,
};

function _invalidateCache() {
  CACHE.lastUpdate = Date.now();
  CACHE.operacoesPorStatus = null;
  CACHE.operacoesPorAtivo = null;
  CACHE.operacoesPorDia = null;
  CACHE.lucroBruto = null;
  CACHE.perdaBruta = null;
}

/**
 * Converte valor para número seguramente.
 */
function _toNumber(v, fallback = 0) {
  const n = Number(v);
  return isNaN(n) || !isFinite(n) ? fallback : n;
}

/**
 * Valida se é um número válido.
 */
function _isValidNumber(v) {
  const n = Number(v);
  return !isNaN(n) && isFinite(n);
}

/**
 * Lê elemento do DOM e retorna como número.
 */
function _inputNum(id, fallback = 0, parser = parseFloat) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  const v = parser(el.value);
  return isNaN(v) ? fallback : v;
}

/**
 * Atualiza elemento DOM com segurança.
 */
function _setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMATADORES
// ═══════════════════════════════════════════════════════════════════════════

const fmt = {
  brl(v) {
    if (v === null || v === undefined || v === '') return '—';
    const n = _toNumber(v);
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  pct(v, decimals = 1) {
    if (!_isValidNumber(v)) return '—';
    const n = _toNumber(v);
    return n.toFixed(decimals).replace('.', ',') + '%';
  },

  num(v) {
    if (v == null || !_isValidNumber(v)) return '—';
    const n = _toNumber(v);
    return n.toFixed(2).replace('.', ',');
  },

  custom(v, decimals = 2) {
    if (v == null || !_isValidNumber(v)) return '—';
    const n = _toNumber(v);
    return n.toFixed(decimals).replace('.', ',');
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÕES DE AGREGAÇÃO COM CACHE
// ═══════════════════════════════════════════════════════════════════════════

const agg = {
  /**
   * Contabiliza operações por status com cache.
   */
  contarPorStatus() {
    if (CACHE.operacoesPorStatus) return CACHE.operacoesPorStatus;
    
    const ops = STATE.operacoes ?? [];
    CACHE.operacoesPorStatus = {
      ganhos: ops.filter(o => o.status === 'GAIN').length,
      perdas: ops.filter(o => o.status === 'LOSS').length,
      zeradas: ops.filter(o => o.status === 'ZERADA').length,
    };
    return CACHE.operacoesPorStatus;
  },

  /**
   * Agrupa operações por ativo com cache.
   */
  agruparPorAtivo() {
    if (CACHE.operacoesPorAtivo) return CACHE.operacoesPorAtivo;
    
    const ops = STATE.operacoes ?? [];
    CACHE.operacoesPorAtivo = ops.reduce((acc, o) => {
      if (!acc[o.ativo]) acc[o.ativo] = [];
      acc[o.ativo].push(o);
      return acc;
    }, {});
    return CACHE.operacoesPorAtivo;
  },

  /**
   * Agrupa operações por dia com cache.
   */
  agruparPorDia() {
    if (CACHE.operacoesPorDia) return CACHE.operacoesPorDia;
    
    const ops = STATE.operacoes ?? [];
    CACHE.operacoesPorDia = ops.reduce((acc, o) => {
      if (!acc[o.dia]) acc[o.dia] = [];
      acc[o.dia].push(o);
      return acc;
    }, {});
    return CACHE.operacoesPorDia;
  },

  /**
   * Calcula lucro bruto une com cache.
   */
  lucroBruto() {
    if (CACHE.lucroBruto !== null) return CACHE.lucroBruto;
    
    const ops = STATE.operacoes ?? [];
    CACHE.lucroBruto = ops
      .filter(o => o.status === 'GAIN')
      .reduce((sum, o) => sum + _toNumber(o.resultado), 0);
    return CACHE.lucroBruto;
  },

  /**
   * Calcula perda bruta com cache.
   */
  perdaBruta() {
    if (CACHE.perdaBruta !== null) return CACHE.perdaBruta;
    
    const ops = STATE.operacoes ?? [];
    CACHE.perdaBruta = ops
      .filter(o => o.status === 'LOSS')
      .reduce((sum, o) => sum + Math.abs(_toNumber(o.resultado)), 0);
    return CACHE.perdaBruta;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// GETTERS DE CONFIGURAÇÃO (compatibilidade)
// ═══════════════════════════════════════════════════════════════════════════

const get = {
  // — Configurações —
  banca_inicial:               () => _inputNum('cfg_banca_inicial'),
  objetivo_diario:             () => _inputNum('cfg_objetivo_diario'),
  dias_uteis:                  () => _inputNum('cfg_dias_uteis', 20, parseInt),
  plano_meta_aprovacao:        () => _inputNum('cfg_plano_meta_aprovacao'),
  plano_perda_max_total:       () => _inputNum('cfg_plano_perda_max_total'),
  plano_perda_diaria_aprovacao:() => _inputNum('cfg_plano_perda_diaria_aprovacao'),
  plano_capital:               () => _inputNum('cfg_plano_capital'),
  plano_meta:                  () => _inputNum('cfg_plano_meta'),
  plano_maxentradas:           () => _inputNum('cfg_plano_maxentradas', 0, parseInt),
  plano_stop:                  () => _inputNum('cfg_plano_stop'),

  // — Contagem de operações —
  ganhos:  () => agg.contarPorStatus().ganhos,
  perdas:  () => agg.contarPorStatus().perdas,
  zeradas: () => agg.contarPorStatus().zeradas,

  // — Resultado total —
  resultado_total: () =>
    (STATE.operacoes ?? []).reduce((sum, o) => sum + _toNumber(o.resultado), 0),

  // — Projeção (não usam cache, são frequentemente alterados) —
  custos_totais:   () => (STATE.projecao ?? []).reduce((sum, p) => sum + _toNumber(p.custo_op), 0),
  impostos_totais: () => (STATE.projecao ?? []).reduce((sum, p) => sum + _toNumber(p.imposto_retido), 0),
  realizado_total: () => (STATE.projecao ?? []).reduce((sum, p) => sum + _toNumber(p.realizado), 0),

  // — Pontos por ativo —
  pontos_win: () => {
    const ops = STATE.operacoes ?? [];
    return ops
      .filter(o => o.ativo === 'WIN')
      .reduce((sum, o) => sum + _toNumber(o.pontos), 0);
  },

  pontos_wdo: () => {
    const ops = STATE.operacoes ?? [];
    return ops
      .filter(o => o.ativo === 'WDO')
      .reduce((sum, o) => sum + _toNumber(o.pontos), 0);
  },

  // — Dias operados —
  dias_feitos: () =>
    (STATE.projecao ?? [])
      .filter(d => d.realizado !== null && d.realizado !== '' && d.realizado !== '0')
      .length,
};

// ═══════════════════════════════════════════════════════════════════════════
// CALCULADORES POR DOMÍNIO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cálculos de P&L (Resultado Financeiro)
 */
const calcPnL = {
  lucroBruto()      { return agg.lucroBruto(); },
  perdaBruta()      { return agg.perdaBruta(); },
  totalDeducoes()   { return -(get.custos_totais() + get.impostos_totais()); },
  
  lucroLiquido() {
    return this.lucroBruto() 
      - this.perdaBruta() 
      - get.custos_totais() 
      - get.impostos_totais();
  },

  capitalFinal() {
    return get.banca_inicial() + this.lucroLiquido();
  },

  capitalAtual() {
    // Capital Atual = Banca Inicial + Lucro Líquido
    // Lucro Líquido = GAIN - LOSS - Custos - Impostos
    return get.banca_inicial() + this.lucroLiquido();
  },

  prejuizoBruto() { return this.perdaBruta(); },
};

/**
 * Cálculos de Performance e Índices
 */
const calcPerformance = {
  roi() {
    const capital = get.banca_inicial();
    return capital !== 0 ? (calcPnL.lucroLiquido() / capital) * 100 : 0;
  },

  margemLiquida() {
    const resultado = calcPnL.lucroBruto() - calcPnL.perdaBruta();
    return resultado !== 0 ? (calcPnL.lucroLiquido() / resultado) * 100 : 0;
  },

  fatorLucro() {
    const perda = calcPnL.perdaBruta();
    if (perda === 0) return calcPnL.lucroBruto() > 0 ? 999 : 0;
    return calcPnL.lucroBruto() / perda;
  },

  winRate() {
    const ganhos = get.ganhos();
    const total = ganhos + get.perdas();
    return total !== 0 ? (ganhos / total) * 100 : 0;
  },

  mediaResultado() {
    const total = STATE.operacoes?.length ?? 0;
    return total !== 0 ? (calcPnL.lucroBruto() - calcPnL.perdaBruta()) / total : 0;
  },

  mediaGain() {
    const gains = get.ganhos();
    return gains !== 0 ? calcPnL.lucroBruto() / gains : 0;
  },

  mediaLoss() {
    const losses = get.perdas();
    return losses !== 0 ? -calcPnL.perdaBruta() / losses : 0;
  },

  maiorGain() {
    const gains = (STATE.operacoes ?? []).filter(o => o.status === 'GAIN');
    return gains.length ? Math.max(...gains.map(o => _toNumber(o.resultado))) : 0;
  },

  maiorLoss() {
    const losses = (STATE.operacoes ?? []).filter(o => o.status === 'LOSS');
    return losses.length ? Math.min(...losses.map(o => _toNumber(o.resultado))) : 0;
  },

  maxContratos() {
    const ops = STATE.operacoes ?? [];
    return ops.length ? Math.max(...ops.map(o => parseInt(o.contratos) || 0)) : 0;
  },

  opsPerDia() {
    const dias = get.dias_feitos();
    return dias !== 0 ? (STATE.operacoes?.length ?? 0) / dias : 0;
  },

  maxOpsPerDia() {
    if (!STATE.operacoes?.length) return 0;
    const contagem = agg.agruparPorDia();
    const counts = Object.values(contagem).map(ops => ops.length);
    return Math.max(...counts);
  },

  volatilidade() {
    const retornos = (STATE.projecao ?? [])
      .filter(d => d.realizado !== null && d.realizado !== '')
      .map(d => _toNumber(d.realizado));

    if (retornos.length < 2) return 0;

    const media = retornos.reduce((a, b) => a + b, 0) / retornos.length;
    const variancia = retornos.reduce((a, r) => a + Math.pow(r - media, 2), 0) / (retornos.length - 1);
    return Math.sqrt(variancia);
  },
};

/**
 * Cálculos de Risco e Gestão de Patrimônio
 */
const calcRisco = {
  riscRetorno() {
    const meta = get.plano_meta_aprovacao();
    const perdaMax = get.plano_perda_max_total();
    return meta !== 0 && perdaMax !== 0 ? Math.abs(meta / perdaMax) : 0;
  },

  drawdownDiario() {
    return this._calcDrawdown(STATE.projecao ?? [], true);
  },

  drawdownTrade() {
    return this._calcDrawdown(STATE.operacoes ?? [], false);
  },

  _calcDrawdown(items, isProjecao) {
    let cap = get.banca_inicial();
    let peak = cap;
    let ddValor = 0;
    let ddPct = 0;

    for (const item of items) {
      if (isProjecao) {
        if (item.realizado === null || item.realizado === '') continue;
        cap += _toNumber(item.realizado) - _toNumber(item.custo_op) - _toNumber(item.imposto_retido);
      } else {
        cap += _toNumber(item.resultado);
      }

      if (cap > peak) peak = cap;
      const dd = peak - cap;
      const ddP = peak > 0 ? (dd / peak) * 100 : 0;
      if (dd > ddValor) { ddValor = dd; ddPct = ddP; }
    }

    return { valor: ddValor, pct: ddPct };
  },

  patrimonioMaximo() {
    let cap = get.banca_inicial();
    let peak = cap;
    for (const d of STATE.projecao ?? []) {
      if (d.realizado === null || d.realizado === '') continue;
      cap += _toNumber(d.realizado) - _toNumber(d.custo_op) - _toNumber(d.imposto_retido);
      if (cap > peak) peak = cap;
    }
    return peak;
  },

  sequencias() {
    let curWin = 0, curLoss = 0;
    let maiorWin = 0, maiorLoss = 0;

    for (const o of STATE.operacoes ?? []) {
      if (o.status === 'GAIN') {
        curWin++;
        curLoss = 0;
        if (curWin > maiorWin) maiorWin = curWin;
      } else if (o.status === 'LOSS') {
        curLoss++;
        curWin = 0;
        if (curLoss > maiorLoss) maiorLoss = curLoss;
      } else {
        curWin = 0;
        curLoss = 0;
      }
    }

    return { maiorWin, maiorLoss };
  },
};

/**
 * Cálculos de Planejamento
 */
const calcPlano = {
  lucroEsperado() {
    return get.objetivo_diario() * get.dias_uteis();
  },

  retornoEsperado() {
    const capital = get.banca_inicial();
    return capital !== 0 ? (this.lucroEsperado() / capital) * 100 : 0;
  },

  bancaFinal() {
    return get.banca_inicial() + this.lucroEsperado();
  },

  pctAprovacao() {
    const diasUteis = get.dias_uteis();
    return diasUteis !== 0 ? (get.dias_feitos() / diasUteis) * 100 : 0;
  },

  impostoRenda() {
    // IR: 15% sobre ganhos (não sobre projeção)
    const lucro = calcPnL.lucroBruto();
    return lucro > 0 ? lucro * 0.15 : 0;
  },

  lucroAposIR() {
    return calcPnL.lucroLiquido() - this.impostoRenda();
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACE COMPATÍVEL (mantém nomes originais)
// ═══════════════════════════════════════════════════════════════════════════

const calc = {
  // P&L
  lucroBruto:       () => calcPnL.lucroBruto(),
  perdaBruta:       () => calcPnL.perdaBruta(),
  totalDeducoes:    () => calcPnL.totalDeducoes(),
  lucroLiquido:     () => calcPnL.lucroLiquido(),
  capitalFinal:     () => calcPnL.capitalFinal(),
  capitalAtual:     () => calcPnL.capitalAtual(),
  prejuizoBruto:    () => calcPnL.prejuizoBruto(),

  // Performance
  roi:              () => calcPerformance.roi(),
  margemLiquida:    () => calcPerformance.margemLiquida(),
  fatorLucro:       () => calcPerformance.fatorLucro(),
  winRate:          () => calcPerformance.winRate(),
  mediaResultado:   () => calcPerformance.mediaResultado(),
  mediaGain:        () => calcPerformance.mediaGain(),
  mediaLoss:        () => calcPerformance.mediaLoss(),
  maiorGain:        () => calcPerformance.maiorGain(),
  maiorLoss:        () => calcPerformance.maiorLoss(),
  maxContratos:     () => calcPerformance.maxContratos(),
  opsPerDia:        () => calcPerformance.opsPerDia(),
  maxOpsPerDia:     () => calcPerformance.maxOpsPerDia(),
  volatilidade:     () => calcPerformance.volatilidade(),

  // Risco
  riscRetorno:      () => calcRisco.riscRetorno(),
  drawdownDiario:   () => calcRisco.drawdownDiario(),
  drawdownTrade:    () => calcRisco.drawdownTrade(),
  patrimonioMaximo: () => calcRisco.patrimonioMaximo(),
  sequencias:       () => calcRisco.sequencias(),

  // Planejamento
  lucroEsperado:    () => calcPlano.lucroEsperado(),
  retornoEsperado:  () => calcPlano.retornoEsperado(),
  bancaFinal:       () => calcPlano.bancaFinal(),
  pctAprovacao:     () => calcPlano.pctAprovacao(),
  impostoRenda:     () => calcPlano.impostoRenda(),
};

// ═══════════════════════════════════════════════════════════════════════════
// RENDERIZAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

function atualizarCampos() {
  const dd = calc.drawdownDiario();
  const ddTrade = calc.drawdownTrade();
  const seq = calc.sequencias();
  const ir = calc.impostoRenda();

  // — Financeiros —
  _setText('totalDeducoes', fmt.brl(calc.totalDeducoes()));
  _setText('lucroLiquido', fmt.brl(calc.lucroLiquido()));
  _setText('bancaFinal', fmt.brl(calc.bancaFinal()));
  _setText('planoBancaFinal', fmt.brl(calc.bancaFinal()));
  _setText('capitalAtualDisp', fmt.brl(calc.capitalAtual()));
  _setText('lucroEsperado', fmt.brl(calc.lucroEsperado()));
  _setText('totalRealizado', fmt.brl(calc.lucroBruto()));
  _setText('prejuizoBruto', fmt.brl(calc.prejuizoBruto()));
  _setText('totalCustosOperacionais', fmt.brl(get.custos_totais()));
  _setText('totalImpostoFonte', fmt.brl(get.impostos_totais()));
  _setText('patrimonioMaximo', fmt.brl(calc.patrimonioMaximo()));
  _setText('volatilidade', fmt.brl(calc.volatilidade()));
  _setText('totalResultadoDetalhado', fmt.brl(calc.lucroBruto() - calc.perdaBruta()));
  _setText('impostoRendaEstimado', fmt.brl(ir));

  // — Médias e extremos —
  _setText('mediaLucroPrejuizo', fmt.brl(calc.mediaResultado()));
  _setText('mediaOpsVencedoras', fmt.brl(calc.mediaGain()));
  _setText('maiorOpVencedora', fmt.brl(calc.maiorGain()));
  _setText('mediaOpsPerdedoras', fmt.brl(calc.mediaLoss()));
  _setText('maiorOpPerdedora', fmt.brl(calc.maiorLoss()));
  _setText('maxAcoesContratos', calc.maxContratos() || '—');

  // — Percentuais —
  _setText('roi', fmt.pct(calc.roi()));
  _setText('roiTotal', fmt.pct(calc.roi()));
  _setText('margemLiquida', fmt.pct(calc.margemLiquida()));
  _setText('winRateCalc', fmt.pct(calc.winRate()));
  _setText('pctAprovacao', fmt.pct(calc.pctAprovacao()));
  _setText('retornoEsperado', fmt.pct(calc.retornoEsperado()));
  _setText('retornoCapitalInicial', fmt.pct(calc.roi()));
  _setText('fatorLucro', calc.fatorLucro() ? calc.fatorLucro().toFixed(2) : '—');
  _setText('pctOperacoesVencedoras', fmt.pct(calc.winRate()));

  // — Contagens —
  _setText('riskRetorno', calc.riscRetorno().toFixed(2) + ':1');
  _setText('mediaOpsDiaria', calc.opsPerDia().toFixed(1));
  _setText('mediaOpsPorDia', calc.opsPerDia().toFixed(1));
  _setText('maxOpsDiaria', calc.maxOpsPerDia().toString());
  _setText('maxOpsPorDia', calc.maxOpsPerDia().toString());
  _setText('totalOperacoes', (STATE.operacoes?.length ?? 0).toString());
  _setText('operacoesVencedoras', get.ganhos().toString());
  _setText('operacoesPerdedoras', get.perdas().toString());
  _setText('operacoesZeradas', get.zeradas().toString());
  _setText('totalPontosWIN', get.pontos_win().toFixed(0));
  _setText('totalPontosWDO', get.pontos_wdo().toFixed(0));

  // — Drawdown —
  _setText('drawdownMaximoValor', fmt.brl(dd.valor));
  _setText('drawdownMaximoPct', fmt.pct(dd.pct));
  _setText('drawdownTradeValor', fmt.brl(ddTrade.valor));
  _setText('drawdownTradePct', fmt.pct(ddTrade.pct));

  // — Sequências —
  _setText('maiorSequenciaVencedora', seq.maiorWin.toString());
  _setText('maiorSequenciaPerdedora', seq.maiorLoss.toString());
}

function initCalculos() {
  atualizarCampos();
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    calc, fmt, get, 
    atualizarCampos, initCalculos,
    // Internos para testes
    calcPnL, calcPerformance, calcRisco, calcPlano,
    agg, _invalidateCache,
  };
}
