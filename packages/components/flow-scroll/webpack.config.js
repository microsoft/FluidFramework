/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@microsoft/fluid-webpack-component-loader");
const path = require("path");
const merge = require("webpack-merge");
const pkg = require("./package.json");

// These packages expect WebPack to generate CSS modules
const useCssModules = [ 
    path.resolve(__dirname, "./src"),
    path.resolve(__dirname, "../table-view"),
    path.resolve(__dirname, "../webflow"),
    path.resolve(__dirname, "../flow-util"),
];

module.exports = env => {
    const isProduction = env && env.production;
    const styleLocalIdentName = isProduction
        ? "[hash:base64:5]"
        : "[name]-[local]-[hash:base64:5]"

    const configFile = isProduction
        ? "tsconfig.json"
        : "tsconfig.esnext.json";       // Improves debugging experience w/'await'.

    return merge({
        entry: { main: "./src/index.ts" },
        resolve: { extensions: [".ts", ".js"] },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    use: ["source-map-loader"],
                    exclude: /node_modules/,
                    enforce: "pre"
                },
                {
                    test: /\.tsx?$/,
                    loader: "ts-loader",
                    options: {
                        configFile,
                    },
                },
                {
                    test: /\.css$/,
                    exclude: useCssModules,
                    use: [
                        "style-loader", // creates style nodes from JS strings
                        "css-loader", // translates CSS into CommonJS
                    ]
                },
                {
                    test: /\.css$/,
                    include: useCssModules,
                    use: [
                        "style-loader", {
                            loader: "css-loader",
                            options: {
                                modules: true,
                                localIdentName: styleLocalIdentName
                            },
                        }
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
            // https://github.com/webpack/webpack/issues/5767
            // https://github.com/webpack/webpack/issues/7939
            devtoolNamespace: pkg.name,
            libraryTarget: "umd",
            publicPath: "/dist/",
        },
        devServer: {
            before: (app, server) => fluidRoute.before(app, server, env),
            after: (app, server) => fluidRoute.after(app, server, __dirname, env),
        }
    }, isProduction
        ? require("./webpack.prod")
        : require("./webpack.dev"));
};

