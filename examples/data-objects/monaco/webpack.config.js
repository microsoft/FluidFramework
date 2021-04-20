/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluidframework/webpack-fluid-loader");
const path = require('path');
const merge = require('webpack-merge');
// const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

module.exports = env => {
    const isProduction = env && env.production;
    return merge({
        entry: {
            main: './src/index.ts'
        },
        mode: 'production',
        devtool: 'source-map',
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: [{
                        loader:'ts-loader',
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
                    use: ["source-map-loader"],
                    enforce: "pre"
                },
                {
                    test: /\.css$/,
                    use: [
                        "style-loader", // creates style nodes from JS strings
                        "css-loader", // translates CSS into CommonJS
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
        resolve: {
            extensions: [ '.tsx', '.ts', '.js' ]
        },
        resolveLoader: {
            alias: {
                'blob-url-loader': require.resolve('./loaders/blobUrl'),
                'compile-loader': require.resolve('./loaders/compile'),
            },
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
            host: "0.0.0.0",
            before: (app, server) => fluidRoute.before(app, server, env),
            after: (app, server) => fluidRoute.after(app, server, __dirname, env),
            watchOptions: {
                ignored: "**/node_modules/**",
            }
        },
        plugins: [
            // new MonacoWebpackPlugin()
            // new BundleAnalyzerPlugin()
        ]
    }, isProduction
        ? require("./webpack.prod")
        : require("./webpack.dev"));
};
