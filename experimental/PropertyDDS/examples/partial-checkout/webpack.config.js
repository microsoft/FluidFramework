/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

module.exports = env => {
    const htmlTemplate = "./src/index.html";

    return {
        devtool: "inline-source-map",
        entry: "./src/app.tsx",
        mode: "development",
        module: {
            rules: [{
                    test: /\.s?css$/,
                    use: ['style-loader', 'css-loader', 'sass-loader']
                },
                {
                    test: /\.tsx?$/,
                    loader: require.resolve("ts-loader")
                }
            ]
        },
        output: {
            filename: "[name].[contenthash].js",
        },
        plugins: [
            // For an unknown reason, this does not work for this specific example. It seems to have issues with the async package.
            // new webpack.ProvidePlugin({process: 'process/browser'}),
            // So use DefinePlugin to recreate just the part we need:
            new webpack.DefinePlugin({
                'process.env.NODE_DEBUG': undefined,
            }),
            new HtmlWebpackPlugin({
                template: htmlTemplate
            })
        ],
        resolve: {
            extensions: [".ts", ".tsx", ".js"],
        },
    }
}
