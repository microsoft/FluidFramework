/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
  preset: "jest-puppeteer",
  testMatch: ["**/dist/test/jest/?(*.)+(spec|test).js"],
  testPathIgnorePatterns: ['/node_modules/'],
};
