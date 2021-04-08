/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
const path = require('path');
module.exports = function(config) {
  const { CommonKarmaLibConfig } = require('@adsk/forge-appfw-configs');
  const commonConfig = CommonKarmaLibConfig(config, {
    webpack: path.resolve(__dirname, 'webpack.dev.js'),
    webpackCoverage: path.resolve(__dirname, 'webpack.coverage.js')
  });
  config.set(commonConfig);
};
