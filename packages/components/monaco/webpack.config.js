/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require('path');
const webpack = require('webpack');
// const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

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
                use: [{
                    loader:'ts-loader',
                    options: {
                        compilerOptions: {
                            module: "esnext"
                        },
                    }
                }],
                exclude: /node_modules/
            },
            {
                test: /\.js$/,
                use: ["source-map-loader"],
                enforce: "pre"
            },
            {
                test: /\.css$/,
                use: [
                    "style-loader", // creates style nodes from JS strings
                    "css-loader", // translates CSS into CommonJS
                ]
            },
            {
                test: /\.scss$/,
                use: [
                    "style-loader", // creates style nodes from JS strings
                    "css-loader", // translates CSS into CommonJS
                    "sass-loader" // compiles Sass to CSS, using Node Sass by default
                ]
            },
            {
                test: /\.(png|jpg|gif|svg|eot|ttf|woff|woff2)$/,
                loader: 'url-loader',
                options: {
                    limit: 10000
                }
            },
            {
                test: /\.html$/,
                loader: 'html-loader'
            }
        ]
    },
    resolve: {
        extensions: [ '.tsx', '.ts', '.js' ]
    },
    resolveLoader: {
		alias: {
			'blob-url-loader': require.resolve('./loaders/blobUrl'),
			'compile-loader': require.resolve('./loaders/compile'),
		},
	},
    output: {
        filename: '[name].bundle.js',
        chunkFilename: '[name].async.js',
        path: path.resolve(__dirname, 'dist'),
        publicPath: "/dist/",
        library: "[name]",
        libraryTarget: "umd",
        globalObject: 'self',
    },
    plugins: [
        // new MonacoWebpackPlugin()
        // new BundleAnalyzerPlugin()
    ]
};
