/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require('path');
const webpack = require("webpack");

module.exports = env => {
    const htmlTemplate = "./src/index.html";
    return {
        devtool: "inline-source-map",
        entry: "./src/app.tsx",
        mode: "development",
        devServer: {
            port: 9000
        },
        // This impacts which files are watched by the dev server (and likely by webpack if watch is true).
        // This should be configurable under devServer.static.watch
        // (see https://github.com/webpack/webpack-dev-server/blob/master/migration-v4.md) but that does not seem to work.
        // The CLI options for disabling watching don't seem to work either, so this may be a symptom of using webpack4 with the newer webpack-cli and webpack-dev-server.
        watchOptions: {
            ignored: "**/node_modules/**",
        },
        module: {
            rules: [{
                    test: /\.s?css$/,
                    use: ['style-loader', 'css-loader', 'sass-loader']
                },
                {
                    test: /\.tsx?$/,
                    loader: require.resolve("ts-loader")
                },
                {
                    test: /\.js$/,
                    use: ["source-map-loader"],
                }
            ]
        },
        output: {
            filename: "[name].[contenthash].js",
        },
        plugins: [
            new webpack.DefinePlugin({
                'process.env.NODE_DEBUG': undefined,
            }),
            new HtmlWebpackPlugin({
                template: htmlTemplate
            })
        ],
        resolve: {
            extensions: [".ts", ".tsx", ".js"]
        },
    }
}
