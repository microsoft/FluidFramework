/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
const path = require('path');
const { CommonWebpackLibTestTSConfig } = require('@adsk/forge-appfw-configs');
const { CustomConfig } = require('./webpack.dev.custom');

module.exports = CommonWebpackLibTestTSConfig(
  {
    dir: path.join(__dirname, 'test/setup.js'),
    merge: CustomConfig
  }
);
