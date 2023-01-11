/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Get the test port from the global map and set it in env for this test
const testTools = require("@fluidframework/test-tools");
const { name } = require("./package.json");

const mappedPort = testTools.getTestPort(name);
process.env["PORT"] = mappedPort;

module.exports = {
    preset: "ts-jest",
    globals: {
        PATH: `http://localhost:${mappedPort}`,
    },
    roots: ["<rootDir>/src"],
    transform: {
        "^.+\\.tsx?$": "ts-jest",
    },
    testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.(ts|tsx)?$",
    testPathIgnorePatterns: ["/node_modules/", "dist"],
    moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
    setupFiles: ["./jestTestSetup.js"],
    globalSetup: "./jestGlobalSetup.js",
    globalTeardown: "./jestGlobalTeardown.js",
    coveragePathIgnorePatterns: ["/node_modules/", "/src/test/"],
};
