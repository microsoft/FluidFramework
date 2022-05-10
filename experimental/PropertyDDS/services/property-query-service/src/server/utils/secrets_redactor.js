/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
(function() {
  const tokensRegex = /(-token)=[^& ]+/g;

  module.exports = function(string) {
    if (typeof string === 'string' || string instanceof String) {
      return string.replace(tokensRegex, '$1=REDACTED');
    }

    return string;
  };
})();
