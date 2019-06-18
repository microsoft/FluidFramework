/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const merge = require("webpack-merge");
const webpack = require('webpack');
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

module.exports = env => {
    const isProduction = env === "production";

    return merge({
        entry: {
            main: "./src/index.tsx"
        },
        resolve: {
            extensions: [".ts", ".tsx", ".js"],
        },
        resolveLoader: {
            alias: {
                'blob-url-loader': require.resolve('./loaders/blobUrl'),
                'compile-loader': require.resolve('./loaders/compile'),
            },
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: 'ts-loader',
                    exclude: /node_modules/
                },
                {
                    test: /\.css$/,
                    use: [
                        "style-loader", // creates style nodes from JS strings
                        "css-loader", // translates CSS into CommonJS
                    ]
                },
                {
                    test: /\.html$/i,
                    use: 'raw-loader',
                }
            ]
        },
        output: {
            filename: "[name].bundle.js",
            path: path.resolve(__dirname, "dist"),
            library: "[name]",
            // https://github.com/webpack/webpack/issues/5767
            // https://github.com/webpack/webpack/issues/7939            
            devtoolNamespace: "chaincode/counter",
            libraryTarget: "umd"
        },
        devServer: {
            publicPath: '/dist',
            stats: "minimal"
        },
        node: {
            fs: "empty"
        },
        plugins: [
          new MonacoWebpackPlugin({languages: ['javascript']}),
		    new webpack.optimize.LimitChunkCountPlugin({
			    maxChunks: 1,
		    })
        ]
    }, isProduction
        ? require("./webpack.prod")
        : require("./webpack.dev"));
};