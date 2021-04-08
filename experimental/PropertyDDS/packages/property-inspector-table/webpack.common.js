/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
module.exports = () => ({
  resolve: {
    extensions: ['.svg', '.css'],
    plugins: [
      new TsconfigPathsPlugin({ configFile: './tsconfig.json' }),
    ]
  }, module: {
    rules: [
      {
        test: /\.s?css$/,
        use: ['style-loader', 'css-loader', 'sass-loader']
      },
      {
        test: /\.svg$/,
        use: [
          {
            loader: 'svg-sprite-loader'
          },
          {
            loader: 'svgo-loader',
            options: require('./svgo.plugins.js')
          }
        ]
      }
    ]
  }
});
