/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const path = require('path');
const { PropertyGraphManager, Table, CredentialRotation } = require('hfdm-dynamodb-store');
const BigStoreUtils = require('hfdm-bigstore').Utils;
const BinaryStore = require('hfdm-dynamodb-store').BinaryStore;
const { PluginManager } = require('hfdm-plugin-manager');
const { ModuleLogger } = require('@fluid-experimental/property-query')
const AWS = require('aws-sdk');

const settings = require('../../src/server/utils/server_settings');
const {ddbSettings} = require('hfdm-dynamodb-store');

/**
 * HFDM Classic client that retrieves data directly from DynamoDB. It defines a similar interface to PSSClient
 * but also allows to do extra stuff.
 */
class DynamoDBHfdmClassicClient {
  /**
   * Constructor for this class
   */
  constructor() {
    const storeSettings = ddbSettings.get('store-dynamodb');
    let pmConfigPath = settings.get('pluginManager:configPath');
    if (!path.isAbsolute(pmConfigPath)) {
      pmConfigPath = path.join(__dirname, '..', '..', pmConfigPath);
    }
    const pm = new PluginManager(pmConfigPath);
    const Authorizer = pm.resolve('Authorizer');
    let instance;

    try {
      // Long live singletons
      // Throwing in a getter will cause premature death and
      // other health related problems.
      // The surgeon general advises against it.
      //
      // This path is only for running the tests
      instance = PluginManager.instance;
    } catch (ex) {
      // This is actually the path executed when running the tool.
      // This will catch when there is no PluginManager instance.
      instance = {
        systemMonitor: pm.resolve('SystemMonitor').createInstance(settings.get('systemMonitor'),
          ModuleLogger.getLogger('HFDM.MaterializedHistoryRepair.SystemMonitor'), 'mr', settings.get('stackName')),
        authorizer: new Authorizer()
      };
    }

    PluginManager.instance = instance;
    const dependencies = {
      authorizer: PluginManager.instance.authorizer,
      bigStore: BigStoreUtils.getBigStore(ddbSettings),
      binaryStore: new BinaryStore({settings: ddbSettings.get('binary')})
    };
    this._propertyGraph = PropertyGraphManager.getPropertyGraph(storeSettings, dependencies);
  }

  /**
   * Initializes the DynamoDB client library
   * @return {Promise} Resolved when the operation is completed
   */
  init() {
    return this._propertyGraph.connect();
  }

  /**
   * De-initializes the DynamoDB client library
   * @return {Promise} Resolved when the operation is completed
   */
  stop() {
    return this._propertyGraph.disconnect();
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
    const branchesResult = await this._propertyGraph.getBranches([branchGuid]);
    const repositoriesResult = await this._propertyGraph.getRepositories([branchesResult.branches[0].container.guid]);

    const result = {
      repository: branchesResult.branches[0].container,
      branch: branchesResult.branches[0].branch
    };
    result.repository.rootCommit = repositoriesResult.repositories[0].rootCommit;
    return result;
  }

  /**
   * Obtains a single commit by its guid
   * @param {Object} params - Parameters
   * @param {String} params.branchGuid - Branch Guid
   * @param {String} params.commitGuid - Commit Guid
   * @return {Object} - The commit object, if found, with the following structure:
   * {
   *   {object} commit: {
   *     {string} guid commit guid,
   *     {string} urn commit urn,
   *     {number} created The commit creation time as a unix timestamp (milliseconds since epoch, UTC)
   *     {string} [creatorId] The commit creator id if it was specified at creation time.
   *     {string} [serviceId] The commit service id if it was specified at creation time.
   *     {object} [changeSet] The commit payload if the commit contains a payload.
   *     {number} sequence The commit sequence.
   *     {object} parent: {
   *       {string} guid Guid of the parent commit
   *       {string} urn Urn of the parent commit
   *     }
   *   }
   * }
   */
  async getCommit(params) {
    const result = await this._propertyGraph.getCommit({
      commit: {
        guid: params.commitGuid,
        payload: true,
        meta: false,
        mergeParent: false
      },
      branch: {
        guid: params.branchGuid
      }
    });
    return result;
  }

  /**
   * Gets a range of commits for the specified branch
   * @param {Object} params Parameters for this operation
   * @param {String} params.branchGuid Guid of the branch to fetch commits for
   * @param {String} params.minCommitGuid Guid of the minimum commit in the range (not included in the result)
   * @param {String} params.maxCommitGuid Guid of the maximum commit in the range (included in the result)
   * @param {Number} params.limit Limits the number of commits to be fetched
   * @return {Object} Object containing the requested commits
   */
  async getCommitRange(params) {
    const result = await this._propertyGraph.getCommitRange({
      range: {
        min: {
          commit: {
            guid: params.minCommitGuid
          }
        },
        max: {
          commit: {
            guid: params.maxCommitGuid
          }
        }
      },
      limit: params.limit,
      flatten: false
    });
    return result;
  }

  /**
   * Gets the branch guid for the branches that meet the conditions specified by parameter
   * @param {Object} params Parameters for this function
   * @param {Date} params.lastModifiedSince Filters the results to those branches last modified since this timestamp
   * @param {Object} [params.lastEvaluatedKey] If specified, scan will continue with the branch guid next to this
   * @return {Object} An object containing the scan result
   *   {Array<String>} branches Guids of the scanned branches
   *   {Object} lastEvaluatedKey References the last branch scanned if paging is needed
   */
  async scanBranches(params) {
    const scanParams = {
      TableName: Table.BRANCHES.name,
      ProjectionExpression: 'branch, meta, lastModified',
      FilterExpression: 'lastModified > :from',
      ExpressionAttributeValues: {
        ':from': { 'S': params.lastModifiedSince.toISOString() }
      }
    };
    if (params.lastEvaluatedKey) {
      scanParams.ExclusiveStartKey = AWS.DynamoDB.Converter.marshall(params.lastEvaluatedKey);
    }
    const scanResult = await new Promise((resolve, reject) => {
      CredentialRotation.ddbClient._dynamodb.scan(scanParams, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
    const result = {};
    result.branches = scanResult.Items.filter((branchRow) => {
      const uRow = AWS.DynamoDB.Converter.unmarshall(branchRow);
      const meta = uRow.meta && uRow.meta.data && JSON.parse(uRow.meta.data);
      return !!(meta && meta.materializedHistory && meta.materializedHistory.enabled);
    }).map((branchRow) => branchRow.branch.S);
    if (scanResult.LastEvaluatedKey) {
      result.lastEvaluatedKey = AWS.DynamoDB.Converter.unmarshall(scanResult.LastEvaluatedKey);
    }
    return result;
  }
}

module.exports = DynamoDBHfdmClassicClient;
