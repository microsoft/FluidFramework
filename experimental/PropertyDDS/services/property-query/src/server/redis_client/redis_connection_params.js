/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 6379;
const DEFAULT_CLUSTER_PORTS = [16379, 26379, 36379];

/**
 *
 * @param {Object} [in_params = {}] the hfdmRedis settings
 * @return {Object} as {
 *   cluster: Boolean: true when running in cluster mode
 *   nodes: Array: in cluster mode [{host: String, port: Number}, ... ], otherwise an empty array
 *   redisOptions: Object: redis options to pass when creating the Redis object
 * }
 */
function getConnectionParams(in_params = {}) {
  const redisSettings = _.clone(in_params);
  const endpoints = (redisSettings.endpoints || '').split(',')
    .map((x) => x.match(/^([^:]+):(\d+)$/)).filter((x) => x).map((x) => ({host: x[1], port: Number(x[2])}));
  const res = {};
  let redisOptions;

  // Are we in cluster mode
  res.cluster = String(in_params.cluster) === 'true';

  // Setup the redisOptions
  if (redisSettings.redisOptions) {
    redisOptions = _.extend({}, redisSettings.redisOptions);
  } else {
    redisOptions = _.omit(redisSettings, 'cluster', 'endpoints', 'nodes', 'options');
  }

  // the redis options must have db
  redisOptions.db = redisOptions.hasOwnProperty('db') ? redisOptions.db : 0;

  // Setup the clusterOptions
  if (res.cluster) {
    if (!redisSettings.clusterOptions) {
      res.clusterOptions = {};
    } else {
      res.clusterOptions = _.omit(redisSettings.clusterOptions, 'redisOptions');
    }
  }

  // Hosts and ports
  if (res.cluster) {
    // In cluster mode
    if (endpoints.length > 0) {
      res.nodes = endpoints;
    } else if (redisSettings.nodes && redisSettings.nodes.length > 0) {
      res.nodes = _.clone(redisSettings.nodes);
    } else if (redisSettings.host && redisSettings.port) {
      res.nodes = [{host: redisSettings.host, port: redisSettings.port}];
    } else {
      res.nodes = DEFAULT_CLUSTER_PORTS.map((x) => ({host: DEFAULT_HOST, port: x}));
    }
  } else {
    // In regular mode
    if (!redisOptions.host || !redisOptions.port) {
      if (redisSettings.host && redisSettings.port) {
        redisOptions.host = redisSettings.host;
        redisOptions.port = redisSettings.port;
      } else if (endpoints.length > 0) {
        redisOptions.host = endpoints[0].host;
        redisOptions.port = endpoints[0].port;
      } else if (redisSettings.nodes && redisSettings.nodes.length > 0) {
        redisOptions.host = redisSettings.nodes[0].host;
        redisOptions.port = redisSettings.nodes[0].port;
      } else {
        redisOptions.host = DEFAULT_HOST;
        redisOptions.port = DEFAULT_PORT;
      }
    }
  }

  if (res.cluster) {
    // Cluster mode is true: remove the host and port from the options
    delete redisOptions.host;
    delete redisOptions.port;

    // Add the redisOptions to the clusterOptions
    _.extend(res.clusterOptions, {redisOptions});
  } else {
    // Host mode: Use the redisOptions
    res.redisOptions = redisOptions;
  }
  return res;
}

module.exports = getConnectionParams;
