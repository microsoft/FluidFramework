/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

'use strict';

const { existsSync } = require("fs");
const path = require("path");

function getFluidTestVariant() {
    const testDriver = process.env.fluid__test__driver ? process.env.fluid__test__driver : "local";
    const r11sEndpointName = process.env.fluid__test__r11sEndpointName;
    const testVariant = (testDriver === "r11s" || testDriver === "routerlicious")
        && (r11sEndpointName !== undefined && r11sEndpointName !== "r11s") ? `r11s-${r11sEndpointName}` : testDriver;
    return testVariant;
}

function getFluidTestMochaConfig(packageDir, additionalRequiredModules) {

    const moduleDir = `${packageDir}/node_modules`;

    const requiredModules = [
        ...(additionalRequiredModules ? additionalRequiredModules : []),
        // General mocha setup e.g. suppresses console.log
        // Moved to last in required modules, so that aria logger will be ready to access in mochaHooks.ts
        `@fluidframework/mocha-test-setup`,
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
        requiredModulePaths.unshift(process.env.FLUID_TEST_LOGGER_PKG_PATH);
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
        const testVariant = getFluidTestVariant();
        const packageJson = require(`${packageDir}/package.json`);
        config["reporter"] = `xunit`;
        config["reporter-options"] = [
            // give the report file a unique name based on driver config
            `output=${packageDir}/nyc/${testVariant}-junit-report.xml`,
            `suiteName=${packageJson.name} - ${testVariant}`
        ];
    }
    return config;
}

module.exports = { getFluidTestMochaConfig, getFluidTestVariant };
