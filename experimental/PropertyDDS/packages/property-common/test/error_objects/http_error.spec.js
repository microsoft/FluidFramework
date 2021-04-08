/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Tests the functions exported by error_objects/http_error.js
 */
(function() {

  const HTTPError = require('../..').HTTPError;

  describe('property-common.HTTPError', function() {
    var errorMsg = 'a test error message';

    describe('object', function() {
      it('is instanceof Error', function(done) {
        expect(new HTTPError() instanceof Error).to.equal(true);
        done();
      });

      it('is instanceof HTTPError', function(done) {
        expect(new HTTPError() instanceof HTTPError).to.equal(true);
        done();
      });
    });

    describe('toString', function() {
      it('basic error message', function(done) {
        var actual = new HTTPError(errorMsg);
        expect(actual.toString()).to.have.string(errorMsg);
        done();
      });
    });

    describe('JSON.stringify', function() {
      it('stringifies', function(done) {
        var actual = JSON.stringify(new HTTPError(errorMsg));
        expect(actual).to.have.string(errorMsg);
        done();
      });
    });

    describe('flags', function() {
      it('default at 0', function(done) {
        var actual = new HTTPError(errorMsg);
        expect(actual.flags).to.equal(0);
        done();
      });

      it('can be quiet', function(done) {
        var actual = new HTTPError(errorMsg, undefined, undefined, undefined, undefined, HTTPError.FLAGS.QUIET);
        expect(actual.isQuiet()).to.equal(true);
        expect(actual.flags).to.equal(HTTPError.FLAGS.QUIET);
        done();
      });

      it('can be extended', function(done) {
        var actual = new HTTPError(errorMsg, undefined, undefined, undefined, undefined, HTTPError.FLAGS.QUIET | 4);
        expect(actual.isQuiet()).to.equal(true);
        expect(actual.flags).to.equal(HTTPError.FLAGS.QUIET | 4);
        done();
      });
    });
  });
})();
