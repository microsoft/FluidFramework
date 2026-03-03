/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { exampleWebpackDefaults } = require("@fluid-example/example-webpack-integration");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");
const webpack = require("webpack");

module.exports = (env) => {
	const { production } = env;

	return {
		...exampleWebpackDefaults,
		entry: {
			app: "./src/app.ts",
		},
		resolve: {
			extensionAlias: {
				".js": [".ts", ".tsx", ".js", ".cjs", ".mjs"],
			},
			extensions: [".ts", ".tsx", ".js", ".cjs", ".mjs"],
		},
		module: {
			rules: [
				{
					test: /\.tsx?$/,
					loader: "ts-loader",
				},
				{
					test: /\.m?js$/,
					use: ["source-map-loader"],
				},
			],
		},
		output: {
			filename: "[name].bundle.js",
			path: path.resolve(__dirname, "dist"),
			library: "[name]",
			// https://github.com/webpack/webpack/issues/5767
			// https://github.com/webpack/webpack/issues/7939
			devtoolNamespace: "fluid-example/presence-tracker",
			libraryTarget: "umd",
		},
		plugins: [
			new HtmlWebpackPlugin({
				template: "./src/index.html",
			}),
			new webpack.ProvidePlugin({
				process: "process/browser.js",
			}),
		],
		mode: production ? "production" : "development",
		devtool: production ? "source-map" : "inline-source-map",
	};
};
