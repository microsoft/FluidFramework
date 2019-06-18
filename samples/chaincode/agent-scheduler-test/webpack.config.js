/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const merge = require("webpack-merge");
const pkg = require("./package.json");

module.exports = env => {
    const isProduction = env === "production";

    return merge({
        entry: {
            main: "./src/index.ts"
        },
        resolve: {
            extensions: [".ts", ".js"],
        },
        module: {
            rules: [
                { 
                    test: /\.ts$/,
                    loader: "ts-loader",
                    exclude: /node_modules/
                },
                {
                    test: /\.js$/,
                    use: ["source-map-loader"],
                    enforce: "pre"
                }
            ]
        },
        node: {
            dgram: 'empty',
            fs: 'empty',
            net: 'empty',
            tls: 'empty',
            child_process: 'empty',
        },
        output: {
            filename: "[name].bundle.js",
            path: path.resolve(__dirname, "dist"),
            library: "[name]",            
            devtoolNamespace: pkg.name,
            libraryTarget: "umd"
        },
        devServer: {
            publicPath: '/dist'
        }
    }, isProduction
        ? require("./webpack.prod")
        : require("./webpack.dev"));
};