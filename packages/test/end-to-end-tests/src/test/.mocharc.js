/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

'use strict';

const testDriver = process.env.FLUID_TEST_DRIVER ? process.env.FLUID_TEST_DRIVER  : "local";
const packageDir = `${__dirname}/../..`;
const testPackagesDir = `${packageDir}/..`;

const requiredModules = [
    `${testPackagesDir}/mocha-test-setup`, // General mocha setup e.g. suppresses console.log
    `${testPackagesDir}/test-drivers`, // Inject implementation of getFluidTestDriver, configured via FLUID_TEST_DRIVER
];

if (process.env.FLUID_DI_ROOT) {
    // Inject implementation of getTestLogger that logs to Aria
    requiredModules.push(`${process.env.FLUID_DI_ROOT}/@ff-internal/aria-logger`);
}

const config = {
  "exit": true,
  "recursive": true,
  // "parallel": testDriver === "local",
  "require": requiredModules,
  "unhandled-rejections": "strict"
};

if(process.env.FLUID_TEST_TIMEOUT !== undefined){
  config["timeout"] = process.env.FLUID_TEST_TIMEOUT;
}

if(process.env.FLUID_TEST_REPORT === "1"){
  config["reporter"] = `mocha-junit-reporter`;
  config["reporter-options"] = [
    // give the report file a unique name based on driver config
    `mochaFile=${packageDir}/nyc/${testDriver}-junit-report.xml`
  ];
}

module.exports = config
