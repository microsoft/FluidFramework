/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const { merge } = require("webpack-merge");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

const pkg = require("./package.json");
const componentName = pkg.name.slice(1);

module.exports = (env) => {
	const isProduction = env?.production;

	return merge(
		{
			entry: {
				app: "./src/app.ts",
			},
			resolve: {
				extensionAlias: {
					".cjs": [".cts", ".cjs"],
					".js": [".ts", ".tsx", ".js"],
					".mjs": [".mts", ".mjs"],
				},
				extensions: [".ts", ".tsx", ".js", ".cjs", ".mjs"],
				fallback: {
					dgram: false,
					fs: false,
					net: false,
					tls: false,
					child_process: false,
				},
			},
			module: {
				rules: [
					{
						test: /\.tsx?$/,
						loader: "ts-loader",
					},
					{
						test: /\.css$/,
						use: [
							"style-loader", // creates style nodes from JS strings
							"css-loader", // translates CSS into CommonJS
						],
					},
				],
			},
			output: {
				filename: "[name].bundle.js",
				path: path.resolve(__dirname, "dist"),
				library: "[name]",
				// https://github.com/webpack/webpack/issues/5767
				// https://github.com/webpack/webpack/issues/7939
				devtoolNamespace: componentName,
				libraryTarget: "umd",
			},
			plugins: [
				// As of webpack 5, we no longer automatically get node polyfills.
				// We do however transitively depend on the `util` npm package (node_modules/util/util.js) which requires `process.env` to be defined.
				// We can explicitly load the polyfill for process to make this work:
				// https://github.com/browserify/node-util/issues/57#issuecomment-764436352
				// Note that using DefinePlugin with `process.env.NODE_DEBUG': undefined` would also handle this case.
				new webpack.ProvidePlugin({
					process: "process/browser.js",
				}),
				new HtmlWebpackPlugin({
					template: "./public/index.html",
				}),
			],
		},
		isProduction ? require("./webpack.prod.cjs") : require("./webpack.dev.cjs"),
	);
};
