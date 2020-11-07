/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require('path');
const webpack = require('webpack');

const mode = 'development';

module.exports = {
  entry: {
    'fluid-loader': path.resolve(__dirname, './src/loader.ts'),
  },
  mode,
  devtool: 'inline-source-map',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.js$/,
        use: ["source-map-loader"],
        enforce: "pre"
      },
    ],
  },
  // Webpack 5 does not support automatic polyfilling of node modules, setting node to false will help simulate webpack 5 behavior by throwing build errors when we rely on node polyfills
  node: false,
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  // Some of Fluid's dependencies depend on things like global and process.env.NODE_ENV being defined. This won't be set in Webpack 5 by default, so we are setting it with the define plugin.
  // This can be removed when we no longer get runtime errors like 'process is not defined' and 'global' is not defined
  plugins: [
    new webpack.DefinePlugin({
        process: { env: { NODE_ENV: JSON.stringify(mode) } },
        global : {}
      }),
  ],
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'FluidLoader',
    libraryTarget: 'umd',
  },
};
