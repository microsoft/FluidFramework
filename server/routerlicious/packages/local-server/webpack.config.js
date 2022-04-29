/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This config exists in order to test local-server in a browser context, vs Node.js.

const path = require('path');

module.exports = {
    entry: {
        main: './src/index.ts'
    },
    mode: 'production',
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: require.resolve('ts-loader'),
                exclude: /node_modules/
            },
        ]
    },
    resolve: {
        extensions: [ '.tsx', '.ts', '.js' ]
    },
    output: {
        filename: '[name].bundle.js',
        path: path.resolve(__dirname, 'dist'),
        library: "[name]",
        libraryTarget: "umd"
    },
    devServer: {
        devMiddleware: { publicPath: '/dist' },
        watchOptions: {
            ignored: "**/node_modules/**",
        }
    },
};
