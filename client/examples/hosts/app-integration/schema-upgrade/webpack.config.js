/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const { merge } = require("webpack-merge");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");
// const { CleanWebpackPlugin } = require("clean-webpack-plugin");

module.exports = env => {
    const isProduction = env?.production;

    return merge({
        entry: {
            start: "./src/start.ts"
        },
        resolve: {
            extensions: [".ts", ".tsx", ".js"],
        },
        module: {
            rules: [{
                test: /\.tsx?$/,
                loader: "ts-loader"
            }]
        },
        output: {
            filename: "[name].bundle.js",
            path: path.resolve(__dirname, "dist"),
            library: "[name]",
            // https://github.com/webpack/webpack/issues/5767
            // https://github.com/webpack/webpack/issues/7939
            devtoolNamespace: "fluid-example/app-integration-external-data",
            libraryTarget: "umd"
        },
        plugins: [
            new webpack.ProvidePlugin({
                process: 'process/browser'
            }),
            new HtmlWebpackPlugin({
                template: "./src/index.html",
            }),
            // new CleanWebpackPlugin(),
        ],
    }, isProduction
        ? require("./webpack.prod")
        : require("./webpack.dev"));
};
