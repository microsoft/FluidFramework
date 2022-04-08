/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const AWS = require('aws-sdk');
const HttpStatus = require('http-status-codes');
const { ModuleLogger } = require('@fluid-experimental/property-query')
const OperationError = require('@fluid-experimental/property-common').OperationError;
const logger = ModuleLogger.getLogger('HFDM.ServerUtils.CredsRotation');

const DEFAULT_PARAMS = {
  minTimeoutMs: 60000, // The minimum amount of time to wait before requesting new credentials again.
  safeMarginMs: 300000 // Renew the credentials safeMarginMs before they expire.
};

/**
 * @fileOverview
 * Manages temporary AWS access with credential rotation.
 */
class Rotation {
  /**
   * Creates a new Rotation class that handles credential rotation for an IAM role.
   * @param {Object} role AWS IAM role.
   * @param {string} role.arn - AWS ARN of the role.
   * @param {string} role.prefix - Role session name.
   * @param {Object} [params] - Params for rotations.
   * @param {number} [params.minTimeoutMs = 60000] - The minimum amount of time to wait before requesting
   * new credentials again.
   * @param {number} [params.safeMarginMs = 300000] - Renew the credentials safeMarginMs before they expire.
   * @param {Function} [params.onStopRotation] - Callback that will be called when the task is stopped.
   */
  constructor(role, params) {
    if (!role || !role.arn || !role.prefix) {
      throw new Error(`Failed to instantiate new Rotation: ${JSON.stringify(role)}`);
    }

    this._role = {
      arn: role.arn,
      prefix: role.prefix
    };

    this._params = Rotation.getSaneParams(params);

    this._creds = null;
    this._callbacks = new Set();
    this._timeout = null;
    this._nextTime = 0;
    this._error = null;
    this._promise = null;

    this._sts = new AWS.STS();
  }

  /**
   * Adds a new callback that will be called when the credentials get rotated.
   * @param {Function} onRotation - Callback.
   */
  addCallback(onRotation) {
    if (typeof onRotation !== 'function') {
      throw new Error('Failed to execute `addCallback`: The provided callback is not a function.');
    }

    this._callbacks.add(onRotation);

    // retrying
    if (this._error) {
      const cbResult = this._creds ? Object.assign({}, this._creds) : null;
      onRotation(this._error, cbResult);
    // if new rotation is stopped or starts too soon (rescheduling)
    } else if (this._nextTime - Date.now() <= this._params.minTimeoutMs) {
      this._startRotation();
    // just pass creds
    } else {
      onRotation(null, Object.assign({}, this._creds));
    }
  }

  /**
   * Removes specified callback and stops the task if there are no other callbacks.
   * @param {Function} onRotation - Callback.
   */
  removeCallback(onRotation) {
    if (typeof onRotation !== 'function') {
      throw new Error('Failed to execute `removeCallback`: The provided callback is not a function.');
    }

    this._callbacks.delete(onRotation);

    if (this._callbacks.size === 0) {
      this._stopRotation();
    }
  }

  /**
   * Starts the credential rotation task for an IAM role.
   * @async
   * @private
   */
  async _startRotation() {
    // already in process
    if (this._promise) { return; }

    // to avoid multiple timeouts
    clearTimeout(this._timeout);

    const params = {
      RoleArn: this._role.arn,
      RoleSessionName: this._role.prefix
    };

    let data;
    try {
      let timeoutMilliSec;

      this._error = null;
      this._promise = this._sts.assumeRole(params).promise();
      data = await this._promise;
      this._promise = null;

      if (!data || !data.Credentials) {
        throw new OperationError(
          'AWS.STS.assumeRole did not return credentials',
          'AWS.STS.assumeRole',
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }

      this._creds = data.Credentials;

      logger.info(`Successfully rotated credentials for: ${JSON.stringify(this._role)}.`);

      // scheduling of the next rotation
      timeoutMilliSec = Math.max(
        data.Credentials.Expiration.getTime() - new Date().getTime() - this._params.safeMarginMs,
        this._params.minTimeoutMs
      );

      this._nextTime = Date.now() + timeoutMilliSec;
      this._timeout = setTimeout(() => this._startRotation(), timeoutMilliSec);

      logger.info(`Credentials for ${JSON.stringify(this._role)} will rotate on: ` +
        new Date(this._nextTime).toISOString());
    } catch (error) {
      this._error = error;
      this._promise = null;
      this._timeout = setTimeout(() => this._startRotation(), this._params.minTimeoutMs);

      logger.error(`Failed to obtain temporary credentials for ${JSON.stringify(this._role)}:`, error);
    }

    const cbResult = this._creds ? Object.assign({}, this._creds) : null;
    this._callbacks.forEach(cb => cb(this._error, cbResult));
  }

  /**
   * Stops the credential rotation task for an IAM role.
   * @async
   * @private
   */
  async _stopRotation() {
    try {
      if (this._promise) {
        await this._promise;
      }
    } catch (err) {
      // ignore
    } finally {
      // check if new callbacks were added
      if (this._callbacks.size === 0) {
        clearTimeout(this._timeout);
        this._nextTime = 0;
        this._creds = null;
        this._error = null;
        logger.info(`Credentials rotation was stopped for: ${JSON.stringify(this._role)}.`);

        if (typeof this._params.onStopRotation === 'function') {
          this._params.onStopRotation();
        }
      }
    }
  }

  /**
   * Returns valid and sane params.
   * @param {Object} params - Params to be processed.
   * @return {Object} Processed params.
   */
  static getSaneParams(params) {
    let saneParams = Object.assign({}, DEFAULT_PARAMS, params);

    if (saneParams.minTimeoutMs < 10000) {
      saneParams.minTimeoutMs = DEFAULT_PARAMS.minTimeoutMs;
    }

    if (saneParams.safeMarginMs < 60000) {
      saneParams.safeMarginMs = DEFAULT_PARAMS.safeMarginMs;
    }

    if (saneParams.safeMarginMs < saneParams.minTimeoutMs) {
      saneParams.safeMarginMs = saneParams.minTimeoutMs;
    }

    return saneParams;
  }
}

/**
 * Collection of Rotation instances which are mapped to the stringified role and params.
 * @type {Map<string, Rotation>}
 */
const _rotations = new Map();

/**
 * Returns normalized key for `_rotations` collection
 * @param {Object} role - AWS IAM role.
 * @param {Object} [params] - Params for rotations.
 * @return {string} Normalized key
 */
const _getNormalizedKey = (role, params) => {
  if (!role || !role.arn || !role.prefix) {
    throw new Error(`Failed to get rotation for the role: ${JSON.stringify(role)}`);
  }

  const saneParams = Rotation.getSaneParams(params);

  return JSON.stringify({
    arn: role.arn,
    prefix: role.prefix,
    minTimeoutMs: saneParams.minTimeoutMs,
    safeMarginMs: saneParams.safeMarginMs
  });
};

const credsRotation = {
  /**
   * Initiates a new credentials rotation task or uses an existed one associated with the passed `role` and `params`.
   * @param {Object} role AWS IAM role.
   * @param {string} role.arn - AWS ARN of the role.
   * @param {string} role.prefix - Role session name.
   * @param {Function} onRotation - Callback that will be called when the credentials get rotated.
   * @param {Object} [params] - Params for rotations.
   * @param {number} [params.minTimeoutMs = 60000] - The minimum amount of time to wait before requesting
   * new credentials again.
   * @param {number} [params.safeMarginMs = 300000] - Renew the credentials safeMarginMs before they expire.
   */
  addRotation(role, onRotation, params) {
    if (typeof onRotation !== 'function') {
      throw new Error('Failed to execute `addRotation`: The provided callback is not a function.');
    }

    const key = _getNormalizedKey(role, params);

    let rotation = _rotations.get(key);
    if (!rotation) {
      rotation = new Rotation(role, Object.assign({}, params, {
        onStopRotation: () => {
          _rotations.delete(key);
        }
      }));

      _rotations.set(key, rotation);
    }

    rotation.addCallback(onRotation);
  },

  /**
   * Removes passed callback from the credentials rotation task associated with the passed role and params.
   * @param {Object} role AWS IAM role.
   * @param {string} role.arn - AWS ARN of the role.
   * @param {string} role.prefix - Role session name.
   * @param {Function} onRotation - Callback that will be called when the credentials get rotated.
   * @param {Object} [params] - Params for rotations.
   * @param {number} [params.minTimeoutMs = 60000] - The minimum amount of time to wait before requesting
   * new credentials again.
   * @param {number} [params.safeMarginMs = 300000] - Renew the credentials safeMarginMs before they expire.
   */
  removeRotation(role, onRotation, params) {
    const key = _getNormalizedKey(role, params);

    const rotation = _rotations.get(key);
    if (!rotation) {
      return;
    }

    rotation.removeCallback(onRotation);
  }
};

module.exports = credsRotation;
