const path = require('path');
// var Visualizer = require('webpack-visualizer-plugin');

module.exports = {
    entry: {
        main: './src/index.ts',
        test: './src/test.ts'
    },
    devtool: 'source-map',
    mode: "development",
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
        filename: '[name].bundle.js',
        path: path.resolve(__dirname, 'dist'),
        library: "[name]",
        libraryTarget: "umd"
    },
    serve: {
        devMiddleware: {
            publicPath: '/dist/'
        }
    },
    node: {
        fs: 'empty',
        net: 'empty',
        tls: 'empty'
    },
    // plugins: [new Visualizer({
    //     filename: './statistics.html'
    //   })],
};
