/* Original third-party marks: local assets, fixed identities, no account authority. */
(function () {
  'use strict';
  var marks = Object.freeze({
    calendar: ['google-calendar.svg', false],
    google_local_services_ads: ['google-local-services.svg', false],
    thumbtack: ['thumbtack.svg', false],
    angi: ['angi.svg', true],
    yelp: ['yelp.svg', false],
    facebook: ['facebook.png', false],
    instagram: ['instagram.svg', false],
    houzz: ['houzz.svg', false],
    porch: ['porch.png', true],
    stripe: ['stripe.svg', true]
  });
  function mark(id) {
    // Channel icons are authored UI symbols; provider identities use original assets below.
    var channels = {
      web: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01M7 13h10M7 16h6"/>',
      voice: '<path d="M8 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-4l-5-2-2 2a14 14 0 0 1-6-6l2-2-2-5Z"/>',
      sms: '<path d="M21 12a8 8 0 0 1-8 8H7l-4 2V12a9 9 0 0 1 18 0Z"/><path d="M7 10h10M7 14h7"/>'
    };
    if (Object.prototype.hasOwnProperty.call(channels, id)) return '<svg class="service-mark" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + channels[id] + '</svg>';
    if (id === 'meta_messaging') return '<span class="brand-mark-pair" aria-hidden="true">' + mark('facebook') + mark('instagram') + '</span>';
    if (!Object.prototype.hasOwnProperty.call(marks, id)) return '';
    var item = marks[id];
    return '<img class="brand-mark' + (item[1] ? ' brand-mark--wide' : '') + '" src="assets/brands/' + item[0] + '" width="' + (item[1] ? '72' : '24') + '" height="24" alt="" aria-hidden="true" decoding="async">';
  }
  // Wordmark names remain visible until the original image actually loads.
  // A missing image or this optional script must never hide the provider name.
  function imageState(event) {
    var image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.classList.contains('brand-mark')) return;
    if (event.type === 'load' && image.naturalWidth > 0) {
      image.dataset.brandLoaded = 'true'; image.hidden = false;
    } else {
      delete image.dataset.brandLoaded; image.hidden = true;
    }
  }
  document.addEventListener('load', imageState, true);
  document.addEventListener('error', imageState, true);
  // Cached public wordmarks may have completed before this optional helper loads.
  document.querySelectorAll('img.brand-mark').forEach(function (image) {
    if (image.complete) imageState({ target: image, type: image.naturalWidth > 0 ? 'load' : 'error' });
  });
  window.MCBrandMark = mark;
})();
