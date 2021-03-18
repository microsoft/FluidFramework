/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

'use strict';

function getFluidTestMochaConfig(packageDir, additionaRequireModules) {

    const testDriver = process.env.FLUID_TEST_DRIVER ? process.env.FLUID_TEST_DRIVER : "local";
    const moduleDir = `${packageDir}/node_modules`;

    const requiredModules = [
        `${moduleDir}/@fluidframework/mocha-test-setup`, // General mocha setup e.g. suppresses console.log
        `${moduleDir}/@fluidframework/test-drivers`, // Inject implementation of getFluidTestDriver, configured via FLUID_TEST_DRIVER
        ...(additionaRequireModules ? additionaRequireModules : [])
    ];

    if (process.env.FLUID_TEST_LOGGER_PKG_PATH) {
        // Inject implementation of getTestLogger
        requiredModules.push(process.env.FLUID_TEST_LOGGER_PKG_PATH);
    }

    const config = {
        "exit": true,
        "recursive": true,
        "require": requiredModules,
        "unhandled-rejections": "strict"
    };

    if (process.env.FLUID_TEST_TIMEOUT !== undefined) {
        config["timeout"] = process.env.FLUID_TEST_TIMEOUT;
    }

    if (process.env.FLUID_TEST_REPORT === "1") {
        const packageJson = require(`${packageDir}/package.json`);
        config["reporter"] = `xunit`;
        config["reporter-options"] = [
            // give the report file a unique name based on driver config
            `output=${packageDir}/nyc/${testDriver}-junit-report.xml`,
            `suiteName=${packageJson.name} - ${testDriver}`
        ];
    }
    return config;
}

module.exports = getFluidTestMochaConfig;
