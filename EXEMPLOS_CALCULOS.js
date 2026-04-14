/**
 * EXEMPLOS DE USO — Cálculos V2
 * 
 * Exemplos práticos de como usar os novos módulos de cálculos.
 */

// ═══════════════════════════════════════════════════════════════════════════
// EXEMPLO 1: Utilizar Módulo de P&L
// ═══════════════════════════════════════════════════════════════════════════

function exemploResultadoFinanceiro() {
  // Obter resultados financeiros
  const lucro = calc.lucroBruto();
  const perda = calc.perdaBruta();
  const deducoes = calc.totalDeducoes();
  const liquido = calc.lucroLiquido();
  const ir = calc.impostoRenda();
  const final = calc.capitalFinal();

  console.log('📊 RESULTADO FINANCEIRO');
  console.log(`Lucro Bruto:    ${fmt.brl(lucro)}`);
  console.log(`Perda Bruta:    ${fmt.brl(perda)}`);
  console.log(`Deduções:       ${fmt.brl(deducoes)}`);
  console.log(`Lucro Líquido:  ${fmt.brl(liquido)}`);
  console.log(`IR (15%):       ${fmt.brl(ir)}`);
  console.log(`Após IR:        ${fmt.brl(liquido - ir)}`);
  console.log(`Capital Final:  ${fmt.brl(final)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXEMPLO 2: Análise de Performance
// ═══════════════════════════════════════════════════════════════════════════

function exemploPerformance() {
  const roi = calc.roi();
  const winRate = calc.winRate();
  const margemLiq = calc.margemLiquida();
  const fatorLucro = calc.fatorLucro();

  console.log('📈 PERFORMANCE');
  console.log(`ROI:             ${fmt.pct(roi)}`);
  console.log(`Win Rate:        ${fmt.pct(winRate)}`);
  console.log(`Margem Líquida:  ${fmt.pct(margemLiq)}`);
  console.log(`Fator de Lucro:  ${fatorLucro.toFixed(2)}`);
  
  // Análise de média por operação
  console.log('\nMÉDIAS:');
  console.log(`Média Geral:     ${fmt.brl(calc.mediaResultado())}`);
  console.log(`Média Ganhos:    ${fmt.brl(calc.mediaGain())}`);
  console.log(`Média Perdas:    ${fmt.brl(calc.mediaLoss())}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXEMPLO 3: Gestão de Risco
// ═══════════════════════════════════════════════════════════════════════════

function exemploRisco() {
  const dd = calc.drawdownDiario();
  const ddTrade = calc.drawdownTrade();
  const vol = calc.volatilidade();
  const seq = calc.sequencias();

  console.log('⚠️ RISCO');
  console.log(`Drawdown Diário: ${fmt.brl(dd.valor)} (${fmt.pct(dd.pct)})`);
  console.log(`Drawdown Trade:  ${fmt.brl(ddTrade.valor)} (${fmt.pct(ddTrade.pct)})`);
  console.log(`Volatilidade:    ${fmt.brl(vol)}`);
  console.log(`Patrimônio Máx:  ${fmt.brl(calc.patrimonioMaximo())}`);
  
  console.log('\nSEQUÊNCIAS:');
  console.log(`Maior vitória:   ${seq.maiorWin} operações`);
  console.log(`Maior derrota:   ${seq.maiorLoss} operações`);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXEMPLO 4: Planejamento e Metas
// ═══════════════════════════════════════════════════════════════════════════

function exemploPlano() {
  const esperado = calc.lucroEsperado();
  const retornoEsp = calc.retornoEsperado();
  const bancaFinal = calc.bancaFinal();
  const pctAprova = calc.pctAprovacao();

  console.log('🎯 PLANEJAMENTO');
  console.log(`Lucro Esperado:  ${fmt.brl(esperado)}`);
  console.log(`Retorno Esp:     ${fmt.pct(retornoEsp)}`);
  console.log(`Banca Final:     ${fmt.brl(bancaFinal)}`);
  console.log(`% Aprovação:     ${fmt.pct(pctAprova)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXEMPLO 5: Usar Agregações com Cache
// ═══════════════════════════════════════════════════════════════════════════

function exemploAgregacoes() {
  // Contar operações por status (otimizado com cache)
  const contagem = agg.contarPorStatus();
  console.log('📋 CONTAGEM:');
  console.log(`Ganhos:   ${contagem.ganhos}`);
  console.log(`Perdas:   ${contagem.perdas}`);
  console.log(`Zeradas:  ${contagem.zeradas}`);

  // Agrupar por ativo (otimizado com cache)
  const porAtivo = agg.agruparPorAtivo();
  console.log('\n🔄 POR ATIVO:');
  for (const [ativo, ops] of Object.entries(porAtivo)) {
    console.log(`${ativo}: ${ops.length} operações`);
  }

  // Agrupar por dia (otimizado com cache)
  const porDia = agg.agruparPorDia();
  console.log('\n📅 OPERAÇÕES POR DIA:');
  for (const [dia, ops] of Object.entries(porDia)) {
    console.log(`Dia ${dia}: ${ops.length} operações`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXEMPLO 6: Formatação Customizada
// ═══════════════════════════════════════════════════════════════════════════

function exemploFormatacao() {
  const valor = 12345.6789;

  console.log('💱 FORMATAÇÃO:');
  console.log('BRL:      ', fmt.brl(valor));          // R$ 12.345,68
  console.log('Percentual:', fmt.pct(valor));         // 12.345,7%
  console.log('Número:    ', fmt.num(valor));         // 12345,68
  console.log('3 casas:   ', fmt.custom(valor, 3));   // 12345,679
  console.log('Inválido:  ', fmt.brl(null));          // —
}

// ═══════════════════════════════════════════════════════════════════════════
// EXEMPLO 7: Validação de Dados
// ═══════════════════════════════════════════════════════════════════════════

function exemploValidacao() {
  console.log('✅ VALIDAÇÃO');
  console.log('10 é válido?      ', _isValidNumber(10));        // true
  console.log('null é válido?    ', _isValidNumber(null));      // false
  console.log('Infinity válido?  ', _isValidNumber(Infinity));  // false
  console.log('NaN é válido?     ', _isValidNumber(NaN));       // false
  
  console.log('\nCONVERSÃO SEGURA:');
  console.log('Número válido:    ', _toNumber('123.45', 0));    // 123.45
  console.log('Inválido → 0:     ', _toNumber('abc', 0));       // 0
  console.log('null → fallback:  ', _toNumber(null, 100));      // 100
}

// ═══════════════════════════════════════════════════════════════════════════
// EXEMPLO 8: Invalidar Cache (força recalculação)
// ═══════════════════════════════════════════════════════════════════════════

function exemploInvalidarCache() {
  console.log('🔄 CACHE');
  
  // Cache está preenchido
  console.log('Contagem (com cache):', get.ganhos());
  
  // Limpar cache (útil quando STATE muda)
  _invalidateCache();
  console.log('Cache invalidado!');
  
  // Próximo cálculo refaz a agregação
  console.log('Contagem (novo cache):', get.ganhos());
}

// ═══════════════════════════════════════════════════════════════════════════
// EXEMPLO 9: Renderização Automática
// ═══════════════════════════════════════════════════════════════════════════

function exemploRenderizacao() {
  // Atualizar todos os elementos HTML em uma chamada
  atualizarCampos();
  
  // Mostra em console o que foi renderizado
  const campos = [
    'lucroLiquido', 'roi', 'winRate', 'drawdownMaximoValor',
    'maiorSequenciaVencedora', 'impostoRendaEstimado'
  ];
  
  console.log('📋 CAMPOS RENDERIZADOS:');
  campos.forEach(campo => {
    const el = document.getElementById(campo);
    if (el) {
      console.log(`${campo}: ${el.textContent}`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// EXEMPLO 10: Criar Dashboard Customizado
// ═══════════════════════════════════════════════════════════════════════════

function exemploDashboardCustomizado() {
  const dashboard = {
    pnl: {
      lucroBruto: calc.lucroBruto(),
      perdaBruta: calc.perdaBruta(),
      lucroLiquido: calc.lucroLiquido(),
      impostoRenda: calc.impostoRenda(),
    },
    performance: {
      roi: calc.roi(),
      winRate: calc.winRate(),
      fatorLucro: calc.fatorLucro(),
    },
    risco: {
      drawdownDiario: calc.drawdownDiario(),
      volatilidade: calc.volatilidade(),
    },
    metas: {
      objetivo: get.objetivo_diario(),
      realizado: get.realizado_total(),
      progresso: (get.realizado_total() / get.objetivo_diario()) * 100,
    },
  };
  
  console.table(dashboard);
  return dashboard;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTAR EXEMPLOS
// ═══════════════════════════════════════════════════════════════════════════

// Execute no console do navegador ou Node.js:
// exemploResultadoFinanceiro()
// exemploPerformance()
// exemploRisco()
// exemploDashboardCustomizado()
