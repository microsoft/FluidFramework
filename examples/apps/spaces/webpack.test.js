/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = env => {
    const config = require("./webpack.config")(env);
    return {
        ...config,
        entry: {
            app: "./tests/index.ts"
        },
        mode: "development",
        devtool: "inline-source-map",
        devServer: {
            static: {
                directory: path.join(__dirname, 'tests')
            }
        },
        plugins: [
            config.plugins[0],
            new HtmlWebpackPlugin({
                template: "./tests/index.html",
            }),
        ],
    }
};
