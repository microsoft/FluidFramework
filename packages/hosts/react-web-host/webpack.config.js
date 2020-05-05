/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require('path');

module.exports = env => {
    const devServerSettings = {
        host: '0.0.0.0', // This makes the server public so that others can test by http://hostname ...
        disableHostCheck: true,
        port: 3030,
        public: 'localhost:' + 3030,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*"
          }
    };

    return {
        mode: "development",
        entry: "./src/index.ts",
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: 'main.bundle.js',
            library: 'reactLoader',
            libraryTarget: "umd",
            publicPath: 'dist',
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
        watch: env != "build",
        node: {
            fs: "empty",
            dgram: "empty",
            net: "empty",
            tls: "empty"
        },
        stats: 'minimal',
        devServer: devServerSettings,
    }
};
