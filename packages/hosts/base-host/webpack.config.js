/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { resolve } = require('path');
const { BundleComparisonPlugin } = require('@mixer/webpack-bundle-compare/dist/plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const DuplicatePackageCheckerPlugin = require('duplicate-package-checker-webpack-plugin');

/**
 * Get all the plugins to use for this compilation.
 */
function getPlugins() {
  return [
    new DuplicatePackageCheckerPlugin({
      // Also show module that is requiring each duplicate package
      verbose: true,
      // Emit errors instead of warnings
      emitError: true
    }),
    // We don't split debug/release builds, so always do bundle analysis
    new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      reportFilename: resolve(process.cwd(), 'bundleAnalysis/report.html'),
      openAnalyzer: false,
      generateStatsFile: false,
      statsFilename: resolve(process.cwd(), 'bundleAnalysis/report.json')
    }),
    // Plugin that generates a compressed version of the stats file that can be uploaded to blob storage
    new BundleComparisonPlugin({
      // File to create, relative to the webpack build output path:
      file: resolve(process.cwd(), 'bundleAnalysis/bundleStats.msp.gz')
    })
  ];
}

/**
 * Creates the versioned JavaScript that should be deployed for this application.
 * @returns {WebpackOptions}
 */
function createConfig() {
  /**
   * @type {WebpackOptions}
   */
  const config = {
    mode: 'production',
    entry: { main: './src/index.ts' },
    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
    },
    output: {
      path: resolve(process.cwd(), 'dist'),
      libraryTarget: 'var',
      library: '[name]',
      // Needed to get error call stacks in window.onerror when the script is loaded on a domain that does not match that of the CDN
      crossOriginLoading: 'anonymous'
    },
    // This polyfills node APIs that are used by the routerlicious client package.
    // Once the routerlicious package is cleaned up, we should set this to node: false
    node: {},
    target: 'web',
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: 'ts-loader',
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        },
        {
          test: /\.js$/,
          use: ['source-map-loader'],
          enforce: 'pre'
        },
      ]
    },
    plugins: getPlugins(),
    devtool: 'source-map',
    // We want to enable the big optimizations, like tree shaking, on both debug and prod builds to help with debugging
    optimization: {
      // This enables more aggressive tree shaking for packages that have set the sideEffects flag in their package.json
      sideEffects: true,
      splitChunks: {
        // We expect this application to be served from an HTTP/2 endpoint, so the number of concurrent connections
        // is less of concern than total file size.
        maxAsyncRequests: 10,
        cacheGroups: {
          // Disable the vendors split chunks optimizations provided by webpack
          vendors: false
        }
      }
    }
  };

  return config;
}

module.exports = createConfig();
