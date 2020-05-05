/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
  preset: "jest-puppeteer",
  globals: {
    PATH: "http://localhost:8081"
  },
  testMatch: ["**/?(*.)+(spec|test).[t]s"],
  testPathIgnorePatterns: ['/node_modules/', 'dist'],
  transform: {
    "^.+\\.ts?$": "ts-jest"
  },
};
