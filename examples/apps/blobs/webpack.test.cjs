/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	createExampleDriverServiceWebpackPlugin,
	createOdspMiddlewares,
} = require("@fluid-example/example-webpack-integration");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

module.exports = (env) => {
	const { service } = env;

	return {
		entry: {
			app: "./tests/app.ts",
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
			],
		},
		output: {
			filename: "[name].bundle.js",
			path: path.resolve(__dirname, "dist"),
			library: "[name]",
			// https://github.com/webpack/webpack/issues/5767
			// https://github.com/webpack/webpack/issues/7939
			devtoolNamespace: "fluid-example/blobs",
			libraryTarget: "umd",
		},
		plugins: [
			new webpack.ProvidePlugin({
				process: "process/browser.js",
			}),
			new HtmlWebpackPlugin({
				template: "./tests/index.html",
			}),
			createExampleDriverServiceWebpackPlugin(service),
		],
		devServer: {
			static: {
				directory: path.join(__dirname, "tests"),
			},
			setupMiddlewares: (middlewares) => {
				if (service === "odsp") {
					middlewares.push(...createOdspMiddlewares());
				}
				return middlewares;
			},
		},
		mode: "development",
		devtool: "inline-source-map",
	};
};
