(function () {
  'use strict';

  var STORAGE_KEY = 'shared_custom_palettes_v1';
  var DEFAULTS = [
    { name: 'Rainbow', colors: ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#8B00FF'] }
  ];

  function isHex(v) {
    return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  }

  function normalizePalette(input, fallbackName) {
    if (!input || !Array.isArray(input.colors)) {
      return null;
    }
    var colors = input.colors.filter(isHex).slice(0, 12);
    if (colors.length < 2) {
      return null;
    }
    return {
      name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : fallbackName,
      colors: colors
    };
  }

  function readCustom() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map(function (p, idx) { return normalizePalette(p, 'Custom ' + (idx + 1)); })
        .filter(function (p) { return p !== null; });
    } catch (e) {
      return [];
    }
  }

  function writeCustom(customPalettes) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(customPalettes || []));
    } catch (e) {
      // noop
    }
  }

  function getDefaults() {
    return DEFAULTS.map(function (p) {
      return { name: p.name, colors: p.colors.slice() };
    });
  }

  function getCustomPalettes() {
    return readCustom().map(function (p) {
      return { name: p.name, colors: p.colors.slice() };
    });
  }

  function saveCustomPalettes(customPalettes) {
    var clean = (customPalettes || [])
      .map(function (p, idx) { return normalizePalette(p, 'Custom ' + (idx + 1)); })
      .filter(function (p) { return p !== null; });
    writeCustom(clean);
  }

  function getAllPalettes() {
    return getDefaults().concat(getCustomPalettes());
  }

  window.PaletteStore = {
    getDefaults: getDefaults,
    getCustomPalettes: getCustomPalettes,
    saveCustomPalettes: saveCustomPalettes,
    getAllPalettes: getAllPalettes
  };
})();
