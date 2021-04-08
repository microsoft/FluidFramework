/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
const path = require('path');
const { CommonWebpackLibTestCoverageTSConfig } = require('@adsk/forge-appfw-configs');
const { CustomConfig } = require('./webpack.dev.custom');

module.exports = CommonWebpackLibTestCoverageTSConfig(
  {
    dir: path.join(__dirname, 'test/setup.js'),
    merge: CustomConfig
  }
);
