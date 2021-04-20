/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const dev = require('./webpack.dev.js');
const prod = require('./webpack.prod.js');
const merge = require('webpack-merge');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = env => {
    let prod_target = env && env.target;
    const envOptions = prod_target ? prod : dev
    let typeCheckingCores = 1;

    const defaultOptions = {
        devtool: 'source-map',
        resolve: {
            extensions: [".mjs", ".ts", ".tsx", ".js", ".json"]
        },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    use: ["source-map-loader"],
                    exclude: /node_modules/,
                    enforce: "pre"
                },
                {
                    test: /\.(ts|tsx)$/,
                    use: [
                        {
                            loader: "cache-loader"
                        },
                        {
                            loader: 'thread-loader',
                            options: {
                                // there should be 1 cpu for the fork-ts-checker-webpack-plugin
                                workers: require('os').cpus().length - typeCheckingCores,
                            },
                        },
                        {
                        loader: "ts-loader",
                        options: {
                            compilerOptions: {
                                declaration: false,
                                // Switch to es6 modules in production to enable tree shaking
                                module: prod_target ? "esnext" : "commonjs",
                            },
                            // Removes TypeChecking and forces thread safety
                            // ForkTSCheckerWebpackPlugin handles types and syntax
                            happyPackMode: true,
                        }
                    }],
                    exclude: [
                        /node_modules/,
                        /dist/,
                    ]
                },
                {
                    test: /\.css$/,
                    use: [
                        "style-loader", // creates style nodes from JS strings
                        "css-loader", // translates CSS into CommonJS
                    ]
                },
                {
                    test: /\.scss$/,
                    use: [
                        "style-loader", // creates style nodes from JS strings
                        "css-loader", // translates CSS into CommonJS
                        "sass-loader" // compiles Sass to CSS, using Node Sass by default
                    ]
                },
                {
                    test: /\.(png|jpg|gif|svg|eot|ttf|woff|woff2)$/,
                    loader: 'url-loader',
                    options: {
                        limit: 10000
                    }
                },
                {
                    test: /\.html$/,
                    loader: 'html-loader'
                }
            ]
        },
        stats: {
            timings: true,
            colors: true,
            builtAt: false,
            hash: false,
            version: false,
            assets: false,
            chunks: false,
            modules: false,
            reasons: false,
            children: false,
            source: false,
            errorDetails: false,
            publicPath: false
        },
        plugins: [
            new ForkTsCheckerWebpackPlugin({
                checkSyntacticErrors: true,
                workers: typeCheckingCores
            }),
        ]
    };

    const bundles = [
        {
            entry: {
                controllers: "./src/controllers/index.ts"
            },
            plugins: [
                new BundleAnalyzerPlugin({
                    analyzerMode: 'static',
                    reportFilename: 'controllers.stats.html',
                    openAnalyzer: false,
                    generateStatsFile: true,
                    statsFilename: 'controllers.stats.json'
                })
            ],
        },
        {
            entry: {
                loaderHost: "./src/controllers/loaderHost.ts"
            },
            plugins: [
                new BundleAnalyzerPlugin({
                    analyzerMode: 'static',
                    reportFilename: 'loaderHost.stats.html',
                    openAnalyzer: false,
                    generateStatsFile: true,
                    statsFilename: 'loaderHost.stats.json'
                })
            ],
        },
        {
            entry: {
                loaderFramed: "./src/controllers/loaderFramed.ts"
            },
            plugins: [
                new BundleAnalyzerPlugin({
                    analyzerMode: 'static',
                    reportFilename: 'loaderFramed.stats.html',
                    openAnalyzer: false,
                    generateStatsFile: true,
                    statsFilename: 'loaderFramed.stats.json'
                })
            ],
        },
        {
            entry: {
                worker: "./src/controllers/workerLoader.ts"
            },
            plugins: [
                new BundleAnalyzerPlugin({
                    analyzerMode: 'static',
                    reportFilename: 'worker.stats.html',
                    openAnalyzer: false,
                    generateStatsFile: true,
                    statsFilename: 'worker.stats.json'
                })
            ],
        }];

    // Always minify worker bundle for easy lookup.
    return bundles.map((bundle) => merge(bundle.entry.worker ? prod : envOptions, defaultOptions, bundle));
};
