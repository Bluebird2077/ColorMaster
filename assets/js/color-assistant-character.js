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
            'skin': '피부 (Skin)',
            'hair': '머리 (Hair)',
            'eyes': '눈 (Eyes)',
            'top_inner': '상의/이너 (Top Inner)',
            'top_outer': '상의/아우터 (Top Outer)',
            'bottom': '하의 (Bottom)',
            'clothes_point': '의상 포인트 (Clothes Point)',
            'shoes': '신발/양말 (Shoes)',
            'line': '선화 (Line)',
            'bg': '배경 (Background)',
            'misc': '기타 (Misc)'
        };

        if (window.ColorExtraction && dedupeRange && dedupeLabel) {
            window.ColorExtraction.bindDedupeLabel(dedupeRange, dedupeLabel, 0.55);
            window.ColorExtraction.populateCountSelect(colorCountSelect, {
                minCount: 3,
                maxCount: 12,
                includeAuto: true,
                autoLabel: '자동(기본)',
                defaultValue: '7',
                defaultValueLabel: '7 (기본값)'
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
            extractedItems = [];
            
            // 1. 색상 분석 정보 수집 및 공간(Y좌표) 정보 계산
            var colorInfos = colors.map(function(hex, idx) {
                var c = chroma(hex);
                var hsl = c.hsl();
                return { 
                    idx: idx, hex: hex, h: isNaN(hsl[0]) ? 0 : hsl[0], s: hsl[1], l: hsl[2], type: null, 
                    sumY: 0, count: 0, boundaryCount: 0, 
                    yBuckets: new Array(20).fill(0), avgY: 0.5, minY: 1.0,
                    surroundCount: 0, faceXs: []
                };
            });

            var mappings = colors.map(function(hex) { return hexToRgb(hex); });
            var height = img.height;
            var width = img.width;
            var sampleWidth = Math.ceil(width / 4);
            var sampleHeight = Math.ceil(height / 4);
            var pixelMap = new Int16Array(sampleWidth * sampleHeight);
            
            // 픽셀 샘플링을 통해 각 색상의 위치 정보(평균 Y, 최소 Y, 경계면) 계산
            for (var sy = 0; sy < sampleHeight; sy++) {
                for (var sx = 0; sx < sampleWidth; sx++) {
                    var y = sy * 4;
                    var x = sx * 4;
                    if (y >= height || x >= width) continue;
                    
                    var i = (y * width + x) * 4;
                    if (img.data[i+3] === 0) {
                        pixelMap[sy * sampleWidth + sx] = -1;
                        continue; 
                    }
                    
                    var pixel = { r: img.data[i], g: img.data[i+1], b: img.data[i+2] };
                    var nearestIdx = 0;
                    var nearestDist = colorDistanceSq(pixel, mappings[0]);
                    
                    for (var m = 1; m < mappings.length; m++) {
                        var d = colorDistanceSq(pixel, mappings[m]);
                        if (d < nearestDist) {
                            nearestDist = d;
                            nearestIdx = m;
                        }
                    }
                    
                    pixelMap[sy * sampleWidth + sx] = nearestIdx;
                    var info = colorInfos[nearestIdx];
                    info.sumY += y;
                    info.count++;
                    
                    // 경계면(테두리)에 닿는 픽셀 카운트 (배경 판별용)
                    if (x <= 4 || x >= width - 8 || y <= 4 || y >= height - 8) {
                        info.boundaryCount++;
                    }
                    
                    // 세로를 20개 구역으로 나누어 픽셀 분포 저장
                    var bucket = Math.floor((y / height) * 20);
                    if (bucket >= 20) bucket = 19;
                    info.yBuckets[bucket]++;
                }
            }

            var totalBoundary = 0;
            colorInfos.forEach(function(info) {
                totalBoundary += info.boundaryCount;
                if (info.count > 0) {
                    info.avgY = (info.sumY / info.count) / height;
                    // 노이즈 무시 실질적 minY
                    var threshold = info.count * 0.03;
                    var accumulated = 0;
                    for (var b = 0; b < 20; b++) {
                        accumulated += info.yBuckets[b];
                        if (accumulated >= threshold) {
                            info.minY = b / 20.0;
                            break;
                        }
                    }
                } else {
                    info.minY = 1.0;
                }
            });

            // 2. 선화(Line) 후보 찾기
            var darkestIdx = -1;
            var minLightness = 1.0;
            colorInfos.forEach(function(info) {
                if (info.l < minLightness) {
                    minLightness = info.l;
                    darkestIdx = info.idx;
                }
            });
            if (minLightness < 0.4) {
                colorInfos[darkestIdx].type = 'line';
            }

            // 3. 피부(Skin) 찾기
            var skinIdx = -1;
            var skinCandidate = null;
            var bestSkinScore = -1;
            colorInfos.forEach(function(info) {
                if (info.type) return;
                // Hue: 0~50 (Red to Yellow), or 340~360 (Pinkish Red)
                if ((info.h >= 0 && info.h <= 50) || (info.h >= 340)) {
                    if (info.l >= 0.5 && info.l <= 0.95) {
                        var score = info.l; 
                        if (info.s > 0.15 && info.s < 0.6) score += 0.5; 
                        if (score > bestSkinScore) {
                            bestSkinScore = score;
                            skinCandidate = info;
                        }
                    }
                }
            });
            if (skinCandidate) {
                skinCandidate.type = 'skin';
                skinIdx = skinCandidate.idx;
            }

            // 4. 배경(Background) 찾기
            var bgCandidate = null;
            var maxCount = 0;
            colorInfos.forEach(function(info) {
                if (info.type) return;
                if (totalBoundary > 0 && (info.boundaryCount / totalBoundary) > 0.4) {
                    if (info.count > maxCount) {
                        maxCount = info.count;
                        bgCandidate = info;
                    }
                }
            });
            if (!bgCandidate) {
                colorInfos.forEach(function(info) {
                    if (info.type) return;
                    if (info.count > maxCount) {
                        maxCount = info.count;
                        bgCandidate = info;
                    }
                });
                if (bgCandidate && maxCount < (width * height / 16) * 0.20) {
                    bgCandidate = null;
                }
            }
            if (bgCandidate) bgCandidate.type = 'bg';

            // 5. 얼굴 영역 기반 추론 (피부가 찾아졌을 때만 가능)
            if (skinIdx !== -1) {
                // 5-1. 얼굴 영역(Face Bounding Box) 찾기
                var skinPixels = []; // {x, y}
                for (var sy = 0; sy < sampleHeight; sy++) {
                    for (var sx = 0; sx < sampleWidth; sx++) {
                        if (pixelMap[sy * sampleWidth + sx] === skinIdx) {
                            skinPixels.push({x: sx, y: sy});
                        }
                    }
                }
                
                var faceMinX = sampleWidth, faceMaxX = 0, faceMinY = sampleHeight, faceMaxY = 0;
                var faceCenterX = sampleWidth / 2;
                
                if (skinPixels.length > 0) {
                    // Y 기준으로 오름차순 정렬 (위쪽 픽셀들 먼저)
                    skinPixels.sort(function(a, b) { return a.y - b.y; });
                    // 상위 40%만 얼굴로 취급 (팔, 다리 제외)
                    var facePixelCount = Math.floor(skinPixels.length * 0.4);
                    if (facePixelCount === 0) facePixelCount = skinPixels.length;
                    
                    var sumX = 0;
                    for (var k = 0; k < facePixelCount; k++) {
                        var px = skinPixels[k].x;
                        var py = skinPixels[k].y;
                        if (px < faceMinX) faceMinX = px;
                        if (px > faceMaxX) faceMaxX = px;
                        if (py < faceMinY) faceMinY = py;
                        if (py > faceMaxY) faceMaxY = py;
                        sumX += px;
                    }
                    faceCenterX = sumX / facePixelCount;
                }
                
                // 5-2. 머리카락(Hair) 추론: 얼굴 인접 픽셀 카운트
                for (var k = 0; k < facePixelCount; k++) {
                    var px = skinPixels[k].x;
                    var py = skinPixels[k].y;
                    
                    var neighbors = [
                        {x: px, y: py - 1}, // 상
                        {x: px - 1, y: py}, // 좌
                        {x: px + 1, y: py}  // 우
                    ];
                    
                    neighbors.forEach(function(n) {
                        if (n.x >= 0 && n.x < sampleWidth && n.y >= 0 && n.y < sampleHeight) {
                            var nIdx = pixelMap[n.y * sampleWidth + n.x];
                            if (nIdx !== -1 && nIdx !== skinIdx) {
                                var nInfo = colorInfos[nIdx];
                                // 배경이나 선화가 아닌 경우에만 인접 카운트 증가
                                if (nInfo.type !== 'line' && nInfo.type !== 'bg') {
                                    nInfo.surroundCount++;
                                }
                            }
                        }
                    });
                }
                
                var hairCandidate = null;
                var maxSurround = 0;
                colorInfos.forEach(function(info) {
                    if (!info.type && info.surroundCount > maxSurround) {
                        maxSurround = info.surroundCount;
                        hairCandidate = info;
                    }
                });
                if (hairCandidate) hairCandidate.type = 'hair';
                
                // 5-3. 눈(Eyes) 추론: 얼굴 영역 내 양안 분포 검사
                for (var sy = faceMinY; sy <= faceMaxY; sy++) {
                    for (var sx = faceMinX; sx <= faceMaxX; sx++) {
                        var pIdx = pixelMap[sy * sampleWidth + sx];
                        if (pIdx !== -1) {
                            var info = colorInfos[pIdx];
                            if (!info.type) {
                                if (!info.facePixels) info.facePixels = [];
                                info.facePixels.push({x: sx, y: sy});
                            }
                        }
                    }
                }
                

                var totalOpaquePixels = 0;
                colorInfos.forEach(function(info) { totalOpaquePixels += info.count; });
                
                var faceCenterY = faceMinY + (faceMaxY - faceMinY) / 2;
                var eyeCandidate = null;
                var bestEyeScore = -1;
                
                console.log("=== Eye Detection Scoring ===");
                colorInfos.forEach(function(info) {
                    if (info.type || !info.facePixels || info.facePixels.length < 2) {
                        console.log("Color " + info.hex + " rejected: Already assigned (" + info.type + ") or insufficient face pixels (" + (info.facePixels ? info.facePixels.length : 0) + ")");
                        return;
                    }
                    
                    // 면적 조건: 투명 배경을 제외한 캐릭터 실제 면적의 5% 미만이어야 함
                    var areaRatio = info.count / totalOpaquePixels;
                    if (areaRatio > 0.05) {
                        console.log("Color " + info.hex + " rejected: Area too large (" + (areaRatio * 100).toFixed(1) + "% > 5%)");
                        return;
                    }
                    
                    var xs = [];
                    var sumY = 0;
                    var skinAdjacency = 0;
                    
                    info.facePixels.forEach(function(p) {
                        xs.push(p.x);
                        sumY += p.y;
                        
                        // 피부(Skin) 인접도 검사 (상하좌우)
                        var neighbors = [
                            {x: p.x, y: p.y - 1}, {x: p.x, y: p.y + 1},
                            {x: p.x - 1, y: p.y}, {x: p.x + 1, y: p.y}
                        ];
                        neighbors.forEach(function(n) {
                            if (n.x >= 0 && n.x < sampleWidth && n.y >= 0 && n.y < sampleHeight) {
                                if (pixelMap[n.y * sampleWidth + n.x] === skinIdx) {
                                    skinAdjacency++;
                                }
                            }
                        });
                    });
                    
                    var avgFaceY = sumY / info.facePixels.length;
                    
                    // 턱밑이나 옷깃이 오인되는 것을 방지하기 위해 얼굴 위쪽 절반에 있는지 확인
                    if (avgFaceY > faceCenterY) {
                        console.log("Color " + info.hex + " rejected: Below face center (avgY=" + avgFaceY.toFixed(1) + " > center=" + faceCenterY.toFixed(1) + ")");
                        return;
                    }
                    
                    // 양안(Bimodal) 특성 검사: 얼굴의 절대 중심(faceCenterX) 기준이 아니라,
                    // 픽셀들 사이의 가장 큰 공백(미간, 코)을 찾아 두 개의 독립된 그룹인지 확인합니다.
                    // 이렇게 하면 얼굴이 측면을 향해 두 눈이 한쪽으로 치우쳐 있어도 완벽하게 잡아냅니다.
                    xs.sort(function(a, b) { return a - b; });
                    var maxGap = 0;
                    for (var i = 1; i < xs.length; i++) {
                        var gap = xs[i] - xs[i-1];
                        if (gap > maxGap) maxGap = gap;
                    }
                    
                    var faceWidth = faceMaxX - faceMinX || 1;
                    var gapRatio = maxGap / faceWidth;
                    
                    // 픽셀 덩어리 사이에 미간(최소 얼굴 너비의 5% 이상 공백)이 존재할 경우 양안으로 간주하여 높은 가산점 부여
                    // 한쪽 눈이 머리카락에 가려진 '외눈' 캐릭터도 눈으로 인식될 수 있도록 절대 조건에서 보너스 점수로 변경합니다.
                    var gapScore = (gapRatio > 0.05) ? gapRatio : 0;
                    
                    // 가중치 2: 상단에 위치할수록 압도적으로 높은 점수 (0.0 ~ 1.0)
                    var heightScore = 1.0 - ((avgFaceY - faceMinY) / (faceMaxY - faceMinY));
                    if (heightScore < 0) heightScore = 0;
                    
                    // 가중치 3: 면적이 좁을수록 높은 점수 (0.0 ~ 1.0)
                    var areaScore = 1.0 - (areaRatio / 0.05); 
                    
                    // 가중치 4: 픽셀이 피부색으로 둘러싸여 있을수록 높은 점수
                    var skinAdjacencyScore = skinAdjacency / info.facePixels.length; 
                    
                    // 종합 가중치 평가 (상단 위치, 좁은 면적, 피부 인접도 기본에 미간 보너스 추가)
                    var score = (heightScore * 40) + (gapScore * 20) + (areaScore * 20) + (skinAdjacencyScore * 20);
                    
                    console.log("Color " + info.hex + " scored " + score.toFixed(2) + " [Height:" + (heightScore*40).toFixed(1) + ", Gap:" + (gapScore*20).toFixed(1) + ", Area:" + (areaScore*20).toFixed(1) + ", Skin:" + (skinAdjacencyScore*20).toFixed(1) + "]");
                    
                    if (score > bestEyeScore) {
                        bestEyeScore = score;
                        eyeCandidate = info;
                    }
                });
                console.log("=== Eye Candidate Selected: " + (eyeCandidate ? eyeCandidate.hex : "None") + " ===");
                if (eyeCandidate) eyeCandidate.type = 'eyes';
            }

            // 6. 의상 포인트(Clothes Point) 찾기: 아직 할당 안 된 것 중 채도가 높고 면적이 매우 작은 것
            var totalOpaque = 0;
            colorInfos.forEach(function(info) { totalOpaque += info.count; });
            
            var unassignedForPoint = colorInfos.filter(function(i) { return !i.type; });
            var smallAreaColors = unassignedForPoint.filter(function(i) { return (i.count / totalOpaque) < 0.05; });
            smallAreaColors.sort(function(a, b) { return b.s - a.s; }); 
            
            if (smallAreaColors.length > 0) {
                var eyesExist = colorInfos.find(function(i) { return i.type === 'eyes'; });
                if (!eyesExist) {
                    smallAreaColors[0].type = 'eyes';
                    if (smallAreaColors.length > 1) smallAreaColors[1].type = 'clothes_point';
                } else {
                    smallAreaColors[0].type = 'clothes_point';
                }
            }

            // 7. 나머지 주요 색상들 (머리, 상의, 하의 등) 할당 - 평균 높이(avgY) 기반
            // minY는 노이즈(귀걸이, 지퍼 등 작은 픽셀)에 의해 쉽게 왜곡되므로, 면적의 무게중심인 avgY를 사용하여 
            // 위에서 아래로 상의 -> 하의 -> 신발 순으로 안정적으로 할당되도록 정교화합니다.
            var unassignedMains = colorInfos.filter(function(i) { return !i.type; });
            unassignedMains.sort(function(a, b) { return a.avgY - b.avgY; });
            
            // 전형적인 위->아래 순서. 이미 hair가 할당되었다면 넘어감
            var verticalParts = ['hair', 'top_outer', 'bottom', 'shoes'];
            
            unassignedMains.forEach(function(info) {
                var assigned = false;
                for (var p = 0; p < verticalParts.length; p++) {
                    var vPart = verticalParts[p];
                    if (!colorInfos.find(function(i) { return i.type === vPart; })) {
                        info.type = vPart;
                        assigned = true;
                        break;
                    }
                }
                if (!assigned) {
                    if (!colorInfos.find(function(i) { return i.type === 'top_inner'; })) {
                        info.type = 'top_inner';
                    } else {
                        info.type = 'misc';
                    }
                }
            });

            // 7. 결과 반영
            colorInfos.forEach(function(info) {
                extractedItems.push({
                    id: info.idx,
                    origHex: info.hex,
                    slotHex: info.hex,
                    type: info.type,
                    locked: (info.type === 'skin'),
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
                    if (item.type === 'skin') item.locked = true;
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
                'skin': 1, 'hair': 2, 'eyes': 3,
                'top_inner': 4, 'top_outer': 5, 'bottom': 6,
                'clothes_point': 7, 'shoes': 8, 'line': 9, 'bg': 10, 'misc': 11
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

                if (item.type !== 'skin' && item.type !== 'line') {
                    html += `
                    <div style="margin-top: 0.5em;">
                        <input type="checkbox" class="slot-random-lock" id="rnd-lock-${item.id}" data-id="${item.id}" ${item.randomLocked ? 'checked' : ''} />
                        <label for="rnd-lock-${item.id}" style="font-size:0.9em; color:#0056b3;">랜덤 자동생성 고정</label>
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
                link.download = 'color-assistant-character.png';
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

            var targetItem = extractedItems.find(function(i) { return i.id === targetId; });
            if (!targetItem) return;
            
            var targetC = chroma(targetItem.slotHex);

            // 1. 클릭한 대상 색상을 기준(Main)으로 설정!
            var mainC = targetC;

            // 2. 다른 서브 색상들만 수집 (포인트 칼라 및 타겟 색상 제외)
            var excludedTypes = ['eyes', 'clothes_point'];
            var otherColors = extractedItems.filter(function(i) {
                return i.id !== targetId && !excludedTypes.includes(i.type);
            }).map(function(i) { return chroma(i.slotHex); });

            // 중복 방지 세팅
            var seenColors = [];
            var dedupeThreshold = parseInt($('#rec-dedupe-strength').val(), 10);
            if (isNaN(dedupeThreshold)) dedupeThreshold = 100;
            var maxDelta = dedupeThreshold / 10; // 0 to 30

            function appendUnique(containerId, hex) {
                var c1 = chroma(hex);
                var isDuplicate = false;
                if (maxDelta > 0) {
                    for (var i = 0; i < seenColors.length; i++) {
                        if (chroma.deltaE(c1, seenColors[i]) < maxDelta) {
                            isDuplicate = true;
                            break;
                        }
                    }
                }
                if (!isDuplicate) {
                    seenColors.push(c1);
                    $(containerId).append(createSwatch(hex));
                }
            }

            // 3. 조화/블렌딩: 메인 컬러와 다른 색상들의 혼합(Mix) 또는 중간 톤
            otherColors.forEach(function(c) {
                appendUnique('#rec-analogous', chroma.mix(mainC, c, 0.25).hex());
                appendUnique('#rec-analogous', chroma.mix(mainC, c, 0.5).hex());
                appendUnique('#rec-analogous', chroma.mix(mainC, c, 0.75).hex());
            });
            // 추가로 메인의 순수 유사색
            appendUnique('#rec-analogous', mainC.set('hsl.h', '+25').hex());
            appendUnique('#rec-analogous', mainC.set('hsl.h', '-25').hex());

            // 4. 톤(채도/명도) 매칭: 기존 팔레트 색상들의 밝기/채도 변형
            appendUnique('#rec-tone', mainC.brighten(1).hex());
            appendUnique('#rec-tone', mainC.darken(1).hex());
            otherColors.forEach(function(c) {
                appendUnique('#rec-tone', c.brighten(1.2).hex());
                appendUnique('#rec-tone', c.darken(1.2).hex());
                appendUnique('#rec-tone', c.desaturate(1.5).hex());
            });

            // 5. 보색 대비: 메인 및 전체 색상 평균의 보색
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
            
            appendUnique('#rec-complementary', mainC.set('hsl.h', '+180').hex()); // 메인 보색
            appendUnique('#rec-complementary', getContrastCompHex(mainC)); // 메인 보색 (밝기 반전)
            appendUnique('#rec-complementary', avgC.set('hsl.h', '+180').hex());  // 전체 평균 보색
            appendUnique('#rec-complementary', getContrastCompHex(avgC));  // 평균 보색 (밝기 반전)
            
            otherColors.forEach(function(c) {
                appendUnique('#rec-complementary', c.set('hsl.h', '+180').hex()); // 서브 보색
                appendUnique('#rec-complementary', getContrastCompHex(c)); // 서브 보색 (밝기 반전)
            });

            // 6. 다각/엑센트 배색 (Triadic & Tetradic): 메인 및 서브 컬러와 완전히 다른 각도의 색상
            appendUnique('#rec-accent', mainC.set('hsl.h', '+120').hex()); // 3원색 대비
            appendUnique('#rec-accent', mainC.set('hsl.h', '-120').hex());
            appendUnique('#rec-accent', mainC.set('hsl.h', '+90').hex());  // 4원색 대비
            appendUnique('#rec-accent', mainC.set('hsl.h', '-90').hex());
            
            otherColors.forEach(function(c) {
                appendUnique('#rec-accent', c.set('hsl.h', '+120').hex());
                appendUnique('#rec-accent', c.set('hsl.h', '-120').hex());
            });

            // 7. 캐릭터 특화 추천 (동적 표시)
            var $charContainer = $('#rec-character-specific-container');
            var $charSwatches = $('#rec-character-specific');
            var $charTitle = $('#rec-character-title');
            var $charDesc = $('#rec-character-desc');
            
            $charSwatches.empty();
            var hasSpecific = false;

            // 캐릭터 특화 추천은 일반 추천 색상과 중복되더라도 항상 표시되도록 중복 제거 필터 초기화
            seenColors = [];

            var skinItem = extractedItems.find(function(i) { return i.type === 'skin'; });

            // (1) 이너/아우터 특화: 명도 대비 매칭
            if (targetItem.type === 'top_inner' || targetItem.type === 'top_outer') {
                var topInnerItem = extractedItems.find(function(i) { return i.type === 'top_inner'; });
                var topOuterItem = extractedItems.find(function(i) { return i.type === 'top_outer'; });
                var contrastAnchor = null;
                if (targetItem.type === 'top_inner' && topOuterItem) contrastAnchor = chroma(topOuterItem.slotHex);
                else if (targetItem.type === 'top_outer' && topInnerItem) contrastAnchor = chroma(topInnerItem.slotHex);
                
                if (contrastAnchor) {
                    hasSpecific = true;
                    $charTitle.html('👕 레이어드 대비 (Contrast Balance)');
                    $charDesc.text('이너와 아우터의 명도 차이를 확실하게 주어 시각적 입체감을 극대화합니다.');
                    var anchorL = contrastAnchor.hsl()[2];
                    var targetH = mainC.hsl()[0] || 0;
                    var targetS = mainC.hsl()[1];
                    
                    if (anchorL > 0.5) { // 앵커가 밝음 -> 어둡게 추천
                        appendUnique('#rec-character-specific', chroma.hsl(targetH, targetS, 0.2).hex());
                        appendUnique('#rec-character-specific', chroma.hsl(targetH, targetS, 0.3).hex());
                        appendUnique('#rec-character-specific', chroma.hsl(targetH, targetS, 0.4).hex());
                    } else { // 앵커가 어두움 -> 밝게 추천
                        appendUnique('#rec-character-specific', chroma.hsl(targetH, targetS, 0.7).hex());
                        appendUnique('#rec-character-specific', chroma.hsl(targetH, targetS, 0.8).hex());
                        appendUnique('#rec-character-specific', chroma.hsl(targetH, targetS, 0.9).hex());
                    }
                }
            }
            // (2) 눈/의상포인트 특화: 고채도 액센트 & 머리-눈 보색
            else if (targetItem.type === 'eyes' || targetItem.type === 'clothes_point') {
                hasSpecific = true;
                $charTitle.html('👁️ 시선을 끄는 고채도 포인트 (Vibrant Point)');
                $charDesc.text('탁기를 빼고 채도를 강제로 높여 반짝이는 느낌을 주는 포인트 전용 색상입니다.');
                
                var h = mainC.hsl()[0] || 0;
                appendUnique('#rec-character-specific', chroma.hsl(h, 0.9, 0.6).hex());
                appendUnique('#rec-character-specific', chroma.hsl((h + 180) % 360, 0.9, 0.6).hex());
                appendUnique('#rec-character-specific', chroma.hsl((h + 120) % 360, 0.9, 0.6).hex());
                appendUnique('#rec-character-specific', chroma.hsl((h - 120 + 360) % 360, 0.9, 0.6).hex());

                if (targetItem.type === 'eyes') {
                    var hairItem = extractedItems.find(function(i) { return i.type === 'hair'; });
                    if (hairItem) {
                        var hairC = chroma(hairItem.slotHex);
                        var hairH = hairC.hsl()[0] || 0;
                        appendUnique('#rec-character-specific', chroma.hsl((hairH + 180) % 360, 0.85, 0.6).hex()); // 보색
                        appendUnique('#rec-character-specific', chroma.hsl((hairH + 120) % 360, 0.85, 0.6).hex());
                        appendUnique('#rec-character-specific', chroma.hsl((hairH - 120 + 360) % 360, 0.85, 0.6).hex());
                        $charDesc.text('캐릭터의 머리카락 색상과 보색/다각 대비를 이루는 애니메이션 정석 배색을 제안합니다.');
                        $charTitle.html('✨ 머리-눈 보색 매칭 및 고채도 (Anime Complementary)');
                    }
                }
            }
            // (3) 신발 특화: 하의 기반 안정감 매칭
            else if (targetItem.type === 'shoes') {
                var bottomItem = extractedItems.find(function(i) { return i.type === 'bottom'; });
                if (bottomItem) {
                    hasSpecific = true;
                    $charTitle.html('👞 하의 기반 안정감 매칭 (Grounding Tone)');
                    $charDesc.text('하의 색상을 바탕으로 톤다운 시켜, 캐릭터의 무게 중심을 안정적으로 잡아줍니다.');
                    var bottomC = chroma(bottomItem.slotHex);
                    appendUnique('#rec-character-specific', bottomC.darken(0.8).desaturate(0.5).hex());
                    appendUnique('#rec-character-specific', bottomC.darken(1.5).desaturate(0.8).hex());
                    appendUnique('#rec-character-specific', bottomC.darken(2.5).desaturate(1.2).hex());
                }
            }
            // (4) 그 외 머리/하의 등 피부제외 일반 부위 특화: 피부톤 융화
            else if (['hair', 'bottom'].includes(targetItem.type) && skinItem) {
                hasSpecific = true;
                $charTitle.html('🍑 피부톤 융화 컬러 (Skin Tone Blend)');
                $charDesc.text('캐릭터의 피부색이 미세하게 혼합되어 이질감 없이 착붙는 안정적인 색상입니다.');
                var skinC = chroma(skinItem.slotHex);
                appendUnique('#rec-character-specific', chroma.mix(mainC, skinC, 0.15).hex());
                appendUnique('#rec-character-specific', chroma.mix(mainC, skinC, 0.3).hex());
                appendUnique('#rec-character-specific', chroma.mix(mainC, skinC, 0.5).hex());
                appendUnique('#rec-character-specific', chroma.mix(mainC, skinC, 0.15).brighten(0.5).hex());
            }

            if (hasSpecific) {
                $charContainer.show();
            } else {
                $charContainer.hide();
            }
        }

        // 중복 방지 슬라이더 이벤트
        $('#rec-dedupe-strength').on('input', function() {
            var val = $(this).val();
            var lbl = '중간';
            if (val < 50) lbl = '아주 낮음 (거의 허용)';
            else if (val < 100) lbl = '낮음';
            else if (val < 150) lbl = '중간';
            else if (val < 250) lbl = '높음';
            else lbl = '매우 높음 (완전 차단)';
            $('#rec-dedupe-label').text(lbl);
            
            if (currentTargetSlotId !== null) {
                generateRecommendations(currentTargetSlotId);
            }
        });

        // 4. 자동 랜덤 팔레트 생성 기능
        function getRecommendationColors(references) {
            var recs = [];
            if (references.length === 0) return recs;
            var skinItem = extractedItems.find(function(i) { return i.type === 'skin'; });
            var mainC = skinItem ? chroma(skinItem.slotHex) : chroma(references[0]);
            
            var subTypes = ['top_inner', 'top_outer', 'bottom', 'hair', 'shoes'];
            var otherColors = extractedItems.filter(function(i) {
                return subTypes.includes(i.type);
            }).map(function(i) { return chroma(i.slotHex); });
            
            var pointTypes = ['eyes', 'clothes_point'];
            var pointColors = extractedItems.filter(function(i) {
                return pointTypes.includes(i.type);
            }).map(function(i) { return chroma(i.slotHex); });

            if (otherColors.length === 0) otherColors = references.slice(1).map(function(hex) { return chroma(hex); });

            // 1. 조화/블렌딩
            otherColors.forEach(function(c) {
                recs.push(chroma.mix(mainC, c, 0.25).hex());
                recs.push(chroma.mix(mainC, c, 0.5).hex());
                recs.push(chroma.mix(mainC, c, 0.75).hex());
            });
            recs.push(mainC.set('hsl.h', '+25').hex());
            recs.push(mainC.set('hsl.h', '-25').hex());

            // 2. 보색 대비 (기존 고퀄리티 평균 계산 복구)
            var sumHue = mainC.hsl()[0] || 0;
            var validColorsCount = 1;
            otherColors.forEach(function(c) { 
                var h = c.hsl()[0];
                if (!isNaN(h)) { sumHue += h; validColorsCount++; }
            });
            var avgHue = sumHue / validColorsCount;
            var avgC = chroma.hsl(avgHue, mainC.hsl()[1], mainC.hsl()[2]);
            
            var getCompHex = function(c) {
                var comp = c.set('hsl.h', '+180');
                var hsl = comp.hsl();
                var l = hsl[2];
                var contrastL = l > 0.5 ? Math.max(0.2, l - 0.4) : Math.min(0.8, l + 0.4);
                return chroma.hsl(hsl[0], hsl[1], contrastL).hex();
            };
            
            recs.push(mainC.set('hsl.h', '+180').hex());
            recs.push(getCompHex(mainC));
            recs.push(avgC.set('hsl.h', '+180').hex());
            recs.push(getCompHex(avgC));
            
            otherColors.forEach(function(c) {
                recs.push(c.set('hsl.h', '+180').hex());
                recs.push(getCompHex(c));
            });

            // 3. 다각/엑센트 배색 (눈, 포인트 컬러 반영)
            recs.push(mainC.set('hsl.h', '+120').hex());
            recs.push(mainC.set('hsl.h', '-120').hex());
            recs.push(mainC.set('hsl.h', '+90').hex());
            recs.push(mainC.set('hsl.h', '-90').hex());
            otherColors.forEach(function(c) {
                recs.push(c.set('hsl.h', '+120').hex());
                recs.push(c.set('hsl.h', '-120').hex());
            });
            pointColors.forEach(function(pC) {
                recs.push(pC.set('hsl.h', '+120').hex());
                recs.push(pC.set('hsl.h', '-120').hex());
                recs.push(pC.set('hsl.h', '+90').hex());
                recs.push(pC.set('hsl.h', '-90').hex());
            });

            // 4. 톤 매칭 (Desaturate 복구)
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
            
            var skinItem = extractedItems.find(function(i) { return i.type === 'skin'; });
            if (!skinItem && extractedItems.length > 0) skinItem = extractedItems[0];
            if (!skinItem) {
                alert('추출된 색상이 없습니다.');
                return;
            }

            if (!loadedImage.src) { return; }

            // 성능을 위해 미리보기용 작은 원본 캔버스 데이터 생성
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
                var references = [skinItem.slotHex];
                var newPaletteItems = JSON.parse(JSON.stringify(extractedItems));
                
                var targetItems = newPaletteItems.filter(function(item) {
                    if (item.type !== 'skin' && item.type !== 'line' && item.randomLocked) {
                        references.push(item.slotHex);
                        return false; 
                    }
                    return item.type !== 'skin' && item.type !== 'line';
                });

                targetItems.forEach(function(item) {
                    var recs = getRecommendationColors(references);
                    if (recs.length === 0) recs = [skinItem.slotHex];
                    var randomPick = recs[Math.floor(Math.random() * recs.length)];
                    item.slotHex = randomPick;
                    references.push(randomPick);
                });
                
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

        $('#toggle-random-panel-btn').on('click', function() {
            $('#random-palette-panel').slideToggle();
        });
    });
})(jQuery);
