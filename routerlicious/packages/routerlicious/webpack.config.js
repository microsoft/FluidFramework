const path = require('path');
const webpack = require('webpack');
const dev = require('./webpack.dev.js');
const prod = require('./webpack.prod.js');
const merge = require('webpack-merge');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = env => {
    let prod_target = env && env.target;
    const envOptions = prod_target ? prod : dev
    let typeCheckingCores = 1;

    const defaultOptions = {
        devtool: 'source-map',
        resolve: {
            extensions: [".ts", ".tsx", ".js", ".json"]
        },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    use: ["source-map-loader"],
                    exclude: /node_modules/,
                    enforce: "pre"
                },
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
                                // Switch to es6 modules in production to enable tree shaking
                                module: prod_target ? "esnext" : "commonjs",
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
/*
            new ForkTsCheckerWebpackPlugin({
                checkSyntacticErrors: true,
                workers: typeCheckingCores
            }),
*/
        ]
    };

    const bundles = [
        {
            entry: {
                controller: "./src/alfred/controllers/index.ts",
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
            plugins: [
                new BundleAnalyzerPlugin({
                    analyzerMode: 'static',
                    reportFilename: 'routerlicious.stats.html',
                    openAnalyzer: false,
                    generateStatsFile: true,
                    statsFilename: 'routerlicious.stats.json'
                  })
            ],
        },
        {
            entry: {
                loader: "./src/alfred/controllers/loader.ts"
            },
            plugins: [
                new BundleAnalyzerPlugin({
                    analyzerMode: 'static',
                    reportFilename: 'loader.stats.html',
                    openAnalyzer: false,
                    generateStatsFile: true,
                    statsFilename: 'loader.stats.json'
                  })
            ],
        }];

    return bundles.map((bundle) => merge(envOptions, defaultOptions, bundle));
};
