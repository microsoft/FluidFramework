/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Class for instance monitoring.
 */
class InstanceMonitor {
  /**
   *
   * @param {Object} inParams contructor parameters
   * @param {Number} inParams.port the port the server will listen on
   * @param {String} inParams.shortServiceName the short name of the server (2 letters)
   */
  constructor(inParams) {
    this.params = inParams;
  }

  /**
   *
   * @param {String} state The state to publish.
   * Value: "starting": the server starting but not listening on its port
   * Value: "started": the server is ready and is listening on its port
   * Value: "stopping": the server closed its listening port and is draining running request
   * Vakue: "stoppoed": the server completed or aborted running requests
   */
  async publish(state) {}

  /**
   * @return {Object} an object defining this instance
   */
  getDefinition() { return {}; }

  /**
   * An overloadable system operation.
   */
  async noop() {
    return Promise.resolve();
  }
}

module.exports = InstanceMonitor;
