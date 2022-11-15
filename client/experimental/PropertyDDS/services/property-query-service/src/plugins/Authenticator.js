/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Class for authentication
 */
class Authenticator {
  /**
   * @typedef {object} AuthenticationResult
   * @property {string} userId
   * @property {string} clientId
   * @property {array<string>} userScopes
   */

  /**
   * Set the white list of urls which authentication will bypass
   * @param {Array<string>} urlWhiteList A white list of urls
   */
  setUrlWhiteList(urlWhiteList) {
    this._urlWhiteList = urlWhiteList;
  }

  /**
   * Authenticate request
   * @param {object} req The request to authenticate
   * @return {AuthenticationResult|null|undefined} The authenticate result.
   * Return null or undefined if authentication failed.
   **/
  authenticate(req) {
    if (req && req.headers) {
      const userId = req.headers['user-id'];
      const clientId = req.headers['client-id'];
      if (userId || clientId) {
        return {
          userId,
          clientId
        };
      }
    }
    return {
      userId: 'dummyUserId',
      clientId: 'dummyClientId'
    };
  }

  /**
   * Set authentication info for a request to a service
   * @param {object} req the request object to set authentication info
   * @param {AuthenticationResult} user The authentication info
   */
  setAuth(req, user) {
    if (req && user) {
      req.headers = req.headers || {};
      req.headers['user-id'] = user.userId;
      req.headers['client-id'] = user.clientId;
    }
  }

  /**
   * Validate the content object return by authenticate
   * @param {AuthenticationResult} inPayload the object to validate
   * @return {boolean} true when the validation succeeded, false otherwise
   */
  validateAuthenticationResult(inPayload) {
    return !!inPayload;
  }
}

module.exports = Authenticator;
