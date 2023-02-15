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
        entry: "./src/index.tsx",
        mode: "development",
        module: {
            rules: [{
                    test: /\.s?css$/,
                    use: ['style-loader', 'css-loader']
                },
                {
                    test: /\.tsx?$/,
                    loader: "ts-loader"
                }
            ]
        },
        output: {
            filename: "[name].[hash].js",
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
            extensions: [".ts", ".tsx", ".js"],
        },
    }
}
