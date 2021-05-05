/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
  preset: "jest-puppeteer",
  globals: {
    PATH: "http://localhost:8080"
  },
  testMatch: ["**/?(*.)+(spec|test).[t]s"],
  testPathIgnorePatterns: ['/node_modules/', 'dist'],
  transform: {
		"^.+\\.ts?$": "ts-jest"
	},
};
