const path = require('path');

module.exports = {
    entry: './src/index.ts',
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: [{
                    loader: "cache-loader"
                  },
                  {
                    loader: "ts-loader",
                    options: {
                        compilerOptions: {
                            declaration: false,
                        },
                    }
                  }],
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: [ '.tsx', '.ts', '.js' ]
    },
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist')
    },
    node: {
        fs: 'empty',
        dgram: 'empty',
        net: 'empty',
        tls: 'empty',
        ws: 'empty',
    }
};
