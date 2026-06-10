(function () {
  'use strict';

  var menu = document.getElementById('menu');
  if (!menu) {
    return;
  }

  var links = menu.querySelectorAll('a[href]');
  var path = window.location.pathname.split('/').pop() || 'index.html';

  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href');
    if (href === path) {
      links[i].classList.add('is-active');
    }
  }
})();
