/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require('path');

module.exports = {
    entry: './src/controllers/index.ts',
    devtool: 'source-map',
    module: {
        rules: [
            // All files with a '.ts' or '.tsx' extension will be handled by 'awesome-typescript-loader'.
            { test: /\.tsx?$/, loader: "awesome-typescript-loader" },

            // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
            { enforce: "pre", test: /\.js$/, loader: "source-map-loader" },

            { test: /\.css$/, use: [ 'style-loader', 'css-loader' ] },
        ]
    },
    resolve: {
        extensions: [ '.tsx', '.ts', '.js', '.json', '.css' ]
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
    externals: {
        "react": "React",
        "react-dom": "ReactDOM"
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