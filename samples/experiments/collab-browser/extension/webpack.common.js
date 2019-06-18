/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const CleanWebpackPlugin = require("clean-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
    entry: {
        background: "./src/background.ts",
        content: "./src/content.ts",
        popup: "./src/popup.ts",
    },
    resolve: {
        extensions: [".ts", ".tsx", ".js", ".json", ".css"]
    },
    module: {
        rules: [
            { 
                test: /\.tsx?$/,
                loader: "ts-loader",
                exclude: /node_modules/
            },
            {
                test: /\.css$/,
                include: path.join(__dirname, "src"),
                use: [
                    "style-loader", {
                        loader: "typings-for-css-modules-loader",
                        options: {
                            modules: true,
                            namedExport: true,
                            camelCase: true,
                        }
                    }
                ]
            }
        ]
    },
    plugins: [
        new CleanWebpackPlugin(["dist"]),
        new CopyWebpackPlugin(["./src/manifest.json", "./src/popup.html"]),
        // new webpack.WatchIgnorePlugin([
        //     /css\.d\.ts$/
        // ]),
    ],
    output: {
        filename: "[name].bundle.js",
        path: path.resolve(__dirname, "dist"),
        library: "[name]",
        // https://github.com/webpack/webpack/issues/5767
        // https://github.com/webpack/webpack/issues/7939
        devtoolNamespace: "collab-browser-extension",
        libraryTarget: "umd"
    },
    node: {
        fs: "empty",
        dgram: "empty",
        net: "empty",
        tls: "empty",
    }
};
