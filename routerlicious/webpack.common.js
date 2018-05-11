const path = require('path');
const webpack = require('webpack');

module.exports = {
    entry: {
        api: "./src/client-api/index.ts",
        ui: "./src/client-ui/index.ts",
        agent: "./src/agent/index.ts",
        controller: "./src/alfred/controllers/index.ts",
    },
    output: {
        path: path.resolve(__dirname, "public/scripts/dist"),
        filename: '______.js', // Overwriten in prod/dev config
        library: "[name]"
    },
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
                use: [{
                    loader: "ts-loader",
                    options: {
                        compilerOptions: {
                            declaration: false,
                        }
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
    }
};
