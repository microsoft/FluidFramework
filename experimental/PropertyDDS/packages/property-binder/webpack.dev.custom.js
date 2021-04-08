/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
const path = require('path');

module.exports.CustomConfig = {
  resolve: {
    modules: ['node_modules', 'src'],
    alias: {
      '@adsk/forge-hfdm': '@adsk/forge-hfdm/lib/browser/forge-hfdm.js'
    }
},
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        include: path.resolve('test/'),
        exclude: [/node_modules/, /@adsk/],
        use: {
          loader: 'babel-loader',
          options: {
            plugins: [['@babel/proposal-decorators', {legacy: true}]],
            cacheDirectory: true
          }
        }
      }
    ]
  }
};
