const path = require('path');

module.exports = {
    entry: {
      api: "./src/client-api/index.ts",
      ui: "./src/client-ui/index.ts",
      agent: "./src/agent/index.ts",
      controllers: "./src/alfred/controllers/index.ts"
    },
    // entry: __dirname + '/src/client-api/index.ts',
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: '[name].js'
    },
    devtool: "source-map",
    resolve: {
        extensions: [".ts", ".tsx", ".js", ".json"]
    },
    // module: {
    //     loaders: [
    //         {
    //             test:/
                
    //         }
    //     ]
    // },
    node: {
        dgram: 'empty',
        fs: 'empty',
        net: 'empty',
        tls: 'empty',
        child_process: 'empty',
      },
};
