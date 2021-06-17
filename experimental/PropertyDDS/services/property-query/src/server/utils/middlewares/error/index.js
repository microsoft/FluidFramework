/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');

module.exports = () => {
  /**
   * @function
   * @description Error handling middleware for Express routing. Remove context before sending back to client
   * for security purpose.
   *
   * @param {object} err Error object received
   * @param {object} req Express request object
   * @param {object} res Express response object
   * @param {function} next Next function
   *
   * @return {function} next
   */
  return (err, req, res, next) => {
    res.set({ 'Content-Type': 'application/json' });

    if (err && err.code && _.isInteger(err.code)) {
      const message = `${(err.message || 'Unknown error')} | Error ID : ${err.errorId}`;
      res.status(err.code).send({ message });
    }

    if (err && !_.isInteger(err.code)) {
      res.status(500).send(err.message || 'Unknown error');
    }

    return next();
  };
};
