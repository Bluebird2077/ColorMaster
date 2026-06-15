(function ($) {
	'use strict';

	var ADDR_SCRIPT = 'https://script.google.com/macros/s/AKfycbx3cNvyZVPIC9jqIJ8BmU5PUq_uvkZcgfx5ybre6A6hJWR4thRVT5CLuysdQi_kZBwVrQ/exec';
	var TABLE_NAME = 'visitors';
	var MAX_RETRY = 2;
	var REQUEST_TIMEOUT_MS = 8000;
	var SESSION_FLAG_KEY = 'visitors_sent_v1';
	var USER_COOKIE_KEY = 'user';
	var USER_COOKIE_DAYS = 180;

	function getCookieValue(name) {
		var value = '; ' + document.cookie;
		var parts = value.split('; ' + name + '=');
		if (parts.length === 2) {
			return parts.pop().split(';').shift();
		}
		return '';
	}

	function setCookieValue(name, value, days) {
		var expires = '';
		if (days) {
			var date = new Date();
			date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
			expires = '; expires=' + date.toUTCString();
		}
		document.cookie = name + '=' + (value || '') + expires + '; path=/';
	}

	function getUVfromCookie() {
		var existingHash = getCookieValue(USER_COOKIE_KEY);
		if (existingHash) {
			return existingHash;
		}

		var hash = Math.random().toString(36).substring(2, 8).toUpperCase();
		setCookieValue(USER_COOKIE_KEY, hash, USER_COOKIE_DAYS);
		return hash;
	}

	function pad2(n) {
		return n < 10 ? '0' + n : String(n);
	}

	function formatTimestamp(d) {
		return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' '
			+ pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
	}

	function getClientIp(done) {
		$.ajax({
			url: 'https://jsonip.com?format=jsonp',
			dataType: 'jsonp',
			timeout: 4000,
			success: function (res) {
				var ip = (res && res.ip) ? res.ip : 'unknown';
				done(ip);
			},
			error: function () {
				done('unknown');
			}
		});
	}

	function buildPayload(ip) {
		var params = new URLSearchParams(window.location.search);
		var utm = params.get('utm_source') || params.get('utm_medium') || params.get('utm') || '';
		return {
			id: getUVfromCookie(),
			landingUrl: window.location.href,
			ip: ip || 'unknown',
			referer: document.referrer || '',
			time_stamp: formatTimestamp(new Date()),
			utm: utm,
			device: /Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
		};
	}

	function buildUrl(data) {
		return ADDR_SCRIPT + '?action=insert&table=' + encodeURIComponent(TABLE_NAME) + '&data=' + encodeURIComponent(data);
	}

	function buildReadUrl() {
		return ADDR_SCRIPT + '?action=read&table=' + encodeURIComponent(TABLE_NAME);
	}

	function upsertDebugBadge(text, ok) {
		// UI에 계속 남아있는 디버그 뱃지 생성 로직을 제거했습니다.
		// 콘솔로만 상태를 로깅합니다.
		console.log('[visitors badge log]', text, ok);
	}

	function logRecentRows(rows) {
		if (!Array.isArray(rows) || rows.length === 0) {
			console.warn('[visitors] read 결과가 비어있음');
			return;
		}
		var recent = rows.slice(-3).map(function (row) {
			return {
				id: row && row.id,
				time_stamp: row && row.time_stamp,
				landingUrl: row && row.landingUrl
			};
		});
		console.log('[visitors] 최근 3개 레코드', recent);
	}

	function markSent() {
		try {
			sessionStorage.setItem(SESSION_FLAG_KEY, '1');
		} catch (e) {
			console.warn('[visitors] sessionStorage write failed', e);
		}
	}

	function alreadySent() {
		try {
			return sessionStorage.getItem(SESSION_FLAG_KEY) === '1';
		} catch (e) {
			console.warn('[visitors] sessionStorage read failed', e);
			return false;
		}
	}

	function verifyInserted(id) {
		$.ajax({
			url: buildReadUrl(),
			dataType: 'jsonp',
			timeout: REQUEST_TIMEOUT_MS,
			success: function (readRes) {
				var rows = readRes && readRes.data;
				logRecentRows(rows);
				var matched = Array.isArray(rows) && rows.some(function (row) {
					return row && String(row.id) === String(id);
				});

				if (matched) {
					console.log('[visitors] 시트 반영 확인 완료, id=', id);
					upsertDebugBadge('visitors OK: ' + id, true);
					markSent();
				} else {
					console.warn('[visitors] insert 응답은 성공이지만 read 결과에서 id 미확인', {
						id: id,
						readResponse: readRes
					});
					upsertDebugBadge('visitors MISMATCH: ' + id, false);
				}
			},
			error: function (xhr) {
				console.warn('[visitors] read 검증 실패', {
					status: xhr && xhr.status,
					readyState: xhr && xhr.readyState
				});
				upsertDebugBadge('visitors READ ERR', false);
			}
		});
	}

	function sendWithRetry(url, payload, attempt) {
		$.ajax({
			url: url,
			dataType: 'jsonp',
			timeout: REQUEST_TIMEOUT_MS,
			success: function (res) {
				if (res && res.success === true) {
					console.log('[visitors] insert 응답 성공', res);
					markSent(); // insert가 성공하면 즉시 전송 완료 처리하여 중복 방지
					verifyInserted(payload.id);
					return;
				}

				console.error('[visitors] insert 응답 실패', res);
				upsertDebugBadge('visitors INSERT FAIL', false);
			},
			error: function (xhr) {
				console.error('[visitors] 실패', {
					attempt: attempt + 1,
					status: xhr && xhr.status,
					readyState: xhr && xhr.readyState,
					responseText: xhr && xhr.responseText
				});

				if (attempt < MAX_RETRY) {
					var delay = (attempt + 1) * 1200;
					console.warn('[visitors] 재시도 예정(ms):', delay);
					window.setTimeout(function () {
						sendWithRetry(url, payload, attempt + 1);
					}, delay);
				} else {
					upsertDebugBadge('visitors NETWORK FAIL', false);
				}
			}
		});
	}

	function sendFallbackOnPageHide(url) {
		var fired = false;
		window.addEventListener('pagehide', function () {
			if (fired || alreadySent()) {
				return;
			}
			fired = true;

			// JSONP endpoint is GET-only, so use Image beacon-style fallback.
			var img = new Image();
			img.src = url + '&_=' + Date.now();
			console.warn('[visitors] pagehide fallback 전송 시도');
		});
	}

	$(function () {
		if (alreadySent()) {
			console.log('[visitors] 같은 세션에서 이미 전송됨');
			return;
		}

		getClientIp(function (ip) {
			var payload = buildPayload(ip);
			var data = JSON.stringify(payload);
			var url = buildUrl(data);

			console.log('[visitors] 전송 payload', payload);
			
			// 전송을 시작하기 직전에 바로 세션에 전송 완료 마킹을 합니다.
			// 이렇게 하면 AJAX 요청이 서버에 도달하기 전에 페이지를 이탈하여 pagehide가 발생했을 때
			// fallback 이미지 비콘이 중복으로 전송되는 Race Condition을 막을 수 있습니다.
			markSent();
			
			sendWithRetry(url, payload, 0);
			sendFallbackOnPageHide(url);
		});
	});
})(jQuery);
