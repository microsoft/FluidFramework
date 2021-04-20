/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const UglifyJsPlugin = require("uglifyjs-webpack-plugin");
const { BundleComparisonPlugin } = require('@mixer/webpack-bundle-compare/dist/plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const DuplicatePackageCheckerPlugin = require('duplicate-package-checker-webpack-plugin');

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
        }),
        new DuplicatePackageCheckerPlugin({
            // Also show module that is requiring each duplicate package
            verbose: true,
            // Emit errors instead of warnings
            emitError: true,
            /**
             * We try to avoid duplicate packages, but sometimes we have to allow them since the duplication is coming from a third party library.
             * - IsArray, ms, and debug can be removed once the Node API dependency cleanup of the routerlicious package is complete.
             * - Inherits and safe-buffer duplicate packages are coming in from webpack polyfills for the crypto library. We should not
             *   be shipping polyfills for crypto APIs, so this can be removed once word-online-beta breaks the jwt dependency.
             */
            exclude: (instance) =>
              instance.name === 'isarray' ||
              instance.name === 'ms' ||
              instance.name === 'debug' ||
              instance.name === 'inherits' ||
              /**
               * The following need to be investigated:
               * bn.js
               * Multiple versions of bn.js found:
               *     4.11.8 ./~/asn1.js/~/bn.js from ./~/asn1.js\lib\asn1.js
               *     5.1.1 ./~/bn.js from ./~/browserify-sign\browser\sign.js
               *
               * component-emitter
               * Multiple versions of component-emitter found:
               *     1.2.1 ./~/component-emitter from ./~/socket.io-client\lib\socket.js
               *     1.3.0 ./~/engine.io-client/~/component-emitter from ./~/engine.io-client\lib\socket.js
               *
               * readable-stream
               * Multiple versions of readable-stream found:
               *     2.0.6 ./~/readable-stream from ./~/stream-browserify\index.js
               *     3.6.0 ./~/browserify-sign/~/readable-stream from ./~/browserify-sign/~/readable-stream\lib\_stream_writable.js
               */
              instance.name === 'bn.js' ||
              instance.name === 'component-emitter' ||
              instance.name === 'readable-stream'
          }),
          // We don't split debug/release builds, so always do bundle analysis
          new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            reportFilename: path.resolve(process.cwd(), 'bundleAnalysis/report.html'),
            openAnalyzer: false,
            generateStatsFile: false,
            statsFilename: path.resolve(process.cwd(), 'bundleAnalysis/report.json')
          }),
          // Plugin that generates a compressed version of the stats file that can be uploaded to blob storage
          new BundleComparisonPlugin({
            // File to create, relative to the webpack build output path:
            file: path.resolve(process.cwd(), 'bundleAnalysis/bundleStats.msp.gz')
          })
    ],
};
