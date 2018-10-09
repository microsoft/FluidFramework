const path = require('path');
const webpack = require('webpack');
// const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

module.exports = {
    entry: {
        local: './src/localServer.ts',
        main: './src/index.ts'
    },
    mode: 'production',
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            },
            {
                test: /\.css$/,
                use: [
                    "style-loader", // creates style nodes from JS strings
                    "css-loader", // translates CSS into CommonJS
                ]
            }
        ]
    },
    resolve: {
        extensions: [ '.tsx', '.ts', '.js' ]
    },
    resolveLoader: {
		alias: {
			'blob-url-loader': require.resolve('./loaders/blobUrl'),
			'compile-loader': require.resolve('./loaders/compile'),
		},
	},
    output: {
        filename: '[name].bundle.js',
        path: path.resolve(__dirname, 'dist'),
        publicPath: "https://pragueunpkg.blob.core.windows.net/egjncwvrnjwmqlbcugacp6ru/@chaincode/monaco@latest/dist/",
        // publicPath: "/dist/",
        library: "[name]",
        libraryTarget: "umd",
        globalObject: 'self',
    },
    serve: {
        devMiddleware: {
            publicPath: 'dist/'
        }
    },
    plugins: [
        new webpack.IgnorePlugin(/^((fs)|(path)|(os)|(crypto)|(source-map-support))$/, /vs\/language\/typescript\/lib/),
		new webpack.optimize.LimitChunkCountPlugin({
			maxChunks: 1,
		}),
    ],
};
