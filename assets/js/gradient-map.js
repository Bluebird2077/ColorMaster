(function () {
  'use strict';

  var palettes = [];
  var defaultPaletteCount = 0;

  var imageUpload = document.getElementById('image-upload');
  var paletteSelect = document.getElementById('palette-select');
  var mixRange = document.getElementById('mix-range');
  var mixValue = document.getElementById('mix-value');
  var swatches = document.getElementById('palette-swatches');
  var paletteEditorColors = document.getElementById('palette-editor-colors');
  var addPaletteColorButton = document.getElementById('add-palette-color');
  var removePaletteColorButton = document.getElementById('remove-palette-color');
  var resetPalettesButton = document.getElementById('reset-palettes');
  var downloadMappedButton = document.getElementById('download-mapped');
  var compareButton = document.getElementById('toggle-compare');
  var compareGrid = document.getElementById('palette-compare');
  var originalCanvas = document.getElementById('original-canvas');
  var mappedCanvas = document.getElementById('mapped-canvas');

  if (
    !imageUpload || !paletteSelect || !mixRange || !mixValue || !swatches ||
    !paletteEditorColors || !addPaletteColorButton || !removePaletteColorButton || !resetPalettesButton ||
    !downloadMappedButton || !compareButton || !compareGrid ||
    !originalCanvas || !mappedCanvas
  ) {
    return;
  }

  var originalCtx = originalCanvas.getContext('2d');
  var mappedCtx = mappedCanvas.getContext('2d');
  var loadedImage = new Image();
  var compareVisible = false;
  loadedImage.crossOrigin = 'anonymous';

  function getDefaultPalettes() {
    if (window.PaletteStore && typeof window.PaletteStore.getDefaults === 'function') {
      return window.PaletteStore.getDefaults();
    }
    return [
      { name: 'Cinematic Warm', colors: ['#140b0b', '#5a2f15', '#c8742d', '#f9d995'] },
      { name: 'Cyberpunk Neon', colors: ['#09040f', '#301060', '#00c5ff', '#ff66c4'] },
      { name: 'Forest Mist', colors: ['#0d1c14', '#2f5e41', '#78a36f', '#d9e5c2'] },
      { name: 'Noir Blue', colors: ['#05080f', '#1a2940', '#4f6c93', '#c8d6ea'] }
    ];
  }

  function getAllPalettesFromStore() {
    if (window.PaletteStore && typeof window.PaletteStore.getAllPalettes === 'function') {
      return window.PaletteStore.getAllPalettes();
    }
    return getDefaultPalettes();
  }

  function savePalettes() {
    if (window.PaletteStore && typeof window.PaletteStore.saveCustomPalettes === 'function') {
      // Save custom palettes only (defaults remain immutable base set).
      window.PaletteStore.saveCustomPalettes(palettes.slice(defaultPaletteCount));
    }
  }

  function loadPalettes() {
    var defaults = getDefaultPalettes();
    defaultPaletteCount = defaults.length;
    palettes = getAllPalettesFromStore();
  }

  function refreshPaletteSelectOptions() {
    var currentIndex = parseInt(paletteSelect.value, 10);
    if (isNaN(currentIndex)) {
      currentIndex = 0;
    }

    paletteSelect.innerHTML = '';
    populatePalettes();

    if (currentIndex >= palettes.length) {
      currentIndex = palettes.length - 1;
    }
    if (currentIndex < 0) {
      currentIndex = 0;
    }
    paletteSelect.value = String(currentIndex);
  }

  function hexToRgb(hex) {
    var normalized = hex.replace('#', '');
    var parsed = parseInt(normalized, 16);
    return {
      r: (parsed >> 16) & 255,
      g: (parsed >> 8) & 255,
      b: parsed & 255
    };
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function getGradientColor(paletteColors, t) {
    var segmentCount = paletteColors.length - 1;
    if (segmentCount <= 0) {
      return hexToRgb(paletteColors[0]);
    }

    var scaled = t * segmentCount;
    var index = Math.min(Math.floor(scaled), segmentCount - 1);
    var localT = scaled - index;

    var c1 = hexToRgb(paletteColors[index]);
    var c2 = hexToRgb(paletteColors[index + 1]);

    return {
      r: Math.round(lerp(c1.r, c2.r, localT)),
      g: Math.round(lerp(c1.g, c2.g, localT)),
      b: Math.round(lerp(c1.b, c2.b, localT))
    };
  }

  function drawContain(ctx, canvas, image) {
    var scale = Math.min(canvas.width / image.width, canvas.height / image.height);
    var w = image.width * scale;
    var h = image.height * scale;
    var x = (canvas.width - w) / 2;
    var y = (canvas.height - h) / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#101319';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, x, y, w, h);
  }

  function renderSwatches(colors) {
    swatches.innerHTML = '';
    colors.forEach(function (hex) {
      var chip = document.createElement('span');
      chip.className = 'art-tool-swatch';
      chip.title = hex;
      chip.style.backgroundColor = hex;
      swatches.appendChild(chip);
    });
  }

  function getSelectedPalette() {
    return palettes[parseInt(paletteSelect.value, 10)] || palettes[0];
  }

  function mapFromSourceToTarget(sourceImageData, targetImageData, palette, mix) {
    for (var i = 0; i < sourceImageData.data.length; i += 4) {
      var r = sourceImageData.data[i];
      var g = sourceImageData.data[i + 1];
      var b = sourceImageData.data[i + 2];
      var a = sourceImageData.data[i + 3];

      var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      var mapped = getGradientColor(palette.colors, luminance);

      targetImageData.data[i] = Math.round(lerp(r, mapped.r, mix));
      targetImageData.data[i + 1] = Math.round(lerp(g, mapped.g, mix));
      targetImageData.data[i + 2] = Math.round(lerp(b, mapped.b, mix));
      targetImageData.data[i + 3] = a;
    }
  }

  function applyGradientMap(shouldRefreshEditor) {
    if (!loadedImage.src) {
      return;
    }

    drawContain(originalCtx, originalCanvas, loadedImage);
    var src = originalCtx.getImageData(0, 0, originalCanvas.width, originalCanvas.height);
    var dst = mappedCtx.createImageData(src.width, src.height);
    var palette = getSelectedPalette();
    var mix = parseInt(mixRange.value, 10) / 100;

    mapFromSourceToTarget(src, dst, palette, mix);

    mappedCtx.putImageData(dst, 0, 0);
    renderSwatches(palette.colors);
    if (shouldRefreshEditor) {
      renderPaletteEditor(palette);
    }
    if (compareVisible) {
      renderCompareGrid();
    }
  }

  function populatePalettes() {
    palettes.forEach(function (palette, index) {
      var option = document.createElement('option');
      option.value = String(index);
      option.textContent = palette.name;
      paletteSelect.appendChild(option);
    });
  }

  function renderPaletteEditor(palette) {
    paletteEditorColors.innerHTML = '';
    var selectedIndex = parseInt(paletteSelect.value, 10);
    var readonlyDefault = !isNaN(selectedIndex) && selectedIndex < defaultPaletteCount;
    palette.colors.forEach(function (hex, index) {
      var input = document.createElement('input');
      input.type = 'color';
      input.value = hex;
      input.setAttribute('aria-label', 'palette-color-' + index);
      input.disabled = readonlyDefault;
      input.addEventListener('input', function () {
        palette.colors[index] = input.value;
        savePalettes();
        applyGradientMap(false);
      });
      paletteEditorColors.appendChild(input);
    });
  }

  function createCompareCard(palette, sourceImageData, mix) {
    var card = document.createElement('div');
    card.className = 'art-tool-compare-card';

    var title = document.createElement('h4');
    title.textContent = palette.name;
    card.appendChild(title);

    var canvas = document.createElement('canvas');
    canvas.width = originalCanvas.width;
    canvas.height = originalCanvas.height;
    var ctx = canvas.getContext('2d');
    var out = ctx.createImageData(sourceImageData.width, sourceImageData.height);
    mapFromSourceToTarget(sourceImageData, out, palette, mix);
    ctx.putImageData(out, 0, 0);
    card.appendChild(canvas);

    return card;
  }

  function renderCompareGrid() {
    if (!loadedImage.src) {
      return;
    }

    var sourceImageData = originalCtx.getImageData(0, 0, originalCanvas.width, originalCanvas.height);
    var mix = parseInt(mixRange.value, 10) / 100;
    compareGrid.innerHTML = '';
    palettes.forEach(function (palette) {
      compareGrid.appendChild(createCompareCard(palette, sourceImageData, mix));
    });
  }

  function loadDefaultImage() {
    loadedImage.onload = applyGradientMap;
    loadedImage.src = 'images/pic10.jpg';
  }

  imageUpload.addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) {
      return;
    }
    var reader = new FileReader();
    reader.onload = function (evt) {
      loadedImage.onload = applyGradientMap;
      loadedImage.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  });

  paletteSelect.addEventListener('change', function () {
    renderPaletteEditor(getSelectedPalette());
    applyGradientMap(false);
  });
  mixRange.addEventListener('input', function () {
    mixValue.textContent = mixRange.value + '%';
    applyGradientMap(false);
  });
  addPaletteColorButton.addEventListener('click', function () {
    var palette = getSelectedPalette();
    if (palette.colors.length < 8) {
      palette.colors.push('#ffffff');
      savePalettes();
      applyGradientMap(true);
    }
  });
  removePaletteColorButton.addEventListener('click', function () {
    var palette = getSelectedPalette();
    if (palette.colors.length > 2) {
      palette.colors.pop();
      savePalettes();
      applyGradientMap(true);
    }
  });
  resetPalettesButton.addEventListener('click', function () {
    loadPalettes();
    refreshPaletteSelectOptions();
    renderPaletteEditor(getSelectedPalette());
    applyGradientMap(false);
  });
  downloadMappedButton.addEventListener('click', function () {
    var link = document.createElement('a');
    link.href = mappedCanvas.toDataURL('image/png');
    link.download = 'gradient-mapped.png';
    link.click();
  });
  compareButton.addEventListener('click', function () {
    compareVisible = !compareVisible;
    compareGrid.classList.toggle('hidden', !compareVisible);
    compareButton.textContent = compareVisible ? '전체 팔레트 비교 숨기기' : '전체 팔레트 비교 보기';
    if (compareVisible) {
      renderCompareGrid();
    }
  });
  loadPalettes();
  refreshPaletteSelectOptions();
  renderPaletteEditor(getSelectedPalette());
  mixValue.textContent = mixRange.value + '%';
  loadDefaultImage();
})();
