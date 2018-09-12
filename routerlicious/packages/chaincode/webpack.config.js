const path = require('path');
var Visualizer = require('webpack-visualizer-plugin');

module.exports = {
    entry: {
        main: './src/index.ts'
    },
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
    plugins: [new Visualizer({
        filename: './statistics.html'
      })],
};
