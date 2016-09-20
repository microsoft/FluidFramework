                   
// Copyright (c) Microsoft. All rights reserved. Licensed under the MIT license. See LICENSE in the project root for license information.

/**
 * SearchBox Plugin
 *
 * Adds basic demonstration functionality to .ms-SearchBox components.
 *
 * @param  {jQuery Object}  One or more .ms-SearchBox components
 * @return {jQuery Object}  The same components (allows for chaining)
 */
(function ($) {
  $.fn.SearchBox = function () {

    /** Iterate through each text field provided. */
    return this.each(function () {
      var cancel = false;
      var $searchField = $(this).find('.ms-SearchBox-field');
      var $candidateList = $(this).find('.ms-SearchBox-CandidateList');
      var $label = $(this).find('.ms-SearchBox-label');
      var $closeButton = $(this).find('.ms-SearchBox-closeButton');

      //////////////////////////////////////// $searchField Focus
      function onFocus() {
        var $searchBox = $(this).parent('.ms-SearchBox');

        $label.hide();
        $searchBox.addClass('is-active');
      }

      //////////////////////////////////////// $searchField Blur
      function onBlur() {
        var $searchBox = $(this).parent('.ms-SearchBox');

        // If cancel button is selected remove the text and show the label
        if (cancel) {
          $(this).val('');
          $searchField.addClass('hovering');
        }

        // Prevents inputfield from gaining focus too soon
        setTimeout(function() { $searchBox.removeClass('is-active'); }, 10);

        if ($(this).val().length === 0 ) {
          $label.show();
        }

        $candidateList.slideUp();        

        // Reset cancel to false
        cancel = false;
      }      

      //////////////////////////////////////// $searchField Mouse Over/Out
      function onMouseOver() {
        $searchField.addClass('hovering');
      }

      function onMouseOut() {
        $searchField.removeClass('hovering');
      }

      //////////////////////////////////////// $searchField input
      function onInput() {
        var val = $(this).val();

        // Put filtered candidates into the ".ms-List" child of $candidateList
        // if there are results, then $candidateList.slideDown(); 
      }

      $searchField.on('focus', onFocus);
      $searchField.on('mouseover', onMouseOver);
      $searchField.on('mouseout', onMouseOut);
      $searchField.on('blur', onBlur);
      $searchField.on('input', onInput);

      // If cancel button is selected, change cancel value to true
      $closeButton.on('mousedown', function() {
        cancel = true;
      });
    });
  };
})(jQuery);