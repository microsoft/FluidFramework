/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { teardown: teardownDevServer } = require('jest-dev-server')

module.exports = async function globalTeardown() {
  await teardownDevServer();
}
