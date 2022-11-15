/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');
const DynamoDBClient = require('./dynamodb_client');
const settings = require('../../../server/utils/server_settings');
const { ModuleLogger } = require('@fluid-experimental/property-query');
const logger = ModuleLogger.getLogger('HFDM.PropertyGraphStore.DynamoDB');
const DeferredPromise = require('@fluid-experimental/property-common').DeferredPromise;

/**
 * @fileOverview
 * Manages temporary AWS access with credential rotation.
 * This class requires static initialization.
 * See {@link CredentialRotation#init}
 */
class CredentialRotation {
  /**
   * Create a new temporary access class that handles credential rotation.
   */
  constructor() {
    const ddbSettings = settings.get('store-dynamodb');
    if (ddbSettings && ddbSettings.awsRole &&
      ddbSettings.awsRole.arn && ddbSettings.awsRole.prefix
    ) {
      this._role = _.clone(ddbSettings.awsRole);
      logger.info('Credentials will rotate using the configured AWS role');
    }

    this._onRotation = this._onRotation.bind(this);
  }

  /**
   * @return {DynamoDBClient} A DynamoDBClient to use to access DynamoDB. The returned instance is
   *   periodically changed to rotate permission, so it should not be cached.
   */
  get ddbClient() {
    return this._ddbClient;
  }

  /**
   * @return {boolean} Whether or not the {@link #ddbClient} property is ready for use.
   */
  get isStarted() {
    return !!this._ddbClient;
  }

  /**
   * Initializes the CredentialRotation instance with what it needs to create new DynamoDBClients
   * every time the credentials get rotated.
   * @param {object} awsConfig The AWS configuration.
   * @param {object} storeConfig Additional non-AWS config.
   */
  init(awsConfig, storeConfig) {
    this._awsConfig = _.clone(awsConfig);
    this._config = _.clone(storeConfig);
    this._credsRotation = require('../../../server/utils/creds_rotation');
  }

  /**
   * Start the credential rotation task.
   * @async
   */
  async start() {
    if (this._role) {
      this._initPromise = new DeferredPromise();
      this._credsRotation.addRotation(this._role, this._onRotation);
      await this._initPromise;
    } else {
      this._ddbClient = new DynamoDBClient(this._awsConfig, this._config);
      await this._ddbClient.connect();
      logger.info('Using static AWS config: credentials will not rotate.');
    }
  }

  /**
   * Stops the credential rotation task.
   * @async
   */
  async stop() {
    if (this._role) {
      this._credsRotation.removeRotation(this._role, this._onRotation);
    }

    if (this._ddbClient) {
      await this._ddbClient.disconnect();
      delete this._ddbClient;
    }
  }

  /**
   * Callback that will be called when the credentials get rotated.
   * @param {Error|null} error Error object.
   * @param {object|null} creds Temporary AWS credentials.
   * @async
   */
  async _onRotation(error, creds) {
    if (error) {
      this._initPromise.reject(error); // can fail only on start
      return;
    }

    try {
      const ddbCreds = _stsCredentialsToDynamoDBCreds.call(this, creds);
      const ddbClient = new DynamoDBClient(ddbCreds, this._config);
      await ddbClient.connect();
      this._ddbClient = ddbClient;
      this._initPromise.resolve();
      logger.info(`Successfully connected with renewed credentials using ${JSON.stringify(this._role)}. ` +
        JSON.stringify(_.pick(ddbCreds, 'endpoint', 'region')));
    } catch (connectError) {
      logger.error(`Failed to connect with renewed credentials using ${JSON.stringify(this._role)}:`, connectError);
      this._initPromise.reject(connectError); // can fail only on start
    }
  }
}

/**
 * Converts STS credentials into DynamoDB format.
 * @param {object} stsCredentials STS credentials.
 * @return {object} DynamoDB credentials.
 * @private
 * @this CredentialsRotation
 */
function _stsCredentialsToDynamoDBCreds(stsCredentials) {
  const ddbCredentials = {};
  if (stsCredentials.AccessKeyId) {
    ddbCredentials.accessKeyId = stsCredentials.AccessKeyId;
  }
  if (stsCredentials.SecretAccessKey) {
    ddbCredentials.secretAccessKey = stsCredentials.SecretAccessKey;
  }
  if (stsCredentials.SessionToken) {
    ddbCredentials.sessionToken = stsCredentials.SessionToken;
  }

  if (this._awsConfig.endpoint) {
    ddbCredentials.endpoint = this._awsConfig.endpoint;
  }

  if (this._awsConfig.region) {
    ddbCredentials.region = this._awsConfig.region;
  }

  return ddbCredentials;
}

module.exports = new CredentialRotation();
