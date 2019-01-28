const path = require('path');
// var Visualizer = require('webpack-visualizer-plugin');
// const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const webpack = require("webpack");

module.exports = {
    entry: {
        main: './src/index.ts'
    },
    mode: 'production',
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
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
    output: {
        filename: '[name].bundle.js',
        path: path.resolve(__dirname, 'dist'),
        library: "[name]",
        libraryTarget: "umd"
    },
    devServer: {
        publicPath: '/dist'
    },
    plugins: [
        new webpack.DllReferencePlugin({
            context: process.cwd(),
            manifest: require(path.resolve(__dirname, "../external-dll/dist", "External.json"))
        }),
        new webpack.DllReferencePlugin({
            context: process.cwd(),
            manifest: require(path.resolve(__dirname, "../runtime-dll/dist", "PragueRuntime.json"))
        }),
        // new BundleAnalyzerPlugin(),
        // new Visualizer({
        //     filename: './statistics.html'
        // })
    ],
};
