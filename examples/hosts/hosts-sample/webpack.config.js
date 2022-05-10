/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require('path');

module.exports = {
    entry: {
        main: './src/app.ts'
    },
    devtool: 'source-map',
    mode: 'development',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: require.resolve('ts-loader'),
                exclude: /node_modules/
            },
            {
                test: /\.js$/,
                use: [require.resolve("source-map-loader")],
                enforce: "pre"
            }
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
        historyApiFallback: true,
        devMiddleware: { publicPath: '/dist' },
        watchOptions: {
            ignored: "**/node_modules/**",
        }
    }
};
