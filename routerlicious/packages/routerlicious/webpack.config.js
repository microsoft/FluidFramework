const path = require('path');
const webpack = require('webpack');
const dev = require('./webpack.dev.js');
const prod = require('./webpack.prod.js');
const merge = require('webpack-merge');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

module.exports = env => {
    let entry = {
        controller: "./src/alfred/controllers/index.ts",
    };
    let prod_target = (env && env.target)

    let typeCheckingCores = 1;
    return merge((prod_target ? prod : dev), {
        entry,
        devtool: 'source-map',
        resolve: {
            extensions: [".ts", ".tsx", ".js", ".json"]
        },
        node: {
            dgram: 'empty',
            fs: 'empty',
            net: 'empty',
            tls: 'empty',
            child_process: 'empty',
        },
        externals: {
            jquery: '$',
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
                                module: "esnext",
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
        ]
    });
};
