# ✅ TESTE: Validar Correção da Diferença de R$ 90

## Como Testar

### 1. Force Refresh (Recarregar Código)

```
Windows/Linux: Ctrl + Shift + R
Mac: Cmd + Shift + R
```

### 2. Abrir Console (F12 → Console)

Copie e cole cada comando abaixo, um de cada vez:

---

## Teste 1: Verificar se Código Novo Carregou

```javascript
// Verifica se a função tem o comentário novo
console.log(calcPnL.capitalFinal.toString().includes('capitalAtual()'));
// Esperado: true ✅
```

---

## Teste 2: Comparar Valores

```javascript
// Deve haver sincronização entre as duas funções
const cap1 = calc.capitalAtual();
const cap2 = calc.capitalFinal();

console.log('Capital Atual:  ' + fmt.brl(cap1));
console.log('Capital Final:  ' + fmt.brl(cap2));
console.log('Diferença:     R$', (cap1 - cap2).toFixed(2));

// Esperado: Diferença = 0,00 ✅
```

---

## Teste 3: Verificar com Dados Reais

```javascript
// Simule os dados atuais
if (STATE.operacoes && STATE.projecao) {
  console.log('Dados carregados:');
  console.log('- Operações:', STATE.operacoes.length);
  console.log('- Dias de projeção:', STATE.projecao.length);
  
  // Calcule manualmente
  let capitalManual = get.banca_inicial();
  for (const dia of STATE.projecao) {
    if (dia.realizado !== null && dia.realizado !== '') {
      capitalManual += parseFloat(dia.realizado || 0);
      capitalManual -= parseFloat(dia.custo_op || 0);
      capitalManual -= parseFloat(dia.imposto_retido || 0);
    }
  }
  
  console.log('\nManual (soma dia a dia):', fmt.brl(capitalManual));
  console.log('capitalFinal() calcula:', fmt.brl(calc.capitalFinal()));
  console.log('Diferença:', Math.abs(capitalManual - calc.capitalFinal()).toFixed(2));
  
  // Esperado: Diferença mínima (arredondamento) ✅
}
```

---

## Teste 4: Verificar os Campos HTML

```javascript
// Renderiza e verifica
atualizarCampos();

// Obtém os valores renderizados
const capitalFinalHTML = document.getElementById('capitalAtualDisp')?.textContent;
const bancaFinalHTML = document.getElementById('bancaFinal')?.textContent;

console.log('Capital Final (HTML):', capitalFinalHTML);
console.log('Banca Final (HTML):', bancaFinalHTML);

// Veremos as diferenças entre eles
// capitalAtualDisp = valor real do dia (capital progressivo)
// bancaFinal = projeção (se todos os dias atingissem objetivo)
```

---

## Teste 5: Comparar com Backend (Se Disponível)

```javascript
// Se STATE.capital_atual foi preenchido pelo backend
if (STATE.capital_atual) {
  console.log('Backend enviou:');
  console.log('- capital_final:', STATE.capital_atual.capital_final);
  console.log('- dia:', STATE.capital_atual.dia);
  
  console.log('\nFrontend calcula:');
  console.log('- capitalFinal():', calc.capitalFinal());
  console.log('- capitalAtual():', calc.capitalAtual());
  
  const diff = STATE.capital_atual.capital_final - calc.capitalFinal();
  console.log('\nDiferença (backend - frontend):', diff);
  
  // Esperado: Diferença = 0 ou muito pequena (< R$ 0,10) ✅
  if (Math.abs(diff) < 0.10) {
    console.log('✅ SINCRONIZADO COM BACKEND');
  } else {
    console.log('⚠️ Ainda há diferença:', diff);
  }
}
```

---

## Interpretação dos Resultados

| Resultado | Significa | Ação |
|-----------|----------|------|
| Diferença = 0 | ✅ Perfeito! | Problema fixado |
| Diferença < R$ 0,50 | ⚠️ Arredondamento | Normal, aceito |
| Diferença > R$ 1 | ❌ Ainda há problema | Reportar |
| Diferença R$ 90 | ❌ Não foi fixado | Verificar se recarregou |

---

## Se Ainda Houver Diferença

### Passo 1: Verificar Cache

```javascript
// Limpar cache
_invalidateCache();

// Recalcular
atualizarCampos();

// Testar novamente
console.log('Após limpar cache:', calc.capitalFinal());
```

### Passo 2: Verificar Dados

```javascript
// Validate dados de entrada
console.log('Banca inicial:', get.banca_inicial());
console.log('Dias com realizado:', get.dias_feitos());
console.log('Custos totais:', get.custos_totais());
console.log('Impostos:', get.impostos_totais());
```

### Passo 3: Verificar Arredondamento

```javascript
// Às vezes a diferença é por arredondamento
STATE.projecao.forEach((dia, idx) => {
  const real = parseFloat(dia.realizado || 0);
  const custo = parseFloat(dia.custo_op || 0);
  const imposto = parseFloat(dia.imposto_retido || 0);
  const net = real - custo - imposto;
  
  console.log(`Dia ${idx}: ${real} - ${custo} - ${imposto} = ${net}`);
});
```

---

## Checklist Final

- [ ] Recarregou com Ctrl+Shift+R
- [ ] Teste 1: Retorna true
- [ ] Teste 2: Diferença = 0
- [ ] Teste 3: Valores aproximados (< R$ 1)
- [ ] Teste 4: HTML mostrado corretamente
- [ ] Teste 5: Backend sincronizado
- [ ] Relatórios mostram valores corretos

---

## Próxima Ação

Se todos os testes passarem: ✅  
→ Problema **FIXADO**

Se ainda houver problema: ⚠️  
→ Copie a saída dos testes e reporte com prints da diferença

---

**Data do Fix:** 14 de Abril, 2026  
**Arquivo Corrigido:** `static/calculos.js`  
**Método:** Sincronizar `capitalFinal()` com `capitalAtual()` (mesma fórmula do backend)
