const path = require('path');

module.exports = {
    entry: './src/controllers/index.ts',
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: [ '.tsx', '.ts', '.js' ]
    },
    optimization: {
        splitChunks: {
            cacheGroups: {
                commons: {
                    chunks: "initial",
                    minChunks: 2,
                    maxInitialRequests: 5, // The default limit is too small to showcase the effect
                    minSize: 0 // This is example is too small to create commons chunks
                },
                vendor: {
                    test: /node_modules/,
                    chunks: "initial",
                    name: "vendor",
                    priority: 10,
                    enforce: true
                }
            }
        }
    },
    output: {
        filename: 'bundle.js',
        library: "controllers",
		libraryTarget: "umd",
        path: path.resolve(__dirname, 'public/dist')
    },
    node: {
        fs: 'empty',
        dgram: 'empty',
        net: 'empty',
        tls: 'empty'
    }
};