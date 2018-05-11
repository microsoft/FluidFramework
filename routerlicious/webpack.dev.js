const common = require('./webpack.common.js');
const merge = require('webpack-merge');
const path = require('path');

common.output.filename = '[name].js';

module.exports = merge(common, {
});
