/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const { merge } = require("webpack-merge");
const HtmlWebpackPlugin = require("html-webpack-plugin");

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
        node: {
            dgram: "empty",
            fs: "empty",
            net: "empty",
            tls: "empty",
            child_process: "empty",
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
            new HtmlWebpackPlugin({
                template: "./public/index.html",
            }),
        ],
    }, isProduction
        ? require("./webpack.prod")
        : require("./webpack.dev"));
};
