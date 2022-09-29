/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-tools/webpack-fluid-loader");
const path = require("path");
const { merge } = require("webpack-merge");
const webpack = require("webpack");

module.exports = env => {
    return {
        mode: "production",
        entry: {
            main: "./assets/icons/SVGStoreIcons/index.js"
        },
        resolve: {
            extensions: [".ts", ".tsx", ".js"],
        },
        module: {
            rules: [
              {
                test: /\.svg$/,
                use: [
                  {
                    loader: require.resolve('svg-sprite-loader')
                  },
                  {
                    loader: require.resolve('svgo-loader'),
                    options: require('./svgo.plugins.js')
                  }
                ]
              }]
        },
        output: {
            filename: "./index.js",
            path: path.resolve(__dirname, "dist", "assets", "icons", "SVGStoreIcons")
        }
    }
};
