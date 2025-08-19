/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Simple dirname replacement for browser environment
const path = require("path-browserify");

// Mock __dirname for browser environment
const _dirname = "/test/mocha"; // Simplified path for browser

module.exports = { _dirname };
