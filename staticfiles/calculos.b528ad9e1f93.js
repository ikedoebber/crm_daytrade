/* ================================================
   CALCULOS.JS — Cálculos e Fórmulas
   Sistema de cálculos automáticos para todos os campos
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
   * Exemplo: 1234.5 → "R$ 1.234,50"
   */
  brl(v) {
    if (v == null || isNaN(v)) return 'R$ —';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  /**
   * Formata um número como percentual.
   * Exemplo: 12.345 → "12,3%"
   */
  pct(v, decimals = 1) {
    if (v == null || isNaN(v)) return '—%';
    return v.toFixed(decimals).replace('.', ',') + '%';
  },

  /**
   * Formata um número com 2 casas decimais.
   * Exemplo: 3.14159 → "3,14"
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

  // — Operações (derivados de STATE) —
  ganhos:          () => STATE.operacoes?.filter(o => o.status === 'GAIN').length  ?? 0,
  perdas:          () => STATE.operacoes?.filter(o => o.status === 'LOSS').length  ?? 0,
  zeradas:         () => STATE.operacoes?.filter(o => o.status === 'ZERADA').length ?? 0,

  /** Soma dos resultados brutos de todas as operações. */
  resultado_total: () => STATE.operacoes?.reduce((a, o) => a + (+o.resultado || 0), 0) ?? 0,

  // — Projeção (derivados de STATE) —
  custos_totais:   () => STATE.projecao?.reduce((a, p) => a + (+p.custo_op       || 0), 0) ?? 0,
  impostos_totais: () => STATE.projecao?.reduce((a, p) => a + (+p.imposto_retido || 0), 0) ?? 0,
  realizado_total: () => STATE.projecao?.reduce((a, p) => a + (+p.realizado      || 0), 0) ?? 0,

  // — Pontos por ativo —
  pontos_win: () => STATE.operacoes?.filter(o => o.ativo === 'WIN')
                      .reduce((a, o) => a + (+o.pontos || 0), 0) ?? 0,
  pontos_wdo: () => STATE.operacoes?.filter(o => o.ativo === 'WDO')
                      .reduce((a, o) => a + (+o.pontos || 0), 0) ?? 0,
};

// ─── CÁLCULOS PRINCIPAIS ────────────────────────────

/**
 * Todas as funções retornam números puros (sem formatação).
 *
 * CORREÇÃO DE BUG — lucroLiquido:
 *   Antes: lucroBruto já descontava custos/impostos, e lucroLiquido somava
 *          prejuizoBruto (que também era -(custos+impostos)), descontando tudo
 *          duas vezes.
 *   Agora: lucroLiquido = resultado_total - custos - impostos (cálculo direto e único).
 *          lucroBruto e prejuizoBruto mantidos como métricas auxiliares independentes.
 */
const calc = {
  /** Resultado bruto das operações, sem nenhum desconto. */
  resultadoBruto() {
    return get.resultado_total();
  },

  /** Total de deduções (custos operacionais + impostos). Sempre ≤ 0. */
  totalDeducoes() {
    return -(get.custos_totais() + get.impostos_totais());
  },

  /**
   * Lucro Líquido = Resultado bruto − Custos − Impostos.
   * É a métrica principal de resultado do período.
   */
  lucroLiquido() {
    return calc.resultadoBruto() + calc.totalDeducoes();
  },

  /**
   * Capital Final = Capital Inicial + Lucro Líquido.
   */
  capitalFinal() {
    return get.banca_inicial() + calc.lucroLiquido();
  },

  /**
   * ROI = (Lucro Líquido / Capital Inicial) × 100.
   * Retorna 0 se não houver capital inicial.
   */
  roi() {
    const capital = get.banca_inicial();
    return capital !== 0 ? (calc.lucroLiquido() / capital) * 100 : 0;
  },

  /**
   * Margem Líquida = (Lucro Líquido / Resultado Bruto) × 100.
   * Representa quanto do resultado bruto se converte em lucro real.
   * Retorna 0 se não houver resultado bruto.
   */
  margemLiquida() {
    const resultado = calc.resultadoBruto();
    return resultado !== 0 ? (calc.lucroLiquido() / resultado) * 100 : 0;
  },

  /**
   * Win Rate = Ganhos / (Ganhos + Perdas) × 100.
   * Zeradas não entram no cálculo (operações neutras).
   */
  winRate() {
    const ganhos = get.ganhos();
    const total  = ganhos + get.perdas();
    return total !== 0 ? (ganhos / total) * 100 : 0;
  },

  /**
   * Razão Retorno/Risco = Meta de Aprovação / Perda Máxima Total.
   * Retorna 0 se qualquer um dos valores for zero.
   */
  riscRetorno() {
    const meta     = get.plano_meta_aprovacao();
    const perdaMax = get.plano_perda_max_total();
    return meta !== 0 && perdaMax !== 0 ? Math.abs(meta / perdaMax) : 0;
  },

  /**
   * Média de operações por dia útil operado.
   * Considera apenas dias com valor realizado preenchido.
   */
  opsPerDia() {
    const diasFeitos = STATE.projecao?.filter(
      d => d.realizado !== null && d.realizado !== ''
    ).length ?? 0;
    if (diasFeitos === 0) return 0;
    return (STATE.operacoes?.length ?? 0) / diasFeitos;
  },

  /**
   * Maior número de operações feitas em um único dia.
   */
  maxOpsPerDia() {
    if (!STATE.operacoes?.length) return 0;
    const contagem = STATE.operacoes.reduce((acc, o) => {
      acc[o.dia] = (acc[o.dia] ?? 0) + 1;
      return acc;
    }, {});
    return Math.max(...Object.values(contagem));
  },

  /**
   * Percentual de dias úteis já operados em relação ao total previsto.
   */
  pctAprovacao() {
    const diasFeitos = STATE.projecao?.filter(
      d => d.realizado !== null && d.realizado !== ''
    ).length ?? 0;
    const diasUteis = get.dias_uteis();
    return diasUteis !== 0 ? (diasFeitos / diasUteis) * 100 : 0;
  },

  /**
   * Capital atual acumulando apenas os dias já realizados na projeção.
   */
  capitalAtual() {
    return (STATE.projecao ?? []).reduce((capital, d) => {
      if (d.realizado === null || d.realizado === '') return capital;
      return capital + (+d.realizado || 0) - (+d.custo_op || 0) - (+d.imposto_retido || 0);
    }, get.banca_inicial());
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
};

// ─── ATUALIZAR CAMPOS HTML ─────────────────────────

/**
 * Aplica todos os valores calculados nos elementos do DOM.
 * Cada _setText é seguro: não lança erro se o elemento não existir.
 */
function atualizarCampos() {
  _setText('totalDeducoes',    fmt.brl(calc.totalDeducoes()));
  _setText('lucroLiquido',     fmt.brl(calc.lucroLiquido()));
  _setText('bancaFinal',       fmt.brl(calc.capitalFinal()));
  _setText('capitalAtualDisp', fmt.brl(calc.capitalAtual()));
  _setText('lucroEsperado',    fmt.brl(calc.lucroEsperado()));

  _setText('roi',              fmt.pct(calc.roi()));
  _setText('margemLiquida',    fmt.pct(calc.margemLiquida()));
  _setText('winRateCalc',      fmt.pct(calc.winRate()));
  _setText('pctAprovacao',     fmt.pct(calc.pctAprovacao()));
  _setText('retornoEsperado',  fmt.pct(calc.retornoEsperado()));

  _setText('riskRetorno',      calc.riscRetorno().toFixed(2) + ':1');
  _setText('mediaOpsDiaria',   calc.opsPerDia().toFixed(1));
  _setText('maxOpsDiaria',     calc.maxOpsPerDia().toString());
}

// ─── INICIALIZAR ───────────────────────────────────

function initCalculos() {
  atualizarCampos();
}

// ─── EXPORTAR ───────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calc, fmt, get, atualizarCampos, initCalculos };
}
