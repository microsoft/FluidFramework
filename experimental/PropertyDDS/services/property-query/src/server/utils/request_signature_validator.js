/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const crypto = require('crypto');
const HTTPError = require('@fluid-experimental/property-common').HTTPError;
const HTTPStatus = require('http-status');

/**
 * A validator for signed requests from the PSS
 */
class RequestSignatureValidator {

  /**
   * Constructor for the request validation
   * @param {Object} params - Parameter object
   * @param {Boolean} [params.enableRequestSigning] - Whether to validate the request signature
   * @param {Array[]} [params.requestSigningKeys] - Request signing keys for rotation
   * @param {Number} [params.signatureToleranceMsec] - Tolerance in milliseconds for the request timestamp
   * @param {Array<String>} [params.supportedSignatureAlgos] - Algos supported for request signature
   */
  constructor(params) {
    this._enableRequestSigning = params.enableRequestSigning;
    this._requestSigningKeys = params.requestSigningKeys;
    this._signatureToleranceMsec = params.signatureToleranceMsec;
    this._supportedSignatureAlgos = params.supportedSignatureAlgos;
  }

  /**
   * Returns an express middleware for validating signature request
   * @param {function} branchGuidProvider - Function that provides the branch guid from request params
   * @return {function} - Express middleware
   */
  validateSignature(branchGuidProvider) {
    return (req, res, next) => {
      if (!this._enableRequestSigning) {
        return next();
      }

      const now = new Date();
      const requestSignature = req.get('X-Request-Signature');
      const requestTimestamp = req.get('X-Request-Signature-Timestamp');
      const requestAlgo = req.get('X-Request-Signature-Algorithm');
      const requestBranchGuid = branchGuidProvider(req);

      if (!requestAlgo || !this._supportedSignatureAlgos.includes(requestAlgo)) {
        return next(
          new HTTPError('Bad Request',
            HTTPStatus.BAD_REQUEST,
            'Request signature algorithm not supported'
          )
        );
      }

      if (!requestTimestamp) {
        return next(
          new HTTPError('Bad Request',
            HTTPStatus.BAD_REQUEST,
            'The request signature timestamp is missing for this request'
          )
        );
      }

      if (!requestSignature) {
        return next(
          new HTTPError('Bad Request',
            HTTPStatus.BAD_REQUEST,
            'The request signature is missing for this request'
          )
        );
      }

      const parsedRequestTimestamp = new Date(requestTimestamp);

      if (isNaN(parsedRequestTimestamp.getTime())) {
        return next(
          new HTTPError('Bad Request',
            HTTPStatus.BAD_REQUEST,
            'The request signature timestamp is invalid'
          )
        );
      }

      if (parsedRequestTimestamp > new Date(now.getTime() + this._signatureToleranceMsec) ||
          parsedRequestTimestamp < new Date(now.getTime() - this._signatureToleranceMsec)) {
        return next(
          new HTTPError('Unauthorized',
            HTTPStatus.UNAUTHORIZED,
            'The request signature timestamp is expired or in the future'
          )
        );
      }

      const theSigningKey =
        this._requestSigningKeys
          .find((rsk) => new Date(rsk.expireAt) > parsedRequestTimestamp)
          .key;

      const computedRequestSignature =
        crypto.createHmac(requestAlgo, theSigningKey)
          .update(`${requestBranchGuid}:${requestTimestamp}`)
          .digest('base64');

      if (computedRequestSignature !== requestSignature) {
        return next(
          new HTTPError('Unauthorized',
            HTTPStatus.UNAUTHORIZED,
            'Invalid request signature'
          )
        );
      }

      return next();
    };
  }
}

module.exports = RequestSignatureValidator;
