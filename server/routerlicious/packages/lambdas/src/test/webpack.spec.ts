/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as webpack from "webpack";

const path = require('path');

const options: webpack.Configuration = {
  entry: {
    'fluid-lambdas': path.resolve(__dirname, '../index.ts'),
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
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'FluidLambdas',
    libraryTarget: 'umd',
  },
  node: {
    fs: "empty",
  },
};


describe("Routerlicious.Lambdas", () => {

    it("Webpack to ensure isomorphism", async () => {
        let promiseResolve;
        const promise = new Promise((resolve) => promiseResolve = resolve);
        webpack(options, (err, stats) => {
            if (err) {
                throw err;
            }
            if (stats.hasErrors()) {
                throw stats;
            }
            promiseResolve();
        });
        await promise;

    }).timeout(30000);
});
