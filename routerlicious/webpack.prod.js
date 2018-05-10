const common = require('./webpack.common.js');
const merge = require('webpack-merge');
const path = require('path');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');

module.exports = merge(common, {
    devtool: "inline-source-map",
    plugins: [
        new UglifyJsPlugin({
            test: /\.ts($|\?)/i,
            parallel: true,
            sourceMap: false,
            uglifyOptions: {
                mangle: false,
                compress: false,
                warnings: true,
            }
        }),
    ],
    output: {
        path: path.resolve(__dirname, "public/scripts/dist"),
        filename: '[name].min.js',
        library: "prague_[name]"
    },
}) 