(function () {
  'use strict';

  function clamp(v) {
    return v < 0 ? 0 : (v > 255 ? 255 : v);
  }

  function colorDistanceSq(a, b) {
    var dr = a.r - b.r;
    var dg = a.g - b.g;
    var db = a.b - b.b;
    return dr * dr + dg * dg + db * db;
  }

  function getSaturation(rgb) {
    var max = Math.max(rgb.r, rgb.g, rgb.b);
    var min = Math.min(rgb.r, rgb.g, rgb.b);
    if (max === 0) return 0;
    return (max - min) / max;
  }

  function rgbToHex(rgb) {
    function c(v) {
      var x = clamp(v).toString(16);
      return x.length === 1 ? '0' + x : x;
    }
    return '#' + c(rgb.r) + c(rgb.g) + c(rgb.b);
  }

  function samplePixels(imageData, step) {
    var out = [];
    for (var y = 0; y < imageData.height; y += step) {
      for (var x = 0; x < imageData.width; x += step) {
        var idx = (y * imageData.width + x) * 4;
        if (imageData.data[idx + 3] < 20) continue;
        out.push({
          r: imageData.data[idx],
          g: imageData.data[idx + 1],
          b: imageData.data[idx + 2]
        });
      }
    }
    return out;
  }

  function getAdaptiveStep(imageData) {
    var minEdge = Math.min(imageData.width, imageData.height);
    return minEdge > 1400 ? 3 : (minEdge > 700 ? 2 : 1);
  }

  function estimateAutoCount(pixelSamples, minCount, maxCount) {
    if (!pixelSamples.length) return minCount;
    var sampleSize = Math.min(pixelSamples.length, 2500);
    var step = Math.max(1, Math.floor(pixelSamples.length / sampleSize));
    var bins = {};
    var sumL = 0;
    var sumL2 = 0;
    var picked = 0;

    for (var i = 0; i < pixelSamples.length; i += step) {
      var p = pixelSamples[i];
      var l = 0.299 * p.r + 0.587 * p.g + 0.114 * p.b;
      sumL += l;
      sumL2 += l * l;
      picked += 1;
      var key = (p.r >> 4) + '-' + (p.g >> 4) + '-' + (p.b >> 4);
      bins[key] = 1;
    }

    var mean = sumL / picked;
    var std = Math.sqrt(Math.max(0, sumL2 / picked - mean * mean));
    var uniqueScore = Math.min(1, Object.keys(bins).length / 120);
    var complexity = (Math.min(1, std / 45) * 0.6) + (uniqueScore * 0.4);
    var range = maxCount - minCount;
    return minCount + Math.round(complexity * range);
  }

  function buildColorBins(pixelSamples) {
    var bins = {};
    for (var i = 0; i < pixelSamples.length; i++) {
      var p = pixelSamples[i];
      var key = (p.r >> 3) + '_' + (p.g >> 3) + '_' + (p.b >> 3);
      if (!bins[key]) {
        bins[key] = { r: 0, g: 0, b: 0, count: 0 };
      }
      bins[key].r += p.r;
      bins[key].g += p.g;
      bins[key].b += p.b;
      bins[key].count += 1;
    }
    var out = [];
    Object.keys(bins).forEach(function (k) {
      var bin = bins[k];
      var color = {
        r: Math.round(bin.r / bin.count),
        g: Math.round(bin.g / bin.count),
        b: Math.round(bin.b / bin.count)
      };
      out.push({ color: color, count: bin.count, saturation: getSaturation(color) });
    });
    return out;
  }

  function pickDistinct(candidates, target, minDistSq, picked) {
    var out = [].concat(picked || []);
    for (var i = 0; i < candidates.length && out.length < target; i++) {
      var c = candidates[i].color;
      var dup = false;
      for (var j = 0; j < out.length; j++) {
        if (colorDistanceSq(c, out[j]) < minDistSq) {
          dup = true;
          break;
        }
      }
      if (!dup) out.push(c);
    }
    return out;
  }

  function selectKeyColors(pixelSamples, targetCount, dedupeFactor) {
    if (!pixelSamples.length) return [];
    var bins = buildColorBins(pixelSamples);
    if (!bins.length) return [];

    var byCount = bins.slice().sort(function (a, b) { return b.count - a.count; });
    var byAccent = bins.slice().sort(function (a, b) {
      var as = a.saturation * a.saturation * Math.log10(a.count + 1);
      var bs = b.saturation * b.saturation * Math.log10(b.count + 1);
      return bs - as;
    });

    var f = typeof dedupeFactor === 'number' ? dedupeFactor : 0.55;
    var strong = f >= 2.2;
    var accentBase = strong ? 70 : 24;
    var dominantBase = strong ? 62 : 18;
    var fallbackBase = strong ? 58 : 8;
    var accentScale = strong ? 48 : 34;
    var dominantScale = strong ? 42 : 34;
    var fallbackScale = strong ? 36 : 18;
    var accentDist = Math.round((accentBase + f * accentScale) * (accentBase + f * accentScale));
    var dominantDist = Math.round((dominantBase + f * dominantScale) * (dominantBase + f * dominantScale));
    var fallbackDist = Math.round((fallbackBase + f * fallbackScale) * (fallbackBase + f * fallbackScale));

    var selected = [];
    if (byCount.length) selected.push(byCount[0].color);
    selected = pickDistinct(byAccent, Math.ceil(targetCount / 2), accentDist, selected);
    selected = pickDistinct(byCount, targetCount, dominantDist, selected);
    if (selected.length < targetCount) {
      selected = pickDistinct(byCount, targetCount, fallbackDist, selected);
    }
    return selected.slice(0, targetCount);
  }

  function extractFromImageData(imageData, requestedCount, options) {
    var opts = options || {};
    var minCount = typeof opts.minCount === 'number' ? opts.minCount : 3;
    var maxCount = typeof opts.maxCount === 'number' ? opts.maxCount : 6;
    var step = typeof opts.step === 'number' ? opts.step : getAdaptiveStep(imageData);
    var dedupeFactor = typeof opts.dedupeFactor === 'number' ? opts.dedupeFactor : 0.55;

    var samples = samplePixels(imageData, step);
    var count = requestedCount === 'auto'
      ? estimateAutoCount(samples, minCount, maxCount)
      : parseInt(requestedCount, 10);

    if (isNaN(count)) count = minCount;
    if (count < minCount) count = minCount;
    if (count > maxCount) count = maxCount;

    var colors = selectKeyColors(samples, count, dedupeFactor);
    return {
      count: count,
      colors: colors,
      hexColors: colors.map(rgbToHex)
    };
  }

  function resolveRequestedCount(rawValue, minCount, fallbackMode) {
    if (rawValue === null || typeof rawValue === 'undefined' || rawValue === '') {
      return fallbackMode || 'auto';
    }
    if (String(rawValue).toLowerCase() === 'auto') {
      return 'auto';
    }
    var n = parseInt(rawValue, 10);
    if (isNaN(n)) {
      return fallbackMode || 'auto';
    }
    if (n < minCount) return String(minCount);
    return String(n);
  }

  function getRequestedCountFromControl(control, options) {
    var opts = options || {};
    var minCount = typeof opts.minCount === 'number' ? opts.minCount : 3;
    var fallbackMode = typeof opts.fallbackMode === 'string' ? opts.fallbackMode : 'auto';
    var rawValue = control && typeof control.value !== 'undefined'
      ? control.value
      : control;
    return resolveRequestedCount(rawValue, minCount, fallbackMode);
  }

  function populateCountSelect(selectEl, options) {
    if (!selectEl) return;
    var opts = options || {};
    var minCount = typeof opts.minCount === 'number' ? opts.minCount : 3;
    var maxCount = typeof opts.maxCount === 'number' ? opts.maxCount : 8;
    var includeAuto = opts.includeAuto !== false;
    var autoLabel = opts.autoLabel || '자동(기본값)';
    var defaultValue = typeof opts.defaultValue !== 'undefined' ? String(opts.defaultValue) : 'auto';
    var defaultValueLabel = typeof opts.defaultValueLabel === 'string' ? opts.defaultValueLabel : '';

    selectEl.innerHTML = '';
    if (includeAuto) {
      var autoOpt = document.createElement('option');
      autoOpt.value = 'auto';
      autoOpt.textContent = autoLabel;
      selectEl.appendChild(autoOpt);
    }
    for (var c = minCount; c <= maxCount; c++) {
      var opt = document.createElement('option');
      opt.value = String(c);
      opt.textContent = String(c);
      selectEl.appendChild(opt);
    }

    if (defaultValueLabel && defaultValue !== 'auto') {
      var defaultOpt = selectEl.querySelector('option[value="' + defaultValue + '"]');
      if (defaultOpt) {
        defaultOpt.textContent = defaultValueLabel;
      }
    }

    var resolved = getRequestedCountFromControl(defaultValue, {
      minCount: minCount,
      fallbackMode: includeAuto ? 'auto' : String(minCount)
    });
    selectEl.value = resolved;
    if (selectEl.value !== resolved) {
      selectEl.value = includeAuto ? 'auto' : String(minCount);
    }
  }

  function extractFromImageDataUsingControl(imageData, countControlOrValue, options) {
    var requested = getRequestedCountFromControl(countControlOrValue, options);
    return extractFromImageData(imageData, requested, options);
  }

  function getDedupeFactorFromControl(control, fallback) {
    var rawValue = control && typeof control.value !== 'undefined'
      ? control.value
      : control;
    var n = parseInt(rawValue, 10);
    var fb = typeof fallback === 'number' ? fallback : 0.55;
    if (isNaN(n)) return fb;
    if (n < 0) n = 0;
    if (n > 300) n = 300;
    return n / 100;
  }

  function getDedupeLabel(factor) {
    var f = typeof factor === 'number' ? factor : 0.55;
    if (f < 0.34) return '낮음';
    if (f < 0.8) return '보통';
    if (f < 1.1) return '높음';
    if (f < 2.2) return '매우 높음';
    return '완전 차단';
  }

  function bindDedupeLabel(rangeControl, labelNode, fallback) {
    if (!rangeControl || !labelNode) return function () {};
    var update = function () {
      var factor = getDedupeFactorFromControl(rangeControl, fallback);
      labelNode.textContent = getDedupeLabel(factor);
      return factor;
    };
    rangeControl.addEventListener('input', update);
    update();
    return update;
  }

  window.ColorExtraction = {
    colorDistanceSq: colorDistanceSq,
    extractFromImageData: extractFromImageData,
    extractFromImageDataUsingControl: extractFromImageDataUsingControl,
    getRequestedCountFromControl: getRequestedCountFromControl,
    getDedupeFactorFromControl: getDedupeFactorFromControl,
    getDedupeLabel: getDedupeLabel,
    bindDedupeLabel: bindDedupeLabel,
    populateCountSelect: populateCountSelect,
    rgbToHex: rgbToHex
  };
})();
