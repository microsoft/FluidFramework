/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// jest.config.js
module.exports = {
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/src/test/tsconfig.json'
    }
  },
  preset: "ts-jest",

  // The glob patterns Jest uses to detect test files
  testMatch: [
    "/**/dist/test/*.spec.js"
  ],

  testEnvironment: "jsdom",

  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: ['/node_modules/'],

  // A map from regular expressions to paths to transformers
  transform: {
    "^.+\\.(t|j)sx?$": "ts-jest"
  }

  // A list of paths to modules that run some code to configure or set up the testing framework before each test
  //   setupFilesAfterEnv: ['<rootDir>/test/setup.ts']
};
