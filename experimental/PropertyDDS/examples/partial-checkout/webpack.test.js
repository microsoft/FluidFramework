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
            rules: [{
                test: /\.tsx?$/,
                loader: require.resolve("ts-loader")
            },
            {
                test: /\.css$/i,
                use: ['style-loader', 'css-loader'],
            }]
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
            // For an unknown reason, this does not work for this specific example. It seems to have issues with the async package.
            // new webpack.ProvidePlugin({process: 'process/browser'}),
            // So use DefinePlugin to recreate just the part we need:
            new webpack.DefinePlugin({
                'process.env.NODE_DEBUG': undefined,
            }),
            new HtmlWebpackPlugin({
                template: "./tests/index.html",
            }),
        ],
        mode: "development",
        devtool: "inline-source-map"
    });
};
