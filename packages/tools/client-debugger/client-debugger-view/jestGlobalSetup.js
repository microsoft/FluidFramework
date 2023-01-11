/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { setup: setupDevServer } = require('jest-dev-server')

//
module.exports = async function globalSetup() {
  await setupDevServer({
    command: `npm run start:tinylicious`,
    launchTimeout: 50000,
    port: process.env["PORT"],
  });
}
