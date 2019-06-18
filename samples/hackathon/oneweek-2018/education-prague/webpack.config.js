/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require('path');
const dev = require('./webpack.dev.js');
const prod = require('./webpack.prod.js');
const merge = require('webpack-merge');
const webpack = require('webpack');

module.exports = env => {
  let prod_target = (env && env.prod)

  return merge((prod_target ? prod : dev), {
    entry: {
      main: './src/index.ts'
    },
    devtool: "source-map",
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".css"]
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          use: [
            {
              loader: "cache-loader"
            },
            {
              loader: "ts-loader",
              options: {
                  compilerOptions: {
                      declaration: false,
                  },
              }
            }
          ],
          exclude: [
            "/node_modules/",
            "/dist/",
          ]
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
          exclude: [
            "/node_modules/",
            "/dist/",
          ]
        }
      ]
    },
    externals: {
      'react': 'React', // Case matters here 
      'react-dom': 'ReactDOM' // Case matters here
    },
    node: {
      fs: 'empty',
      dgram: 'empty',
      net: 'empty',
      tls: 'empty'
    }
  });
};
