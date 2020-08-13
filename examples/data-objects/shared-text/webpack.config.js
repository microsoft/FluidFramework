/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
const fluidRoute = require("@fluidframework/webpack-fluid-loader");
const path = require("path");
const merge = require("webpack-merge");
const pkg = require("./package.json");
// var Visualizer = require('webpack-visualizer-plugin');
// const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
// const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

module.exports = env => {
    const isProduction = env && env.production;
    return merge(
        {
            entry: './src/index.ts',
            resolve: {
                extensions: [".mjs", ".ts", ".tsx", ".js"],
            },
            devtool: 'source-map',
            mode: "production",
            module: {
                rules: [
                    {
                        test: /\.tsx?$/,
                        use: [{
                            loader: 'ts-loader',
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
                        use: ["source-map-loader"],
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
            node: {
                dgram: 'empty',
                fs: 'empty',
                net: 'empty',
                tls: 'empty',
                child_process: 'empty',
            },
            devServer: {
                publicPath: '/dist',
                stats: "minimal",
                before: (app, server) => fluidRoute.before(app, server, env),
                after: (app, server) => fluidRoute.after(app, server, __dirname, env),
                watchOptions: {
                    ignored: "**/node_modules/**",
                }
            },
            resolveLoader: {
                alias: {
                    'blob-url-loader': require.resolve('./loaders/blobUrl'),
                    'compile-loader': require.resolve('./loaders/compile'),
                },
            },
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
                // new MonacoWebpackPlugin()
                // new BundleAnalyzerPlugin()
            ]
        },
        isProduction ? require("./webpack.prod") : require("./webpack.dev"));
};
