/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

'use strict';

const { existsSync } = require("fs");
const path = require("path");

function getFluidTestMochaConfig(packageDir, additionalRequiredModules) {

    const testDriver = process.env.fluid__test__driver ? process.env.fluid__test__driver : "local";
    const moduleDir = `${packageDir}/node_modules`;

    const requiredModules = [
        `@fluidframework/mocha-test-setup`, // General mocha setup e.g. suppresses console.log
        ...(additionalRequiredModules ? additionalRequiredModules : [])
    ];

    // mocha install node_modules directory might not be the same as the module required because of hoisting
    // We need to give the full path in that case.
    const requiredModulePaths = requiredModules.map((mod) => {
        // Just return if it is path already
        if (existsSync(mod) || existsSync(`${mod}.js`)) { return mod; }

        // Try the test's packageDirectory
        const modulePath = path.join(moduleDir, mod);
        if (existsSync(modulePath)) { return modulePath; }
        return mod;
    });

    if (process.env.FLUID_TEST_LOGGER_PKG_PATH) {
        // Inject implementation of getTestLogger
        requiredModulePaths.push(process.env.FLUID_TEST_LOGGER_PKG_PATH);
    }

    const config = {
        "exit": true,
        "recursive": true,
        "require": requiredModulePaths,
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
