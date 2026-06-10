(function () {
  'use strict';

  var nameInput = document.getElementById('custom-palette-name');
  var imageUpload = document.getElementById('custom-image-upload');
  var dedupeStrengthRange = document.getElementById('custom-dedupe-strength');
  var dedupeLabel = document.getElementById('custom-dedupe-label');
  var colorCountSelect = document.getElementById('custom-color-count');
  var extractBtn = document.getElementById('extract-custom-colors');
  var addBtn = document.getElementById('add-custom-color');
  var removeBtn = document.getElementById('remove-custom-color');
  var saveBtn = document.getElementById('save-custom-palette');
  var colorsWrap = document.getElementById('custom-palette-colors');
  var selectedSourceSwatch = document.getElementById('custom-selected-source-swatch');
  var selectedColorInput = document.getElementById('custom-selected-color-input');
  var selectedHexInput = document.getElementById('custom-selected-hex-input');
  var savedWrap = document.getElementById('saved-custom-palettes');
  var status = document.getElementById('custom-palette-status');

  if (!window.PaletteStore || !window.ColorExtraction || !nameInput || !imageUpload || !dedupeStrengthRange || !dedupeLabel || !colorCountSelect || !extractBtn || !addBtn || !removeBtn || !saveBtn || !colorsWrap || !selectedSourceSwatch || !selectedColorInput || !selectedHexInput || !savedWrap || !status) {
    return;
  }

  var currentColors = ['#ff0000', '#00ffcc', '#3366ff', '#ffd700'];
  var loadedImage = new Image();
  var selectedColorIndex = 0;
  var selectedSourceHex = currentColors[0];

  function setStatus(msg) {
    status.textContent = msg || '';
  }

  function updateSelectedColorEditor() {
    if (!currentColors.length) return;
    if (selectedColorIndex < 0) selectedColorIndex = 0;
    if (selectedColorIndex >= currentColors.length) selectedColorIndex = currentColors.length - 1;
    var hex = currentColors[selectedColorIndex];
    selectedSourceSwatch.style.backgroundColor = selectedSourceHex || hex;
    selectedColorInput.value = hex;
    selectedHexInput.value = hex.replace('#', '').toUpperCase();
  }

  function normalizeHexNoHash(value) {
    if (typeof value !== 'string') return null;
    var v = value.trim().replace(/^#/, '').toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(v)) return null;
    return v;
  }

  function sanitizeFileName(name) {
    return (name || 'palette')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 60);
  }

  function downloadPaletteAsImage(palette) {
    if (!palette || !Array.isArray(palette.colors) || !palette.colors.length) {
      return;
    }
    var swatchW = 102;
    var swatchH = 88;
    var hexH = 28;
    var pad = 12;
    var titleH = 26;
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(300, (swatchW * palette.colors.length) + (pad * 2));
    canvas.height = titleH + swatchH + hexH + (pad * 2);
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#3d4449';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(palette.name || 'Palette', pad, pad + 12);

    for (var i = 0; i < palette.colors.length; i++) {
      var x = pad + (i * swatchW);
      var y = pad + titleH;
      ctx.fillStyle = palette.colors[i];
      ctx.fillRect(x, y, swatchW, swatchH);
      ctx.strokeStyle = 'rgba(61, 68, 73, 0.2)';
      ctx.strokeRect(x + 0.5, y + 0.5, swatchW - 1, swatchH - 1);

      ctx.fillStyle = '#3d4449';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(palette.colors[i].toUpperCase(), x + (swatchW / 2), y + swatchH + 18);
    }

    var link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = sanitizeFileName(palette.name || 'palette') + '.png';
    link.click();
  }

  function renderColorEditors() {
    colorsWrap.innerHTML = '';
    if (selectedColorIndex >= currentColors.length) {
      selectedColorIndex = currentColors.length - 1;
    }
    currentColors.forEach(function (hex, idx) {
      var input = document.createElement('input');
      input.type = 'color';
      input.value = hex;
      input.setAttribute('aria-label', 'custom-color-' + idx);
      input.classList.toggle('is-selected-color', idx === selectedColorIndex);
      input.addEventListener('input', function () {
        currentColors[idx] = input.value;
        updateSelectedColorEditor();
      });
      function selectThis() {
        selectedColorIndex = idx;
        selectedSourceHex = currentColors[idx];
        renderColorEditors();
      }
      input.addEventListener('click', selectThis);
      input.addEventListener('focus', selectThis);
      colorsWrap.appendChild(input);
    });
    updateSelectedColorEditor();
  }

  function renderSavedPalettes() {
    var custom = window.PaletteStore.getCustomPalettes();
    savedWrap.innerHTML = '';

    if (!custom.length) {
      var p = document.createElement('p');
      p.textContent = '저장된 커스텀 팔레트가 없습니다.';
      savedWrap.appendChild(p);
      return;
    }

    custom.forEach(function (palette, idx) {
      var card = document.createElement('div');
      card.className = 'art-tool-compare-card';
      var h = document.createElement('h4');
      h.textContent = palette.name;
      card.appendChild(h);

      var swatches = document.createElement('div');
      swatches.className = 'art-tool-swatches';
      palette.colors.forEach(function (hex) {
        var chip = document.createElement('span');
        chip.className = 'art-tool-swatch';
        chip.style.backgroundColor = hex;
        swatches.appendChild(chip);
      });
      card.appendChild(swatches);

      var actions = document.createElement('div');
      actions.className = 'art-tool-actions';
      var useBtn = document.createElement('button');
      useBtn.className = 'button small';
      useBtn.type = 'button';
      useBtn.textContent = '불러오기';
      useBtn.addEventListener('click', function () {
        nameInput.value = palette.name;
        currentColors = palette.colors.slice();
        selectedColorIndex = 0;
        selectedSourceHex = currentColors[0];
        renderColorEditors();
        setStatus('저장 팔레트를 불러왔습니다.');
      });
      var delBtn = document.createElement('button');
      delBtn.className = 'button small';
      delBtn.type = 'button';
      delBtn.textContent = '삭제';
      delBtn.addEventListener('click', function () {
        var list = window.PaletteStore.getCustomPalettes();
        list.splice(idx, 1);
        window.PaletteStore.saveCustomPalettes(list);
        renderSavedPalettes();
        setStatus('팔레트를 삭제했습니다.');
      });
      var saveImageBtn = document.createElement('button');
      saveImageBtn.className = 'button small';
      saveImageBtn.type = 'button';
      saveImageBtn.textContent = '이미지로 저장';
      saveImageBtn.addEventListener('click', function () {
        downloadPaletteAsImage(palette);
        setStatus('팔레트를 이미지로 저장했습니다.');
      });
      actions.appendChild(useBtn);
      actions.appendChild(delBtn);
      actions.appendChild(saveImageBtn);
      card.appendChild(actions);

      savedWrap.appendChild(card);
    });
  }

  function extractFromImage() {
    if (!loadedImage.src) {
      setStatus('먼저 이미지를 업로드하세요.');
      return;
    }

    var temp = document.createElement('canvas');
    var w = loadedImage.naturalWidth || loadedImage.width;
    var h = loadedImage.naturalHeight || loadedImage.height;
    temp.width = w;
    temp.height = h;
    var tctx = temp.getContext('2d');
    tctx.drawImage(loadedImage, 0, 0, w, h);
    var img = tctx.getImageData(0, 0, w, h);

    var extraction = window.ColorExtraction.extractFromImageDataUsingControl(img, colorCountSelect, {
      minCount: 3,
      maxCount: 8,
      dedupeFactor: window.ColorExtraction.getDedupeFactorFromControl(dedupeStrengthRange, 0.55)
    });

    currentColors = extraction.hexColors.slice(0, 8);
    if (currentColors.length < 2) {
      currentColors = ['#ff0000', '#00ffcc', '#3366ff'];
    }
    selectedColorIndex = 0;
    selectedSourceHex = currentColors[0];
    renderColorEditors();
    setStatus('이미지에서 색상을 추출했습니다.');
  }

  imageUpload.addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) {
      return;
    }
    var reader = new FileReader();
    reader.onload = function (evt) {
      loadedImage.onload = function () {
        extractFromImage();
      };
      loadedImage.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  });

  extractBtn.addEventListener('click', extractFromImage);
  addBtn.addEventListener('click', function () {
    if (currentColors.length < 12) {
      currentColors.push('#ffffff');
      selectedColorIndex = currentColors.length - 1;
      renderColorEditors();
    }
  });
  removeBtn.addEventListener('click', function () {
    if (currentColors.length <= 2) return;
    if (selectedColorIndex < 0 || selectedColorIndex >= currentColors.length) {
      setStatus('제거할 색상을 먼저 선택하세요.');
      return;
    }
    currentColors.splice(selectedColorIndex, 1);
    if (selectedColorIndex >= currentColors.length) {
      selectedColorIndex = currentColors.length - 1;
    }
    selectedSourceHex = currentColors[selectedColorIndex];
    renderColorEditors();
    setStatus('선택한 색상을 제거했습니다.');
  });
  selectedColorInput.addEventListener('input', function () {
    if (!currentColors.length) return;
    currentColors[selectedColorIndex] = selectedColorInput.value;
    renderColorEditors();
  });
  selectedHexInput.addEventListener('change', function () {
    if (!currentColors.length) return;
    var normalized = normalizeHexNoHash(selectedHexInput.value);
    if (!normalized) {
      updateSelectedColorEditor();
      setStatus('색상코드는 6자리 HEX(RRGGBB) 형식으로 입력하세요.');
      return;
    }
    currentColors[selectedColorIndex] = '#' + normalized.toLowerCase();
    renderColorEditors();
  });
  saveBtn.addEventListener('click', function () {
    var name = nameInput.value.trim() || 'My Palette';
    var custom = window.PaletteStore.getCustomPalettes();
    custom.push({ name: name, colors: currentColors.slice() });
    window.PaletteStore.saveCustomPalettes(custom);
    renderSavedPalettes();
    setStatus('팔레트를 저장했습니다. 다른 페이지에서 바로 사용할 수 있습니다.');
  });

  renderColorEditors();
  renderSavedPalettes();
  window.ColorExtraction.bindDedupeLabel(dedupeStrengthRange, dedupeLabel, 0.55);
  window.ColorExtraction.populateCountSelect(colorCountSelect, {
    minCount: 3,
    maxCount: 8,
    includeAuto: true,
    autoLabel: '자동',
    defaultValue: '5',
    defaultValueLabel: '5 (기본값)'
  });
})();
