/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require('path');

module.exports = env => {
    return {
        mode: "development",
        entry: "./src/index.ts",
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: 'main.bundle.js',
            library: 'Loader',
            libraryTarget: "umd",
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    loader: require.resolve("ts-loader"),
                },
                {
                    test: /\.tsx$/,
                    loader: require.resolve("ts-loader"),
                }
            ]
        },
        resolve: {
            modules: ["node_modules"],
            extensions: [".js", ".ts", ".tsx"]
        },
        devtool: "source-map",
        stats: 'minimal',
    }
};
