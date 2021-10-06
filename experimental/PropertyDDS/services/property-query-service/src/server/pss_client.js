/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const OperationError = require('@fluid-experimental/property-common').OperationError;
const HTTPStatus = require('http-status');
//const RequestUtils = require('hfdm-utils').Utils.RequestUtils;
const { promisify } = require('util');
//const requestAsPromise = promisify(RequestUtils.requestWithRetries);
const _ = require('lodash');
const settings = require('./utils/server_settings');

const { ModuleLogger } = require('@fluid-experimental/property-query')
const logger = ModuleLogger.getLogger('HFDM.MaterializedHistoryService.PSSClient');

const MAX_RETRIES = 3;

/**
 * Used by MHS to request data from the PSS
 */
class PSSClient {

  /**
   * Constructor for this class
   * @param {Object} params Object containing initialization parameters
   * @param {RedisBranchAssignations} params.branchAssignations Redis client to query assignations of branches to PSS
   * @param {String} params.brokerId Identifier used for error reporting/resetting in Redis instances
   */
  constructor(params = {}) {
    this._branchAssignations = params.branchAssignations;
    this._brokerId = params.brokerId;
    this._registrationRefreshIntervalMs = 60000;
    this._authenticator = params.authenticator;
    this._enableEviction = settings.get('mh:pssEviction:isEnabled');
  }

  /**
   * Registers the broker and start periodic reporting to the voting pool
   * @return {Promise} - A promise that resolves upon registration completed
   */
  registerBroker() {
    if (this._enableEviction) {
      let currentDate = Date.now();
      let secondsInMinute = currentDate - currentDate % 60000;
      let whenToStartInterval = 60000 - secondsInMinute;

      setTimeout(this._initializeRegistrationInterval.bind(this), whenToStartInterval);

      return this._branchAssignations.upsertBrokerInstance(this._brokerId);
    }
    return Promise.resolve();
  }

  /**
   * Stops the periodic reporting to voting pool
   */
  unregisterBroker() {
    clearInterval(this._refreshRegistrationInterval);
  }

  /**
   * Gets a range of commits for the specified branch
   * @param {Object} params Parameters for this operation
   * @param {String} params.branchGuid Guid of the branch to fetch commits for
   * @param {String} params.minCommitGuid Guid of the minimum commit in the range (not included in the result)
   * @param {String} params.maxCommitGuid Guid of the maximum commit in the range (included in the result)
   * @param {Number} params.limit Limits the number of commits to be fetched
   * @return {Object} Response object containing the requested commits
   */
  async getCommitRange(params) {
    let result;

    const pssHost = await this._getPSSInstance(params.branchGuid);

    try {
      const requestParams = {
        url: `http://${pssHost}/v2/branch/${params.branchGuid}/commitRange`,
        method: 'GET',
        json: true,
        qs: _.omit(params, ['branchGuid'])
      };
      this._setAuth(requestParams);

      result = await requestAsPromise({
        requestParams,
        retries: MAX_RETRIES
      });
    } catch (error) {
      if (this._enableEviction && (error.statusCode === undefined || error.statusCode >= 500)) {
        this._branchAssignations.reportFailure(params.branchGuid, pssHost, this._brokerId)
          .catch((ex) => logger.warn(`Failed to report failure for instance ${pssHost}`, ex));
      }
      throw error;
    }

    if (this._enableEviction) {
      this._branchAssignations.resetFailure(pssHost, this._brokerId).catch(() => {});
    }
    return result;
  }

  /**
   * Obtains a single commit by its guid
   * @param {Object} params - Parameters
   * @param {String} params.branchGuid - Branch Guid
   * @param {String} params.commitGuid - Commit Guid
   * @return {Object} - Response from PSS
   */
  async getCommit(params) {
    let result;
    const pssHost = await this._getPSSInstance(params.branchGuid);

    try {
      const requestParams = {
        method: 'GET',
        url: `http://${pssHost}/v2/branch/${params.branchGuid}/commit/${params.commitGuid}`,
        qs: {
          payload: true,
          meta: false,
          repositoryInfo: false
        },
        json: true
      };
      this._setAuth(requestParams);
      result = await requestAsPromise({requestParams});
    } catch (error) {
      if (this._enableEviction && (error.statusCode === undefined || error.statusCode >= 500)) {
        this._branchAssignations.reportFailure(params.branchGuid, pssHost, this._brokerId)
          .catch((ex) => logger.warn(`Failed to report failure for instance ${pssHost}`, ex));
      }
      throw error;
    }

    if (this._enableEviction) {
      this._branchAssignations.resetFailure(pssHost, this._brokerId).catch(() => {});
    }
    return result;
  }

  /**
   * Retrieves general information about the specified branch
   * @param {String} branchGuid Guid of the branch to be retrieved
   * @return {Object} Object containing branch and repository information
   * repository: {
   *   guid: Guid of the repository,
   *   urn: Urn of the repository,
   *   rootCommit: {
   *     guid: Guid of the root commit of the repo,
   *     urn: Urn of the root commit of the repo
   *   }
   * },
   * branch: {
   *   guid: Guid of the branch,
   *   urn: Urn of the branch,
   *   head: {
   *     guid: Guid of the head commit,
   *     urn: Urn of the head commit,
   *     sequence: sequence number of the commit
   *   },
   *   parent: {
   *     commit: {
   *       guid: Guid of the parent commit of the branch,
   *       urn: Urn of the parent commit of the branch
   *     },
   *     branch: {
   *       guid: Guid of the parent branch,
   *       urn: Urn of the parent branch
   *     }
   *   }
   * }
   */
  async getBranch(branchGuid) {
    let result;

    const pssHost = await this._getPSSInstance(branchGuid);
    try {
      const requestParams = {
        url: `http://${pssHost}/v2/branch/${branchGuid}`,
        method: 'GET',
        json: true
      };
      this._setAuth(requestParams);
      result = await requestAsPromise({
        requestParams,
        retries: MAX_RETRIES
      });
    } catch (error) {
      if (this._enableEviction && (error.statusCode === undefined || error.statusCode >= 500)) {
        this._branchAssignations.reportFailure(branchGuid, pssHost, this._brokerId)
          .catch((ex) => logger.warn(`Failed to report failure for instance ${pssHost}`, ex));
      }
      throw error;
    }

    if (this._enableEviction) {
      this._branchAssignations.resetFailure(pssHost, this._brokerId).catch(() => {});
    }

    return result;
  }

  /**
   * Set authentication for requestParams
   * @param {object} requestParams - The parameters of the request to set authentication
   * @private
   */
  _setAuth(requestParams) {
    let serviceClientId = settings.get('mh:serviceClientId');
    this._authenticator.setAuth(requestParams, {
      clientId: serviceClientId
    });
  }

  /**
   * Checks if the PSS instance is unavailable.
   * @param {String} instance - The instance to check.
   * @return {bool} Whether the PSS instance is unavailable.
  */
  _isInstanceUnavailable(instance) {
    return instance.indexOf('UNAVAILABLE') === 0;
  }

  /**
   * Get the PSS host the branch is assigned to, or assign one if none is assigned.
   * @param {String} branchGuid - The branch guid.
   * @return {String} The assigned PSS host.
  */
  async _getPSSInstance(branchGuid) {
    let pss = await this._branchAssignations.getPSSInstanceForBranch(branchGuid);

    if (this._isInstanceUnavailable(pss)) {
      throw new OperationError('The PSS instance for this branch is temporarily unavailable, please try again shortly',
        'GetCommit', HTTPStatus.SERVICE_UNAVAILABLE);
    }

    let match = pss.match(/^undefined(([0-9]+\.?)+:[0-9]+)$/g);
    if (match) {
      logger.warn(
        `Detected an invalid host when resolving PSS instance for branch: ${pss}. Fixing host to ${match[1]}`);
      pss = match[1];
    }

    return pss;
  }

  /**
   * Initializes the voting right interval for a broker's registration
   * @private
   */
  _initializeRegistrationInterval() {
    this._refreshRegistrationInterval = setInterval(
      this._branchAssignations.upsertBrokerInstance.bind(
        this._branchAssignations,
        this._brokerId),
      this._registrationRefreshIntervalMs);
  }
}

module.exports = PSSClient;
