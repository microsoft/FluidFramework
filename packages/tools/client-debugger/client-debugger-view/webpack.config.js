/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");

const webpack = require("webpack");
const { merge } = require("webpack-merge");

const fluidRoute = require("@fluid-tools/webpack-fluid-loader");

const testAppSrcPath = path.join(__dirname, "src", "test", "app");

module.exports = (env) => {
	const isProduction = env && env.production;

	return merge(
		{
			entry: {
				main: path.join(testAppSrcPath, "index.tsx"),
			},
			resolve: {
				extensions: [".ts", ".tsx", ".js"],
			},
			module: {
				rules: [
					{
						test: /\.tsx?$/,
						loader: require.resolve("ts-loader"),
					},
					{
						test: /\.css$/,
						use: [
							require.resolve("css-loader"), // translates CSS into CommonJS
							require.resolve("style-loader"), // creates style nodes from JS strings
						],
					},
				],
			},
			output: {
				filename: "[name].bundle.js",
				path: path.resolve(__dirname, "dist"),
				library: "[name]",
				devtoolNamespace: "fluid-tools/client-debugger-view",
				libraryTarget: "umd",
			},
			plugins: [
				new webpack.ProvidePlugin({
					process: require.resolve("process/browser"),
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
		fluidRoute.devServerConfig(__dirname, env),
	);
};
