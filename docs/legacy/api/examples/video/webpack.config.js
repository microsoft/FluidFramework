/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require('path');
const SpeedMeasurePlugin = require("speed-measure-webpack-plugin");

const smp = new SpeedMeasurePlugin();

module.exports = smp.wrap({
    entry: './src/index.ts',
    devtool: 'source-map',
    resolve: {
        extensions: [ '.tsx', '.ts', '.js', '.json' ]
    },
    mode: "development",
    module: {
        rules: [
            {
                test: /\.(ts|tsx)$/,
                use: [
                    {
                        loader: "cache-loader"
                    },
                    {
                        loader: 'thread-loader',
                        options: {
                            workers: require('os').cpus().length,
                        },
                    },
                    {
                    loader: "ts-loader",
                    options: {
                        compilerOptions: {
                            declaration: false,
                        },
                        // Removes TypeChecking and forces thread safety
                        // ForkTSCheckerWebpackPlugin handles types and syntax
                        happyPackMode: true,
                    }
                }],
                exclude: [
                    "/node_modules/",
                    "/dist/",
                ]
            },
            { // TODO: Investigate why babel-loader reduces build speeds by so much
                test: /\.js$/,
                include: [
                    path.resolve(__dirname, "node_modules/@prague/routerlicious"),
                    path.resolve(__dirname, "node_modules/telegrafjs"),
                ],
                use: {
                    loader: 'babel-loader?cacheDirectory',
                    options: {
                        presets: ['env']
                    }
                }
            }
        ]
    },
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist')
    },
    node: {
        fs: 'empty',
        dgram: 'empty',
        net: 'empty',
        tls: 'empty'
    }
});
