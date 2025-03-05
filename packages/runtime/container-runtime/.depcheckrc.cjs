/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Enable TypeScript type-checking for this file.
// See https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html#ts-check
// @ts-check

// Import the shared config from the root of the repo.
const sharedConfig = require("../../../.depcheckrc.base.cjs");

/**
 * @type {import("depcheck").Config}
 */
const config = sharedConfig;

module.exports = config;
