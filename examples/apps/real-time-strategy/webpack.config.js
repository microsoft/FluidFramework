/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-tools/webpack-fluid-loader");
const path = require("path");
const { merge } = require("webpack-merge");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const pkg = require("./package.json");
const fluidPackageName = pkg.name.slice(1);

module.exports = (env) => {
	const isProduction = env?.production;

	return merge(
		{
			entry: {
				main: "./src/app.ts",
			},
			resolve: {
				extensions: [".ts", ".tsx", ".js"],
			},
			module: {
				rules: [
					{
						test: /\.tsx?$/,
						loader: "ts-loader",
					},
					{
						test: /\.js$/,
						use: [require.resolve("source-map-loader")],
						enforce: "pre",
					},
				],
			},
			output: {
				filename: "[name].bundle.js",
				path: path.resolve(__dirname, "dist"),
				library: "[name]",
				// https://github.com/webpack/webpack/issues/5767
				// https://github.com/webpack/webpack/issues/7939
				devtoolNamespace: fluidPackageName,
				libraryTarget: "umd",
			},
			devServer: { devMiddleware: { stats: "minimal" } },
			plugins: [
				new webpack.ProvidePlugin({
					process: "process/browser",
				}),
				new HtmlWebpackPlugin({
					template: "./src/index.html",
				}),
			],
			watchOptions: {
				ignored: "**/node_modules/**",
			},
		},
		isProduction ? require("./webpack.prod") : require("./webpack.dev"),
		fluidRoute.devServerConfig(__dirname, env),
	);
};
