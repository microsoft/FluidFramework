/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

'use strict';

// Here's a JavaScript-based config file.
// If you need conditional logic, you might want to use this type of config.
// Otherwise, JSON or YAML is recommended.

module.exports = {
  "exit": true,
  "recursive": true,
  "require": [
    "node_modules/@fluidframework/mocha-test-setup",
  ],
  "reporter": process.env.FLUID_TEST_COVERAGE === "1" ?  "mocha-junit-reporter" : undefined,
  "reporter-options":[
    `mochaFile=nyc/junit-report.xml`
  ],
  "unhandled-rejections": "strict"
};
