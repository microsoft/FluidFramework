/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

module.exports = env => {
    return ({
        entry: {
            app: "./tests/index.ts"
        },
        resolve: {
            extensions: [".ts", ".tsx", ".js"],
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    loader: require.resolve("ts-loader")
                },
            ]
        },
        output: {
            filename: "[name].bundle.js",
            path: path.resolve(__dirname, "dist"),
            library: "[name]",
            // https://github.com/webpack/webpack/issues/5767
            // https://github.com/webpack/webpack/issues/7939
            devtoolNamespace: "fluid-example/draft-js",
            libraryTarget: "umd"
        },
        devServer: {
            static: {
                directory: path.join(__dirname, 'tests')
            }
        },
        plugins: [
            new webpack.ProvidePlugin({
                process: 'process/browser'
            }),
            new HtmlWebpackPlugin({
                template: "./tests/index.html",
            }),
        ],
        mode: "development",
        devtool: "inline-source-map"
    });
};
