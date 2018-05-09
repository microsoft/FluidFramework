const path = require('path');
// const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const webpack = require('webpack');

// Aliasing: https://webpack.js.org/configuration/resolve/

module.exports = {
    entry: {
      api: "./dist/client-api/index.js",
      ui: "./dist/client-ui/index.js",
      agent: "./dist/agent/index.js",
      index: "./dist/alfred/controllers/index.js"
    },
    // target: 'umd',
    // entry: {
    //     api: "./src/client-api/index.ts",
    //     ui: "./src/client-ui/index.ts",
    //     agent: "./src/agent/index.ts",
    //     controllers: "./src/alfred/controllers/index.ts"
    // },
    devtool: "source-map",
    output: {
        path: path.resolve(__dirname, "public/scripts/dist"),
        filename: '[name].js',
        library: '[name]'
    },
    devtool: "source-map",
    resolve: {
        extensions: [".ts", ".tsx", ".js", ".json"]
    },
    module: {
        rules: [
            {
                test: /\.(ts|tsx)$/,
                use: "ts-loader",
                exclude: "/node_modules/"
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
    // entry: {
    //     client-api: 
    // }
    // plugins: [
    //     new webpack.ProvidePlugin({
    //         "client-api": "global:prague",
    //     }),
    //     new UglifyJsPlugin({
    //         cache: false,
    //         parallel: true,
    //     })
    // ],
    // minimizer: [
    //     new UglifyJsPlugin({
    //         cache: false,
    //        parallel: false
    //     })
    // ]
};
