/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// jest.config.js
module.exports = {
  // The glob patterns Jest uses to detect test files
  testMatch: [
    "/**/dist/test/*.spec.js"
  ],

  testEnvironment: "jsdom",

  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: ['/node_modules/']
};
