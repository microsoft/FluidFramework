/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require('path');

module.exports = {
  entry: {
      main: './dist/frontEnd.js'
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist')
  },
  // Basically some leaf dependencies can't be resolved, just treat them as empty for now because they aren't relied on
  // https://github.com/webpack-contrib/css-loader/issues/447
  // https://stackoverflow.com/questions/46775168/cant-resolve-fs-using-webpack-and-react?rq=1
  node: {
      fs: 'empty',
      dgram: 'empty',
      net: 'empty',
      tls: 'empty'
  }
};