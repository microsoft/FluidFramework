const path = require('path');

module.exports = {
    mode: "development",
    entry: "./loadPrague.ts",
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'loadPrague.js',        
        library: 'loadPrague',
        publicPath: 'dist',
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: 'ts-loader',
            },
            {
                test: /\.tsx$/,
                loader: 'ts-loader',
            }
        ]
    },
    resolve: {
        modules: ["node_modules"],
        extensions: [".js", ".ts", ".tsx"]
    },
    devtool: "source-map",
    watch: true,
    stats: 'minimal',
    devServer: {
        host: '0.0.0.0', // This makes the server public so that others can test by http://hostname ...
        disableHostCheck: true,
        port: 3000,
        public: 'localhost:' + 3000,
        open: true,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*"
          }
      
    },
};