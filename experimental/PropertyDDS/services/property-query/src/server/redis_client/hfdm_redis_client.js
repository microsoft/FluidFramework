/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-use-before-define */
/* eslint-disable no-fallthrough */
(function() {
  'use strict';

  const _ = require('lodash');
  const DeferredPromise = require('@fluid-experimental/property-common').DeferredPromise;
  const EventEmitter = require('events').EventEmitter;
  const HttpStatus = require('http-status-codes');
  const { ModuleLogger } = require('@fluid-experimental/property-query');
  const Redis = require('ioredis');
  const util = require('util');

  const logger = ModuleLogger.getLogger('HFDM.Redis.HfdmRedisClient');
  const getConnectionParams = require('./redis_connection_params');

  /**
   * Constructor for the Hfdm Redis Client
   * @param {object} in_params - Connection parameters to pass to the underlying ioredis driver
   */
  const HfdmRedisClient = function(in_params) {
    const connectionParams = getConnectionParams(in_params);

    this._cluster = connectionParams.cluster;
    if (this._cluster) {
      this._clusterOptions = connectionParams.clusterOptions;
      this._nodes = connectionParams.nodes;
      this._redisOptions = connectionParams.clusterOptions.redisOptions;
    } else {
      this._redisOptions = connectionParams.redisOptions;
    }
    this._redisOptions.enableReadyCheck = true;
    this._pubSubSubscriptions = {};
    this._disconnecting = false;
  };

  /**
   * Checks that 'connect' has been called.
   * @return {Promise} A promise that is rejected if connect wasn't called.
   * @this HFDM.Redis.HfdmRedisClient
   * @private
   */
  const _checkConnected = function() {
    return this.redis ? Promise.resolve() : Promise.reject(new Error('Not connected to redis'));
  };

  /**
   * Logs redis errors using the logger instance.
   * @param {*} error A redis error.
   * @this HFDM.Redis.HfdmRedisClient
   * @private
   */
  const _logError = function(error) {
    let stack = error.stack.replace(/(?:\r\n|\r|\n)/g, ' --- ');
    let message = error.message ? (error.message + ' ' + stack) : error;
    logger.error('Redis error:', message);
  };

  /**
   * Called when connected to redis.
   * @this HFDM.Redis.HfdmRedisClient
   * @private
   */
  const _onConnected = function() {
    logger.info(`Connected to Redis ${this._cluster ? 'cluster' : 'host'}`);
    this.redis.removeAllListeners();
    this.redis.on('message', this._handlePubSubMessage.bind(this));
    this.redis.on('pmessage', this._handlePubSubPMessage.bind(this));
    this.redis.on('error', _logError.bind(this));
    this.redis.on('close', _onClose.bind(this));

    if (this._cluster) {
      this.redis.nodes('master').forEach(ri => {
        ri.on('message', this._handlePubSubMessage.bind(this));
        ri.on('pmessage', this._handlePubSubPMessage.bind(this));
      });
    }
  };

  const _onClose = function() {
    this.emit('close');
  };

  /**
   * Initializes the connection with Redis
   * @this HfdmRedisClient
   * @return {Promise} - A promise that resolves when the connection is successfully established or rejects otherwise
   */
  HfdmRedisClient.prototype.connect = function() {
    const that = this;
    const redisOptions = _.clone(this._redisOptions);

    if (this.redis && this.redis.status === 'connect') {
      return Promise.reject(new Error('Can\'t connect, a connection is already established to Redis'));
    }

    // Make sure to stop reconnecting when already trying to disconnect
    if (!redisOptions.hasOwnProperty('retryStategy')) {
      redisOptions.retryStrategy = function redisRetry(times) {
        // Will stop retrying when the return value is not a number
        return that._disconnecting ? undefined : Math.min(times * 50, 2000);
      };
    }

    if (this._cluster) {
      const clusterOptions = _.clone(this._clusterOptions);

      clusterOptions.redisOptions = redisOptions;
      this.redis = new Redis.Cluster(this._nodes, clusterOptions);
    } else {
      this.redis = new Redis(redisOptions);
    }

    const deferredPromise = new DeferredPromise();

    if (that.redis.status === 'connect') {   // TODO: Magic constant here
      _onConnected.call(this);
      deferredPromise.resolve();
    } else {
      that.redis.once('ready', function() {
        _onConnected.call(that);
        deferredPromise.resolve();
      });
      that.redis.once('error', function(error) {
        logger.error('Unable to connect to Redis:', error.message ? error.message : error);
        that.redis.removeAllListeners();
        that.redis.on('error', _logError.bind(that));
        deferredPromise.reject(error);
      });
    }

    return deferredPromise;
  };

  /**
   * Describes the connection state to Redis
   * @this HfdmRedisClient
   * @return {boolean} - True if connection is active
   */
  HfdmRedisClient.prototype.isConnected = function() {
    return this.redis !== undefined && this.redis.status === 'ready';
  };

  /**
   * Broadcasts the messages to the interested listeners
   * @this HfdmRedisClient
   * @param {string} channel - Name of the subscription channel
   * @param {string} message - Contents of the message
   */
  HfdmRedisClient.prototype._handlePubSubMessage = function(channel, message) {
    if (this._pubSubSubscriptions[channel]) {
      if (logger.isLevelEnabled(ModuleLogger.levels.DEBUG)) {
        logger.debug(
          'Broadcasting message for channel: ' + channel +
          ' to ' + this._pubSubSubscriptions[channel].length + ' callbacks. Message contents was: ' +
          JSON.stringify(message));
      }
      this._pubSubSubscriptions[channel].forEach(function(callback) {
        callback.callback(undefined, message);
      });
    } else {
      logger.debug(
        'Received message for non-subscribed channel: ' + channel +
         '. Message contents was: ' + JSON.stringify(message));
    }
  };

  /**
   * Broadcasts the messages to the interested listeners
   * @this HfdmRedisClient
   * @param {string} pattern - A pattern for the subscription
   * @param {string} channel - Name of the topic
   * @param {string} message - Contents of the message
   */
  HfdmRedisClient.prototype._handlePubSubPMessage = function(pattern, channel, message) {

    if (this._pubSubSubscriptions[pattern]) {
      if (logger.isLevelEnabled(ModuleLogger.levels.DEBUG)) {
        logger.debug(
          'Broadcasting message for pattern: ' + pattern +
          ' to ' + this._pubSubSubscriptions[pattern].length + ' callbacks. Message contents was: ' +
          JSON.stringify(message));
      }
      this._pubSubSubscriptions[pattern].forEach(function(callback) {
        callback.callback(pattern, channel, message);
      });
    } else {
      logger.debug(
        'Received message for non-subscribed pattern: ' + pattern +
         '. Message contents was: ' + JSON.stringify(message));
    }
  };

  /**
   * Adds the callback to a subscription
   * @this HfdmRedisClient
   * @param {string} channel - Name of the subscription channel
   * @param {function} callbackKey - A unique identifier for the callback
   * @param {function} callback - Function to recieve the message
   */
  HfdmRedisClient.prototype._addSubscriptionCallback = function(channel, callbackKey, callback) {
    if (!this._pubSubSubscriptions[channel]) {
      this._pubSubSubscriptions[channel] = [];
    }
    this._pubSubSubscriptions[channel].push({callbackKey: callbackKey, callback: callback});
  };

  /**
   * Publishes a message to a channel
   * @this HfdmRedisClient
   * @param {string} channel - Name of the subscription channel
   * @param {string} message - Payload to send
   * @return {Promise} - A promise that resolves when the subscription is successfully created or rejects otherwise
   */
  HfdmRedisClient.prototype.publish = function(channel, message) {
    const that = this;
    return _checkConnected.call(this)
      .then(function() {
        return that.redis.publish(channel, message);
      });
  };

  /**
   * Removes the callback to a subscription
   * @this HfdmRedisClient
   * @param {string} channel - Name of the subscription channel
   * @param {function} callbackKey - A unique identifier for the callback
   */
  HfdmRedisClient.prototype._removeSubscriptionCallback = function(channel, callbackKey) {
    if (this._pubSubSubscriptions[channel]) {

      const index = this._pubSubSubscriptions[channel].findIndex(function(item) {
        return callbackKey === item.callbackKey;
      });

      if (index > -1) {
        this._pubSubSubscriptions[channel].splice(index, 1);
        if (this._pubSubSubscriptions[channel] === 0) {
          delete this._pubSubSubscriptions[channel];
        }
      }
    }
  };

  /**
  * Clears all the PubSub subscriptions
  * @this HfdmRedisClient
  */
  HfdmRedisClient.prototype._clearSubscriptionCallbacks = function() {
    this._pubSubSubscriptions = {};
  };


  /**
   * Get the health status of redis.
   * @return {Promise} A promise that is resolved with the redis health status on success.
   */
  HfdmRedisClient.prototype.getHealth = function() {
    const health = {
      status: this.redis ? this.redis.status : 'not connected'
    };

    // Intentional fallthrough in switch:
    switch (health.status) {
      case 'ready':
        health.code = HttpStatus.OK;
        break;
      case 'connect':
      case 'connecting':
      case 'reconnecting':
      case 'wait':
        health.code = HttpStatus.SERVICE_UNAVAILABLE;
        break;
      case 'end':
      default:
        health.code = HttpStatus.INTERNAL_SERVER_ERROR;
        break;
    }

    return Promise.resolve(health);
  };

  /**
  * Handles subscription or psubscription to a channel
  * @this HfdmRedisClient
  * @param {function} verb - Reference to redis subscribe or psubscribe
  * @param {string} channel - Name of the subscription channel
  * @param {any} callbackKey - A key to uniquely identify the callback
  * @param {function} callback - Function to recieve the message
  * @return {Promise} - A promise that resolves when the subscription is successfully created or rejects otherwise
  */
  const _subscribe = function(verb, channel, callbackKey, callback) {
    const that = this;
    const mustSubscribe = !that._pubSubSubscriptions[channel] || that._pubSubSubscriptions[channel].length <= 0;

    that._addSubscriptionCallback(channel, callbackKey, callback);

    return _checkConnected.call(this)
      .then(function() { // eslint-disable-line consistent-return
        if (mustSubscribe) {
          logger.debug('Adding subscription to ' + channel);
          return verb(channel);
        }
      })
      .then(function() {
        return Promise.resolve();
      });
  };

  /**
  * Handles subscription or psubscription to a channel
  * @this HfdmRedisClient
  * @param {function} verb - Reference to redis subscribe or psubscribe
  * @param {string} channel - Name of the subscription channel
  * @param {any} callbackKey - A key to uniquely identify the callback
  * @param {function} callback - Function to recieve the message
  * @return {Promise} - A promise that resolves when the subscription is successfully created or rejects otherwise
  */
  const _subscribeAll = function(verb, channel, callbackKey, callback) {
    this._addSubscriptionCallback(channel, callbackKey, callback);

    return _checkConnected.call(this)
      .then(function() { // eslint-disable-line consistent-return
        logger.debug('Adding subscription to ' + channel);
        return verb(channel);
      })
      .then(function() {
        return Promise.resolve();
      });
  };

  /**
  * Removes the subscription or psubscription to a channel
  * @this HfdmRedisClient
  * @param {function} verb - Reference to redis unsubscribe or punsubscribe
  * @param {string} channel - Name of the subscription channel
  * @param {function} callbackKey - A key to uniquely identify the callback
  * @return {Promise} - A promise that resolves when the subscription is successfully removed or rejects otherwise
  */
  const _unsubscribe = function(verb, channel, callbackKey) {
    this._removeSubscriptionCallback(channel, callbackKey);

    if (!this._pubSubSubscriptions[channel] || this._pubSubSubscriptions[channel].length <= 0) {
      delete this._pubSubSubscriptions[channel];
      logger.debug('Removing subscription ' + channel);
      return _checkConnected.call(this)
        .then(() => {
          return verb(channel);
        });
    }

    return Promise.resolve();
  };

  /**
  * Removes the subscription or psubscription to a channel
  * @this HfdmRedisClient
  * @param {function} verb - Reference to redis unsubscribe or punsubscribe
  * @param {string} channel - Name of the subscription channel
  * @param {function} callbackKey - A key to uniquely identify the callback
  * @return {Promise} - A promise that resolves when the subscription is successfully removed or rejects otherwise
  */
  const _unsubscribeAll = function(verb, channel, callbackKey) {
    this._removeSubscriptionCallback(channel, callbackKey);
    delete this._pubSubSubscriptions[channel];
    logger.debug('Removing subscription ' + channel);
    return _checkConnected.call(this)
    .then(() => {
      return verb(channel);
    });
  };

  /**
  * Creates a subscription to a channel
  * @this HfdmRedisClient
  * @param {string} channel - Name of the subscription channel
  * @param {any} callbackKey - A key to uniquely identify the callback
  * @param {function} callback - Function to recieve the message
  * @return {Promise} - A promise that resolves when the subscription is successfully created or rejects otherwise
  */
  HfdmRedisClient.prototype.subscribe = function(channel, callbackKey, callback) {
    return _subscribe.call(this, this.redis.subscribe.bind(this.redis), channel, callbackKey, callback);
  };

  /**
  * Creates a pattern subscription to a topic
  * @this HfdmRedisClient
  * @param {string} pattern - Pattern of the subscription
  * @param {any} callbackKey - A key to uniquely identify the callback
  * @param {function} callback - Function to recieve the message
  * @return {Promise} - A promise that resolves when the subscription is successfully created or rejects otherwise
  */
  HfdmRedisClient.prototype.psubscribe = function(pattern, callbackKey, callback) {
    return _subscribe.call(this, this.redis.psubscribe.bind(this.redis), pattern, callbackKey, callback);
  };

  /**
  * Removes the subscription to a channel
  * @this HfdmRedisClient
  * @param {string} channel - Name of the subscription channel
  * @param {function} callbackKey - A key to uniquely identify the callback
  * @return {Promise} - A promise that resolves when the subscription is successfully removed or rejects otherwise
  */
  HfdmRedisClient.prototype.unsubscribe = function(channel, callbackKey) {
    return _unsubscribe.call(this, this.redis.unsubscribe.bind(this.redis), channel, callbackKey);
  };

  /**
  * Removes the pattern subscription to a topic
  * @this HfdmRedisClient
  * @param {string} pattern - Name of the subscription channel
  * @param {function} callbackKey - A key to uniquely identify the callback
  * @return {Promise} - A promise that resolves when the subscription is successfully removed or rejects otherwise
  */
  HfdmRedisClient.prototype.punsubscribe = function(pattern, callbackKey) {
    return _unsubscribe.call(this, this.redis.punsubscribe.bind(this.redis), pattern, callbackKey);
  };

  /**
  * Creates a pattern subscription to a topic
  * @this HfdmRedisClient
  * @param {string} pattern - Pattern of the subscription
  * @param {any} callbackKey - A key to uniquely identify the callback
  * @param {function} callback - Function to recieve the message
  * @return {Promise} - A promise that resolves when the subscription is successfully created or rejects otherwise
  */
  HfdmRedisClient.prototype.psubscribeAll = function(pattern, callbackKey, callback) {
    if (this._cluster) {
      return Promise.all(this.redis.nodes('master').map(ri => {
        return _subscribeAll.call(this, ri.psubscribe.bind(ri), pattern, callbackKey, callback);
      }));
    } else {
      return _subscribeAll.call(this, this.redis.psubscribe.bind(this.redis), pattern, callbackKey, callback);
    }
  };

  /**
    * Removes the pattern subscription to a topic
    * @this HfdmRedisClient
    * @param {string} pattern - Name of the subscription channel
    * @param {function} callbackKey - A key to uniquely identify the callback
    * @return {Promise} - A promise that resolves when the subscription is successfully removed or rejects otherwise
    */
  HfdmRedisClient.prototype.punsubscribeAll = function(pattern, callbackKey) {
    if (this._cluster) {
      return Promise.all(this.redis.nodes('master').map(ri => {
        return _unsubscribeAll.call(this, ri.punsubscribe.bind(ri), pattern, callbackKey);
      }));
    } else {
      return _unsubscribeAll.call(this, this.redis.punsubscribe.bind(this.redis), pattern, callbackKey);
    }
  };

  /**
  * Scans for a pattern of keys
  * @this HfdmRedisClient
  * @param {string} pattern - Name of the subscription channel
  * @return {Promise} - A promise that resolves with an array of keys
  */
  HfdmRedisClient.prototype.scan  = function(pattern) {
    let keys = [];
    const dp = new DeferredPromise();

    let redisInstances = [];
    if (this._cluster) {
      redisInstances = this.redis.nodes('master');
    } else {
      redisInstances.push(this.redis);
    }

    let promises = redisInstances.map(ri => new Promise((resolve, reject) => {
      const stream = ri.scanStream({
        match: pattern
      });

      stream.on('data', resultKeys => {
        keys = keys.concat(resultKeys);
      });

      stream.on('error', err => {
        stream.destroy();
        dp.reject(err);
      });

      stream.on('end', () => {
        resolve();
      });
    }));

    return Promise.all(promises)
      .then(() => keys);
  };

  /**
  * Scans for a pattern of keys in a hash.
  * @this HfdmRedisClient
  * @param {string} hash - Name of the hash to scan.
  * @param {string} [pattern] - An optional pattern to match, else all keys and their values will be returned.
  * @return {Promise} - A promise that resolves with the scan result.
  */
  HfdmRedisClient.prototype.hscan = function(hash, pattern = null) {
    let keys = [];
    let redisInstances = [];
    if (this._cluster) {
      redisInstances = this.redis.nodes('master');
    } else {
      redisInstances.push(this.redis);
    }

    let promises = redisInstances.map(ri => new Promise((resolve, reject) => {
      const stream = ri.hscanStream(hash, {
        match: pattern
      });

      stream.on('data', (k) => {
        keys = keys.concat(k);
      });

      stream.on('error', (err) => {
        stream.destroy();
        if (err instanceof Redis.ReplyError && err.message.startsWith('MOVED ')) {
          resolve();
        } else {
          reject(err);
        }
      });

      stream.on('end', () => {
        resolve();
      });
    }));

    return Promise.all(promises).then(() => {
      return keys;
    });
  };

  /**
  * Sets a key with expiry
  * @this HfdmRedisClient
  * @param {string} key - Key
  * @param {string} value - Value
  * @param {number} expiry - Number of seconds before expiry
  * @return {Promise} - A promise that resolves when the value is set
  */
  HfdmRedisClient.prototype.setex  = function(key, value, expiry) {
    return this.redis.setex(key, expiry, value);
  };

  /**
  * Removes a key
  * @this HfdmRedisClient
  * @param {string} key - Key
  * @param {string} value - Value
  * @param {number} expiry - Number of seconds before expiry
  * @return {Promise} - A promise that resolves when the value is set
  */
  HfdmRedisClient.prototype.del  = function(key) {
    return this.redis.del(key);
  };

  /**
  * Sets or updates the expiry for a key
  * @this HfdmRedisClient
  * @param {string} key - Key
  * @param {number} expiry - Number of seconds before expiry
  * @return {Promise} - A promise that resolves when the expiry is set
  */
  HfdmRedisClient.prototype.expire  = function(key, expiry) {
    return this.redis.expire(key, expiry);
  };

  /**
  * Sets or updates the expiry timestamp for a key
  * @this HfdmRedisClient
  * @return {Promise} - A promise that resolves when the expiry is set
  */
  HfdmRedisClient.prototype.expireat  = function() {
    return this.redis.expireat.apply(this.redis, arguments);
  };

  /**
  * Adds a key
  * @this HfdmRedisClient
  * @return {Promise} - A promise that resolves when the key is added
  */
  HfdmRedisClient.prototype.set  = function() {
    return this.redis.set.apply(this.redis, arguments);
  };

  /**
  * Get value from key
  * @this HfdmRedisClient
  * @return {Promise} - A promise that resolves when the key value is retrieved
  */
  HfdmRedisClient.prototype.get  = function() {
    return this.redis.get.apply(this.redis, arguments);
  };

  /**
  * Adds to a sorted set
  * @this HfdmRedisClient
  * @return {Promise} - A promise that resolves when the key is added to the set
  */
  HfdmRedisClient.prototype.zadd  = function() {
    return this.redis.zadd.apply(this.redis, arguments);
  };

  /**
  * Adds to a set
  * @this HfdmRedisClient
  * @return {Promise} - A promise that resolves when the key is added to the set
  */
  HfdmRedisClient.prototype.sadd  = function() {
    return this.redis.sadd.apply(this.redis, arguments);
  };

  /**
  * Gets from a hash map
  * @this HfdmRedisClient
  * @return {Promise} - A promise that resolves with the result
  */
  HfdmRedisClient.prototype.hget  = function() {
    return this.redis.hget.apply(this.redis, arguments);
  };

  /**
  * Removes from a hashmap
  * @this HfdmRedisClient
  * @return {Promise} - A promise that resolves when the removal is completed
  */
  HfdmRedisClient.prototype.hdel  = function() {
    return this.redis.hdel.apply(this.redis, arguments);
  };

  /**
  * Removes from a set
  * @this HfdmRedisClient
  * @return {Promise} - A promise that resolves when the removal is completed
  */
  HfdmRedisClient.prototype.srem  = function() {
    return this.redis.srem.apply(this.redis, arguments);
  };

  /**
  * Gets a range of values from a sorted set
  * @this HfdmRedisClient
  * @return {Promise} - A promise that resolves when the removal is completed
  */
  HfdmRedisClient.prototype.zrange  = function() {
    return this.redis.zrange.apply(this.redis, arguments);
  };

  /**
  * Gets all the elements in the sorted set at key with a score between `min` and `max`
  * (including elements with score equal to min or max).
  * @this HfdmRedisClient
  * @return {Promise} - A promise that resolves when the removal is completed
  */
  HfdmRedisClient.prototype.zrangebyscore  = function() {
    return this.redis.zrangebyscore.apply(this.redis, arguments);
  };

  /**
  * Gets all members from a sorted set
  * @this HfdmRedisClient
  * @return {Promise} - A promise that resolves when the removal is completed
  */
  HfdmRedisClient.prototype.smembers  = function() {
    return this.redis.smembers.apply(this.redis, arguments);
  };

  /**
  * Gets all from a hash map
  * @this HfdmRedisClient
  * @return {Promise} - A promise that resolves with the result
  */
  HfdmRedisClient.prototype.hgetall = function() {
    return this.redis.hgetall.apply(this.redis, arguments);
  };

  /**
  * Sets to a hash map
  * @this HfdmRedisClient
  * @return {Promise} - A promise that resolves with the result
  */
  HfdmRedisClient.prototype.hset = function() {
    return this.redis.hset.apply(this.redis, arguments);
  };

  /**
  * Removes from a sorted set
  * @this HfdmRedisClient
  * @return {Promise} - A promise that resolves when the removal is completed
  */
  HfdmRedisClient.prototype.zrem = function() {
    return this.redis.zrem.apply(this.redis, arguments);
  };

  /**
  * Removes all elements in the sorted set stored at key with a score between `min` and `max`
  * @this HfdmRedisClient
  * @return {Promise} - A promise that resolves with the result
  */
  HfdmRedisClient.prototype.zremrangebyscore  = function() {
    return this.redis.zremrangebyscore.apply(this.redis, arguments);
  };

  /**
  * Gets the time from Redis
  * @this HfdmRedisClient
  * @return {Promise} - A promise that resolves when the time is obtained
  */
  HfdmRedisClient.prototype.time = function() {
    return this.redis.time.apply(this.redis, arguments);
  };

  /**
  * Defines a command
  * @this HfdmRedisClient
  * @param {string} name - Name of the command
  * @return {Promise} - A promise that resolves when the command is defined
  */
  HfdmRedisClient.prototype.defineCommand = function(name) {
    this[name] = this._definedCommand.bind(this, name);
    return this.redis.defineCommand.apply(this.redis, arguments);
  };

  /**
  * Runs a defined command
  * @this HfdmRedisClient
  * @param {string} name - Name of the command
  * @private
  * @return {Promise} - A promise that resolves when the command is completed
  */
  HfdmRedisClient.prototype._definedCommand = function(name, ...restOfArguments) {
    return this.redis[name].apply(this.redis, restOfArguments);
  };

  /**
  * Waits for all pending comands to be sent to redis and closes the connection gracefully
  * @this HfdmRedisClient
  * @return {Promise} - A promise that resolves when the disconnection is completed or rejects if not connected
  */
  HfdmRedisClient.prototype.disconnect = function() {
    let promise;

    this._disconnecting = true;
    if (!this.redis) {
      promise = Promise.reject(new Error('The redis client is not instanciated'));
    } else if (this.redis.status === 'close' || this.redis.status === 'end') {
      promise = Promise.reject(new Error(`Can't disconnect. Current status: ${this.redis.status}`));
    } else if (this.redis.status === 'reconnecting') {
      this.redis.disconnect();
      promise = Promise.reject(new Error(`Can't disconnect. Current status: ${this.redis.status}`));
    } else {
      promise = this.redis.quit();
    }

    return promise
      .catch(e => logger.warn(e.toString()))
      .then(() => {
        if (this.redis) {
          this.redis.removeAllListeners();
          delete this.redis;
        }
        this._clearSubscriptionCallbacks();
        logger.info('Disconnected from Redis');
        this._disconnecting = false;
      });
  };

  /**
  * Is this instance running on against a redis cluster
  * @this HfdmRedisClient
  * @return {Boolean} - true if using a cluster, false otherwise
  * @private
  */
  HfdmRedisClient.prototype._isUsingCluster = function() {
    return this._cluster;
  };

/**
  * Get this private logger (for testing)
  * @this HfdmRedisClient
  * @return {Object} - This module private logger
  * @private
  */
  HfdmRedisClient.prototype._getPrivateLogger = function() {
    return logger;
  };

  util.inherits(HfdmRedisClient, EventEmitter);

  module.exports = HfdmRedisClient;
})();
