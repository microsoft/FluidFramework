/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable max-nested-callbacks */
/**
 * @fileoverview Tests the functions exported by error_objects/http_error.js
 */
(function() {

  const FlaggedError = require('../..').FlaggedError;

  describe('property-common.FlaggedError', function() {
    describe('Flags', function() {
      it('can be extended', function(done) {
        Object.keys(FlaggedError.FLAGS).forEach(function(key, index) {
          expect(FlaggedError.FLAGS[key]).to.equal(Math.pow(2, index));
        });
        done();
      });
    });
  });
})();
