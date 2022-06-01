/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require('path');
const { BundleComparisonPlugin } = require('@mixer/webpack-bundle-compare/dist/plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const DuplicatePackageCheckerPlugin = require('@cerner/duplicate-package-checker-webpack-plugin');
const { BannedModulesPlugin } = require('@fluidframework/bundle-size-tools')

module.exports = {
  entry: {
    'aqueduct': './src/aqueduct',
    'connectionState': './src/connectionState',
    'containerRuntime': './src/containerRuntime',
    'loader': './src/loader',
    'map': './src/map',
    'matrix': './src/matrix',
    'odspDriver': './src/odspDriver',
    'odspPrefetchSnapshot': './src/odspPrefetchSnapshot',
    'sharedString': './src/sharedString'
  },
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: require.resolve('ts-loader'),
        exclude: /node_modules/,
      },
      {
        test: /\.js$/,
        use: [require.resolve("source-map-loader")],
        enforce: "pre"
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    path: path.resolve(__dirname, 'dist')
  },
  node: false,
  plugins: [
    new BannedModulesPlugin({
        bannedModules: [{
                moduleName: 'assert',
                reason: 'This module is very large when bundled in browser facing Javascript, instead use the assert API in @fluidframework/common-utils'
            }
        ]
    }),
    new DuplicatePackageCheckerPlugin({
      // Also show module that is requiring each duplicate package
      verbose: true,
      // Emit errors instead of warnings
      emitError: true,
      /**
       * We try to avoid duplicate packages, but sometimes we have to allow them since the duplication is coming from a third party library we do not control
       * IMPORTANT: Do not add any new exceptions to this list without first doing a deep investigation on why a PR adds a new duplication, this hides a bundle size issue
       */
      exclude: (instance) =>
        // object-is depends on es-abstract 1.18.0-next, which does not satisfy the semver of other packages. We should be able to remove this when es-abstract moves to 1.18.0
        instance.name === 'es-abstract'
    }),
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
