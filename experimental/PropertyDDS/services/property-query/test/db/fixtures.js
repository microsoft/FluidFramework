/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals targets */
const RequestUtils = require('../../src/server/utils/request_utils');
const { promisify } = require('util');
const requestAsPromise = promisify(RequestUtils.requestWithRetries);
const crypto = require('crypto');
const settings = require('../../src/server/utils/server_settings');

const noop = () => {};

/**
 *  Contains fixtures for integration tests
 **/
class Fixtures {
  /**
   * Creates a branch on the local server
   * @param {Object} headers - Headers to pass
   * @param {Object} body - Body for creation
   * @return {Promise} - Promise from requestWithRetries
   */
  static createBranch(headers = {}, body = {}) {
    return requestAsPromise({
      requestParams: {
        url: `${targets.mhServerUrl}/v1/branch`,
        method: 'POST',
        headers: headers,
        json: true,
        body
      },
      logger: noop
    });
  }

  /**
   * Fetches a branch
   * @param {String} branchGuid - Identifier of the branch to fetch
   * @param {Object} headers - Headers to use
   * @return {Promise} - Result from requestWithRetries
   */
  static fetchBranch(branchGuid, headers = {}) {
    return requestAsPromise({
      requestParams: {
        url: `${targets.mhServerUrl}/v1/branch/${branchGuid}`,
        headers: headers,
        json: true,
        timeout: 10000
      },
      logger: noop
    });
  }

  /**
   * Creates a commit on the local server
   * @param {String} branchGuid - Branch on which to commit
   * @param {Object} headers - Headers to pass
   * @param {Object} body - Body for creation
   * @return {Promise} - Promise from requestWithRetries
   */
  static createCommit(branchGuid, headers = {}, body = {}) {
    return requestAsPromise({
      requestParams: {
        url: `${targets.mhServerUrl}/v1/branch/${branchGuid}/commit`,
        method: 'POST',
        headers: headers,
        json: true,
        body
      },
      logger: noop
    });
  }

  /**
   * Creates a commit asynchronously on the local server
   * @param {String} branchGuid - Branch on which to commit
   * @param {Object} headers - Headers to pass
   * @param {Object} body - Body for creation
   * @return {Promise} - Promise from requestWithRetries
   */
  static createCommitAsync(branchGuid, headers = {}, body = {}) {
    return requestAsPromise({
      requestParams: {
        url: `${targets.mhServerUrl}/v1/branch/${branchGuid}/commitTask`,
        method: 'POST',
        headers: headers,
        json: true,
        body
      },
      logger: noop
    });
  }

  /**
   * Fetches a materialized view
   * @param {String} branchGuid - Identifier of the branch to fetch
   * @param {String} commitGuid - Identifier of the commit to fetch
   * @param {Object} headers - Headers to use
   * @param {Object} query - Query string to use
   * @return {Promise} - Result from requestWithRetries
   */
  static fetchMaterializedView(branchGuid, commitGuid, headers = {}, query = {}) {
    return requestAsPromise({
      requestParams: {
        url: `${targets.mhServerUrl}/v1/branch/${branchGuid}/commit/${commitGuid}/materializedView`,
        headers: headers,
        json: true,
        qs: query
      },
      logger: noop
    });
  }

  /**
   * Fetches a materialized view using POST
   * @param {String} branchGuid - Identifier of the branch to fetch
   * @param {String} commitGuid - Identifier of the commit to fetch
   * @param {Object} headers - Headers to use
   * @param {Object} body - Body to use
   * @return {Promise} - Result from requestWithRetries
   */
  static fetchMaterializedViewByPost(branchGuid, commitGuid, headers = {}, body = {}) {
    return requestAsPromise({
      requestParams: {
        method: 'POST',
        url: `${targets.mhServerUrl}/v1/branch/${branchGuid}/commit/${commitGuid}/materializedView`,
        headers: headers,
        json: true,
        body
      },
      logger: noop
    });
  }

  /**
   * Fetches a single commit
   * @param {String} branchGuid - Identifier of the branch to fetch
   * @param {String} commitGuid - Identifier of the commit to fetch
   * @param {Object} headers - Headers to use
   * @param {Object} query - Query string to use
   * @return {Promise} - Result from requestWithRetries
   */
  static fetchSingleCommit(branchGuid, commitGuid, headers = {}, query = {}) {
    return requestAsPromise({
      requestParams: {
        url: `${targets.mhServerUrl}/v1/branch/${branchGuid}/commit/${commitGuid}/changeSet`,
        headers: headers,
        json: true,
        qs: query
      },
      logger: noop
    });
  }

  /**
   * Gets the commit meta node
   * @param {String} branchGuid - Identifier of the branch to fetch
   * @param {String} commitGuid - Identifier of the commit to fetch
   * @param {Object} headers - Headers to use
   * @return {Promise} - Result from requestWithRetries
   */
  static getCommit(branchGuid, commitGuid, headers = {}) {
    return requestAsPromise({
      requestParams: {
        url: `${targets.mhServerUrl}/v1/branch/${branchGuid}/commit/${commitGuid}`,
        headers: headers,
        method: 'GET',
        json: true
      },
      logger: noop
    });
  }

  /**
   * Triggers the deletion of a branch
   * @param {Array<String>} branchGuids - Branches to delete
   * @param {Object} headers - Headers to use
   * @return {Promise} - Result from requestWithRetries
   */
  static deleteBranches(branchGuids, headers = {}) {
    return requestAsPromise({
      requestParams: {
        method: 'POST',
        url: `${targets.mhServerUrl}/v1/branchDeletion`,
        headers: headers,
        json: {
          branchGuids: branchGuids
        }
      },
      logger: noop
    });
  }

  /**
   * Fetch the status of a deletion task
   * @param {String} taskUrl - URL of the task
   * @param {Object} headers - Headers to use
   * @return {Promise} - Result from requestWithRetries
   */
  static fetchDeleteTask(taskUrl, headers = {}) {
    return requestAsPromise({
      requestParams: {
        url: taskUrl,
        headers: headers,
        json: true,
        timeout: 6000
      },
      logger: noop
    });
  }

  /**
   * Triggers the deletion of a branch
   * @param {String} taskGuid - Branches to delete
   * @param {Object} headers - Headers to use
   * @return {Promise} - Result from requestWithRetries
   */
  static retryBranchDeletion(taskGuid, headers = {}) {
    return requestAsPromise({
      requestParams: {
        method: 'POST',
        url: `${targets.mhServerUrl}/v1/branchDeletion/${taskGuid}/retry`,
        headers: headers,
        json: true,
        timeout: 6000
      },
      logger: noop
    });
  }

  /**
   * Returns a set of headers used to sign the request for authentication purposes
   * @param {String} branchGuid - Branch guid for this request
   * @return {Object} - Key-value pair for authentication headers
   */
  static getRequestSignatureHeaders(branchGuid) {
    const now = new Date();
    const theSigningKey =
      settings.get('materializedHistoryService:requestSigningKeys')
        .find((rsk) => new Date(rsk.expireAt) > now)
        .key;

    const signingPayload = (`${branchGuid}:${now.toISOString()}`);

    const requestHash =
      crypto.createHmac('sha256', theSigningKey)
        .update(signingPayload)
        .digest('base64');

    return {
      'X-Request-Signature-Timestamp': now.toISOString(),
      'X-Request-Signature-Algorithm': 'sha256',
      'X-Request-Signature': requestHash
    };
  }
}

module.exports = Fixtures;
