/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

module.exports = {
	entry: {
		start: "./src/start.ts",
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
		],
	},
	output: {
		filename: "[name].bundle.js",
		path: path.resolve(__dirname, "dist"),
		library: "[name]",
		// https://github.com/webpack/webpack/issues/5767
		// https://github.com/webpack/webpack/issues/7939
		devtoolNamespace: "fluid-example/app-integration-external-data",
		libraryTarget: "umd",
	},
	plugins: [
		new webpack.ProvidePlugin({
			process: "process/browser.js",
		}),
		new HtmlWebpackPlugin({
			template: "./src/index.html",
		}),
	],
	mode: "development",
	devtool: "inline-source-map",
};
