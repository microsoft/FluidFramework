const path = require('path');
const CleanWebpackPlugin = require("clean-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
     
// var Visualizer = require('webpack-visualizer-plugin');
// const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
    entry: {        
        background: './src/background.ts',
        content: './src/content.ts',
        popup: './src/popup.ts',
        pragueView: './src/pragueView.ts'
    },
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
            }
        ]
    },
    resolve: {
        extensions: [ '.tsx', '.ts', '.js' ]
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist')
    },
    plugins: [
        new CleanWebpackPlugin(["dist"]),
        new CopyWebpackPlugin(["./src/manifest.json", "./src/view.html", "./src/popup.html", "./src/pragueView.html"]),
        // new webpack.WatchIgnorePlugin([
        //     /css\.d\.ts$/
        // ]),
        // new BundleAnalyzerPlugin(),
        // new Visualizer({
        //     filename: './statistics.html'
        // })
    ]
};
