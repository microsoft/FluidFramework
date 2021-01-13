
'use strict';

// Here's a JavaScript-based config file.
// If you need conditional logic, you might want to use this type of config.
// Otherwise, JSON or YAML is recommended.

module.exports = {
  "exit": true,
  "recursive": true,
  "requires": ["node_modules/@fluidframework/mocha-test-setup","node_modules/@fluidframework/test-drivers"],
  "reporter-options":[`mochaFile=nyc/${process.env.FLUID_TEST_DRIVER ?? "default"}-junit-report.xml`],
  "unhandled-rejections": "strict"
};
