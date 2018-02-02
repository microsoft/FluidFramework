const path = require('path');

module.exports = {
  entry: {
      main: './dist/controllers/index.js'
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'public/scripts/dist'),
    library: 'controller',
    libraryTarget: 'var'
  },

  // Enable sourcemaps for debugging webpack's output.
  devtool: "source-map",

  module: {
    rules: [
        // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
        { enforce: "pre", test: /\.js$/, loader: "source-map-loader" }
    ]
  },

  // TODO: Try to figure out a better solution for this.
  // Basically some leaf dependencies can't be resolved, just treat them as empty for now because they aren't relied on
  // https://github.com/webpack-contrib/css-loader/issues/447
  // https://stackoverflow.com/questions/46775168/cant-resolve-fs-using-webpack-and-react?rq=1
  node: {
      fs: 'empty',
      dgram: 'empty',
      net: 'empty',
      tls: 'empty'
  }
};