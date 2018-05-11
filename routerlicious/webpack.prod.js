const common = require('./webpack.common.js');
const merge = require('webpack-merge');
const path = require('path');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');

common.output.filename = '[name].min.js';

// Uglify Fails on api.js unless uglify-es@3.3.9 is installed
module.exports = merge(common, {
    plugins: [
        new UglifyJsPlugin({
            test: /\.ts($|\?)/i,
            parallel: true,
            sourceMap: true,
            uglifyOptions: {
                mangle: true,
                compress: true,
                warnings: false,
            }
        }),
    ],
});
