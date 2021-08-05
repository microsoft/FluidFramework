/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const DynamoDBBackend = require('./dynamodb');
const InMemoryBackend = require('./in_memory');
const getBigStore = require('./big_store/get_big_store');
const CredentialRotation = require('./dynamodb_store/credential_rotation');
const ddbSettings = require('../../server/utils/server_settings');
const OperationError = require('@fluid-experimental/property-common').OperationError;
const HTTPStatus = require('http-status');

/**
 * A factory to construct the right storage backend based
 * on the configuration for the service
 */
class BackendFactory {

  /**
   * Constructor to the backend factory
   * @param {Settings} in_params.settings - Service settings
   */
  constructor({settings}) {
    this._settings = settings;
  }

  /**
   * Returns the storage backend based on the service configuration
   * @return {StorageBackend} = The Storage Backend
   */
  getBackend() {
    switch (this._settings.get('mh:storageBackend')) {
      case 'DynamoDB':
        return new DynamoDBBackend({
          settings: this._settings.get('mh:dynamoDBBackend'),
          ddbSettings: ddbSettings.get('store-dynamodb'),
          bigStore: getBigStore(ddbSettings),
          credsRotation: CredentialRotation,
          keyspace: ddbSettings.get('store-dynamodb:config:keyspace'),
          tableNames: ddbSettings.get('store-dynamodb:config:tableNames')
        });
      case 'InMemory':
        return new InMemoryBackend({
          settings: this._settings.get('mh:inMemoryBackend')
        });
      default:
        throw new OperationError('Unknown backend: ' + this._settings.get('mh:storageBackend'), 'Initialization',
          HTTPStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

module.exports = BackendFactory;
