/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import webpack from "webpack";

const path = require('path');

const options: webpack.Configuration = {
    entry: {
        'fluid-lambdas-test': path.resolve(__dirname, '../index.js'),
    },
    mode: 'development',
    devtool: 'inline-source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: require.resolve('ts-loader'),
                exclude: /node_modules/,
            },
            {
                test: /\.js$/,
                use: [require.resolve("source-map-loader")],
                enforce: "pre"
            },
        ],
    },
    resolve: {
        extensions: ['.js'],
    },
    output: {
        filename: '[name].bundle.js',
        path: path.resolve(__dirname, '../'),
        library: 'FluidLambdasTest',
        libraryTarget: 'umd',
    },
};


describe("Routerlicious.Lambdas", () => {
    it("Webpack to ensure isomorphism", () => {
        webpack(options, (err, stats) => {
            if (err) {
                throw err;
            }
            if (stats.hasErrors()) {
                throw stats.toString();
            }
        });

    }).timeout(5000);
});
