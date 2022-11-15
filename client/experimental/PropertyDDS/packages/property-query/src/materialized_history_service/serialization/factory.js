/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const JSONSerializer = require('./json');
// TODO: enable bson serialization
// const BSONSerializer = require('./bson');

const OperationError = require('@fluid-experimental/property-common').OperationError;
const HTTPStatus = require('http-status');

/**
 * A factory to construct the right storage backend based
 * on the configuration for the service
 */
class SerializerFactory {

  /**
   * Constructor to the backend factory
   * @param {Settings} in_params.settings - Service settings
   */
  constructor({settings}) {
    this._settings = settings;
  }

  /**
   * Returns the serializer based on the service configuration
   * @return {Serializer} = The Storage Backend
   */
  getSerializer() {
    switch (this._settings.get('mh:serializer')) {
      case 'JSON':
        return new JSONSerializer();
    //   case 'BSON':
    //     return new BSONSerializer();
      default:
        throw new OperationError('Unknown serializer: ' + this._settings.get('mh:serializer'), 'Initialization',
          HTTPStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

module.exports = SerializerFactory;
