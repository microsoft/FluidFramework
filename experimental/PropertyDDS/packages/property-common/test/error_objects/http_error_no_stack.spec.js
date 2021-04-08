/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-unused-expressions */
/* globals assert */
/**
 * @fileoverview Tests the functions exported by error_objects/http_error_no_stack.js
 */
(function() {

  const HTTPError = require('../..').HTTPError;
  const HTTPErrorNoStack = require('../..').HTTPErrorNoStack;

  describe('property-common.HTTPErrorNoStack', function() {
    var errorMsg = 'a test error message';

    describe('object', function() {
      it('is instanceof Error', function(done) {
        expect(new HTTPErrorNoStack() instanceof Error).to.equal(true);
        done();
      });

      it('is instanceof HTTPError', function(done) {
        expect(new HTTPErrorNoStack() instanceof HTTPError).to.equal(true);
        done();
      });

      it('is instanceof HTTPErrorNoStack', function(done) {
        expect(new HTTPErrorNoStack() instanceof HTTPErrorNoStack).to.equal(true);
        done();
      });

      it('has no stack parameter', function(done) {
        let httpErrorNoStack = new HTTPErrorNoStack(errorMsg);
        if (httpErrorNoStack.stack) {
          assert(false, 'httpErrorNoStack.stack should evaluate to false');
        }
        done();
      });
    });

    describe('flags', function() {
      it('default at 0', function(done) {
        var actual = new HTTPErrorNoStack(errorMsg);
        expect(actual.flags).to.equal(0);
        done();
      });

      it('can be quiet', function(done) {
        var actual = new HTTPErrorNoStack(errorMsg, undefined, undefined, undefined, undefined,
          HTTPErrorNoStack.FLAGS.QUIET);
        expect(actual.isQuiet()).to.equal(true);
        expect(actual.flags).to.equal(HTTPErrorNoStack.FLAGS.QUIET);
        done();
      });

      it('can be extended', function(done) {
        var actual = new HTTPErrorNoStack(errorMsg, undefined, undefined, undefined, undefined,
          HTTPErrorNoStack.FLAGS.QUIET | 4);
        expect(actual.isQuiet()).to.equal(true);
        expect(actual.flags).to.equal(HTTPErrorNoStack.FLAGS.QUIET | 4);
        done();
      });
    });
  });
})();
