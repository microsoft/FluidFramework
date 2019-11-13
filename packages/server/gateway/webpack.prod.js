/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const UglifyJsPlugin = require("uglifyjs-webpack-plugin");

// Uglify Fails on api.js unless uglify-es@3.3.9 is installed
module.exports = {
    mode: "production",
    output: {
        path: path.resolve(__dirname, "public/scripts/dist"),
        filename: "[name].min.js",
        library: "[name]",
        // https://github.com/webpack/webpack/issues/5767
        // https://github.com/webpack/webpack/issues/7939
        devtoolNamespace: "routerlicious"
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
