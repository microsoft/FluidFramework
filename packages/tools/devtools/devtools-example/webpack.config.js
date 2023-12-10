/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { merge } = require("webpack-merge");

const sourcePath = path.join(__dirname, "src");
const webpack = require("webpack");

module.exports = (env) => {
	const isProduction = env && env.production;

	return merge(
		{
			mode: "development",
			entry: {
				main: path.join(sourcePath, "index.tsx"),
			},
			resolve: {
				extensions: [".ts", ".tsx", ".js"],
			},
			module: {
				rules: [
					{
						test: /\.m?js/,
						type: "javascript/auto",
					},
					{
						test: /\.m?js/,
						resolve: {
							fullySpecified: false,
						},
					},
					{
						test: /\.tsx?$/,
						loader: require.resolve("ts-loader"),
						resolve: {
							fullySpecified: false,
						},
					},
				],
			},
			output: {
				filename: "[name].bundle.js",
				path: path.resolve(__dirname, "dist"),
				library: "[name]",
				devtoolNamespace: "fluid-experimental/devtools-view",
				libraryTarget: "umd",
			},
			plugins: [
				new webpack.ProvidePlugin({
					process: "process/browser",
				}),
				new HtmlWebpackPlugin({
					template: path.join(sourcePath, "index.html"),
				}),
			],
			// This impacts which files are watched by the dev server (and likely by webpack if watch is true).
			// This should be configurable under devServer.static.watch
			// (see https://github.com/webpack/webpack-dev-server/blob/master/migration-v4.md) but that does not seem to work.
			// The CLI options for disabling watching don't seem to work either, so this may be a symptom of using webpack4 with the newer webpack-cli and webpack-dev-server.
			watchOptions: {
				ignored: "**/node_modules/**",
			},
		},
		isProduction ? require("./webpack.prod") : require("./webpack.dev"),
	);
};
