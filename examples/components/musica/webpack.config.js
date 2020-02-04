/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@microsoft/fluid-webpack-component-loader");
const path = require('path');
const merge = require('webpack-merge');

module.exports = env => {
  const isProduction = env && env.production;

  return merge(
    {
      entry: {
        main: './src/index.tsx'
      },
      resolve: {
        extensions: ['.ts', '.tsx', '.js']
      },
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            loader: 'ts-loader'
          },
          {
            test: /\.css$/,
            use: [
              'style-loader', // creates style nodes from JS strings
              'css-loader' // translates CSS into CommonJS
            ]
          },
          {
            test: /\.js$/,
            exclude: /node_modules/,
            use: {
              loader: 'babel-loader'
            }
          },
          {
            test: /\.(png|jpg|gif|svg|eot|ttf|woff|woff2)$/,
            loader: 'url-loader',
            options: {
              limit: 10000
            }
          }
        ]
      },
      output: {
        filename: '[name].bundle.js',
        path: path.resolve(__dirname, 'dist'),
        library: '[name]',
        // https://github.com/webpack/webpack/issues/5767
        // https://github.com/webpack/webpack/issues/7939
        devtoolNamespace: 'component/counter',
        libraryTarget: 'umd'
      },
      devServer: {
        publicPath: '/dist',
        stats: 'minimal',
        before: fluidRoute.before,
        after: (app, server) => fluidRoute.after(app, server, __dirname, env),
      }
    },
    isProduction ? require('./webpack.prod') : require('./webpack.dev')
  );
};
