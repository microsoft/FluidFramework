/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-tools/webpack-fluid-loader");
const path = require('path');
const { merge } = require("webpack-merge");

const pkg = require("./package.json");
const fluidPackageName = pkg.name.slice(1);

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
            loader: require.resolve("ts-loader")
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
              loader: require.resolve('babel-loader')
            }
          },
          {
            test: /\.(png|jpg|gif|svg|eot|ttf|woff|woff2)$/,
            loader: require.resolve('url-loader'),
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
        devtoolNamespace: fluidPackageName,
        libraryTarget: 'umd'
      },
      devServer: {
        devMiddleware: { publicPath: '/dist' },
        stats: 'minimal',
        before: fluidRoute.before,
        onAfterSetupMiddleware: (devServer) => fluidRoute.after(devServer.app, devServer, __dirname, env),
        watchOptions: {
          ignored: "**/node_modules/**",
        }
      }
    },
    isProduction ? require('./webpack.prod') : require('./webpack.dev')
  );
};
