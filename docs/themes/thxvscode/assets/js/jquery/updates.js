export function loadUpdatesBanner() {
  $('.updates-banner div.dismiss-btn').click(function() {
    Cookies.set('hide-update-notification', 'true', {
      expires: 25 // hide until the next update is live
    })
    $('.updates-banner').addClass('invisible')
  })
}
