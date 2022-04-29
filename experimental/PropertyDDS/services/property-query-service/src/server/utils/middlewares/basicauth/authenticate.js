/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
module.exports = (basicAuthMiddleware) => {
  /**
   * @function
   * @description Auth using basic auth
   *
   * @param {object} credentials : credential item
   * @param {string} credentials.username : username
   * @param {string} credentials.password : password
   * @param {object} req : express request object
   * @param {object} res : express response object
   * @param {function} next : next function
   */
  return (credentials, req, res, next) => {
    const { username, password } = credentials;
    const middleware = basicAuthMiddleware(username, password);

    middleware(req, res, next);
  };
};
