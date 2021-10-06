/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Class for system monitoring.
 */
class SystemMonitor {

  /**
   * Creates a monitor instance.
   * @return {object} The monitor instance
  */
  static createInstance() {
    return new SystemMonitor();
  }

  /**
   * Start a monitoring segment
   * @param {string} name The segment name.
   * @param {bool} record Defines whether the segment should be recorded as a metric.
   * @param {promise} handler The promise to track as a segment.
   * @return {object} The handler's result.
   **/
  async startSegment(name, record, handler) {
    return await handler();
  }

  /**
   * Start a monitoring segment
   * @param {string} url The transaction name.
   * @param {promise} handle The promise to instrument.
   * @return {object} The handle's result.
   **/
  async startWebTransaction(url, handle) {
    return await handle();
  }

  /**
   * Start a monitoring segment for a background transaction
   * @param {string} url The transaction name.
   * @param {promise} handle The promise to instrument.
   * @return {object} The handle's result.
   **/
  async startBackgroundTransaction(url, handle) {
    return await handle();
  }

  /**
   * Gets a handle on the currently executing transaction
   * @return {object} A handle on the currently executing transaction
   **/
  getTransaction() {
    return {
      end: () => { return null;}
    };
  }

  /**
   * Add a custom attribute
   **/
  addCustomAttribute() {
  }

  /**
   * Add custom attributes
   **/
  addCustomAttributes() {
  }

  /**
   * Record metric
   **/
  recordMetric() {
  }

  /**
   * Extract information about the current trace from the query tracer object provided by the client
   *
   * @param {String?} in_queryTracer - A string that identifies the parent span
   */
  extract(in_queryTracer) {
  }

  /**
   * Returns a string that can be used to identify the originating span when doing distributed tracing
   *
   * @return {String} String to identify the current span
   */
  carrier() {
    return undefined;
  }
}

module.exports = SystemMonitor;
