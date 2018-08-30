const path = require('path');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

// Uglify Fails on api.js unless uglify-es@3.3.9 is installed
module.exports = {
    mode: "production",
    output: {
        path: path.resolve(__dirname, "public/scripts/dist"),
        filename: '[name].min.js',
        library: "[name]"
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
        }),
        new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            reportFilename: 'routerlicious.stats.html',
            openAnalyzer: false,
            generateStatsFile: true,
            statsFilename: 'routerlicious.stats.json'
          })       
    ],
};
