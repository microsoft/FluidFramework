/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	createExampleDriverServiceWebpackPlugin,
	createOdspMiddlewares,
} = require("@fluid-example/example-webpack-integration");
const path = require("path");
const { merge } = require("webpack-merge");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

module.exports = (env) => {
	const { production, service } = env;

	return merge(
		{
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
					template: "./src/index.html",
				}),
				createExampleDriverServiceWebpackPlugin(service),
			],
			devServer: {
				setupMiddlewares: (middlewares) => {
					if (service === "odsp") {
						middlewares.push(...createOdspMiddlewares());
					}
					return middlewares;
				},
			},
		},
		production ? require("./webpack.prod.cjs") : require("./webpack.dev.cjs"),
	);
};
