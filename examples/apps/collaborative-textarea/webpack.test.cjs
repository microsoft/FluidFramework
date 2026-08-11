/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

const pkg = require("./package.json");
const componentName = pkg.name.slice(1);

module.exports = (env) => {
	return {
		entry: {
			app: "./tests/index.ts",
		},
		resolve: {
			extensionAlias: {
				".js": [".ts", ".tsx", ".js"],
			},
			extensions: [".ts", ".tsx", ".js"],
		},
		module: {
			rules: [
				{
					test: /\.tsx?$/,
					loader: "ts-loader",
				},
				{
					test: /\.css$/i,
					use: ["style-loader", "css-loader"],
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
		devServer: {
			static: {
				directory: path.join(__dirname, "tests"),
			},
		},
		plugins: [
			new webpack.ProvidePlugin({
				process: "process/browser.js",
			}),
			new HtmlWebpackPlugin({
				template: "./tests/index.html",
			}),
		],
		mode: "development",
		devtool: "inline-source-map",
	};
};
