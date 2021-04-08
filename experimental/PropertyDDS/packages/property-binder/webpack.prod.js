/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const {CleanWebpackPlugin} = require('clean-webpack-plugin');
const merge = require('webpack-merge');
const _ = require('underscore');

const baseConfig = require('./webpack.appfw.base.js');


const getCommandLineArgs = function() {
  const params = {};
  const validParams = [
    '--name=', '--fileType=', '--clearDist=', '--dir=', '--distPath=', '--distTypesPath', '--tsConfigFile'
  ];

  const extractParams = args => {
    for (let param of args) {
      for (let p of validParams) {
        if (param.startsWith(p)) {
          const separatorIndex = param.indexOf('=');
          const paramName = param.substring(2, separatorIndex);
          const paramValue = param.substring(separatorIndex + 1);
          params[paramName] = paramValue;
          break;
        }
      }
    }
  };

  extractParams(process.argv);
  return params;
};

getParams = params => {
  const cmdLineParams = getCommandLineArgs();
  const result = _.extend({}, params, cmdLineParams);
  if (result.name === undefined) {
    throw new Error('Webpack config: "name" not given.');
  }
  if (!result.fileType) {
    throw new Error('Webpack config: "fileType" not defined.');
  }
  if (!result.merge || typeof result.merge !== 'object') {
    result.merge = {};
  }
  if (!result.clearDist && result.clearDist !== false) {
    result.clearDist = true;
  }
  if (!path.isAbsolute(result.distPath)) {
    result.distPath = path.resolve(result.distPath);
  }
  if (result.distTypesPath === '') {
    result.generateDeclarations = false;
  } else {
    result.generateDeclarations = true;
  }
  if (result.distTypesPath && !path.isAbsolute(result.distTypesPath)) {
    result.distTypesPath = path.resolve(result.distTypesPath);
  }
  if (!path.isAbsolute(result.dir)) {
    result.dir = path.resolve(result.dir);
  }
  if (result.tsConfigFile && !path.isAbsolute(result.tsConfigFile)) {
    result.tsConfigFile = path.resolve(result.tsConfigFile);
  }

  return result;
};


/**
 * @typedef AppfwLibraryParameters
 * @property {string} name The project's name. Used in generated bundle file names.
 *  Can also be set on the command line as --name=[name].
 * @property {string} fileType The file type of the project. Either 'js' or 'ts'. Can also be set on the command line
 *  as --fileType=[fileType].
 * @property {string} [dir=./] The path that contains the entry point file, either absolute or relative to the
 *  project root. Can also be set on the command line as --dir=[dir].
 * @property {string} [distPath=dist/lib] The path where generated output files should be stored, either absolute or
 *  relative to the project root. Can also be set on the command line as --distPath=[distPath].
 * @property {string} [distTypesPath=dist/types] The path where generated output files should be stored, either
 *  absolute or relative to the project root. When an empty string is provided, no declaration files will be
 *  generated. Can also be set on the command line as --distTypesPath=[distTypesPath].
 * @property {string} [tsConfigFile] The name of the TypeScript configuration file (tsconfig). Either as an absolute
 *  path or relative to the project root. Can also be set on the command line as --tsConfigFile=[tsConfigFile].
 * @property {object} [merge={}] An object that contains valid webpack configuration options. Will be merged with the
 *  default options defined in this config.
 */

/**
 * The webpack base configuration for Application Framework libraries (e.g. AppComponents).
 * @param {AppfwLibraryParameters} args Configuration parameters.
 * @return {array<object>} An array of webpack configurations with two entries. The first one is for a non-minified
 *  development build, the second one is a minified production bundle.
 */
const CommonWebpackLibTSConfig = function(args) {
  args = _.extend({fileType: 'ts'}, baseConfig.commonParams, {distTypesPath: 'dist/types'}, args);
  const params = getParams(args);

  const commonLibConfig = {
    devtool: 'source-maps',
    output: {
      library: params.name,
      path: params.distPath
    },
    externals: {
      '@adsk/forge-appfw-di': '@adsk/forge-appfw-di',
      "@fluid-experimental/property-properties": {
        amd: "@fluid-experimental/property-properties",
        commonjs: "@fluid-experimental/property-properties",
        commonjs2: "@fluid-experimental/property-properties",
        root: ["Property", "Properties"]
      },
      "@fluid-experimental/property-changeset": {
        amd: "@fluid-experimental/property-changeset",
        commonjs: "@fluid-experimental/property-changeset",
        commonjs2: "@fluid-experimental/property-changeset",
        root: ["Property", "Changeset"]
      }
    },
    module: {
      rules: [
        {
          test: /\.[tj]sx?$/,
          exclude: [/node_modules/, /@adsk/, /\.min\.js$/],
          use: {
            loader: 'babel-loader',
            options: {
              babelrc: false,
              presets: [
                [
                  '@babel/preset-env',
                  {targets: {'ie': 11}, modules: 'commonjs'}
                ]
              ],
              plugins: ['@babel/plugin-transform-runtime']
            }
          }
        }
      ]
    }
  };

  const tsLibConfig = baseConfig.TSConfig(params.fileType, params.generateDeclarations, params.distTypesPath,
    params.tsConfigFile);

  const libConfig = merge(baseConfig.BaseConfig, commonLibConfig, tsLibConfig, params.merge);

  const isFile = fs.statSync(params.dir).isFile();
  const entryFile = path.resolve(params.dir, isFile ? '' : './index.' + params.fileType);
  let devEntry = {};
  devEntry[params.name] = entryFile;
  let prodEntry = {};
  prodEntry[params.name + '.min'] = entryFile;

  const pathsToClean = [params.distPath];
  if (params.fileType === 'ts' && params.generateDeclarations) pathsToClean.push(params.distTypesPath);

  return [
    merge(libConfig, {
      mode: 'development',
      entry: devEntry,
      plugins: [
        new CleanWebpackPlugin({cleanOnceBeforeBuildPatterns:pathsToClean}, process.cwd())
      ]
    }),
    merge(libConfig, {
      mode: 'production',
      entry: prodEntry
    })
  ];
};



const config = CommonWebpackLibTSConfig({
  dir: path.join(__dirname, 'src'),
  name: '@adsk/forge-appfw-databinder',
  merge: {
    externals: {
      'underscore': {
        amd: 'underscore',
        commonjs: 'underscore',
        commonjs2: 'underscore',
        root: '_'
      }
    }
  }
});

config[0] = merge(config[0],
  {
    plugins: [
      new CleanWebpackPlugin({cleanOnceBeforeBuildPatterns:['dist/src', 'dist/index.*']})
    ]
  }
);

module.exports = config;
