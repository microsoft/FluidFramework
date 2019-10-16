/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@microsoft/fluid-webpack-component-loader");
const path = require("path");
const merge = require("webpack-merge");
// var Visualizer = require('webpack-visualizer-plugin');
// const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = env => {
    const isProduction = env && env.production;

    return merge({
        entry: {
            main: './src/index.ts',
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: [{
                        loader:'ts-loader',
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
        resolve: {
            extensions: [ '.tsx', '.ts', '.js' ]
        },
        output: {
            filename: '[name].bundle.js',
            chunkFilename: '[name].async.js',
            path: path.resolve(__dirname, 'dist'),
            publicPath: "/dist/",
            library: "pinpoint-container",
            libraryTarget: "umd"
        },
        devServer: {
            publicPath: '/dist',
            stats: "minimal",
            before: fluidRoute.before,
            after: (app, server) => fluidRoute.after(app, server, __dirname, env),
        },
        plugins: [
            // new MonacoWebpackPlugin()
            // new BundleAnalyzerPlugin()
        ]
    }, isProduction
        ? require("./webpack.prod")
        : require("./webpack.dev"));
};