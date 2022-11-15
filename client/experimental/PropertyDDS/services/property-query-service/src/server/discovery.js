/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileOverview A utility that resolves the external IP and port for the running container
 */

const getPublicIp = require('./utils/get_public_ip');
const { ModuleLogger } = require('@fluid-experimental/property-query')
const logger = ModuleLogger.getLogger('HFDM.MaterializedHistoryService.Discovery');
const settings = require('./utils/server_settings');

/**
 * @constructor
 * @alias HFDM.PropertySetsServer.Discovery
 */

/**
 * Provides discoverability for container host:port
 */
class Discovery {

  /**
   * Returns the host port
   * @param {String} myContainerPort - Port that is listened to
   * @return {Object} = Object containing host and port members
   */
  static discoverMe(myContainerPort) {
    if (process.env.CONTAINER_MAPPING) {
      try {
        let containerMapping = JSON.parse(process.env.CONTAINER_MAPPING);

        if (containerMapping.hostIp && containerMapping.portMapping[myContainerPort]) {
          return { host: containerMapping.hostIp, port: String(containerMapping.portMapping[myContainerPort]) };
        } else {
          let msg = 'Failed to discover the external host:port mapping. ' + process.env.CONTAINER_MAPPING;
          logger.error(msg);
          throw new Error(msg);
        }
      } catch (e) {
        logger.error('Container mapping error was:', e);
        throw e;
      }
    } else {
      let externalHost = getPublicIp();
      let externalPort = settings.get('mh:internal:port');
      return { host: externalHost, port: String(externalPort) };
    }
  }
}

module.exports = Discovery;
