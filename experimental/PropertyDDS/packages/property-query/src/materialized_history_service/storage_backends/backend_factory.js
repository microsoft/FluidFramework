/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const InMemoryBackend = require('./in_memory');
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
