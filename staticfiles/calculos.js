/* ================================================
   CALCULOS.JS — Cálculos e Fórmulas
   Única fonte de verdade para toda lógica numérica.
   planilha.js consome este módulo; não repete cálculos.
   ================================================ */

'use strict';

// ─── UTILITÁRIOS INTERNOS ──────────────────────────

/**
 * Lê um elemento do DOM pelo ID e retorna seu valor como número.
 * Retorna `fallback` se o elemento não existir ou o valor for inválido.
 */
function _inputNum(id, fallback = 0, parser = parseFloat) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  const v = parser(el.value);
  return isNaN(v) ? fallback : v;
}

/**
 * Atualiza o textContent de um elemento do DOM de forma segura.
 */
function _setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ─── FORMATADORES ──────────────────────────────────

const fmt = {
  /**
   * Formata um número como moeda BRL.
   * Retorna '—' para valores nulos/inválidos (sem prefixo R$).
   */
  brl(v) {
    if (v === null || v === undefined || v === '') return '—';
    const n = parseFloat(v);
    if (isNaN(n)) return '—';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  /**
   * Formata um número como percentual.
   * Exemplo: 12.345 → "12,3%"
   */
  pct(v, decimals = 1) {
    const n = parseFloat(v);
    if (isNaN(n)) return '—';
    return n.toFixed(decimals).replace('.', ',') + '%';
  },

  /**
   * Formata um número com 2 casas decimais.
   */
  num(v) {
    if (v == null || isNaN(v)) return '—';
    return v.toFixed(2).replace('.', ',');
  },
};

// ─── GETTERS ─────────────────────────────────────────

/**
 * Leitores de configuração (campos do formulário) e de estado (STATE global).
 * Cada getter é uma função pura que nunca lança exceção — retorna 0 se inválido.
 * STATE deve estar definido globalmente em planilha.js.
 */
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

  // — Contagem de operações por status —
  ganhos:  () => STATE.operacoes?.filter(o => o.status === 'GAIN').length   ?? 0,
  perdas:  () => STATE.operacoes?.filter(o => o.status === 'LOSS').length   ?? 0,
  zeradas: () => STATE.operacoes?.filter(o => o.status === 'ZERADA').length ?? 0,

  /** Soma de resultados de todas as operações (positivos e negativos). */
  resultado_total: () =>
    STATE.operacoes?.reduce((a, o) => a + (+o.resultado || 0), 0) ?? 0,

  // — Projeção —
  custos_totais:   () => STATE.projecao?.reduce((a, p) => a + (+p.custo_op       || 0), 0) ?? 0,
  impostos_totais: () => STATE.projecao?.reduce((a, p) => a + (+p.imposto_retido || 0), 0) ?? 0,
  realizado_total: () => STATE.projecao?.reduce((a, p) => a + (+p.realizado      || 0), 0) ?? 0,

  // — Pontos por ativo —
  pontos_win: () => STATE.operacoes?.filter(o => o.ativo === 'WIN')
                      .reduce((a, o) => a + (+o.pontos || 0), 0) ?? 0,
  pontos_wdo: () => STATE.operacoes?.filter(o => o.ativo === 'WDO')
                      .reduce((a, o) => a + (+o.pontos || 0), 0) ?? 0,

  // — Dias já operados —
  dias_feitos: () =>
    STATE.projecao?.filter(d => d.realizado !== null && d.realizado !== '').length ?? 0,
};

// ─── CÁLCULOS PRINCIPAIS ────────────────────────────

const calc = {

  // ── Resultados Financeiros ──────────────────────────

  /**
   * Lucro bruto: soma apenas das operações vencedoras (GAIN).
   * Sempre ≥ 0.
   */
  lucroBruto() {
    return STATE.operacoes
      ?.filter(o => o.status === 'GAIN')
      .reduce((a, o) => a + (+o.resultado || 0), 0) ?? 0;
  },

  /**
   * Perda bruta: valor absoluto das operações perdedoras (LOSS).
   * Sempre ≥ 0.
   */
  perdaBruta() {
    return Math.abs(
      STATE.operacoes
        ?.filter(o => o.status === 'LOSS')
        .reduce((a, o) => a + (+o.resultado || 0), 0) ?? 0
    );
  },

  /**
   * Total de deduções operacionais (custos + impostos).
   * Retorna valor negativo para facilitar somas.
   */
  totalDeducoes() {
    return -(get.custos_totais() + get.impostos_totais());
  },

  /**
   * Lucro Líquido = Resultado bruto das ops − Custos − Impostos.
   *
   * CORREÇÃO DE BUG (versão anterior):
   *   Antes: lucroBruto descontava custos/impostos E lucroLiquido subtraía
   *          prejuizoBruto (que já incluía custos/impostos) → dupla dedução.
   *   Agora: cálculo direto e único, sem risco de dedução dupla.
   */
  lucroLiquido() {
    return get.resultado_total() + calc.totalDeducoes();
  },

  /**
   * Capital Final = Banca Inicial + Lucro Líquido.
   */
  capitalFinal() {
    return get.banca_inicial() + calc.lucroLiquido();
  },

  /**
   * Capital atual acumulando apenas os dias já realizados na projeção.
   * Prioriza STATE.capital_atual.capital_final quando disponível (vem do backend).
   */
  capitalAtual() {
    if (
      typeof STATE !== 'undefined' &&
      STATE.capital_atual &&
      STATE.capital_atual.capital_final !== undefined
    ) {
      return STATE.capital_atual.capital_final;
    }
    // Fallback: recalcula localmente a partir da projeção
    return (STATE.projecao ?? []).reduce((capital, d) => {
      if (d.realizado === null || d.realizado === '') return capital;
      return capital + (+d.realizado || 0) - (+d.custo_op || 0) - (+d.imposto_retido || 0);
    }, get.banca_inicial());
  },

  // ── Métricas de Performance ─────────────────────────

  /**
   * ROI = (Lucro Líquido / Capital Inicial) × 100.
   */
  roi() {
    const capital = get.banca_inicial();
    return capital !== 0 ? (calc.lucroLiquido() / capital) * 100 : 0;
  },

  /**
   * Margem Líquida = (Lucro Líquido / Resultado Bruto) × 100.
   * Representa quanto do resultado bruto se converte em lucro real.
   */
  margemLiquida() {
    const resultado = get.resultado_total();
    return resultado !== 0 ? (calc.lucroLiquido() / resultado) * 100 : 0;
  },

  /**
   * Fator de Lucro = Lucro Bruto / Perda Bruta.
   * Retorna Infinity (representado como 999) quando não há perdas.
   */
  fatorLucro() {
    const perda = calc.perdaBruta();
    if (perda === 0) return calc.lucroBruto() > 0 ? 999 : 0;
    return calc.lucroBruto() / perda;
  },

  /**
   * Win Rate = Ganhos / (Ganhos + Perdas) × 100.
   * Zeradas não entram no cálculo.
   */
  winRate() {
    const ganhos = get.ganhos();
    const total  = ganhos + get.perdas();
    return total !== 0 ? (ganhos / total) * 100 : 0;
  },

  /**
   * Razão Retorno/Risco = Meta de Aprovação / Perda Máxima Total.
   */
  riscRetorno() {
    const meta     = get.plano_meta_aprovacao();
    const perdaMax = get.plano_perda_max_total();
    return meta !== 0 && perdaMax !== 0 ? Math.abs(meta / perdaMax) : 0;
  },

  /**
   * Lucro esperado para o período = Objetivo Diário × Dias Úteis.
   */
  lucroEsperado() {
    return get.objetivo_diario() * get.dias_uteis();
  },

  /**
   * Retorno esperado sobre o capital inicial (%).
   */
  retornoEsperado() {
    const capital = get.banca_inicial();
    return capital !== 0 ? (calc.lucroEsperado() / capital) * 100 : 0;
  },

  /**
   * Capital esperado no final do período.
   */
  bancaFinal() {
    return get.banca_inicial() + calc.lucroEsperado();
  },

  /**
   * Percentual de dias úteis já operados em relação ao total previsto.
   */
  pctAprovacao() {
    const diasUteis = get.dias_uteis();
    return diasUteis !== 0 ? (get.dias_feitos() / diasUteis) * 100 : 0;
  },

  // ── Médias e Extremos por Operação ─────────────────

  /** Resultado médio de todas as operações (positivas e negativas). */
  mediaResultado() {
    const total = STATE.operacoes?.length ?? 0;
    return total !== 0 ? (calc.lucroBruto() - calc.perdaBruta()) / total : 0;
  },

  /** Resultado médio das operações vencedoras. */
  mediaGain() {
    const gains = get.ganhos();
    return gains !== 0 ? calc.lucroBruto() / gains : 0;
  },

  /** Resultado médio das operações perdedoras (negativo). */
  mediaLoss() {
    const losses = get.perdas();
    return losses !== 0 ? -calc.perdaBruta() / losses : 0;
  },

  /** Maior resultado individual positivo (GAIN). */
  maiorGain() {
    const gains = STATE.operacoes?.filter(o => o.status === 'GAIN') ?? [];
    return gains.length ? Math.max(...gains.map(o => +o.resultado || 0)) : 0;
  },

  /** Pior resultado individual (LOSS), retorna valor negativo. */
  maiorLoss() {
    const losses = STATE.operacoes?.filter(o => o.status === 'LOSS') ?? [];
    return losses.length ? Math.min(...losses.map(o => +o.resultado || 0)) : 0;
  },

  /** Maior número de contratos usado em uma única operação. */
  maxContratos() {
    const ops = STATE.operacoes ?? [];
    return ops.length ? Math.max(...ops.map(o => parseInt(o.contratos) || 0)) : 0;
  },

  // ── Distribuição por Dia ───────────────────────────

  /** Média de operações por dia útil operado. */
  opsPerDia() {
    const dias = get.dias_feitos();
    return dias !== 0 ? (STATE.operacoes?.length ?? 0) / dias : 0;
  },

  /** Maior número de operações feitas em um único dia. */
  maxOpsPerDia() {
    if (!STATE.operacoes?.length) return 0;
    const contagem = STATE.operacoes.reduce((acc, o) => {
      acc[o.dia] = (acc[o.dia] ?? 0) + 1;
      return acc;
    }, {});
    return Math.max(...Object.values(contagem));
  },

  // ── Drawdown ────────────────────────────────────────

  /**
   * Drawdown máximo calculado dia a dia a partir da projeção.
   * Retorna { valor, pct } — valores sempre positivos.
   */
  drawdownDiario() {
    let cap  = get.banca_inicial();
    let peak = cap;
    let ddValor = 0;
    let ddPct   = 0;

    for (const d of STATE.projecao ?? []) {
      if (d.realizado === null || d.realizado === '') continue;
      cap += (+d.realizado || 0) - (+d.custo_op || 0) - (+d.imposto_retido || 0);
      if (cap > peak) peak = cap;
      const dd  = peak - cap;
      const ddP = peak > 0 ? (dd / peak) * 100 : 0;
      if (dd > ddValor) { ddValor = dd; ddPct = ddP; }
    }

    return { valor: ddValor, pct: ddPct };
  },

  /**
   * Drawdown máximo calculado trade a trade (operação por operação).
   * Retorna { valor, pct } — valores sempre positivos.
   */
  drawdownTrade() {
    let cap  = get.banca_inicial();
    let peak = cap;
    let ddValor = 0;
    let ddPct   = 0;

    for (const o of STATE.operacoes ?? []) {
      cap += (+o.resultado || 0);
      if (cap > peak) peak = cap;
      const dd  = peak - cap;
      const ddP = peak > 0 ? (dd / peak) * 100 : 0;
      if (dd > ddValor) { ddValor = dd; ddPct = ddP; }
    }

    return { valor: ddValor, pct: ddPct };
  },

  // ── Pico de Patrimônio ──────────────────────────────

  /**
   * Maior capital acumulado atingido ao longo do período (dia a dia).
   */
  patrimonioMaximo() {
    let cap  = get.banca_inicial();
    let peak = cap;
    for (const d of STATE.projecao ?? []) {
      if (d.realizado === null || d.realizado === '') continue;
      cap += (+d.realizado || 0) - (+d.custo_op || 0) - (+d.imposto_retido || 0);
      if (cap > peak) peak = cap;
    }
    return peak;
  },

  // ── Volatilidade ───────────────────────────────────

  /**
   * Desvio padrão amostral dos resultados diários realizados.
   */
  volatilidade() {
    const retornos = (STATE.projecao ?? [])
      .filter(d => d.realizado !== null && d.realizado !== '')
      .map(d => +d.realizado || 0);

    if (retornos.length < 2) return 0;

    const media    = retornos.reduce((a, b) => a + b, 0) / retornos.length;
    const variancia = retornos.reduce((a, r) => a + Math.pow(r - media, 2), 0) / (retornos.length - 1);
    return Math.sqrt(variancia);
  },

  // ── Sequências ─────────────────────────────────────

  /**
   * Maior sequência consecutiva de GAIN e de LOSS.
   * Retorna { maiorWin, maiorLoss }.
   */
  sequencias() {
    let curWin = 0; let curLoss = 0;
    let maiorWin = 0; let maiorLoss = 0;

    for (const o of STATE.operacoes ?? []) {
      if (o.status === 'GAIN') {
        curWin++;  curLoss = 0;
        if (curWin  > maiorWin)  maiorWin  = curWin;
      } else if (o.status === 'LOSS') {
        curLoss++; curWin  = 0;
        if (curLoss > maiorLoss) maiorLoss = curLoss;
      } else {
        curWin = 0; curLoss = 0;
      }
    }

    return { maiorWin, maiorLoss };
  },

  // ── IR Estimado ────────────────────────────────────

  /**
   * Imposto de Renda estimado (20% sobre lucro acima de R$ 20.000).
   * Simplificado: não considera isenção mensal de operações com prejuízo.
   */
  impostoRenda() {
    const lb = calc.lucroBruto();
    return lb > 20000 ? (lb - 20000) * 0.20 : 0;
  },
};

// ─── ATUALIZAR CAMPOS HTML ─────────────────────────

/**
 * Aplica todos os valores calculados nos elementos do DOM.
 * Cada _setText é seguro: não lança erro se o elemento não existir.
 */
function atualizarCampos() {
  const dd      = calc.drawdownDiario();
  const ddTrade = calc.drawdownTrade();
  const seq     = calc.sequencias();

  // — Financeiros —
  _setText('totalDeducoes',           fmt.brl(calc.totalDeducoes()));
  _setText('lucroLiquido',            fmt.brl(calc.lucroLiquido()));
  _setText('bancaFinal',              fmt.brl(calc.bancaFinal()));
  _setText('planoBancaFinal',         fmt.brl(calc.bancaFinal()));
  _setText('capitalAtualDisp',        fmt.brl(calc.capitalAtual()));
  _setText('lucroEsperado',           fmt.brl(calc.lucroEsperado()));
  _setText('totalRealizado',          fmt.brl(calc.lucroBruto()));
  _setText('prejuizoBruto',           fmt.brl(calc.perdaBruta() + get.custos_totais() + get.impostos_totais()));
  _setText('totalCustosOperacionais', fmt.brl(get.custos_totais()));
  _setText('totalImpostoFonte',       fmt.brl(get.impostos_totais()));
  _setText('impostoRendaCalculado',   fmt.brl(calc.impostoRenda()));
  _setText('patrimonioMaximo',        fmt.brl(calc.patrimonioMaximo()));
  _setText('volatilidade',            fmt.brl(calc.volatilidade()));
  _setText('totalResultadoDetalhado', fmt.brl(get.resultado_total()));

  // — Médias e extremos —
  _setText('mediaLucroPrejuizo',      fmt.brl(calc.mediaResultado()));
  _setText('mediaOpsVencedoras',      fmt.brl(calc.mediaGain()));
  _setText('maiorOpVencedora',        fmt.brl(calc.maiorGain()));
  _setText('mediaOpsPerdedoras',      fmt.brl(calc.mediaLoss()));
  _setText('maiorOpPerdedora',        fmt.brl(calc.maiorLoss()));
  _setText('maxAcoesContratos',       calc.maxContratos() || '—');

  // — Percentuais —
  _setText('roi',              fmt.pct(calc.roi()));
  _setText('roiTotal',         fmt.pct(calc.roi()));
  _setText('margemLiquida',    fmt.pct(calc.margemLiquida()));
  _setText('winRateCalc',      fmt.pct(calc.winRate()));
  _setText('pctAprovacao',     fmt.pct(calc.pctAprovacao()));
  _setText('retornoEsperado',  fmt.pct(calc.retornoEsperado()));
  _setText('retornoCapitalInicial', fmt.pct(calc.roi()));
  _setText('fatorLucro',       calc.fatorLucro() ? calc.fatorLucro().toFixed(2) : '—');
  _setText('pctOperacoesVencedoras', fmt.pct(calc.winRate()));

  // — Contagens —
  _setText('riskRetorno',      calc.riscRetorno().toFixed(2) + ':1');
  _setText('mediaOpsDiaria',   calc.opsPerDia().toFixed(1));
  _setText('mediaOpsPorDia',   calc.opsPerDia().toFixed(1));
  _setText('maxOpsDiaria',     calc.maxOpsPerDia().toString());
  _setText('maxOpsPorDia',     calc.maxOpsPerDia().toString());
  _setText('totalOperacoes',         (STATE.operacoes?.length ?? 0).toString());
  _setText('operacoesVencedoras',    get.ganhos().toString());
  _setText('operacoesPerdedoras',    get.perdas().toString());
  _setText('operacoesZeradas',       get.zeradas().toString());
  _setText('totalPontosWIN',         get.pontos_win().toFixed(0));
  _setText('totalPontosWDO',         get.pontos_wdo().toFixed(0));

  // — Drawdown —
  _setText('drawdownMaximoValor',  fmt.brl(dd.valor));
  _setText('drawdownMaximoPct',    fmt.pct(dd.pct));
  _setText('drawdownTradeValor',   fmt.brl(ddTrade.valor));
  _setText('drawdownTradePct',     fmt.pct(ddTrade.pct));

  // — Sequências —
  _setText('maiorSequenciaVencedora', seq.maiorWin.toString());
  _setText('maiorSequenciaPerdedora', seq.maiorLoss.toString());
}

// ─── INICIALIZAR ───────────────────────────────────

function initCalculos() {
  atualizarCampos();
}

// ─── EXPORTAR (Node.js / testes) ───────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calc, fmt, get, atualizarCampos, initCalculos };
}
