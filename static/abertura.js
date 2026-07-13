const getById = id => document.getElementById(id);

// Will be populated on init to ensure elements exist when the calculator is rendered
const elements = {};

const defaultValues = {
  vix: '0,00',
  fef2: '0,00',
  cl1: '0,00',
};

function parsePercent(value) {
  return parseFloat((value || '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
}

function formatPercent(value) {
  const formatted = Number(value).toFixed(2).replace('.', ',');
  return (value > 0 ? '+' : '') + formatted + '%';
}

function normalizeInput(value) {
  return (value || '')
    .replace(/[^0-9,.-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/,{2,}/g, ',');
}

function determineSignal(result) {
  const absResult = Math.abs(result);
  let direction = 'Lateral';
  let intensity = 'Lateral';
  let range = '< 1,5%';
  let interpretation = 'Movimento lateral; observe alvos curtos em suportes e resistências.';
  let color = '#86c5ff';
  let sizeLevel = 'lateral';

  if (absResult > 4.5) {
    direction = result > 0 ? 'Compradora' : 'Vendedora';
    intensity = 'Forte';
    range = '> 4,5%';
    interpretation = result > 0
      ? 'Abertura compradora forte; sinal de compra com potencial de continuidade.'
      : 'Abertura vendedora forte; venda em resistência é sugerida.';
    color = result > 0 ? '#72df75' : '#ff6d8d';
    sizeLevel = 'forte';
  } else if (absResult > 2.5) {
    direction = result > 0 ? 'Compradora' : 'Vendedora';
    intensity = 'Moderada';
    range = '2,5% - 4,5%';
    interpretation = result > 0
      ? 'Abertura compradora moderada; busque suporte e confirmações.'
      : 'Abertura vendedora moderada; observe o fluxo de oferta.';
    color = result > 0 ? '#67f0ff' : '#ff9eb0';
    sizeLevel = 'moderada';
  } else if (absResult >= 1.5) {
    direction = result > 0 ? 'Compradora' : 'Vendedora';
    intensity = 'Fraca';
    range = '1,5% - 2,5%';
    interpretation = result > 0
      ? 'Abertura compradora fraca; pressão de compra ainda é limitada.'
      : 'Abertura vendedora fraca; oscilações laterais são possíveis.';
    color = result > 0 ? '#86c5ff' : '#ffb5c9';
    sizeLevel = 'fraca';
  }

  if (absResult < 1.5) {
    direction = 'Lateral';
    intensity = 'Lateral';
    range = '< 1,5%';
    interpretation = 'Movimento lateral; observe alvos curtos em suportes e resistências.';
    color = '#86c5ff';
    sizeLevel = 'lateral';
  }

  const signalType = absResult < 1.5 ? 'LATERAL' : result > 0 ? 'POSITIVO' : 'NEGATIVO';
  const signalClass = absResult < 1.5 ? 'lateral' : result > 0 ? 'positivo' : 'negativo';
  return { direction, intensity, range, interpretation, color, absResult, signalType, signalClass, sizeLevel };
}

function updateDisplays(vix, fef2, cl1, result, signal) {
  if (!elements.resultValue || !elements.resultLabel) return;

  elements.resultValue.textContent = formatPercent(result);
  elements.resultValue.style.color = signal.color;
  elements.resultLabel.textContent = `ABERTURA ${signal.direction.toUpperCase()}`;
  if (elements.signalChip) {
    elements.signalChip.textContent = signal.signalType;
    elements.signalChip.className = `signal-chip ${signal.signalClass}`;
  }

  // refresh rows collection (may change if tab was recreated)
  const rows = document.querySelectorAll('.result-table .table-row');
  rows.forEach(row => row.classList.toggle('active', row.dataset.size === signal.sizeLevel));

  if (elements.directionText) elements.directionText.textContent = signal.direction;
  if (elements.intensityText) elements.intensityText.textContent = signal.intensity;
  if (elements.rangeText) elements.rangeText.textContent = signal.range;
  if (elements.vixDisplay) elements.vixDisplay.textContent = formatPercent(vix);
  if (elements.fef2Display) elements.fef2Display.textContent = formatPercent(fef2);
  if (elements.cl1Display) elements.cl1Display.textContent = formatPercent(cl1);
  if (elements.interpretationText) elements.interpretationText.textContent = signal.interpretation;
}

function calculate() {
  if (!elements.vixInput || !elements.fef2Input || !elements.cl1Input) {
    console.debug('abertura.calculate: missing inputs', {
      vix: !!elements.vixInput,
      fef2: !!elements.fef2Input,
      cl1: !!elements.cl1Input,
    });
    return;
  }

  const vix = parsePercent(elements.vixInput.value);
  const fef2 = parsePercent(elements.fef2Input.value);
  const cl1 = parsePercent(elements.cl1Input.value);
  const result = -vix + fef2 + cl1;
  console.debug('abertura.calculate', { vix, fef2, cl1, result });
  const signal = determineSignal(result);
  updateDisplays(vix, fef2, cl1, result, signal);
}

function setValue(input, value) {
  if (!input) return;
  input.value = value;
  calculate();
}

function setupInput(input) {
  if (!input) return;

  input.value = normalizeInput(input.value);

  const row = input.closest('.input-row');
  if (row) {
    row.querySelectorAll('.calc-btn').forEach((button) => {
      if (button.__ab_input_listened) return;
      button.__ab_input_listened = true;
      button.addEventListener('click', () => {
        const step = button.dataset.step === '+' ? 0.1 : -0.1;
        const current = parsePercent(input.value);
        const value = current + step;
        input.value = value.toFixed(2).replace('.', ',');
        calculate();
      });
    });
  }

  if (input.__ab_input_listened) return;
  input.__ab_input_listened = true;
  input.addEventListener('input', () => {
    input.value = normalizeInput(input.value);
    calculate();
  });
  input.addEventListener('change', () => {
    input.value = normalizeInput(input.value);
    calculate();
  });
}

function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(button => {
    if (button.__tab_listened) return;
    button.__tab_listened = true;
    button.addEventListener('click', () => {
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
    });
  });
}

function initAbertura() {
  elements.vixInput = document.querySelector('#vixInput');
  elements.fef2Input = document.querySelector('#fef2Input');
  elements.cl1Input = document.querySelector('#cl1Input');
  elements.resultValue = document.querySelector('#resultValue');
  elements.resultLabel = document.querySelector('#resultLabel');
  elements.signalChip = document.querySelector('#signalChip');
  elements.directionText = document.querySelector('#directionText');
  elements.intensityText = document.querySelector('#intensityText');
  elements.rangeText = document.querySelector('#rangeText');
  elements.vixDisplay = document.querySelector('#vixDisplay');
  elements.fef2Display = document.querySelector('#fef2Display');
  elements.cl1Display = document.querySelector('#cl1Display');
  elements.interpretationText = document.querySelector('#interpretationText');

  if (!elements.vixInput || !elements.fef2Input || !elements.cl1Input) {
    console.debug('abertura.initAbertura: missing required inputs', {
      vix: !!elements.vixInput,
      fef2: !!elements.fef2Input,
      cl1: !!elements.cl1Input,
    });
    return;
  }

  const inputs = [elements.vixInput, elements.fef2Input, elements.cl1Input];
  inputs.forEach((input) => {
    const key = input.id.replace('Input', '').toLowerCase();
    if (!input.value.trim() && defaultValues[key]) {
      input.value = defaultValues[key];
    }
    setupInput(input);
  });

  setupTabs();
  calculate();
}

window.initAbertura = initAbertura;

document.addEventListener('DOMContentLoaded', initAbertura);
window.addEventListener('load', initAbertura);
