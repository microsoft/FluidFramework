/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluidframework/webpack-fluid-loader");
const path = require("path");
const merge = require("webpack-merge");

const pkg = require("./package.json");
const fluidPackageName = pkg.name.slice(1);

module.exports = env => {
    const isProduction = env === "production";

    return merge({
        entry: {
            main: "./src/index.ts"
        },
        resolve: {
            extensions: [".ts", ".js"]
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
        output: {
            filename: "[name].bundle.js",
            path: path.resolve(__dirname, "dist"),
            library: "[name]",
            // https://github.com/webpack/webpack/issues/5767
            // https://github.com/webpack/webpack/issues/7939
            devtoolNamespace: fluidPackageName,
            libraryTarget: "umd"
        },
        devServer: {
            publicPath: '/dist',
            stats: "minimal",
            before: fluidRoute.before,
            after: (app, server) => fluidRoute.after(app, server, __dirname, env),
            watchOptions: {
                ignored: "**/node_modules/**",
            }
        }
    }, isProduction
        ? require("./webpack.prod")
        : require("./webpack.dev"));
};