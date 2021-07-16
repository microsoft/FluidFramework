/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');
const {v4: uuid} = require('uuid');

/**
 * @function
 * @description Factory function.
 *
 * @param {string} username : username
 * @param {array} passwords : password item list [ { value: 'XfTgeejud03', endAt: 'UTC date as ISO string' } ]
 *
 * @return {function} getCredential function
 */
module.exports = (username, passwords) => {
  const preprocessedPasswords = _.map(passwords, (item) => {
    return {
      value: item.value,
      endAt: new Date(item.endAt).getTime()
    };
  });

  /**
   * @function
   * @description Return picks credentials if exist for current unix timestamp in seconds
   *
   * @return {object} credentials item { username: string, password: string }
   */
  return () => {
    const now = new Date();
    const timestamp = now.getTime();

    let previousEndAtDate = 0;

    let passwordSelected = _.find(preprocessedPasswords, (item) => {
      const { endAt } = item;

      if ( timestamp > previousEndAtDate && timestamp <= endAt ) {
        return true;
      }

      previousEndAtDate = endAt;
      return false;
    });

    if (!passwordSelected) {
      passwordSelected = {
        value: uuid()
      };
    }

    return { username, password: passwordSelected.value };
  };
};
