/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-expressions: 0 */
/* eslint max-nested-callbacks: 0 */

const crypto = require('crypto');
const RequestSignatureValidator = require('../../src/server/utils/request_signature_validator');
const generateGUID = require('@fluid-experimental/property-common').GuidUtils.generateGUID;
const sinon = require('sinon');

describe('Request Signature Validator', () => {
  let rsv, validateSignature;

  const branchGuid = generateGUID();

  describe('with a disabled RequestSignatureValidator', () => {
    before(() => {
      rsv = new RequestSignatureValidator({
        enableRequestSigning: false
      });

      validateSignature = rsv.validateSignature(() => branchGuid);
    });

    it('should allow any request', () => {
      let req = {
        get: () => undefined
      };

      let next = sinon.stub();
      validateSignature(req, {}, next);
      expect(next).to.have.been.called;
      expect(next.firstCall.args.length).to.eql(0);
    });
  });

  describe('with a properly configured and enabled RequestSignatureValidator', () => {
    before(() => {
      rsv = new RequestSignatureValidator({
        enableRequestSigning: true,
        requestSigningKeys: [{
          key: 'aKeyThatIsTooOld',
          expireAt: '2000-12-31T23:59:59.99999Z'
        }, {
          key: 'aCurrentKey',
          expireAt: '2099-12-31T23:59:59.99999Z'
        }, {
          key: 'aFutureKey',
          expireAt: '2199-12-31T23:59:59.99999Z'
        }],
        signatureToleranceMsec: 30000,
        supportedSignatureAlgos: ['sha256']
      });

      validateSignature = rsv.validateSignature(() => branchGuid);
    });

    it('should reject the request with an invalid algorithm', () => {

      let req = {
        get: (k) => {
          return {
            'X-Request-Signature': 'a-signature',
            'X-Request-Signature-Timestamp': new Date().toISOString(),
            'X-Request-Signature-Algorithm': 'paul-houde'
          }[k];
        }
      };

      let next = sinon.stub();
      validateSignature(req, {}, next);
      expect(next).to.have.been.called;
      const errArg = next.firstCall.args[0];
      expect(errArg).to.be.instanceof(Error);
      expect(errArg.message).to.contain('Request signature algorithm not supported');
      expect(errArg.statusCode).to.eql(400);
    });

    it('should reject the request if it is missing the signature timestamp', () => {

      let req = {
        get: (k) => {
          return {
            'X-Request-Signature': 'a-signature',
            'X-Request-Signature-Algorithm': 'sha256'
          }[k];
        }
      };

      let next = sinon.stub();
      validateSignature(req, {}, next);
      expect(next).to.have.been.called;
      const errArg = next.firstCall.args[0];
      expect(errArg).to.be.instanceof(Error);
      expect(errArg.message).to.contain('The request signature timestamp is missing for this request');
      expect(errArg.statusCode).to.eql(400);
    });

    it('should reject the request if it is missing the signature', () => {

      let req = {
        get: (k) => {
          return {
            'X-Request-Signature-Timestamp': new Date().toISOString(),
            'X-Request-Signature-Algorithm': 'sha256'
          }[k];
        }
      };

      let next = sinon.stub();
      validateSignature(req, {}, next);
      expect(next).to.have.been.called;
      const errArg = next.firstCall.args[0];
      expect(errArg).to.be.instanceof(Error);
      expect(errArg.message).to.contain('The request signature is missing for this request');
      expect(errArg.statusCode).to.eql(400);
    });

    it('should reject the request if the timestamp is invalid', () => {

      let req = {
        get: (k) => {
          return {
            'X-Request-Signature-Timestamp': 'nopenopenopenope',
            'X-Request-Signature': 'a-signature',
            'X-Request-Signature-Algorithm': 'sha256'
          }[k];
        }
      };

      let next = sinon.stub();
      validateSignature(req, {}, next);
      expect(next).to.have.been.called;
      const errArg = next.firstCall.args[0];
      expect(errArg).to.be.instanceof(Error);
      expect(errArg.message).to.contain('The request signature timestamp is invalid');
      expect(errArg.statusCode).to.eql(400);
    });

    it('should reject the request if the timestamp is expired', () => {
      let req = {
        get: (k) => {
          return {
            'X-Request-Signature-Timestamp': '1989-11-24T01:03:00.954',
            'X-Request-Signature': 'a-signature',
            'X-Request-Signature-Algorithm': 'sha256'
          }[k];
        }
      };

      let next = sinon.stub();
      validateSignature(req, {}, next);
      expect(next).to.have.been.called;
      const errArg = next.firstCall.args[0];
      expect(errArg).to.be.instanceof(Error);
      expect(errArg.message).to.contain('The request signature timestamp is expired or in the future');
      expect(errArg.statusCode).to.eql(401);
    });

    it('should reject the request if the signature doesn\'t match', () => {
      let req = {
        get: (k) => {
          return {
            'X-Request-Signature-Timestamp': new Date().toISOString(),
            'X-Request-Signature': 'a-signature-that-is-not-very-valid',
            'X-Request-Signature-Algorithm': 'sha256'
          }[k];
        }
      };

      let next = sinon.stub();
      validateSignature(req, {}, next);
      expect(next).to.have.been.called;
      const errArg = next.firstCall.args[0];
      expect(errArg).to.be.instanceof(Error);
      expect(errArg.message).to.contain('Invalid request signature');
      expect(errArg.statusCode).to.eql(401);
    });

    it('allow the request if the signature matches', () => {
      const timestamp = new Date().toISOString();

      const signature =
          crypto.createHmac('sha256', 'aCurrentKey')
            .update(`${branchGuid}:${timestamp}`)
            .digest('base64');

      let req = {
        get: (k) => {
          return {
            'X-Request-Signature-Timestamp': timestamp,
            'X-Request-Signature': signature,
            'X-Request-Signature-Algorithm': 'sha256'
          }[k];
        }
      };

      let next = sinon.stub();
      validateSignature(req, {}, next);
      expect(next).to.have.been.called;
      expect(next.firstCall.args.length).to.eql(0);
    });
  });
});
