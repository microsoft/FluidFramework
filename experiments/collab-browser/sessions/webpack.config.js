const path = require('path');
const CleanWebpackPlugin = require("clean-webpack-plugin");
const WebpackShellPlugin = require('webpack-shell-plugin');

module.exports = {
    entry: {
        main: './src/index.ts'
    },
    mode: "development",
    devtool: 'source-map',
    module: {
        rules: [{
            test: /\.ts$/,
            use: 'ts-loader',
            exclude: /node_modules/
        }]
    },
    resolve: {
        extensions: [ '.ts', '.js' ]
    },
    output: {
        filename: '[name].bundle.js',
        path: path.resolve(__dirname, 'dist'),
        library: "[name]",
        libraryTarget: "umd"
    },
    plugins: [
        new CleanWebpackPlugin(["dist"]),
        new WebpackShellPlugin({
            onBuildEnd:["npm run publish-local"],
            dev: false
        })
    ],
};
