/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

const sourceDirectoryPath = path.resolve(__dirname, "src");
const buildDirectoryPath = path.join(__dirname, "dist"); // TODO: resolve?

module.exports = {
    mode: "production",
    entry: {
        background: path.join(sourceDirectoryPath, "background.ts"),
    },
    output: {
        path: buildDirectoryPath,
        filename: "[name].js",
    },
    resolve: {
        extensions: [".ts", ".js"],
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: "ts-loader",
                exclude: /node_modules/,
            },
        ],
    },
    plugins: [
        new CopyPlugin({
            patterns: [{ from: ".", to: ".", context: "public" }],
        }),
    ],
};
