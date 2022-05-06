/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const { merge } = require("webpack-merge");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

const pkg = require("./package.json");
const componentName = pkg.name.slice(1);

module.exports = (env) => {
    const isProduction = env && env.production;

    return merge({
        entry: {
            app: "./src/app.ts",
        },
        resolve: {
            extensions: [".ts", ".tsx", ".js"],
            fallback: {
                dgram: false,
                fs: false,
                net: false,
                tls: false,
                child_process: false,
            }
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    loader: require.resolve("ts-loader"),
                },
                {
                    test: /\.css$/,
                    use: [
                        require.resolve("style-loader"), // creates style nodes from JS strings
                        require.resolve("css-loader"), // translates CSS into CommonJS
                    ],
                },
            ],
        },
        output: {
            filename: "[name].bundle.js",
            path: path.resolve(__dirname, "dist"),
            library: "[name]",
            // https://github.com/webpack/webpack/issues/5767
            // https://github.com/webpack/webpack/issues/7939
            devtoolNamespace: componentName,
            libraryTarget: "umd",
        },
        plugins: [
            // Packages we use expect these to be defined (errors at runtime if they are not), so provide them:
            new webpack.DefinePlugin({
                'process.env.NODE_DEBUG': undefined,
                'global': {
                    'Symbol': 'Symbol',
                    'BigInt64Array':'BigInt64Array',
                    'BigUint64Array':'BigUint64Array',
                    'Float32Array':'Float32Array',
                    'Float64Array':'Float64Array',
                    'Int16Array':'Int16Array',
                    'Int32Array':'Int32Array',
                    'Int8Array':'Int8Array',
                    'Uint16Array':'Uint16Array',
                    'Uint32Array':'Uint32Array',
                    'Uint8Array':'Uint8Array',
                    'Uint8ClampedArray':'Uint8ClampedArray',
                }
              }),
            new HtmlWebpackPlugin({
                template: "./public/index.html",
            }),
        ],
    }, isProduction
        ? require("./webpack.prod")
        : require("./webpack.dev"));
};
