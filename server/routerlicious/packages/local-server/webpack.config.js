/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This config exists in order to test that webpack can pack local server.
// To test actual use in a browser context integrate this package into a consumer that uses it in a browser context
// or add browser based tests to this package.

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
        extensions: [ '.tsx', '.ts', '.js' ],
        fallback: {
            // To polyfill buffer, use: require.resolve("buffer/")
            buffer: false,
            util: false,
        },
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
