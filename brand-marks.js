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
