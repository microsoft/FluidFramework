/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@microsoft/fluid-webpack-component-loader");
const path = require("path");
const merge = require("webpack-merge");

module.exports = env => {
    const isProduction = env && env.production;

    return merge({
        entry: {
            vendor: './src/vendor.ts',
            main: "./src/index.ts",
            polyfills: './src/polyfills.ts',
        },
        resolve: {
            extensions: [".mjs", ".ts", ".tsx", ".js"],
        },
        module: {
            rules: [
                {
                    test: /\.html$/,
                    loader: 'html-loader'
                },
                {
                    test: /\.css$/,
                    use: [
                        'to-string-loader',
                        "css-loader", // translates CSS into CommonJS
                    ]
                },    
                {
                    test: /\.(scss|sass)$/,
                    use: [
                        'to-string-loader',
                        { loader: 'css-loader', options: { sourceMap: true } },
                        { loader: 'sass-loader', options: { sourceMap: true } }
                    ],
                    include: path.join(__dirname, "./src")
                },
                {
                    test: /\.ts$/,
                    loaders: [
                        {
                            loader: 'awesome-typescript-loader',
                            options: {
                                configFileName: path.join(__dirname, "./tsconfig.json")
                            }
                        },
                        'angular2-template-loader',
                        'angular-router-loader'
                    ],
                    exclude: [/node_modules/]
                }    
            ]
        },
        output: {
            filename: "[name].bundle.js",
            chunkFilename: '[id].chunk.js',
            path: path.resolve(__dirname, "dist"),
            library: "[name]",
            // https://github.com/webpack/webpack/issues/5767
            // https://github.com/webpack/webpack/issues/7939
            devtoolNamespace: "chaincode/tourofheroes",
            libraryTarget: "umd"
        },
        devServer: {
            publicPath: '/dist',
            stats: "minimal",
            before: fluidRoute.before,
            after: (app, server) => fluidRoute.after(app, server, __dirname, env),
        }
    }, isProduction
        ? require("./webpack.prod")
        : require("./webpack.dev"));
};