/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const { merge } = require("webpack-merge");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

module.exports = (env) => {
    const isProduction = env && env.production;

    return merge(
        {
            entry: {
                app: "./src/app.ts",
            },
            resolve: {
                extensions: [".ts", ".tsx", ".js"],
            },
            module: {
                rules: [
                    {
                        test: /\.tsx?$/,
                        loader: require.resolve("ts-loader"),
                    },
                ],
            },
            output: {
                filename: "[name].bundle.js",
                path: path.resolve(__dirname, "dist"),
                library: "[name]",
                // https://github.com/webpack/webpack/issues/5767
                // https://github.com/webpack/webpack/issues/7939
                devtoolNamespace: "fluid-example/app-integration-external-controller",
                libraryTarget: "umd",
            },
            plugins: [
                new webpack.ProvidePlugin({
                    process: "process/browser",
                }),
                new HtmlWebpackPlugin({
                    template: "./src/index.html",
                }),
            ],
        },
        isProduction ? require("./webpack.prod") : require("./webpack.dev"),
    );
};
