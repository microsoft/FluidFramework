/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const BasicAuthController = require('./basic_auth_controller');
const Chronometer = require('@fluid-experimental/property-common').Chronometer;

const MAX_HISTOGRAM_FREQ_SEC = 1;
const CLEAR_CACHED_HISTOGRAM_TIMEOUT_MS = 30000;


/**
 * The DiagsController exposes an authenticated `/diags` endpoint to dump server diagnostics.
 * @fileoverview
 */
class DiagsController extends BasicAuthController {
  /**
   *
   * @param {HFDM.ServerUtils.BaseServer} baseServer An instance of HFDM.ServerUtils.BaseServer
   * @param {Object} params List of parameters
   * @param {string} params.basicAuth.username A username to authenticate
   * @param {string} params.basicAuth.password A password to authenticate
   * @param {Object[]} params.basicAuth.passwordList A password list to authenticate
   *  { value: string , endAt: string ISO date}
   * @param {PendingRequestTracker} pendingRequestTracker The pending requests tracker to query to
   *   get a list of all pending requests.
   * @constructor
   */
  constructor(baseServer, params, pendingRequestTracker) {
    super(baseServer, params);
    this._pendingRequestTracker = pendingRequestTracker;
    this._histogramChrono = new Chronometer();

    this.setupRoutes({
      get: {
        '/diags/pending': this.getPendingRequestHistogram.bind(this)
      }
    });
  }

  /**
   * Route invoked to get server diagnostics.
   * @param {Object} req The request.
   * @param {Object} res The response.
   */
  getPendingRequestHistogram(req, res) {
    try {
      const histogram = _getRequestHistogram.call(this);
      res.json({pendingRequests: histogram});
    } finally {
      _clearCachedHistogram.call(this);
    }
  }
}

/**
 * Avoid leaking the cached histogram
 */
function _clearCachedHistogram() {
  // Avoid leaking the cached histogram.
  this._clearCachedHistogramTimeout = setTimeout(() => {
    // Clear the cached histogram from memory.
    delete this._clearCachedHistogramTimeout;
    delete this._cachedHistogram;
  }, CLEAR_CACHED_HISTOGRAM_TIMEOUT_MS);
}

/**
 * Fecthes the request histogram.
 * @return {object} The request histogram.
 */
function _getRequestHistogram() {
  const elapsedSec = this._histogramChrono.stop().elapsedSec();
  if (this._clearCachedHistogramTimeout) {
    // Clear the current cached histogram timeout:
    clearTimeout(this._clearCachedHistogramTimeout);
    delete this._clearCachedHistogramTimeout;
  }

  let histogram;
  if (this._cachedHistogram && elapsedSec < MAX_HISTOGRAM_FREQ_SEC) {
    histogram = this._cachedHistogram;
  } else {
    histogram = this._pendingRequestTracker.getHistogram();
    this._cachedHistogram = histogram;
    this._histogramChrono.start();
  }

  return histogram;
}

module.exports = DiagsController;
