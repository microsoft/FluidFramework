/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require('path');

module.exports = {
  entry: {
    'fluid-loader': path.resolve(__dirname, './src/loader.ts'),
  },
  mode: 'development',
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
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'FluidLoader',
    libraryTarget: 'umd',
  },
};
