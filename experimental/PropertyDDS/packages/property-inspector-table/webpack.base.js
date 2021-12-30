/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const path = require('path');
module.exports.commonParams = { dir: './', distPath: 'dist/lib', merge: {} };

module.exports.BaseConfig = {
  watch: false,
  output: {
    filename: '[name].js',
    libraryTarget: 'umd',
    // fixes the error discussed in this thread https://github.com/webpack/webpack/issues/6522
    globalObject: 'typeof self !== \'undefined\' ? self : this'
  },
  resolve: {
    extensions: ['.wasm', '.mjs', '.ts', '.tsx', '.js', '.jsx', '.json', '*'],
    alias: {
      src: path.join(process.cwd(), 'src')
    }
  },
  module: {
    rules: [
      // All source files will have any sourcemaps re-processed by 'source-map-loader'.
      { enforce: 'pre', test: /\.[tj]sx?$/, exclude: /node_modules/, use: ['source-map-loader'] }
    ]
  }
};

module.exports.TSConfig = function(fileType, generateDeclarations, distTypesPath, configFile = '', compilerOptions = {}) {
  let tsConfig = {};
  if (fileType === 'ts') {
    if (generateDeclarations) {
      compilerOptions.declarationDir = distTypesPath;
    } else {
      compilerOptions.declaration = false;
      compilerOptions.declarationMap = false;
    }

    const options = {
      experimentalWatchApi: true,
      compilerOptions: compilerOptions
    };

    if (configFile) {
      options.configFile = configFile;
    }

    tsConfig = {
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            exclude: [/node_modules/],
            use: {
              loader: require.resolve('ts-loader'),
              options: options
            }
          }
        ]
      }
    };
  }
  return tsConfig;
};
