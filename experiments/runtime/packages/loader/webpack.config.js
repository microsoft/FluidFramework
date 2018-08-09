const path = require('path');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const webpack = require('webpack');

let typeCheckingCores = 1;

module.exports = {
    entry: {
        "runtime": "./src/index.ts"
    },
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: '[name].min.js',
        library: "[name]"
    },
    devtool: 'source-map',
    mode: "production",
    resolve: {
        extensions: [".ts", ".tsx", ".js", ".json"]
    },
    module: {
        rules: [
            {
                test: /\.(ts|tsx)$/,
                use: [
                    {
                        loader: "cache-loader"
                    },
                    {
                        loader: 'thread-loader',
                        options: {
                            // there should be 1 cpu for the fork-ts-checker-webpack-plugin
                            workers: require('os').cpus().length - typeCheckingCores,
                        },
                    },
                    {
                    loader: "ts-loader",
                    options: {
                        compilerOptions: {
                            declaration: false,
                        },
                        // Removes TypeChecking and forces thread safety
                        // ForkTSCheckerWebpackPlugin handles types and syntax
                        happyPackMode: true,
                    }
                }],
                exclude: [
                    "/node_modules/",
                    "/dist/",
                ]
            }
        ]
    },
    stats: {
        timings: true,
        colors: true,
        builtAt: false,
        hash: false,
        version: false,
        assets: false,
        chunks: false,
        modules: false,
        reasons: false,
        children: false,
        source: false,
        errorDetails: false,
        publicPath: false
    },
    plugins: [
        new ForkTsCheckerWebpackPlugin({
            checkSyntacticErrors: true,
            workers: typeCheckingCores
        }),
        new UglifyJsPlugin({
            test: /\.ts($|\?)/i,
            parallel: true,
            sourceMap: true,
            uglifyOptions: {
                mangle: true,
                compress: true,
                warnings: false,
            }
        }),
    ]
}
