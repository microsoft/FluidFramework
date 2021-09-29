export function loadUpdatesBanner() {
  if (document.cookie.indexOf('hide-update-notification=') === -1) {
    $('.updates-banner').removeClass('hidden');
  }

  $('.updates-banner div.dismiss-btn').on('click', function() {
    Cookies.set('hide-update-notification', 'true', {
      expires: 14 // hide until the next update is live
    });
    $('.updates-banner').addClass('hidden');
  })
}
