(function($) {
    'use strict';

    $(function() {
        var imageUpload = document.getElementById('assistant-image-upload');
        var colorCountSelect = document.getElementById('assistant-color-count');
        var dedupeRange = document.getElementById('assistant-dedupe-strength');
        var dedupeLabel = document.getElementById('assistant-dedupe-label');
        var extractBtn = document.getElementById('assistant-extract-btn');
        var originalCanvas = document.getElementById('assistant-original-canvas');
        var remapCanvas = document.getElementById('assistant-remap-canvas');
        var downloadBtn = document.getElementById('assistant-download-btn');
        
        var overviewPanel = document.getElementById('assistant-overview');
        var overviewSwatches = document.getElementById('assistant-overview-swatches');
        var slotsContainer = document.getElementById('assistant-slots-container');
        
        var loadedImage = new Image();
        loadedImage.crossOrigin = 'anonymous';

        var extractedItems = []; // 배열: { id, origHex, slotHex, type, locked, transparent }

        var typeLabels = {
            'main': '메인 컬러',
            'sub': '서브 컬러',
            'point': '포인트 컬러',
            'line': '선화',
            'bg': '배경색'
        };

        if (window.ColorExtraction && dedupeRange && dedupeLabel) {
            window.ColorExtraction.bindDedupeLabel(dedupeRange, dedupeLabel, 0.55);
            window.ColorExtraction.populateCountSelect(colorCountSelect, {
                minCount: 3,
                maxCount: 12,
                includeAuto: true,
                autoLabel: '자동(기본)',
                defaultValue: '6',
                defaultValueLabel: '6 (기본값)'
            });
        }

        // 정사각형(600x600) 캔버스에 강제 비율 맞춤
        function setCanvasOrientationByImage(image) {
            originalCanvas.width = 600;
            originalCanvas.height = 600;
            remapCanvas.width = 600;
            remapCanvas.height = 600;
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

        function hexToRgb(hex) {
            var normalized = (hex||'').replace('#', '');
            var parsed = parseInt(normalized, 16);
            return { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 };
        }

        function colorDistanceSq(a, b) {
            return (a.r - b.r) * (a.r - b.r) + (a.g - b.g) * (a.g - b.g) + (a.b - b.b) * (a.b - b.b);
        }

        function clampChannel(v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }

        function getMappingsFromItems(items) {
            return items.map(function(item) {
                var toHex = item.slotHex;
                var isTransparent = false;
                if (item.type === 'bg' && item.transparent) {
                    toHex = 'transparent';
                    isTransparent = true;
                }
                return {
                    from: hexToRgb(item.origHex),
                    to: isTransparent ? 'transparent' : hexToRgb(toHex),
                    isTransparent: isTransparent
                };
            });
        }

        function remapImageData(source, mappings) {
            var out = new ImageData(source.width, source.height);
            for (var i = 0; i < source.data.length; i += 4) {
                var pixel = { r: source.data[i], g: source.data[i + 1], b: source.data[i + 2] };
                if (source.data[i + 3] === 0) continue; 
                
                var nearest = mappings[0];
                var nearestDist = colorDistanceSq(pixel, mappings[0].from);
                
                for (var m = 1; m < mappings.length; m++) {
                    var d = colorDistanceSq(pixel, mappings[m].from);
                    if (d < nearestDist) {
                        nearestDist = d;
                        nearest = mappings[m];
                    }
                }

                if (nearest.isTransparent) {
                    out.data[i] = 0;
                    out.data[i + 1] = 0;
                    out.data[i + 2] = 0;
                    out.data[i + 3] = 0;
                } else {
                    var deltaR = nearest.to.r - nearest.from.r;
                    var deltaG = nearest.to.g - nearest.from.g;
                    var deltaB = nearest.to.b - nearest.from.b;
                    out.data[i] = clampChannel(pixel.r + deltaR);
                    out.data[i + 1] = clampChannel(pixel.g + deltaG);
                    out.data[i + 2] = clampChannel(pixel.b + deltaB);
                    out.data[i + 3] = source.data[i + 3];
                }
            }
            return out;
        }

        function applyKeyColorRemap() {
            if (!loadedImage.src || extractedItems.length === 0) return;
            var oCtx = originalCanvas.getContext('2d');
            var rCtx = remapCanvas.getContext('2d');
            var source = oCtx.getImageData(0, 0, originalCanvas.width, originalCanvas.height);
            
            var mappings = getMappingsFromItems(extractedItems);
            var out = remapImageData(source, mappings);
            
            rCtx.putImageData(out, 0, 0);

            // 미리보기 캔버스가 표시 중이면 동시 업데이트
            if ($('#recommendation-panel').is(':visible')) {
                var pCanvas = document.getElementById('assistant-rec-preview-canvas');
                if (pCanvas) {
                    var pCtx = pCanvas.getContext('2d');
                    pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
                    pCtx.drawImage(remapCanvas, 0, 0, pCanvas.width, pCanvas.height);
                }
            }
        }

        if (imageUpload) {
            imageUpload.addEventListener('change', function(e) {
                var file = e.target.files && e.target.files[0];
                if (!file) return;
                var reader = new FileReader();
                reader.onload = function(evt) {
                    loadedImage.onload = function() {
                        setCanvasOrientationByImage(loadedImage);
                        drawContain(originalCanvas.getContext('2d'), originalCanvas, loadedImage);
                        drawContain(remapCanvas.getContext('2d'), remapCanvas, loadedImage);
                        extractColors();
                    };
                    loadedImage.src = evt.target.result;
                };
                reader.readAsDataURL(file);
            });
        }

        if (extractBtn) {
            extractBtn.addEventListener('click', function() {
                if (!loadedImage.src) {
                    alert('먼저 이미지를 업로드하세요.');
                    return;
                }
                extractColors();
            });
        }

        function extractColors() {
            if (!window.ColorExtraction) return;
            var img = originalCanvas.getContext('2d').getImageData(0, 0, originalCanvas.width, originalCanvas.height);
            var factor = window.ColorExtraction.getDedupeFactorFromControl(dedupeRange, 0.55);
            var extraction = window.ColorExtraction.extractFromImageDataUsingControl(img, colorCountSelect, {
                minCount: 3,
                maxCount: 12,
                dedupeFactor: factor
            });

            var colors = extraction.hexColors || [];
            var colors = extraction.hexColors || [];
            extractedItems = [];
            
            // 1. 선화(Line) 후보 찾기: 가장 명도가 낮은(어두운) 색상
            var darkestIdx = -1;
            var minLightness = 1.0;
            colors.forEach(function(hex, idx) {
                var l = chroma(hex).get('hsl.l');
                if (l < minLightness) {
                    minLightness = l;
                    darkestIdx = idx;
                }
            });

            // 명도가 0.4 (40%) 미만인 가장 어두운 색을 선화로 추정
            var lineArtIdx = (minLightness < 0.4) ? darkestIdx : -1;

            // 2. 슬롯 자동 할당
            var subCount = 0;
            var mainAssigned = false;

            colors.forEach(function(hex, idx) {
                var type = 'point';
                if (idx === lineArtIdx) {
                    type = 'line';
                } else if (!mainAssigned) {
                    type = 'main';
                    mainAssigned = true;
                } else if (subCount < 3) {
                    type = 'sub';
                    subCount++;
                }
                
                extractedItems.push({
                    id: idx,
                    origHex: hex,
                    slotHex: hex,
                    type: type,
                    locked: (type === 'main'),
                    transparent: false
                });
            });

            renderOverview();
            renderSlots();
            $('#recommendation-panel').slideUp();
            applyKeyColorRemap();
        }

        function renderOverview() {
            overviewPanel.style.display = 'block';
            $(overviewSwatches).empty();
            
            extractedItems.forEach(function(item) {
                var $box = $('<div style="text-align:center; display:flex; flex-direction:column; gap:0.5em; align-items:center;"></div>');
                var $swatch = $('<div style="width:40px; height:40px; border-radius:4px; border:1px solid #ccc;"></div>');
                $swatch.css('background-color', item.origHex);
                
                var $select = $('<select class="small" style="font-size:0.8em; padding:0 0.5em; height:auto;"></select>');
                Object.keys(typeLabels).forEach(function(k) {
                    $select.append($('<option></option>').val(k).text(typeLabels[k]));
                });
                $select.val(item.type);
                $select.on('change', function() {
                    item.type = $(this).val();
                    if (item.type === 'main') item.locked = true;
                    renderSlots();
                });

                $box.append($swatch);
                $box.append($select);
                $(overviewSwatches).append($box);
            });
        }

        function renderSlots() {
            $(slotsContainer).empty();
            
            var typeOrder = {
                'main': 1,
                'sub': 2,
                'point': 3,
                'line': 4,
                'bg': 5
            };

            var sortedItems = extractedItems.slice().sort(function(a, b) {
                if (typeOrder[a.type] !== typeOrder[b.type]) {
                    return typeOrder[a.type] - typeOrder[b.type];
                }
                return a.id - b.id;
            });
            
            sortedItems.forEach(function(item) {
                var html = `
                <div class="assistant-slot" style="border: 1px solid rgba(210, 215, 217, 0.75); padding: 1.5em; border-radius: 4px; width: 220px; text-align: center; background:#fff;">
                    <h4>${typeLabels[item.type]} <span style="font-size:0.7em;color:#999;">(#${item.id+1})</span></h4>
                    <div style="display:flex; justify-content:center; align-items:center; gap: 0.5em; margin-bottom: 1em;">
                        <input type="color" class="slot-orig" data-id="${item.id}" value="${item.origHex}" title="원본 이미지 색상 (수정 불가)" disabled style="width:40px; height:40px; border:none; padding:0; cursor:not-allowed; opacity:0.8;" />
                        <span>&rarr;</span>
                        <input type="color" class="slot-new" data-id="${item.id}" value="${item.slotHex}" title="적용될 새 색상" style="width:50px; height:50px; border:none; padding:0; cursor:pointer;" />
                    </div>
                `;
                
                if (item.type === 'bg') {
                    html += `
                    <div style="margin-bottom: 0.5em;">
                        <input type="checkbox" class="slot-transparent" id="trans-${item.id}" data-id="${item.id}" ${item.transparent ? 'checked' : ''} />
                        <label for="trans-${item.id}" style="font-size:0.9em;">투명하게 (제거)</label>
                    </div>
                    `;
                }

                if (item.type !== 'line') {
                    html += `
                    <div style="display:flex; gap:0.5em; width:100%; margin-bottom: 0.5em;">
                        <button class="button small recommend-btn" data-id="${item.id}" style="flex:1; padding:0 0.5em; font-size:0.8em;">추천</button>
                        <button class="button small alt revert-btn" data-id="${item.id}" style="flex:1; padding:0 0.5em; font-size:0.8em;">되돌리기</button>
                    </div>`;
                } else {
                    html += `
                    <div style="display:flex; gap:0.5em; width:100%; align-items:center; margin-bottom: 0.5em;">
                        <span style="font-size:0.8em; color:#666; flex:1;">추천 제외됨</span>
                        <button class="button small alt revert-btn" data-id="${item.id}" style="flex:1; padding:0 0.5em; font-size:0.8em;">되돌리기</button>
                    </div>`;
                }

                if (item.type === 'sub' || item.type === 'point') {
                    html += `
                    <div style="margin-top: 0.5em;">
                        <input type="checkbox" class="slot-random-lock" id="rnd-lock-${item.id}" data-id="${item.id}" ${item.randomLocked ? 'checked' : ''} />
                        <label for="rnd-lock-${item.id}" style="font-size:0.9em; color:#0056b3;">랜덤 자동생성 시 색상 고정</label>
                    </div>
                    `;
                }
                
                html += `</div>`;
                var $slot = $(html);
                $(slotsContainer).append($slot);
            });

            // 이벤트 바인딩
            $('.slot-new').on('input', function() {
                var id = parseInt($(this).data('id'), 10);
                var it = extractedItems.find(function(i) { return i.id === id; });
                if (it) { it.slotHex = $(this).val(); applyKeyColorRemap(); }
            });
            $('.revert-btn').on('click', function() {
                var id = parseInt($(this).data('id'), 10);
                var it = extractedItems.find(function(i) { return i.id === id; });
                if (it) {
                    it.slotHex = it.origHex;
                    if (it.type === 'bg') it.transparent = false;
                    renderSlots();
                    applyKeyColorRemap();
                }
            });
            $('.slot-transparent').on('change', function() {
                var id = parseInt($(this).data('id'), 10);
                var it = extractedItems.find(function(i) { return i.id === id; });
                if (it) { it.transparent = $(this).is(':checked'); applyKeyColorRemap(); }
            });
            $('.slot-random-lock').on('change', function() {
                var id = parseInt($(this).data('id'), 10);
                var it = extractedItems.find(function(i) { return i.id === id; });
                if (it) { it.randomLocked = $(this).is(':checked'); }
            });
            $('.recommend-btn').on('click', function() {
                var id = parseInt($(this).data('id'), 10);
                var it = extractedItems.find(function(i) { return i.id === id; });
                if (it) {
                    currentTargetSlotId = id;
                    $('#rec-target-name').text(typeLabels[it.type] + ' 대체 색상 추천 (' + it.slotHex + ')');
                    $('#recommendation-panel').slideDown();
                    generateRecommendations(id);
                    // 패널 오픈 즉시 미리보기 캔버스 갱신
                    setTimeout(applyKeyColorRemap, 50); 
                }
            });
        }

        if (downloadBtn) {
            downloadBtn.addEventListener('click', function() {
                if (!loadedImage.src) return;
                var w = loadedImage.naturalWidth || loadedImage.width;
                var h = loadedImage.naturalHeight || loadedImage.height;
                if (!w || !h) return;

                var tempCanvas = document.createElement('canvas');
                tempCanvas.width = w;
                tempCanvas.height = h;
                var tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(loadedImage, 0, 0, w, h);

                if (extractedItems.length > 0) {
                    var src = tempCtx.getImageData(0, 0, w, h);
                    var mappings = getMappingsFromItems(extractedItems);
                    var remapped = remapImageData(src, mappings);
                    tempCtx.putImageData(remapped, 0, 0);
                }

                var link = document.createElement('a');
                link.href = tempCanvas.toDataURL('image/png');
                link.download = 'color-assistant-result.png';
                link.click();
            });
        }

        // 3. 대체 색상 추천 UI 표시 및 로직 연동
        var currentTargetSlotId = null;
        
        function createSwatch(hexCode) {
            var $swatch = $('<div class="rec-swatch" style="width: 50px; height: 50px; border-radius: 4px; cursor: pointer; border: 1px solid rgba(0,0,0,0.2); box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: transform 0.1s;" title="' + hexCode + '"></div>');
            $swatch.css('background-color', hexCode);
            
            $swatch.hover(function() { $(this).css('transform', 'scale(1.1)'); }, function() { $(this).css('transform', 'scale(1)'); });

            $swatch.on('click', function() {
                if (currentTargetSlotId !== null) {
                    var it = extractedItems.find(function(i) { return i.id === currentTargetSlotId; });
                    if (it) {
                        it.slotHex = hexCode;
                        renderSlots();
                        applyKeyColorRemap();
                        $(this).css('transform', 'scale(0.9)');
                        setTimeout(function() { $swatch.css('transform', 'scale(1.1)'); }, 150);
                        $('#rec-target-name').text(typeLabels[it.type] + ' 대체 색상 추천 (' + hexCode + ')');
                    }
                }
            });
            return $swatch;
        }

        function generateRecommendations(targetId) {
            $('#rec-analogous').empty();
            $('#rec-complementary').empty();
            $('#rec-accent').empty();
            $('#rec-tone').empty();

            var mainItem = extractedItems.find(function(i) { return i.type === 'main'; });
            var mainHex = mainItem ? mainItem.slotHex : '#cccccc';
            var mainC = chroma(mainHex);

            // 다른 서브 색상들만 수집 (포인트, 배경, 선화, 타겟 색상 제외)
            var otherColors = extractedItems.filter(function(i) {
                return i.id !== targetId && i.type === 'sub';
            }).map(function(i) { return chroma(i.slotHex); });

            // 1. 조화/블렌딩: 메인 컬러와 다른 서브 색상들의 혼합(Mix) 또는 중간 톤
            otherColors.forEach(function(c) {
                $('#rec-analogous').append(createSwatch(chroma.mix(mainC, c, 0.25).hex()));
                $('#rec-analogous').append(createSwatch(chroma.mix(mainC, c, 0.5).hex()));
                $('#rec-analogous').append(createSwatch(chroma.mix(mainC, c, 0.75).hex()));
            });
            // 추가로 메인의 순수 유사색
            $('#rec-analogous').append(createSwatch(mainC.set('hsl.h', '+25').hex()));
            $('#rec-analogous').append(createSwatch(mainC.set('hsl.h', '-25').hex()));

            // 2. 보색 대비: 메인 및 전체 색상 평균의 보색
            var sumHue = mainC.hsl()[0] || 0;
            var validColorsCount = 1;
            otherColors.forEach(function(c) { 
                var h = c.hsl()[0];
                if (!isNaN(h)) { sumHue += h; validColorsCount++; }
            });
            var avgHue = sumHue / validColorsCount;
            var avgC = chroma.hsl(avgHue, mainC.hsl()[1], mainC.hsl()[2]);
            
            function getContrastCompHex(c) {
                var comp = c.set('hsl.h', '+180');
                var hsl = comp.hsl();
                var l = hsl[2];
                var contrastL = l > 0.5 ? Math.max(0.2, l - 0.4) : Math.min(0.8, l + 0.4);
                return chroma.hsl(hsl[0], hsl[1], contrastL).hex();
            }
            
            $('#rec-complementary').append(createSwatch(mainC.set('hsl.h', '+180').hex())); // 메인 보색
            $('#rec-complementary').append(createSwatch(getContrastCompHex(mainC))); // 메인 보색 (밝기 반전)
            $('#rec-complementary').append(createSwatch(avgC.set('hsl.h', '+180').hex()));  // 전체 평균 보색
            $('#rec-complementary').append(createSwatch(getContrastCompHex(avgC)));  // 평균 보색 (밝기 반전)
            otherColors.forEach(function(c) {
                $('#rec-complementary').append(createSwatch(c.set('hsl.h', '+180').hex())); // 서브 보색
                $('#rec-complementary').append(createSwatch(getContrastCompHex(c))); // 서브 보색 (밝기 반전)
            });

            // 3. 다각/엑센트 배색 (Triadic & Tetradic): 메인 및 서브 컬러와 완전히 다른 각도의 색상
            $('#rec-accent').append(createSwatch(mainC.set('hsl.h', '+120').hex())); // 3원색 대비
            $('#rec-accent').append(createSwatch(mainC.set('hsl.h', '-120').hex()));
            $('#rec-accent').append(createSwatch(mainC.set('hsl.h', '+90').hex()));  // 4원색 대비
            $('#rec-accent').append(createSwatch(mainC.set('hsl.h', '-90').hex()));
            otherColors.forEach(function(c) {
                $('#rec-accent').append(createSwatch(c.set('hsl.h', '+120').hex()));
                $('#rec-accent').append(createSwatch(c.set('hsl.h', '-120').hex()));
            });

            // 4. 톤(채도/명도) 매칭: 기존 팔레트 색상들의 밝기/채도 변형
            $('#rec-tone').append(createSwatch(mainC.brighten(1).hex()));
            $('#rec-tone').append(createSwatch(mainC.darken(1).hex()));
            otherColors.forEach(function(c) {
                $('#rec-tone').append(createSwatch(c.brighten(1.2).hex()));
                $('#rec-tone').append(createSwatch(c.darken(1.2).hex()));
                $('#rec-tone').append(createSwatch(c.desaturate(1.5).hex()));
            });
        }

        // 4. 자동 랜덤 팔레트 생성 기능
        function getRecommendationColors(references) {
            var recs = [];
            if (references.length === 0) return recs;
            var mainC = chroma(references[0]);
            var otherColors = references.slice(1).map(function(hex) { return chroma(hex); });

            // 1. 조화/블렌딩
            otherColors.forEach(function(c) {
                recs.push(chroma.mix(mainC, c, 0.25).hex());
                recs.push(chroma.mix(mainC, c, 0.5).hex());
                recs.push(chroma.mix(mainC, c, 0.75).hex());
            });
            recs.push(mainC.set('hsl.h', '+25').hex());
            recs.push(mainC.set('hsl.h', '-25').hex());

            // 2. 보색 대비
            var sumHue = mainC.hsl()[0] || 0;
            var validCount = 1;
            otherColors.forEach(function(c) {
                var h = c.hsl()[0];
                if (!isNaN(h)) { sumHue += h; validCount++; }
            });
            var avgHue = sumHue / validCount;
            var avgC = chroma.hsl(avgHue, mainC.hsl()[1], mainC.hsl()[2]);

            function getContrastCompHex(c) {
                var comp = c.set('hsl.h', '+180');
                var hsl = comp.hsl();
                var l = hsl[2];
                var contrastL = l > 0.5 ? Math.max(0.2, l - 0.4) : Math.min(0.8, l + 0.4);
                return chroma.hsl(hsl[0], hsl[1], contrastL).hex();
            }

            recs.push(mainC.set('hsl.h', '+180').hex());
            recs.push(getContrastCompHex(mainC));
            recs.push(avgC.set('hsl.h', '+180').hex());
            recs.push(getContrastCompHex(avgC));
            otherColors.forEach(function(c) {
                recs.push(c.set('hsl.h', '+180').hex());
                recs.push(getContrastCompHex(c));
            });

            // 3. 다각/엑센트
            recs.push(mainC.set('hsl.h', '+120').hex());
            recs.push(mainC.set('hsl.h', '-120').hex());
            recs.push(mainC.set('hsl.h', '+90').hex());
            recs.push(mainC.set('hsl.h', '-90').hex());
            otherColors.forEach(function(c) {
                recs.push(c.set('hsl.h', '+120').hex());
                recs.push(c.set('hsl.h', '-120').hex());
            });

            // 4. 톤 매칭
            recs.push(mainC.brighten(1).hex());
            recs.push(mainC.darken(1).hex());
            otherColors.forEach(function(c) {
                recs.push(c.brighten(1.2).hex());
                recs.push(c.darken(1.2).hex());
                recs.push(c.desaturate(1.5).hex());
            });

            return recs;
        }

        $('#generate-random-palettes-btn').on('click', function() {
            var count = parseInt($('#random-palette-count').val(), 10) || 10;
            var $container = $('#random-palettes-container');
            $container.empty();
            
            var mainItem = extractedItems.find(function(i) { return i.type === 'main'; });
            if (!mainItem) {
                alert('이미지에서 추출된 메인 컬러가 없습니다.');
                return;
            }

            if (!loadedImage.src) {
                alert('먼저 이미지를 업로드해야 합니다.');
                return;
            }

            // 성능을 위해 미리보기용 작은 원본 캔버스 데이터 생성 (최대 300px)
            var maxThumbSize = 300;
            var ratio = Math.min(maxThumbSize / loadedImage.width, maxThumbSize / loadedImage.height);
            var thumbWidth = Math.max(1, Math.floor(loadedImage.width * ratio));
            var thumbHeight = Math.max(1, Math.floor(loadedImage.height * ratio));
            
            var thumbSourceCanvas = document.createElement('canvas');
            thumbSourceCanvas.width = thumbWidth;
            thumbSourceCanvas.height = thumbHeight;
            var thumbSourceCtx = thumbSourceCanvas.getContext('2d');
            thumbSourceCtx.drawImage(loadedImage, 0, 0, thumbWidth, thumbHeight);
            var thumbSourceData = thumbSourceCtx.getImageData(0, 0, thumbWidth, thumbHeight);
            
            for (var i = 0; i < count; i++) {
                var references = [mainItem.slotHex];
                var newPaletteItems = JSON.parse(JSON.stringify(extractedItems)); // 깊은 복사
                
                // 서브 -> 포인트 순 정렬
                var typeOrder = { 'sub': 1, 'point': 2 };
                var targetItems = newPaletteItems.filter(function(item) {
                    if ((item.type === 'sub' || item.type === 'point') && item.randomLocked) {
                        references.push(item.slotHex); // 고정된 색상은 그대로 참조용으로만 사용
                        return false; 
                    }
                    return item.type === 'sub' || item.type === 'point';
                }).sort(function(a, b) {
                    if (typeOrder[a.type] !== typeOrder[b.type]) {
                        return typeOrder[a.type] - typeOrder[b.type];
                    }
                    return a.id - b.id;
                });

                targetItems.forEach(function(item) {
                    var recs = getRecommendationColors(references);
                    if (recs.length === 0) recs = [mainItem.slotHex];
                    var randomPick = recs[Math.floor(Math.random() * recs.length)];
                    item.slotHex = randomPick;
                    references.push(randomPick);
                });
                
                // 작은 캔버스에 리맵 이미지 적용
                var mappings = getMappingsFromItems(newPaletteItems);
                var remappedThumbData = remapImageData(thumbSourceData, mappings);
                var thumbCanvas = document.createElement('canvas');
                thumbCanvas.width = thumbWidth;
                thumbCanvas.height = thumbHeight;
                thumbCanvas.style.width = '180px';
                thumbCanvas.style.height = '180px';
                thumbCanvas.style.objectFit = 'contain';
                thumbCanvas.style.borderRadius = '4px';
                thumbCanvas.getContext('2d').putImageData(remappedThumbData, 0, 0);

                var $paletteDiv = $('<div class="random-palette" style="background:#fff; border:1px solid #ccc; border-radius:8px; padding:0.5em; cursor:pointer; transition:transform 0.1s, box-shadow 0.1s; text-align:center;"></div>');
                $paletteDiv.hover(
                    function(){ $(this).css('transform', 'translateY(-2px)').css('box-shadow', '0 4px 8px rgba(0,0,0,0.1)'); },
                    function(){ $(this).css('transform', 'translateY(0)').css('box-shadow', 'none'); }
                );
                
                $paletteDiv.append(thumbCanvas);
                $paletteDiv.append('<div style="font-size:0.75em; font-weight:bold; color:#555; margin-top:0.5em;">적용하기</div>');
                
                (function(itemsToApply) {
                    $paletteDiv.on('click', function() {
                        itemsToApply.forEach(function(p) {
                            var targetIt = extractedItems.find(function(i) { return i.id === p.id; });
                            if (targetIt) targetIt.slotHex = p.slotHex;
                        });
                        renderSlots();
                        applyKeyColorRemap();
                        $('.random-palette').css('border-color', '#ccc').css('background', '#fff');
                        $(this).css('border-color', '#2b6fb6').css('background', '#f0f8ff');
                    });
                })(newPaletteItems);
                
                $container.append($paletteDiv);
            }
        });

        // 자동 랜덤 조합 패널 열기/닫기 토글
        $('#toggle-random-panel-btn').on('click', function() {
            $('#random-palette-panel').slideToggle();
        });
    });
})(jQuery);
