/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
                    loader: 'ts-loader',
                },
                {
                    test: /\.tsx$/,
                    loader: 'ts-loader',
                }
            ]
        },
        resolve: {
            modules: ["node_modules"],
            extensions: [".js", ".ts", ".tsx"]
        },
        devtool: "source-map",
        watch: true,
        node: {
            fs: "empty",
            dgram: "empty",
            net: "empty",
            tls: "empty"
        },
        stats: 'minimal',
    }
};
