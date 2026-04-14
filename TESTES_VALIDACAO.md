# TESTES E VALIDAÇÃO — Cálculos V2

## Checklist de Testes

### ✅ Estrutura do Projeto

- [x] Arquivo `static/calculos.js` atualizado
- [x] Backup em `static/calculos.bak.js` criado
- [x] Arquivo `static/calculos-v2.js` como referência
- [x] Documentação em `RELATORIO_REFACTORING.md`
- [x] Exemplos em `EXEMPLOS_CALCULOS.js`

### ✅ Compatibilidade

- [x] Interface pública mantida (calc, fmt, get)
- [x] Nenhuma mudança em `planilha.js` necessária
- [x] Nenhuma mudança em HTML necessária
- [x] Exporta para Node.js mantido

### ✅ Funcionalidades

- [x] Cálculos de P&L funcionam
- [x] Métricas de performance calculam corretamente
- [x] Risco e drawdown computam
- [x] Planejamento e metas
- [ ] Imposto de Renda (15%) — **NOVO, testar**
- [ ] Cache funciona corretamente — **NOVO, testar**
- [ ] Validação de dados — **NOVO, testar**

---

## Testes Manual (No Navegador)

### Teste 1: Verifica se Calculos Carrega

```javascript
// No console:
typeof calc                    // "object"
typeof fmt                     // "object"
typeof get                     // "object"
typeof agg                     // "object"
typeof calcPnL                 // "object"
typeof calcPerformance         // "object"
typeof calcRisco               // "object"
typeof calcPlano               // "object"
```

**Esperado:** Todos devem retornar `"object"`

---

### Teste 2: Função de Render

```javascript
atualizarCampos()
// Verificar se campos foram preenchidos
document.getElementById('lucroLiquido').textContent
document.getElementById('roi').textContent
document.getElementById('winRate').textContent
```

**Esperado:** Valores formatados (R$ ..., ..%, etc)

---

### Teste 3: Cache Funciona

```javascript
// Primeira chamada (calcula)
console.time('calc1')
get.ganhos()
console.timeEnd('calc1')

// Segunda chamada (usa cache)
console.time('calc2')
get.ganhos()
console.timeEnd('calc2')
```

**Esperado:** `calc2` deve ser ~10x mais rápido

---

### Teste 4: Validação de Dados

```javascript
// Valores inválidos devem retornar fallback
_toNumber(null);              // 0
_toNumber('abc');             // 0
_toNumber(NaN);               // 0
_toNumber(Infinity);          // 0
_isValidNumber(42);           // true
_isValidNumber(NaN);          // false
fmt.brl(null);                // "—"
fmt.pct('abc');               // "—"
```

**Esperado:** Sem exceções, valores sensatos

---

### Teste 5: Imposto de Renda (NOVO)

```javascript
// Caso 1: Com lucro
get.banca_inicial = () => 10000
STATE.operacoes = [
  { status: 'GAIN', resultado: 1000 },
  { status: 'GAIN', resultado: 500 },
]

const ir = calc.impostoRenda()      // 15% de 1500 = 225
console.log(fmt.brl(ir))            // "R$ 225,00"

// Caso 2: Com perda (IR = 0)
STATE.operacoes = [
  { status: 'LOSS', resultado: -500 },
]
const ir2 = calc.impostoRenda()     // 0 (sem lucro)
console.log(ir2)                    // 0
```

**Esperado:** Cálculo correto a 15%

---

### Teste 6: Agregações com Cache

```javascript
// Cache vazio inicialmente
CACHE.operacoesPorStatus = null

// Primeira chamada popula cache
let contagem1 = agg.contarPorStatus()
console.log(CACHE.operacoesPorStatus)  // { ganhos, perdas, zeradas }

// Próxima chamada usa cache
let contagem2 = agg.contarPorStatus()
console.log(contagem1 === contagem2)   // true (mesma referência)
```

**Esperado:** Cache é reutilizado

---

### Teste 7: Invalidação de Cache

```javascript
// Popula cache
agg.contarPorStatus()
console.log(CACHE.operacoesPorStatus)  // { ganhos: X, ... }

// Invalida
_invalidateCache()
console.log(CACHE.operacoesPorStatus)  // null

// Recalcula
agg.contarPorStatus()
console.log(CACHE.operacoesPorStatus)  // { ganhos: Y, ... } (recalculado)
```

**Esperado:** Cache resetado corretamente

---

### Teste 8: Valores Negativos (Edge Case)

```javascript
// Drawdown deve sempre ser positivo
STATE.projecao = [
  { realizado: -100, custo_op: 0, imposto_retido: 0 },
  { realizado: -200, custo_op: 0, imposto_retido: 0 },
]

const dd = calc.drawdownDiario()
console.log(dd.valor)          // Deve ser positivo
console.log(dd.pct)            // Deve ser positivo
```

**Esperado:** Valores sempre positivos/sensatos

---

### Teste 9: Dados Vazios (Edge Case)

```javascript
STATE.operacoes = []
STATE.projecao = []

console.log(calc.lucroBruto())         // 0
console.log(calc.windRate())           // 0
console.log(calc.volatilidade())       // 0
console.log(calc.drawdownDiario())     // { valor: 0, pct: 0 }

// Nenhuma exceção lançada
```

**Esperado:** Sem erro, valores sensatos

---

### Teste 10: Formatação

```javascript
// Testar tipos especiais
fmt.brl(0)              // "R$ 0,00"
fmt.brl(-100)           // "R$ -100,00"
fmt.pct(0)              // "0,0%"
fmt.pct(100.456)        // "100,5%"
fmt.num(12.3456)        // "12,35"
fmt.custom(3.14159, 4)  // "3,1416"
```

**Esperado:** Formatação correta

---

## Teste de Regressão (Comparar com Versão Antiga)

### Cenário: Operações do Mês Inteiro

```javascript
// Usar dados reais
STATE = {
  config: { banca_inicial: 10000 },
  operacoes: [
    { status: 'GAIN', resultado: 500, pontos: 10, ativo: 'WIN' },
    { status: 'GAIN', resultado: 300, pontos: 6, ativo: 'WIN' },
    { status: 'LOSS', resultado: -200, pontos: -4, ativo: 'WDO' },
    { status: 'ZERADA', resultado: 0, pontos: 0, ativo: 'WIN' },
  ],
  projecao: [
    { dia: 1, realizado: 500, custo_op: 20, imposto_retido: 75 },
    { dia: 2, realizado: 300, custo_op: 20, imposto_retido: 45 },
    { dia: 3, realizado: -200, custo_op: 20, imposto_retido: 0 },
  ],
}

// Comparar com versão antiga
const valoresEsperados = {
  lucroBruto: 800,
  perdaBruta: 200,
  lucroLiquido: 360,  // 800 - 200 - 40 - 120
  roi: 3.6,
  winRate: 66.67,
  impostoRenda: 120,  // 15% de 800
}

const valoresNovosCarculos = {
  lucroBruto: calc.lucroBruto(),
  perdaBruta: calc.perdaBruta(),
  lucroLiquido: calc.lucroLiquido(),
  roi: calc.roi(),
  winRate: calc.winRate(),
  impostoRenda: calc.impostoRenda(),
}

// Comparar
for (const [chave, valor] of Object.entries(valoresEsperados)) {
  const calculado = valoresNovosCarculos[chave]
  const diff = Math.abs(calculado - valor)
  console.log(
    `${chave}: esperado ${valor}, calculado ${calculado}, diff: ${diff.toFixed(2)}`
  )
}
```

**Esperado:** Diferença = 0 (ou arredondamento mínimo)

---

## Performance Benchmark

```javascript
// Scenario: 1000 operações

function criarDados() {
  const operacoes = []
  for (let i = 0; i < 1000; i++) {
    operacoes.push({
      id: i,
      status: ['GAIN', 'LOSS', 'ZERADA'][i % 3],
      resultado: Math.random() * 1000 - 500,
      ativo: i % 2 === 0 ? 'WIN' : 'WDO',
      pontos: Math.random() * 20,
      dia: (i % 20) + 1,
    })
  }
  STATE.operacoes = operacoes
}

criarDados()

// Benchmark
console.time('Primeira execução (sem cache)')
atualizarCampos()
console.timeEnd('Primeira execução (sem cache)')

console.time('Segunda execução (com cache)')
atualizarCampos()
console.timeEnd('Segunda execução (com cache)')

console.time('Terceira execução (com cache)')
atualizarCampos()
console.timeEnd('Terceira execução (com cache)')
```

**Esperado:** 
- Primeira: ~50-100ms
- Segunda/Terceira: ~5-10ms (10x mais rápido)

---

## Relatório de Bugs Encontrados

### Se encontrar um bug, reporte assim:

```markdown
**Título:** [Bug] Descrição breve

**Reprodução:**
1. Passo 1
2. Passo 2
3. Passo 3

**Esperado:** Qual era o resultado esperado

**Atual:** Qual foi o resultado

**Ambiente:** 
- Browser: (Chrome/Firefox/Safari)
- OS: (Windows/Mac/Linux)
- Versão: (calculos.js v2)

**Console:**
(Cole qualquer erro do console)
```

---

## Rollback (Se Necessário)

```bash
# Reverter para versão anterior
cp static/calculos.bak.js static/calculos.js

# Recarregar página no navegador
# F5 ou Ctrl+Shift+R (hard refresh)
```

---

## Checklist Final de Validação

Antes de dar como completo:

- [ ] Todos os testes manuais passam
- [ ] Nenhuma mudança necessária em planilha.js
- [ ] Nenhuma mudança necessária em HTML
- [ ] Performance melhorou ou mantida
- [ ] Imposto de Renda calcula corretamente
- [ ] Cache funciona sem bugs
- [ ] Dados vazios são tratados
- [ ] Valores negativos são tratados
- [ ] Formatação mantida
- [ ] Documentsção está clara

---

## Próximos Passos

1. ✅ Executar testes manuais
2. ⏳ Validar com dados reais da produção
3. ⏳ Monitorar por 24h em produção
4. ⏳ Coletar feedback dos usuários
5. ⏳ Fazer ajustes se necessário
6. ⏳ Remover arquivo backup se tudo OK
