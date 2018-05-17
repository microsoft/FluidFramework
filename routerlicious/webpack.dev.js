const common = require('./webpack.common.js');
const merge = require('webpack-merge');
const path = require('path');

    module.exports = merge(common, {
    output: {
        path: path.resolve(__dirname, "public/scripts/dist"),
        filename: '[name].js',
        library: "prague_[name]"
    },
});
