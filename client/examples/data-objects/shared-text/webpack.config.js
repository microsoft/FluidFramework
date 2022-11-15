/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const fluidRoute = require("@fluid-tools/webpack-fluid-loader");
const path = require("path");
const { merge } = require("webpack-merge");
const pkg = require("./package.json");
const webpack = require("webpack");
// var Visualizer = require('webpack-visualizer-plugin');
// const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
// const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

module.exports = env => {
    const isProduction = env?.production;
    return merge(
        {
            entry: './src/index.ts',
            resolve: {
                extensions: [".mjs", ".ts", ".tsx", ".js"],
                fallback: {
                    dgram: false,
                    fs: false,
                    net: false,
                    tls: false,
                    child_process: false,
                }
            },
            devtool: 'source-map',
            mode: "production",
            module: {
                rules: [
                    {
                        test: /\.tsx?$/,
                        use: [{
                            loader: "ts-loader",
                            options: {
                                compilerOptions: {
                                    module: "esnext"
                                },
                            }
                        }],
                        exclude: /node_modules/
                    },
                    {
                        test: /\.js$/,
                        use: [require.resolve("source-map-loader")],
                        enforce: "pre"
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
            devServer: { devMiddleware: { stats: "minimal" }},
            output: {
                filename: '[name].bundle.js',
                chunkFilename: '[name].async.js',
                path: path.resolve(__dirname, 'dist'),
                publicPath: "/dist/",
                library: "[name]",
                // https://github.com/webpack/webpack/issues/5767
                // https://github.com/webpack/webpack/issues/7939
                devtoolNamespace: "shared-text",
                libraryTarget: "umd",
                globalObject: 'self',
            },
            plugins: [
                new webpack.ProvidePlugin({
                    process: 'process/browser'
                }),
                // new MonacoWebpackPlugin()
                // new BundleAnalyzerPlugin()
            ]
        },
        isProduction ? require("./webpack.prod") : require("./webpack.dev"),
        fluidRoute.devServerConfig(__dirname, env));
};
