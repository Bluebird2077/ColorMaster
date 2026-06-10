(function () {
  'use strict';

  // UI 요소 로드
  var upload = document.getElementById('replace-image-upload');
  var keyColorCountSelect = document.getElementById('key-color-count');
  var sharedPaletteSelect = document.getElementById('replace-palette-select');
  var randomCountInput = document.getElementById('replace-random-count');
  var dedupeStrengthRange = document.getElementById('replace-dedupe-strength');
  var dedupeLabel = document.getElementById('replace-dedupe-label');
  var extractButton = document.getElementById('extract-key-colors');
  var applySharedPaletteButton = document.getElementById('apply-shared-palette');
  var resetButton = document.getElementById('reset-key-remap');
  var openFullscreenButton = document.getElementById('open-remap-fullscreen');
  var closeFullscreenButton = document.getElementById('close-remap-fullscreen');
  var remapFullscreenModal = document.getElementById('remap-fullscreen-modal');
  var remapFullscreenImage = document.getElementById('remap-fullscreen-image');
  var downloadButton = document.getElementById('download-remap');
  var currentPaletteHexList = document.getElementById('current-palette-hex-list');
  var currentPaletteCopyStatus = document.getElementById('current-palette-copy-status');
  var randomResultsWrap = document.getElementById('replace-random-results');
  var keyColorList = document.getElementById('key-color-list');
  var originalCanvas = document.getElementById('replace-original-canvas');
  var remapCanvas = document.getElementById('replace-remap-canvas');

  if (!window.ColorExtraction || !upload || !keyColorCountSelect || !sharedPaletteSelect || !randomCountInput || !dedupeStrengthRange || !dedupeLabel || !extractButton || !applySharedPaletteButton || !resetButton || !openFullscreenButton || !closeFullscreenButton || !remapFullscreenModal || !remapFullscreenImage || !downloadButton || !currentPaletteHexList || !currentPaletteCopyStatus || !randomResultsWrap || !keyColorList || !originalCanvas || !remapCanvas) {
    return;
  }

  var originalCtx = originalCanvas.getContext('2d');
  var remapCtx = remapCanvas.getContext('2d');
  var loadedImage = new Image();
  var keyColorMappings = [];
  var randomCandidates = [];
  var selectedCandidateIndex = -1;
  var sourcePaletteHexes = [];
  loadedImage.crossOrigin = 'anonymous';

  // --- 유틸리티 함수 ---

  function hexToRgb(hex) {
    var normalized = hex.replace('#', '');
    var parsed = parseInt(normalized, 16);
    return {
      r: (parsed >> 16) & 255,
      g: (parsed >> 8) & 255,
      b: parsed & 255
    };
  }

  function normalizeHexNoHash(value) {
    if (typeof value !== 'string') return null;
    var v = value.trim().replace(/^#/, '').toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(v)) return null;
    return v;
  }

  function colorDistanceSq(a, b) {
    return window.ColorExtraction.colorDistanceSq(a, b);
  }

  function clampChannel(v) {
    return v < 0 ? 0 : (v > 255 ? 255 : v);
  }

  function drawContain(ctx, canvas, image) {
    var scale = Math.min(canvas.width / image.width, canvas.height / image.height);
    var w = image.width * scale;
    var h = image.height * scale;
    var x = (canvas.width - w) / 2;
    var y = (canvas.height - h) / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, x, y, w, h);
  }

  function getCanvasImageData(canvas, ctx) {
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  function setCanvasOrientationByImage(image) {
    var w = image.naturalWidth || image.width;
    var h = image.naturalHeight || image.height;
    if (!w || !h) return;
    var isPortrait = h > w;
    var targetW = isPortrait ? 360 : 640;
    var targetH = isPortrait ? 640 : 360;
    originalCanvas.width = targetW;
    originalCanvas.height = targetH;
    remapCanvas.width = targetW;
    remapCanvas.height = targetH;
  }

  function toHexNoHash(hex) {
    return (hex || '').replace('#', '').toUpperCase();
  }

  // --- 렌더링 및 이벤트 ---

  function renderKeyColorList() {
    keyColorList.innerHTML = '';
    if (!keyColorMappings.length) {
      keyColorList.innerHTML = '<p>이미지를 업로드하고 핵심 색상을 추출하세요.</p>';
      renderCurrentPaletteSummary();
      return;
    }

    keyColorMappings.forEach(function (mapping, index) {
      var row = document.createElement('div');
      row.className = 'key-color-row';
      row.innerHTML = `
        <span class="key-color-label">원본</span>
        <span class="key-color-swatch" style="background-color: ${mapping.fromHex}"></span>
        <span class="key-color-arrow">-></span>
        <span class="key-color-label">변경</span>
      `;

      var toInput = document.createElement('input');
      toInput.type = 'color';
      toInput.value = mapping.toHex;
      toInput.addEventListener('input', function () {
        mapping.toHex = toInput.value;
        selectedCandidateIndex = -1;
        renderRandomCandidates();
        applyKeyColorRemap();
      });

      var toHexInput = document.createElement('input');
      toHexInput.type = 'text';
      toHexInput.maxLength = 6;
      toHexInput.placeholder = 'RRGGBB';
      toHexInput.value = mapping.toHex.replace('#', '').toUpperCase();
      toHexInput.addEventListener('change', function () {
        var normalized = normalizeHexNoHash(toHexInput.value);
        if (!normalized) {
          toHexInput.value = mapping.toHex.replace('#', '').toUpperCase();
          return;
        }
        mapping.toHex = '#' + normalized.toLowerCase();
        toInput.value = mapping.toHex;
        selectedCandidateIndex = -1;
        renderRandomCandidates();
        applyKeyColorRemap();
      });

      var pasteBtn = document.createElement('button');
      pasteBtn.type = 'button';
      pasteBtn.className = 'button small';
      pasteBtn.textContent = '붙여넣기';
      pasteBtn.addEventListener('click', function () {
        readTextFromClipboard().then(function (text) {
          var normalized = normalizeHexNoHash(text);
          if (!normalized) {
            currentPaletteCopyStatus.textContent = '클립보드 값이 유효한 HEX(RRGGBB)가 아닙니다.';
            return;
          }
          mapping.toHex = '#' + normalized.toLowerCase();
          toInput.value = mapping.toHex;
          toHexInput.value = normalized;
          selectedCandidateIndex = -1;
          renderRandomCandidates();
          applyKeyColorRemap();
          renderCurrentPaletteSummary();
          currentPaletteCopyStatus.textContent = normalized + ' 붙여넣기 완료';
        }).catch(function () {
          currentPaletteCopyStatus.textContent = '클립보드 읽기에 실패했습니다. 브라우저 권한을 확인하세요.';
        });
      });

      var lockBtn = document.createElement('button');
      lockBtn.type = 'button';
      lockBtn.className = 'button small';
      lockBtn.textContent = mapping.locked ? '잠금됨' : '잠금';
      
      var status = document.createElement('span');
      status.className = 'key-color-status';
      status.textContent = mapping.locked ? '잠금됨' : '편집중';
      if (mapping.locked) {
        status.classList.add('locked');
        toInput.disabled = true;
        toHexInput.disabled = true;
        pasteBtn.disabled = true;
      }

      lockBtn.addEventListener('click', function () {
        mapping.locked = !mapping.locked;
        toInput.disabled = mapping.locked;
        toHexInput.disabled = mapping.locked;
        pasteBtn.disabled = mapping.locked;
        lockBtn.textContent = mapping.locked ? '잠금됨' : '잠금';
        status.textContent = mapping.locked ? '잠금됨' : '편집중';
        status.classList.toggle('locked', mapping.locked);
        selectedCandidateIndex = -1;
        renderRandomCandidates();
        applyKeyColorRemap();
      });
      
      row.appendChild(toInput);
      row.appendChild(toHexInput);
      row.appendChild(pasteBtn);
      row.appendChild(lockBtn);
      row.appendChild(status);
      keyColorList.appendChild(row);
    });
    renderCurrentPaletteSummary();
  }

  function renderCurrentPaletteSummary() {
    currentPaletteHexList.innerHTML = '';
    if (!sourcePaletteHexes.length) {
      currentPaletteCopyStatus.textContent = '';
      return;
    }
    sourcePaletteHexes.forEach(function (hex) {
      var row = document.createElement('div');
      row.className = 'palette-hex-row';

      var item = document.createElement('span');
      item.className = 'art-tool-swatch';
      item.style.backgroundColor = hex;
      item.title = toHexNoHash(hex);
      row.appendChild(item);

      var code = document.createElement('span');
      code.className = 'key-color-status';
      code.textContent = toHexNoHash(hex);
      row.appendChild(code);

      var copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'button small';
      copyBtn.textContent = '복사';
      copyBtn.addEventListener('click', function () {
        copyTextToClipboard(toHexNoHash(hex)).then(function () {
          currentPaletteCopyStatus.textContent = toHexNoHash(hex) + ' 복사됨';
        }).catch(function () {
          currentPaletteCopyStatus.textContent = '복사에 실패했습니다. 브라우저 권한을 확인하세요.';
        });
      });
      row.appendChild(copyBtn);

      currentPaletteHexList.appendChild(row);
    });
  }

  function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (e) {
        document.body.removeChild(ta);
        reject(e);
      }
    });
  }

  function readTextFromClipboard() {
    if (navigator.clipboard && navigator.clipboard.readText) {
      return navigator.clipboard.readText();
    }
    return Promise.reject(new Error('clipboard-read-not-supported'));
  }

  function openFullscreenPreview() {
    if (!loadedImage.src) return;
    remapFullscreenImage.src = remapCanvas.toDataURL('image/png');
    remapFullscreenModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeFullscreenPreview() {
    remapFullscreenModal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function clearRandomCandidates() {
    randomCandidates = [];
    selectedCandidateIndex = -1;
    randomResultsWrap.innerHTML = '';
  }

  function getRequestedRandomCount() {
    var raw = parseInt(randomCountInput.value, 10);
    if (isNaN(raw)) raw = 8;
    if (raw < 1) raw = 1;
    if (raw > 24) raw = 24;
    randomCountInput.value = String(raw);
    return raw;
  }

  function getSharedPalettes() {
    if (window.PaletteStore && typeof window.PaletteStore.getAllPalettes === 'function') {
      return window.PaletteStore.getAllPalettes();
    }
    return [];
  }

  function populateSharedPaletteSelect() {
    var palettes = getSharedPalettes();
    sharedPaletteSelect.innerHTML = '';
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '팔레트를 선택하세요';
    placeholder.selected = true;
    sharedPaletteSelect.appendChild(placeholder);

    if (!palettes.length) {
      placeholder.textContent = '사용 가능한 팔레트 없음';
      return;
    }
    palettes.forEach(function (p, idx) {
      var opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = p.name;
      sharedPaletteSelect.appendChild(opt);
    });
  }

  function applyKeyColorRemap() {
    if (!loadedImage.src) return;
    var source = getCanvasImageData(originalCanvas, originalCtx);
    var out = remapCtx.createImageData(source.width, source.height);
    
    var replacements = keyColorMappings.map(function (m) {
      var to = hexToRgb(m.toHex);
      return {
        from: m.from,
        delta: {
          r: m.locked ? 0 : (to.r - m.from.r),
          g: m.locked ? 0 : (to.g - m.from.g),
          b: m.locked ? 0 : (to.b - m.from.b)
        }
      };
    });

    for (var i = 0; i < source.data.length; i += 4) {
      var pixel = { r: source.data[i], g: source.data[i + 1], b: source.data[i + 2] };
      var nearest = replacements[0], nearestDist = colorDistanceSq(pixel, replacements[0].from);
      for (var r = 1; r < replacements.length; r++) {
        var d = colorDistanceSq(pixel, replacements[r].from);
        if (d < nearestDist) { nearestDist = d; nearest = replacements[r]; }
      }
      out.data[i] = clampChannel(pixel.r + nearest.delta.r);
      out.data[i + 1] = clampChannel(pixel.g + nearest.delta.g);
      out.data[i + 2] = clampChannel(pixel.b + nearest.delta.b);
      out.data[i + 3] = source.data[i + 3];
    }
    remapCtx.putImageData(out, 0, 0);
  }

  function remapImageData(source) {
    var out = new ImageData(source.width, source.height);
    var replacements = keyColorMappings.map(function (m) {
      var to = hexToRgb(m.toHex);
      return {
        from: m.from,
        delta: {
          r: m.locked ? 0 : (to.r - m.from.r),
          g: m.locked ? 0 : (to.g - m.from.g),
          b: m.locked ? 0 : (to.b - m.from.b)
        }
      };
    });

    for (var i = 0; i < source.data.length; i += 4) {
      var pixel = { r: source.data[i], g: source.data[i + 1], b: source.data[i + 2] };
      var nearest = replacements[0];
      var nearestDist = colorDistanceSq(pixel, replacements[0].from);
      for (var r = 1; r < replacements.length; r++) {
        var d = colorDistanceSq(pixel, replacements[r].from);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = replacements[r];
        }
      }
      out.data[i] = clampChannel(pixel.r + nearest.delta.r);
      out.data[i + 1] = clampChannel(pixel.g + nearest.delta.g);
      out.data[i + 2] = clampChannel(pixel.b + nearest.delta.b);
      out.data[i + 3] = source.data[i + 3];
    }
    return out;
  }

  function remapImageDataWithMappings(source, mappings) {
    var out = new ImageData(source.width, source.height);
    var replacements = mappings.map(function (m) {
      var to = hexToRgb(m.toHex);
      return {
        from: m.from,
        delta: {
          r: m.locked ? 0 : (to.r - m.from.r),
          g: m.locked ? 0 : (to.g - m.from.g),
          b: m.locked ? 0 : (to.b - m.from.b)
        }
      };
    });
    for (var i = 0; i < source.data.length; i += 4) {
      var pixel = { r: source.data[i], g: source.data[i + 1], b: source.data[i + 2] };
      var nearest = replacements[0];
      var nearestDist = colorDistanceSq(pixel, replacements[0].from);
      for (var r = 1; r < replacements.length; r++) {
        var d = colorDistanceSq(pixel, replacements[r].from);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = replacements[r];
        }
      }
      out.data[i] = clampChannel(pixel.r + nearest.delta.r);
      out.data[i + 1] = clampChannel(pixel.g + nearest.delta.g);
      out.data[i + 2] = clampChannel(pixel.b + nearest.delta.b);
      out.data[i + 3] = source.data[i + 3];
    }
    return out;
  }

  function applyCandidate(index) {
    if (index < 0 || index >= randomCandidates.length) return;
    var candidate = randomCandidates[index];
    for (var i = 0; i < keyColorMappings.length; i++) {
      if (!keyColorMappings[i].locked) {
        keyColorMappings[i].toHex = candidate.toHexes[i];
      }
    }
    selectedCandidateIndex = index;
    renderRandomCandidates();
    renderKeyColorList();
    applyKeyColorRemap();
  }

  function renderRandomCandidates() {
    randomResultsWrap.innerHTML = '';
    if (!randomCandidates.length) return;

    var source = getCanvasImageData(originalCanvas, originalCtx);
    randomCandidates.forEach(function (candidate, idx) {
      var card = document.createElement('div');
      card.className = 'art-tool-compare-card is-clickable' + (idx === selectedCandidateIndex ? ' is-selected' : '');

      var title = document.createElement('h4');
      title.textContent = '랜덤 후보 ' + (idx + 1);
      card.appendChild(title);

      var previewCanvas = document.createElement('canvas');
      previewCanvas.width = source.width;
      previewCanvas.height = source.height;
      var pctx = previewCanvas.getContext('2d');
      pctx.putImageData(remapImageDataWithMappings(source, candidate.mappings), 0, 0);
      card.appendChild(previewCanvas);

      var swatches = document.createElement('div');
      swatches.className = 'art-tool-swatches';
      for (var i = 0; i < candidate.mappings.length; i++) {
        var sw = document.createElement('span');
        sw.className = 'art-tool-swatch';
        sw.style.backgroundColor = candidate.mappings[i].toHex;
        swatches.appendChild(sw);
      }
      card.appendChild(swatches);

      card.addEventListener('click', function () {
        applyCandidate(idx);
      });
      randomResultsWrap.appendChild(card);
    });
  }

  function shuffleArray(items) {
    var arr = items.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function buildBalancedColorBag(paletteColors, slotCount, seed) {
    var p = paletteColors.length;
    if (!p || slotCount <= 0) return [];
    var base = Math.floor(slotCount / p);
    var remainder = slotCount % p;
    var order = shuffleArray(paletteColors);
    if (seed && p > 1) {
      var shift = seed % p;
      order = order.slice(shift).concat(order.slice(0, shift));
    }

    var bag = [];
    for (var i = 0; i < p; i++) {
      var take = base + (i < remainder ? 1 : 0);
      for (var t = 0; t < take; t++) {
        bag.push(order[i]);
      }
    }
    return shuffleArray(bag);
  }

  function buildRandomCandidates(paletteColors, count) {
    var unlockedIndices = [];
    for (var i = 0; i < keyColorMappings.length; i++) {
      if (!keyColorMappings[i].locked) unlockedIndices.push(i);
    }
    if (!unlockedIndices.length) return [];

    var candidates = [];
    var seen = {};
    var tries = 0;
    var maxTries = count * 20;

    while (candidates.length < count && tries < maxTries) {
      tries += 1;
      var base = keyColorMappings.map(function (m) {
        return { from: m.from, fromHex: m.fromHex, toHex: m.toHex, locked: m.locked };
      });

      // 한 후보 이미지 내에서 팔레트 색 사용량 편차가 1 이하가 되도록 균등 분배
      var bag = buildBalancedColorBag(paletteColors, unlockedIndices.length, tries);
      for (var u = 0; u < unlockedIndices.length; u++) {
        var idx = unlockedIndices[u];
        base[idx].toHex = bag[u % bag.length];
      }

      var sigParts = [];
      for (var s = 0; s < unlockedIndices.length; s++) {
        var si = unlockedIndices[s];
        sigParts.push(si + ':' + base[si].toHex);
      }
      var sig = sigParts.join('|');
      if (seen[sig]) continue;
      seen[sig] = true;

      candidates.push({
        mappings: base,
        toHexes: base.map(function (m) { return m.toHex; })
      });
    }

    return candidates;
  }

  function extractKeyColors() {
    if (!loadedImage.src) return;
    var source = getCanvasImageData(originalCanvas, originalCtx);
    var extraction = window.ColorExtraction.extractFromImageDataUsingControl(source, keyColorCountSelect, {
      minCount: 3,
      maxCount: 8,
      dedupeFactor: window.ColorExtraction.getDedupeFactorFromControl(dedupeStrengthRange, 0.55)
    });
    var colors = extraction.colors;

    keyColorMappings = colors.map(function (rgb) {
      var hex = window.ColorExtraction.rgbToHex(rgb);
      return { from: rgb, fromHex: hex, toHex: hex, locked: false };
    });
    clearRandomCandidates();
    renderKeyColorList();
    applyKeyColorRemap();
  }

  function applySelectedSharedPalette() {
    if (!keyColorMappings.length) return;
    var palettes = getSharedPalettes();
    var idx = parseInt(sharedPaletteSelect.value, 10);
    if (isNaN(idx) || !palettes[idx] || !Array.isArray(palettes[idx].colors)) return;
    var colors = palettes[idx].colors;
    if (!colors.length) return;
    sourcePaletteHexes = colors.map(function (hex) {
      var normalized = normalizeHexNoHash(hex);
      return normalized ? ('#' + normalized) : '';
    }).filter(function (hex) {
      return !!hex;
    });
    renderCurrentPaletteSummary();
    randomCandidates = buildRandomCandidates(colors, getRequestedRandomCount());
    if (!randomCandidates.length) {
      clearRandomCandidates();
      return;
    }
    selectedCandidateIndex = 0;
    applyCandidate(0);
  }

  upload.addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (evt) {
      loadedImage.onload = function () {
        setCanvasOrientationByImage(loadedImage);
        drawContain(originalCtx, originalCanvas, loadedImage);
        drawContain(remapCtx, remapCanvas, loadedImage);
        extractKeyColors();
      };
      loadedImage.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  });

  extractButton.addEventListener('click', extractKeyColors);
  applySharedPaletteButton.addEventListener('click', applySelectedSharedPalette);
  sharedPaletteSelect.addEventListener('change', function () {
    applySelectedSharedPalette();
  });
  randomCountInput.addEventListener('change', function () {
    getRequestedRandomCount();
  });
  openFullscreenButton.addEventListener('click', openFullscreenPreview);
  closeFullscreenButton.addEventListener('click', closeFullscreenPreview);
  remapFullscreenModal.addEventListener('click', function (e) {
    if (e.target === remapFullscreenModal) {
      closeFullscreenPreview();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !remapFullscreenModal.classList.contains('hidden')) {
      closeFullscreenPreview();
    }
  });
  resetButton.addEventListener('click', function () {
    keyColorMappings.forEach(function (m) { m.toHex = m.fromHex; m.locked = false; });
    clearRandomCandidates();
    renderKeyColorList(); applyKeyColorRemap();
  });
  
  downloadButton.addEventListener('click', function () {
    if (!loadedImage.src) return;
    var w = loadedImage.naturalWidth || loadedImage.width;
    var h = loadedImage.naturalHeight || loadedImage.height;
    if (!w || !h) return;

    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    var tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(loadedImage, 0, 0, w, h);

    if (keyColorMappings.length) {
      var src = tempCtx.getImageData(0, 0, w, h);
      var remapped = remapImageData(src);
      tempCtx.putImageData(remapped, 0, 0);
    }

    var link = document.createElement('a');
    link.href = tempCanvas.toDataURL('image/png');
    link.download = 'color-replace-result.png';
    link.click();
  });

  renderKeyColorList();
  getRequestedRandomCount();
  window.ColorExtraction.bindDedupeLabel(dedupeStrengthRange, dedupeLabel, 0.55);
  window.ColorExtraction.populateCountSelect(keyColorCountSelect, {
    minCount: 3,
    maxCount: 8,
    includeAuto: true,
    autoLabel: '자동',
    defaultValue: '5',
    defaultValueLabel: '5 (기본값)'
  });
  populateSharedPaletteSelect();
})();