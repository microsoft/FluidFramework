/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

'use strict';
module.exports = {
  "exit": true,
  "recursive": true,
  "require": [
    "node_modules/@fluidframework/mocha-test-setup",
    "node_modules/@fluidframework/test-drivers",
  ],
  "reporter": process.env.FLUID_TEST_COVERAGE === "1" ?  "mocha-junit-reporter" : undefined,
  "reporter-options":[
    // give the report file a unique name based on driver config
    `mochaFile=nyc/${process.env.FLUID_TEST_DRIVER ?? "default"}-junit-report.xml`
  ],
  "unhandled-rejections": "strict"
};
