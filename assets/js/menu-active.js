(function () {
  'use strict';

  var menu = document.getElementById('menu');
  if (!menu) {
    return;
  }

  // 모든 페이지 공통으로 주입될 메뉴 HTML
  var sharedMenuHtml = `
    <header class="major"><h2>Menu</h2></header>
    <ul>
        <li><a href="index.html">메인 허브</a></li>
        <li><a href="color-assistant.html">색상 추천</a></li>
        <li><a href="color-assistant-character.html">캐릭터 색상 추천</a></li>
        <li><a href="color-replace.html">색상 대체</a></li>
        <li><a href="custom-palette.html">커스텀 팔레트</a></li>
        <li><a href="launch-feedback.html">출시 알림/피드백</a></li>
    </ul>
  `;

  // 기존 HTML 내부의 메뉴를 공용 메뉴로 덮어씌움
  menu.innerHTML = sharedMenuHtml;

  var links = menu.querySelectorAll('a[href]');
  var path = window.location.pathname.split('/').pop() || 'index.html';

  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href');
    if (href === path) {
      links[i].classList.add('active');
      // 상위 부모(li 등)에도 클래스 추가가 필요하다면
      if (links[i].parentElement) {
          links[i].parentElement.classList.add('active');
      }
    }
  }
})();
