const path = require('path');

module.exports = {
    entry: {
      api: "./dist/client-api/index.js",
      ui: "./dist/client-ui/index.js",
      agent: "./dist/agent/index.js",
      controllers: "./dist/alfred/controllers/index.js"
    },
    // entry: __dirname + '/src/client-api/index.ts',
    output: {
        path: path.resolve(__dirname, "public/scripts/dist"),
        filename: '[name].js'
    },
    devtool: "source-map",
    resolve: {
        extensions: [".ts", ".tsx", ".js", ".json"]
    },
    // module: {
    //     loader:
    //       // Compile .tsx?
    //       {
    //         test: /\.(ts|tsx)$/,
    //         include: paths.appSrc,
    //         use: [
    //           {
    //             loader: require.resolve('ts-loader'),
    //             options: {
    //               // disable type checker - we will use it in fork plugin
    //               transpileOnly: true,
    //             },
    //           },
    //         ],
    //       }
    // },
    node: {
        dgram: 'empty',
        fs: 'empty',
        net: 'empty',
        tls: 'empty',
        child_process: 'empty',
      },
};
