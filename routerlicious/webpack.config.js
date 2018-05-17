const path = require('path');
const webpack = require('webpack');
const dev = require('./webpack.dev.js');
const prod = require('./webpack.prod.js');
const merge = require('webpack-merge');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

const SpeedMeasurePlugin = require("speed-measure-webpack-plugin");
const smp = new SpeedMeasurePlugin();

module.exports = env => {
    let entry = getEntry(env);
    let prod_target = (env && env.target)

    let typeCheckingCores = 1;
    // smp.wrap(
    return smp.wrap(merge((prod_target ? prod : dev), {
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
            "../client-api": "api",
            "../../client-api": "api",
            "../client-ui": "ui",
            "../../client-ui": "ui",
            "../agent": "agent",
            "../../agent": "agent",
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
                tslint: true,
                workers: typeCheckingCores
            }),
        ]
    }
))};

function getEntry(env) {    
    let entry;

    let apiPath = "./src/client-api/index.ts";
    let uiPath = "./src/client-ui/index.ts";
    let agentPath = "./src/agent/index.ts";
    let controllerPath = "./src/alfred/controllers/index.ts";

    if (env && env.bundle) {
        switch (env.bundle) {
            case ("api"):
                entry = {api: apiPath};
                break;
            case ("ui"):
                entry = {ui: uiPath};
                break;
            case ("agent"):
                entry = {agent: agentPath};
                break;
            case ("controller"):
                entry = {controller: controllerPath};
                break;
        }
    } else {
        entry = {    
            api: apiPath,
            ui: uiPath,
            agent: agentPath,
            controller: controllerPath,
        };
    }
    return entry;
}
