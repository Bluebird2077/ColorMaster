/*
	Editorial by HTML5 UP
	html5up.net | @ajlkn
	Free for personal and commercial use under the CCA 3.0 license (html5up.net/license)
*/

(function($) {

	var	$window = $(window),
		$head = $('head'),
		$body = $('body');

	// Breakpoints.
		breakpoints({
			xlarge:   [ '1281px',  '1680px' ],
			large:    [ '981px',   '1280px' ],
			medium:   [ '737px',   '980px'  ],
			small:    [ '481px',   '736px'  ],
			xsmall:   [ '361px',   '480px'  ],
			xxsmall:  [ null,      '360px'  ],
			'xlarge-to-max':    '(min-width: 1681px)',
			'small-to-xlarge':  '(min-width: 481px) and (max-width: 1680px)'
		});

	// Stops animations/transitions until the page has ...

		// ... loaded.
			$(function() {
				window.setTimeout(function() {
					$body.removeClass('is-preload');
				}, 100);
			});

		// ... stopped resizing.
			var resizeTimeout;

			$window.on('resize', function() {

				// Mark as resizing.
					$body.addClass('is-resizing');

				// Unmark after delay.
					clearTimeout(resizeTimeout);

					resizeTimeout = setTimeout(function() {
						$body.removeClass('is-resizing');
					}, 100);

			});

	// Fixes.

		// Object fit images.
			if (!browser.canUse('object-fit')
			||	browser.name == 'safari')
				$('.image.object').each(function() {

					var $this = $(this),
						$img = $this.children('img');

					// Hide original image.
						$img.css('opacity', '0');

					// Set background.
						$this
							.css('background-image', 'url("' + $img.attr('src') + '")')
							.css('background-size', $img.css('object-fit') ? $img.css('object-fit') : 'cover')
							.css('background-position', $img.css('object-position') ? $img.css('object-position') : 'center');

				});

	// Sidebar.
		var $sidebar = $('#sidebar'),
			$sidebar_inner = $sidebar.children('.inner');

		// Inactive by default on <= large.
			breakpoints.on('<=large', function() {
				$sidebar.addClass('inactive');
			});

			breakpoints.on('>large', function() {
				$sidebar.removeClass('inactive');
			});

		// Hack: Workaround for Chrome/Android scrollbar position bug.
			if (browser.os == 'android'
			&&	browser.name == 'chrome')
				$('<style>#sidebar .inner::-webkit-scrollbar { display: none; }</style>')
					.appendTo($head);

		// Toggle.
			$('<a href="#sidebar" class="toggle">Toggle</a>')
				.appendTo($sidebar)
				.on('click', function(event) {

					// Prevent default.
						event.preventDefault();
						event.stopPropagation();

					// Toggle.
						$sidebar.toggleClass('inactive');

				});

		// Events.

			// Link clicks.
				$sidebar.on('click', 'a', function(event) {

					// >large? Bail.
						if (breakpoints.active('>large'))
							return;

					// Vars.
						var $a = $(this),
							href = $a.attr('href'),
							target = $a.attr('target');

					// Prevent default.
						event.preventDefault();
						event.stopPropagation();

					// Check URL.
						if (!href || href == '#' || href == '')
							return;

					// Hide sidebar.
						$sidebar.addClass('inactive');

					// Redirect to href.
						setTimeout(function() {

							if (target == '_blank')
								window.open(href);
							else
								window.location.href = href;

						}, 500);

				});

			// Prevent certain events inside the panel from bubbling.
				$sidebar.on('click touchend touchstart touchmove', function(event) {

					// >large? Bail.
						if (breakpoints.active('>large'))
							return;

					// Prevent propagation.
						event.stopPropagation();

				});

			// Hide panel on body click/tap.
				$body.on('click touchend', function(event) {

					// >large? Bail.
						if (breakpoints.active('>large'))
							return;

					// Deactivate.
						$sidebar.addClass('inactive');

				});

		// Scroll lock.
		// Note: If you do anything to change the height of the sidebar's content, be sure to
		// trigger 'resize.sidebar-lock' on $window so stuff doesn't get out of sync.

			$window.on('load.sidebar-lock', function() {

				var sh, wh, st;

				// Reset scroll position to 0 if it's 1.
					if ($window.scrollTop() == 1)
						$window.scrollTop(0);

				$window
					.on('scroll.sidebar-lock', function() {

						var x, y;

						// <=large? Bail.
							if (breakpoints.active('<=large')) {

								$sidebar_inner
									.data('locked', 0)
									.css('position', '')
									.css('top', '');

								return;

							}

						// Calculate positions.
							x = Math.max(sh - wh, 0);
							y = Math.max(0, $window.scrollTop() - x);

						// Lock/unlock.
							if ($sidebar_inner.data('locked') == 1) {

								if (y <= 0)
									$sidebar_inner
										.data('locked', 0)
										.css('position', '')
										.css('top', '');
								else
									$sidebar_inner
										.css('top', -1 * x);

							}
							else {

								if (y > 0)
									$sidebar_inner
										.data('locked', 1)
										.css('position', 'fixed')
										.css('top', -1 * x);

							}

					})
					.on('resize.sidebar-lock', function() {

						// Calculate heights.
							wh = $window.height();
							sh = $sidebar_inner.outerHeight() + 30;

						// Trigger scroll.
							$window.trigger('scroll.sidebar-lock');

					})
					.trigger('resize.sidebar-lock');

				});

	// Menu.
		var $menu = $('#menu'),
			$menu_openers = $menu.children('ul').find('.opener');

		// Openers.
			$menu_openers.each(function() {

				var $this = $(this);

				$this.on('click', function(event) {

					// Prevent default.
						event.preventDefault();

					// Toggle.
						$menu_openers.not($this).removeClass('active');
						$this.toggleClass('active');

					// Trigger resize (sidebar lock).
						$window.triggerHandler('resize.sidebar-lock');

				});

			});

	// Real User Upload Tracking
	var realUserTracker = (function() {
		var ADDR_SCRIPT = 'https://script.google.com/macros/s/AKfycbx3cNvyZVPIC9jqIJ8BmU5PUq_uvkZcgfx5ybre6A6hJWR4thRVT5CLuysdQi_kZBwVrQ/exec';
		var TABLE_NAME = 'real_user';
		var USER_COOKIE_KEY = 'user';

		function getCookieValue(name) {
			var value = '; ' + document.cookie;
			var parts = value.split('; ' + name + '=');
			if (parts.length === 2) {
				return parts.pop().split(';').shift();
			}
			return '';
		}

		function getUserId() {
			var existingHash = getCookieValue(USER_COOKIE_KEY);
			if (existingHash) {
				return existingHash;
			}
			var hash = Math.random().toString(36).substring(2, 8).toUpperCase();
			var date = new Date();
			date.setTime(date.getTime() + 180 * 24 * 60 * 60 * 1000);
			document.cookie = USER_COOKIE_KEY + '=' + hash + '; expires=' + date.toUTCString() + '; path=/';
			return hash;
		}

		function pad2(n) { return n < 10 ? '0' + n : String(n); }
		function formatTimestamp(d) {
			return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' '
				+ pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
		}

		return function() {
			var currentPagePath = window.location.pathname;
			var sentKey = 'real_user_sent_upload_' + currentPagePath;

			console.log('[real_user] 트래커 실행됨. 현재 페이지:', currentPagePath);

			if (localStorage.getItem(sentKey) === '1') {
				console.log('[real_user] 이미 전송된 기록이 있어 스킵합니다.');
				return;
			}

			var uid = getUserId();
			var payload = {
				id: uid,
				time_stamp: formatTimestamp(new Date()),
				page: currentPagePath,
				"page ": currentPagePath, // 구글 시트 오타(띄어쓰기) 대응
				" page": currentPagePath,
				" page ": currentPagePath
			};

			var data = JSON.stringify(payload);
			var url = ADDR_SCRIPT + '?action=insert&table=' + encodeURIComponent(TABLE_NAME) + '&data=' + encodeURIComponent(data);

			console.log('[real_user] 서버로 데이터 전송 시작...', payload);

			$.ajax({
				url: url,
				dataType: 'jsonp',
				timeout: 8000,
				success: function (res) {
					console.log('[real_user] 응답 수신:', res);
					if (res && res.success === true) {
						console.log('[real_user] 업로드 기록 완료 (' + currentPagePath + ')');
						localStorage.setItem(sentKey, '1');
					} else {
						console.error('[real_user] 서버에서 실패 응답을 보냈습니다:', res);
					}
				},
				error: function (xhr, status, err) {
					console.error('[real_user] AJAX 요청 실패:', status, err);
				}
			});
		};
	})();

	$(document).on('change', 'input[type="file"]', function(e) {
		var id = $(this).attr('id');
		if (id === 'custom-image-upload' || id === 'replace-image-upload' || id === 'assistant-image-upload') {
			if (e.target.files && e.target.files.length > 0) {
				console.log('[real_user] 파일 선택 감지됨:', e.target.files[0].name);
				realUserTracker();
			}
		}
	});

})(jQuery);