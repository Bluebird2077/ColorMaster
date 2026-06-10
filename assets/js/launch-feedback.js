(function ($) {
  'use strict';

  var ADDR_SCRIPT = 'https://script.google.com/macros/s/AKfycbx3cNvyZVPIC9jqIJ8BmU5PUq_uvkZcgfx5ybre6A6hJWR4thRVT5CLuysdQi_kZBwVrQ/exec';
  var TABLE_NAME = 'tab_final';
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

  function validateEmail(email) {
    var re = /^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$/i;
    return re.test(email);
  }

  function buildInsertUrl(data) {
    return ADDR_SCRIPT
      + '?action=insert'
      + '&table=' + encodeURIComponent(TABLE_NAME)
      + '&data=' + encodeURIComponent(data);
  }

  function getErrorMessageFromResponse(res) {
    if (!res) return '알 수 없는 응답입니다.';
    if (typeof res.error === 'string' && res.error) return res.error;
    if (res.data && typeof res.data.error === 'string' && res.data.error) return res.data.error;
    if (typeof res.message === 'string' && res.message) return res.message;
    return '응답 형식을 확인할 수 없습니다.';
  }

  $(function () {
    $('#submit').on('click', function () {
      var email = $('#submit-email').val().trim();
      var advice = $('#submit-advice').val().trim();

      if (!email || !validateEmail(email)) {
        alert('이메일이 유효하지 않아 알림을 드릴 수가 없습니다.');
        return;
      }

      var finalData = JSON.stringify({
        id: getUVfromCookie(),
        email: email,
        advice: advice
      });

      $.ajax({
        url: buildInsertUrl(finalData),
        dataType: 'jsonp',
        timeout: 8000,
        success: function (res) {
          if (res && res.success === true) {
            alert('제출이 완료되었습니다. 출시 시 알림을 드릴게요.');
            $('#submit-email').val('');
            $('#submit-advice').val('');
            return;
          }
          var msg = getErrorMessageFromResponse(res);
          console.warn('[launch-feedback] insert failed response:', res);
          alert('제출 실패: ' + msg);
        },
        error: function (xhr, statusText) {
          console.error('[launch-feedback] network error:', statusText, xhr && xhr.responseText);
          alert('전송 중 오류가 발생했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.');
        }
      });
    });
  });
})(jQuery);
