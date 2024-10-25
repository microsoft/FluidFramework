/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const { merge } = require("webpack-merge");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

module.exports = (env) => {
	const isProduction = env?.production;

	return merge(
		{
			entry: {
				start: "./src/index.tsx",
			},
			resolve: {
				extensionAlias: {
					".js": [".ts", ".tsx", ".js", ".cjs", ".mjs"],
				},
				extensions: [".ts", ".tsx", ".js", ".cjs", ".mjs"],
			},
			module: {
				rules: [
					// Necessary in order to use TypeScript
					{
						test: /\.ts$|tsx/,
						use: "ts-loader",
						exclude: /node_modules/,
					},
					{
						test: /\.css$/,
						use: [
							{
								loader: "style-loader",
							},
							{
								loader: "css-loader",
							},
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
				devtoolNamespace: "fluid-example/shared-tree-demo",
				libraryTarget: "umd",
			},
			plugins: [
				new webpack.ProvidePlugin({
					process: "process/browser.js",
				}),
				// No need to write a index.html
				new HtmlWebpackPlugin({
					title: "Hello Demo",
					favicon: "",
				}),
			],
		},
		isProduction ? require("./webpack.prod.cjs") : require("./webpack.dev.cjs"),
	);
};
