/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const HtmlWebpackPlugin = require("html-webpack-plugin");

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
            filename: "[name].[hash].js",
        },
        plugins: [
            new HtmlWebpackPlugin({
                template: htmlTemplate
            })
        ],
        resolve: {
            extensions: [".ts", ".tsx", ".js"],
        },
    }
}
