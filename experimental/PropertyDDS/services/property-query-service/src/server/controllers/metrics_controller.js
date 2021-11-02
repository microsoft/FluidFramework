/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview
 * The SingleMetricsController will be used to generate an endpoint for
 * a metric, to be used by the HFDM-Monitor to generate
 * another metric.
 */

const BaseController = require('../utils/base_controller');
const HTTPStatus = require('http-status');

/**
 * Single Metrics Controller
 */
class SingleMetricsController extends BaseController {
/**
 * Single Metrics Controller
 * @param {object} params - SingleMetricsController parameters
 * @param {express} params.app - Express app
 * @param {object} params.metric - A metric with name and value for which the endpoint is made
 * @constructor
 */
  constructor(params) {
    super(params);

    this.id = 'SingleMetricsController';
    this._app = params.app;
    this._metric = params.metric;
    this._addEndpoint();
  }

  /**
   * Exposes tne endpoint to collect the metric
   */
  _addEndpoint() {
    this._app.get('/v1/metric/' + this._metric.metricName, (req, res) => {

      let response = {
        metricName: this._metric.metricName,
        value: this._metric.getValue()
      };

      this.render(res, response, HTTPStatus.OK);
    });
  }
}

module.exports = SingleMetricsController;
