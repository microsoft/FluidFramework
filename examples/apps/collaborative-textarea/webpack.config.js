/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-tools/webpack-fluid-loader");
const path = require("path");
const { merge } = require("webpack-merge");

module.exports = env => {
    const isProduction = env && env.production;

    return merge({
        entry: {
            main: "./src/app.ts"
        },
        resolve: {
            extensions: [".ts", ".tsx", ".js"],
        },
        module: {
            rules: [{
                test: /\.tsx?$/,
                loader: require.resolve("ts-loader")
            }]
        },
        output: {
            filename: "[name].bundle.js",
            path: path.resolve(__dirname, "dist"),
            library: "[name]",
            // https://github.com/webpack/webpack/issues/5767
            // https://github.com/webpack/webpack/issues/7939
            devtoolNamespace: "fluid-example/collaborative-textarea",
            // This is required to run webpacked code in webworker/node
            // https://github.com/webpack/webpack/issues/6522
            globalObject: "(typeof self !== 'undefined' ? self : this)",
            libraryTarget: "umd"
        },
        devServer: {
            headers: {
                'Access-Control-Allow-Origin': '*'
            },
        },
        // This impacts which files are watched by the dev server (and likely by webpack if watch is true).
        // This should be configurable under devServer.static.watch
        // (see https://github.com/webpack/webpack-dev-server/blob/master/migration-v4.md) but that does not seem to work.
        // The CLI options for disabling watching don't seem to work either, so this may be a symptom of using webpack4 with the newer webpack-cli and webpack-dev-server.
        watchOptions: {
            ignored: "**/node_modules/**",
        }
    }, isProduction
        ? require("./webpack.prod")
        : require("./webpack.dev"),
    fluidRoute.devServerConfig(__dirname, env));
};
