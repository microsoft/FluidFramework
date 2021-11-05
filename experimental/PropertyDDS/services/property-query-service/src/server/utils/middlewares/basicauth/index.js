/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const basicAuthMiddleware = require('basicauth-middleware');
const authenticateFactory = require('./authenticate');
const getCredentialFactory = require('./get_credentials');

/**
 * @function
 * @description Factory function
 *
 * @param {string} username : username
 * @param {array} passwords : password item list [ { value: 'XfTgeejud03', endAt: 'milisecond timestamp' } ]
 *
 * @return {function} middleware
 */
module.exports = {

  getCredentialFactory: getCredentialFactory,

  middlewareFactory: (username, passwords) => {
    const getCredential = getCredentialFactory(username, passwords);
    const authenticate = authenticateFactory(basicAuthMiddleware);

    return (req, res, next) => {
      try {
        const credentials = getCredential();
        authenticate(credentials, req, res, next);
      } catch (err) {
        next(err);
      }
    };
  }
};
