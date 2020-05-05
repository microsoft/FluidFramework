/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require('path');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  entry: {
      main: './dist/controllers/index.js'
  },

  // Use a production build of react for faster load times.
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production')
    }),
    new UglifyJSPlugin({
      // sourceMap: true
    }),
  ],

  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'public/scripts/dist'),
    library: 'controller',
    libraryTarget: 'var'
  },

  // Enable sourcemaps for debugging webpack's output.
  // devtool: "source-map",

  resolve: {
    // Add '.ts' and '.tsx' as resolvable extensions.
    extensions: [".ts", ".tsx", ".js", ".json"]
  },

  module: {
    rules: [
        // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
        { enforce: "pre", test: /\.js$/, loader: "source-map-loader" },
        {
          test: /\.css$/,
          use: [ 'style-loader', 'css-loader' ],
          exclude: ["/node_modules/"]
        }
    ]
  },

  // TODO: Try to figure out a better solution for this.
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