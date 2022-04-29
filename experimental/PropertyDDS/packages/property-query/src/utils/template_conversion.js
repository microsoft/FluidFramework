/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');

/**
 * Given a ChangeSet, it extracts its template information encoded as a simple ChangeSet.
 * @param {Object} changeSet - ChangeSet possibly containing template information
 * @return {Object} ChangeSet with encoded template information
 */
function getEncodedTemplates(changeSet) {
  if (!changeSet || !changeSet.insertTemplates || Object.keys(changeSet.insertTemplates).length === 0) {
    return {};
  }

  return {
    insert: {
      String: _.mapValues(changeSet.insertTemplates, (val) => JSON.stringify(val))
    }
  };
}

/**
 * Given a ChangeSet that contains encoded template information, it returns the original templates section.
 * @param {Object} changeSet - ChangeSet with encoded template information
 * @return {Object} Decoded templates section, ready to be assigned to a ChangeSet
 */
function getDecodedTemplates(changeSet) {
  if (!changeSet || !changeSet.insert || !changeSet.insert.String ||
      Object.keys(changeSet.insert.String).length === 0) {
    return {};
  }

  return {
    insertTemplates: _.mapValues(changeSet.insert.String, (val) => JSON.parse(val))
  };
}

module.exports = {
  getEncodedTemplates,
  getDecodedTemplates
};
