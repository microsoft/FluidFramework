const path = require('path');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');

// Uglify Fails on api.js unless uglify-es@3.3.9 is installed
module.exports = {
    mode: "production",
    output: {
        path: path.resolve(__dirname, "public/scripts/dist"),
        filename: 'index.min.js',
        library: 'controller',
        libraryTarget: 'var'
    },
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
        })
    ],
};
