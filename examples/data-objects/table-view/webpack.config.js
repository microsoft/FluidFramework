/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-tools/webpack-fluid-loader");
const path = require("path");
const merge = require("webpack-merge");

module.exports = env => {
    const isProduction = env === "production";
    const styleLocalIdentName = isProduction
        ? "[hash:base64:5]"
        : "[local]-[hash:base64:5]"

    return merge(
        {
            entry: './src/index.ts',
            resolve: {
                extensions: [".mjs", ".ts", ".tsx", ".js"],
            },
            devtool: 'source-map',
            mode: "production",
            module: {
                rules: [
                    {
                        test: /\.tsx?$/,
                        use: [{
                            loader: require.resolve("ts-loader"),
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
                        use: [require.resolve("source-map-loader")],
                        enforce: "pre"
                    },
                    {
                        test: /\.css$/,
                        use: [
                            "style-loader", {
                                loader: require.resolve("css-loader"),
                                options: {
                                    modules: true,
                                    localIdentName: styleLocalIdentName
                                }
                            }
                        ]
                    },
                    {
                        test: /\.(png|jpg|gif|svg|eot|ttf|woff|woff2)$/,
                        loader: require.resolve('url-loader'),
                        options: {
                            limit: 10000
                        }
                    },
                    {
                        test: /\.html$/,
                        loader: require.resolve('html-loader')
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
                filename: '[name].bundle.js',
                chunkFilename: '[name].async.js',
                path: path.resolve(__dirname, 'dist'),
                publicPath: "/dist/",
                library: "[name]",
                libraryTarget: "umd",
                globalObject: 'self',
            },
            devServer: {
                before: (app, server) => fluidRoute.before(app, server, env),
                after: (app, server) => fluidRoute.after(app, server, __dirname, env),
                watchOptions: {
                    ignored: "**/node_modules/**",
                }
            },
        },
        isProduction ? require("./webpack.prod") : require("./webpack.dev"));
};
