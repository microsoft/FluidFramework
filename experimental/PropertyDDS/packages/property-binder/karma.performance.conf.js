/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
const path = require('path');
module.exports = function(config) {
  const { CommonKarmaLibConfig } = require('@adsk/forge-appfw-configs');
  const commonConfig = CommonKarmaLibConfig(config, {
    webpack: path.resolve(__dirname, 'webpack.dev.js'),
    webpackCoverage: path.resolve(__dirname, 'webpack.coverage.js'),
    entryPoint: path.resolve(__dirname, './test/setup.performance.js')
  });
  // we overwrite the browsers Array because we only want the performance tests to be executed once (via our config)
  commonConfig.browsers = ['ChromeHeadlessNoSandboxDebug'];
  commonConfig.customLaunchers.ChromeHeadlessNoSandboxDebug = {
      base: 'ChromeHeadless',
      flags: ['--no-sandbox', '--js-flags="--expose-gc"']
  };
  commonConfig.customLaunchers.ChromeDebug = {
    base: 'Chrome',
    flags: ['--js-flags="--expose-gc"']
  };
  config.set(commonConfig);
};
