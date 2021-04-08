/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Tests the functions exported by error_objects/operation_error.js
 */
(function() {

  const OperationError = require('../..').OperationError;

  describe('property-common.OperationError', function() {
    var errorMsg = 'a test error message';
    var operation = 'TestOperation';

    describe('object', function() {
      it('is instanceof Error', function(done) {
        expect(new OperationError() instanceof Error).to.equal(true);
        done();
      });

      it('is instanceof OperationError', function(done) {
        expect(new OperationError() instanceof OperationError).to.equal(true);
        done();
      });

      it('stringifies', function(done) {
        var actual = JSON.stringify(new OperationError(errorMsg));
        var expected = '{"name":"OperationError","flags":0}';
        expect(actual).to.equal(expected);
        done();
      });
    });

    describe('toString', function() {
      it('basic error message', function(done) {
        var expected = `OperationError: ${errorMsg}`;
        var actual = new OperationError(errorMsg).toString();
        expect(actual).to.not.be.undefined; // eslint-disable-line
        expect(actual).to.have.string(expected);
        done();
      });

      it('full OperationError', function(done) {
        var code = 99;
        var expected = 'OperationError[' + operation + ', ' + code + ', 1 [TRANSIENT]]: ' + errorMsg;
        var actual = new OperationError(errorMsg, operation, code, OperationError.FLAGS.TRANSIENT);
        expect(actual.toString()).to.have.string(expected);
        done();
      });

      it('partial OperationError', function(done) {
        var expected = 'OperationError[' + operation + ']: ' + errorMsg;
        var actual = new OperationError(errorMsg, operation);
        expect(actual.toString()).to.have.string(expected);
        done();
      });

      it('code only', function(done) {
        var code = 99;
        var expected = 'OperationError[' + code + ']: ' + errorMsg;
        var actual = new OperationError(errorMsg, undefined, code);
        expect(actual.toString()).to.have.string(expected);
        done();
      });

      it('extended flags', function(done) {
        var code = 99;
        var expected = 'OperationError[' + operation + ', ' + code + ', 5 [TRANSIENT]]: ' + errorMsg;
        var actual = new OperationError(errorMsg, operation, code, OperationError.FLAGS.TRANSIENT | 4);
        expect(actual.toString()).to.have.string(expected);
        done();
      });
    });

    describe('fields', function() {
      it('name', function(done) {
        var actual = new OperationError();
        expect(actual.name).to.equal('OperationError');
        done();
      });

      it('stack', function(done) {
        var actual = new OperationError();
        expect(actual).to.have.property('stack');
        done();
      });

      it('operation', function(done) {
        var actual = new OperationError(errorMsg, operation);
        expect(actual.operation).to.equal(operation);
        done();
      });

      it('statusCode', function(done) {
        var code = 99;
        var actual = new OperationError(errorMsg, operation, code);
        expect(actual.statusCode).to.equal(code);
        done();
      });

      it('can set the stack', function(done) {
        var e = new OperationError();
        var e2 = new Error();
        e.stack = e2.stack;
        done();
      });
    });

    describe('flags', function() {
      it('default at 0', function(done) {
        var actual = new OperationError(errorMsg, operation, undefined, undefined);
        expect(actual.flags).to.equal(0);
        done();
      });

      it('can be transiant', function(done) {
        var actual = new OperationError(errorMsg, operation, undefined, OperationError.FLAGS.TRANSIENT);
        expect(actual.isTransient()).to.equal(true);
        expect(actual.flags).to.equal(OperationError.FLAGS.TRANSIENT);
        done();
      });

      it('can be quiet', function(done) {
        var actual = new OperationError(errorMsg, operation, undefined, OperationError.FLAGS.QUIET);
        expect(actual.isQuiet()).to.equal(true);
        expect(actual.flags).to.equal(OperationError.FLAGS.QUIET);
        done();
      });

      it('can be transient and quiet', function(done) {
        var actual = new OperationError(errorMsg, operation, undefined, OperationError.FLAGS.TRANSIENT |
           OperationError.FLAGS.QUIET);
        expect(actual.isTransient()).to.equal(true);
        expect(actual.isQuiet()).to.equal(true);
        expect(actual.flags).to.equal(OperationError.FLAGS.TRANSIENT | OperationError.FLAGS.QUIET);
        done();
      });

      it('can be extended', function(done) {
        var actual = new OperationError(errorMsg, operation, undefined,
          OperationError.FLAGS.TRANSIENT | 4 | OperationError.FLAGS.QUIET);
        expect(actual.isTransient()).to.equal(true);
        expect(actual.isQuiet()).to.equal(true);
        expect(actual.flags).to.equal(OperationError.FLAGS.TRANSIENT | 4 | OperationError.FLAGS.QUIET);
        done();
      });
    });
  });
})();
