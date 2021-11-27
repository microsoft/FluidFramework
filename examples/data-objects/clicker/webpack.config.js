/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-tools/webpack-fluid-loader");
const path = require("path");
const merge = require("webpack-merge");

const pkg = require("./package.json");
const fluidPackageName = pkg.name.slice(1);

module.exports = env => {
    const isProduction = env && env.production;

    return merge({
        entry: {
            main: "./src/index.tsx"
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
            devtoolNamespace: fluidPackageName,
            // This is required to run webpacked code in webworker/node
            // https://github.com/webpack/webpack/issues/6522
            globalObject: "(typeof self !== 'undefined' ? self : this)",
            libraryTarget: "umd"
        },
        devServer: {
            headers: {
                'Access-Control-Allow-Origin': '*'
            },
            publicPath: '/dist',
            before: (app, server) => fluidRoute.before(app, server, env),
            after: (app, server) => fluidRoute.after(app, server, __dirname, env),
            watchOptions: {
                ignored: "**/node_modules/**",
            }
        }
    }, isProduction
        ? require("./webpack.prod")
        : require("./webpack.dev"));
};
