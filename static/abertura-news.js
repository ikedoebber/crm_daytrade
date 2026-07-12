(function() {
  const elements = {};

  const defaultValues = {
    newsValeInput: '0,00',
    newsPbrInput: '0,00',
    newsItubInput: '0,00',
    newsBdoryInput: '0,00',
    newsBbdInput: '0,00',
    newsBolsyInput: '0,00',
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

  function updateDisplays(values, result, signal) {
    if (!elements.resultValue || !elements.resultLabel) return;

    elements.resultValue.textContent = formatPercent(result);
    elements.resultValue.style.color = signal.color;
    elements.resultLabel.textContent = `ABERTURA ${signal.direction.toUpperCase()}`;
    if (elements.signalChip) {
      elements.signalChip.textContent = signal.signalType;
      elements.signalChip.className = `signal-chip ${signal.signalClass}`;
    }

    const rows = document.querySelectorAll('#abertura-mode-com-noticia .result-table .table-row');
    rows.forEach(row => row.classList.toggle('active', row.dataset.size === signal.sizeLevel));

    if (elements.directionText) elements.directionText.textContent = signal.direction;
    if (elements.intensityText) elements.intensityText.textContent = signal.intensity;
    if (elements.rangeText) elements.rangeText.textContent = signal.range;
    if (elements.newsValeDisplay) elements.newsValeDisplay.textContent = formatPercent(values[0]);
    if (elements.newsPbrDisplay) elements.newsPbrDisplay.textContent = formatPercent(values[1]);
    if (elements.newsItubDisplay) elements.newsItubDisplay.textContent = formatPercent(values[2]);
    if (elements.newsBdoryDisplay) elements.newsBdoryDisplay.textContent = formatPercent(values[3]);
    if (elements.newsBbdDisplay) elements.newsBbdDisplay.textContent = formatPercent(values[4]);
    if (elements.newsBolsyDisplay) elements.newsBolsyDisplay.textContent = formatPercent(values[5]);
    if (elements.interpretationText) elements.interpretationText.textContent = signal.interpretation;
  }

  function calculate() {
    const inputs = [
      elements.newsValeInput,
      elements.newsPbrInput,
      elements.newsItubInput,
      elements.newsBdoryInput,
      elements.newsBbdInput,
      elements.newsBolsyInput,
    ].filter(Boolean);

    if (inputs.length !== 6) return;

    const values = inputs.map(input => parsePercent(input.value));
    const result = values.reduce((sum, current) => sum + current, 0);
    const signal = determineSignal(result);
    updateDisplays(values, result, signal);
  }

  function setupInput(input) {
    if (!input) return;

    input.value = normalizeInput(input.value);

    const row = input.closest('.abertura-input-row');
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
  }

  function initAberturaNews() {
    const root = document.getElementById('abertura-mode-com-noticia');
    if (!root) return;

    elements.newsValeInput = root.querySelector('#newsValeInput');
    elements.newsPbrInput = root.querySelector('#newsPbrInput');
    elements.newsItubInput = root.querySelector('#newsItubInput');
    elements.newsBdoryInput = root.querySelector('#newsBdoryInput');
    elements.newsBbdInput = root.querySelector('#newsBbdInput');
    elements.newsBolsyInput = root.querySelector('#newsBolsyInput');
    elements.resultValue = root.querySelector('#newsResultValue');
    elements.resultLabel = root.querySelector('#newsResultLabel');
    elements.signalChip = root.querySelector('#newsSignalChip');
    elements.directionText = root.querySelector('#newsDirectionText');
    elements.intensityText = root.querySelector('#newsIntensityText');
    elements.rangeText = root.querySelector('#newsRangeText');
    elements.newsValeDisplay = root.querySelector('#newsValeDisplay');
    elements.newsPbrDisplay = root.querySelector('#newsPbrDisplay');
    elements.newsItubDisplay = root.querySelector('#newsItubDisplay');
    elements.newsBdoryDisplay = root.querySelector('#newsBdoryDisplay');
    elements.newsBbdDisplay = root.querySelector('#newsBbdDisplay');
    elements.newsBolsyDisplay = root.querySelector('#newsBolsyDisplay');
    elements.interpretationText = root.querySelector('#newsInterpretationText');

    [
      elements.newsValeInput,
      elements.newsPbrInput,
      elements.newsItubInput,
      elements.newsBdoryInput,
      elements.newsBbdInput,
      elements.newsBolsyInput,
    ].forEach((input) => {
      if (!input) return;
      input.value = normalizeInput(input.value || defaultValues[input.id] || '0,00');
      setupInput(input);
    });

    calculate();
  }

  window.initAberturaNews = initAberturaNews;
  document.addEventListener('DOMContentLoaded', initAberturaNews);
})();
