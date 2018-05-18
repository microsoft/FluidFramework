const path = require('path');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  entry: {
    main: './src/controllers/index.ts'
  },
  devtool: "source-map",
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'public/scripts/dist'),
    library: 'controller',
    libraryTarget: 'var'
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".css"]
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: [
          {
            loader: "cache-loader"
          },
          {
            loader: "ts-loader",
            options: {
                compilerOptions: {
                    declaration: false,
                },
            }
          }
        ],
        exclude: [
          "/node_modules/",
          "/dist/",
        ]
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
        exclude: [
          "/node_modules/",
          "/dist/",
        ]
      }
    ]
  },
  externals: {
    'react': 'React', // Case matters here 
    'react-dom': 'ReactDOM' // Case matters here 
  },
  node: {
    fs: 'empty',
    dgram: 'empty',
    net: 'empty',
    tls: 'empty'
  }
};