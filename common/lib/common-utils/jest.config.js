/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
  globals: {
    "ts-jest": {
      tsConfig: "./testJest/tsconfig.json",
    }
  },
  preset: "jest-puppeteer",
  testMatch: ["**/testJest/?(*.)+(spec|test).[t]s"],
  testPathIgnorePatterns: ['/node_modules/', 'dist'],
  transform: {
    "^.+\\.ts?$": "ts-jest"
  },
};
