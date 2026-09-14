/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Port for the Tinylicious server started by this package's "start:tinylicious:test" script.
 *
 * @remarks
 * Each package that runs Tinylicious in the concurrent CI test sweep must use a distinct port to avoid collisions, so
 * this must stay in sync with the port used in the package.json test scripts.
 *
 * TODO: We should update the tinylicious test infra to dynamically allocate ports for each package to avoid hardcoding and potential collisions in the future.
 * Our jest/puppeteer tests already do this via the `getTestPort` function in `test-tools`.
 * We should do something similar for these real service tests.
 */
export const tinyliciousPort = 7072;
