/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-example/webpack-fluid-loader");
const path = require("path");
const MonacoWebpackPlugin = require("monaco-editor-webpack-plugin");

module.exports = (env) => {
	return {
		...fluidRoute.devServerConfig(__dirname, env),
		entry: {
			main: "./src/index.ts",
		},
		resolve: {
			extensionAlias: {
				".js": [".ts", ".tsx", ".js"],
				".cjs": [".cts", ".cjs"],
				".mjs": [".mts", ".mjs"],
			},
		},
		resolveLoader: {
			alias: {
				"blob-url-loader": require.resolve("./loaders/blobUrl"),
				"compile-loader": require.resolve("./loaders/compile"),
			},
		},
		module: {
			rules: [
				{
					test: /\.tsx?$/,
					loader: "ts-loader",
				},
				// This example currently has missing sourcemap issues.
				// Disabling source mapping allows it to be runnable with these issues.
				// {
				// 	test: /\.[cm]?js$/,
				// 	use: [require.resolve("source-map-loader")],
				// 	enforce: "pre",
				// },
				{
					test: /\.css$/,
					use: [
						"style-loader", // creates style nodes from JS strings
						"css-loader", // translates CSS into CommonJS
					],
				},
				{
					test: /\.scss$/,
					use: [
						"style-loader", // creates style nodes from JS strings
						"css-loader", // translates CSS into CommonJS
						"sass-loader", // compiles Sass to CSS, using Node Sass by default
					],
				},
				{
					test: /\.(png|jpg|gif|svg|eot|ttf|woff|woff2)$/,
					loader: "url-loader",
					options: {
						limit: 10000,
					},
				},
				{
					test: /\.html$/,
					loader: "html-loader",
				},
			],
		},
		output: {
			filename: "[name].bundle.js",
			path: path.resolve(__dirname, "dist"),
			library: { name: "[name]", type: "umd" },
			chunkFilename: "[name].async.js",
			publicPath: "/dist/",
			globalObject: "self",
		},
		plugins: [new MonacoWebpackPlugin()],
		watchOptions: {
			ignored: "**/node_modules/**",
		},
		mode: env?.production ? "production" : "development",
		devtool: env?.production ? "source-map" : "inline-source-map",
	};
};
