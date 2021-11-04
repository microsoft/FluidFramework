/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');
const Chronometer = require('@fluid-experimental/property-common').Chronometer;
const { ModuleLogger } = require('@fluid-experimental/property-query')
const logger = ModuleLogger.getLogger('HFDM.ServerUtils.PendingRequestTracker');

/**
 * The maximum frequency (in seconds) at which to output the warning:
 * "More than 1000 ongoing requests"
 */
const MAX_WARN_PENDING_REQS_FREQ_SEC = 20;
const METRIC_NAME = 'Custom/PendingRequestTracker/RequestCount';

/**
 * Keeps track of all routes that have pending requests.
 */
class PendingRequestTracker {
  /**
   * Create a new pending request tracker
   * @param {http.Server} server The express server.
   * @param {object} [systemMonitor] The systemMonitor to use
   * @param {number} [softOngoingRequests=1000] A count of how many in flight requests will cause
   *   warnings to get logged.
   * @param {number} [logIntervalMS=120000] Controls how often (fixed delay) the pending request
   *   histogram is logged.
   *
   */
  constructor(server, systemMonitor, softOngoingRequests = 1000, logIntervalMS = 120 * 1000) {
    this._systemMonitor = systemMonitor;
    this._softOngoingRequests = softOngoingRequests;
    this._logIntervalMS = logIntervalMS;

    this._requestCount = 0;
    this._pendingRequestCount = 0;
    this._pendingRequests = {};

    // Keep track of the request
    server.on('request', _onRequest.bind(this));

    _updatePendingRequestsMetric.call(this);
    this._histogramTimeoutId = setTimeout(_logHistogram.bind(this), this._logIntervalMS);
  }

  /**
   * Computes a histogram of pending requests.
   * @return {Array<object>} A pending request histogram: [{
   *   url: the route url,
   *   min: minimum pending time in ms,
   *   max: maximum pending time in ms,
   *   count: how many times the same route is pending
   * }]
   */
  getHistogram() {
    const routeToHistogramEntry = {};
    const guidRE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

    _.mapValues(this._pendingRequests, (value, requestId) => {
      // Split URLs into components and replace all guids by the word 'guid' so that URLs are
      // binned by type, regardless of ids.
      const urlComponents = value.url.split('/');
      const filteredComponents = [];
      let guids = [];
      _.each(urlComponents, component => {
        const matches = component.match(guidRE);
        if (matches) {
          filteredComponents.push(component.replace(guidRE, '<guid>'));
          guids = guids.concat(matches);
        } else {
          filteredComponents.push(component);
        }
      });

      const elapsedMS = Math.max(Date.now() - value.startTime, 0);
      let requestInfo = { ip: value.ip, elapsedMS };
      if (guids.length > 0) {
        requestInfo.guids = guids;
      }

      // filteredUrl example: /v1/pss/branch/<guid>/commit
      const filteredUrl = guids.length > 0 ? filteredComponents.join('/') : value.url;
      const entry = routeToHistogramEntry[filteredUrl];

      if (entry) {
        ++entry.count;
        entry.requests.push(requestInfo);
      } else {
        routeToHistogramEntry[filteredUrl] = {
          url: filteredUrl,
          count: 1,
          requests: [requestInfo]
        };
      }
    });

    let histogram = [];
    _.mapValues(routeToHistogramEntry, (entry, url) => {
      entry.requests = _.sortBy(entry.requests, requestInfo => -requestInfo.elapsedMS);
      histogram.push(entry);
    });
    histogram = _.sortBy(histogram, entry => -entry.count);
    return histogram;
  }

  /**
   * Stops the histogram generation for pending requests
   */
  stop() {
    clearTimeout(this._histogramTimeoutId);
  }
}

/**
 * Invoked each time a route is invoked on the server
 * @param {http.IncomingMessage} req The request
 * @param {http.ServerResponse} res The response
 * @this PendingRequestTracker
 * @private
 */
function _onRequest(req, res) {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const url = req.originalUrl;
  const id = ++this._requestCount;
  const ulCtxCallerSpanId = req.headers['ul-ctx-caller-span-id'];
  const ulCtxHeadSpanId = req.headers['ul-ctx-head-span-id'];
  const reqData = { ip, url };

  if (ulCtxCallerSpanId) { reqData['ul-ctx-caller-span-id'] = ulCtxCallerSpanId; }
  if (ulCtxHeadSpanId) { reqData['ul-ctx-head-span-id'] = ulCtxHeadSpanId; }
  this._pendingRequests[id] = reqData;
  logger.debug(`request[${id}]: ${JSON.stringify(this._pendingRequests[id])}`);
  reqData.startTime = Date.now();

  ++this._pendingRequestCount;
  _updatePendingRequestsMetric.call(this);

  if (this._pendingRequestCount > this._softOngoingRequests) {
    const isFirstWarning = !this.muteWarningChrono;
    if (!this.muteWarningChrono) {
      this.muteWarningChrono = new Chronometer();
    }

    if (isFirstWarning || this.muteWarningChrono.stop().elapsedSec() >= MAX_WARN_PENDING_REQS_FREQ_SEC) {
      logger.warn(`More than ${this._softOngoingRequests} ongoing requests: ${this._pendingRequestCount}`);
      this.muteWarningChrono.start();
    }
  }

  // Process the finished request
  res.on('finish', _postResponse.bind(this, 'finished', id));
  res.on('close', _postResponse.bind(this, 'closed', id));
}

/**
 * Logs the pending requests histogram.
 */
function _logHistogram() {
  try {
    const histogram = this.getHistogram();
    if (histogram.length > 0) {
      logger.info('Pending requests', histogram);
    }
  } finally {
    this._histogramTimeoutId = setTimeout(_logHistogram.bind(this), this._logIntervalMS);
  }
}

/**
 * Invoked after the server is done with a response.
 * @param {string} action One of: ['finished', 'closed']
 * @param {number} id Request id. See 'traceRequests'.
 * @this PropertySetsServer
 * @private
 */
function _postResponse(action, id) {
  const reqData = this._pendingRequests[id];
  if (reqData) {
    const elapsedMs = Math.max(Date.now() - reqData.startTime, 0);
    delete reqData.startTime;
    reqData.elapsedMs = elapsedMs;
    logger.debug(`${action}[${id}]: ${JSON.stringify(reqData)}`);
    delete this._pendingRequests[id];
    --this._pendingRequestCount;
    _updatePendingRequestsMetric.call(this);
  }
}

/**
 * Update the pending requests count metric. This updates this metric:
 * 'Custom/PendingRequestTracker/RequestCount'
 */
function _updatePendingRequestsMetric() {
  if (this._systemMonitor) {
    this._systemMonitor.recordMetric(METRIC_NAME, this._pendingRequestCount);
  }
}

module.exports = PendingRequestTracker;
