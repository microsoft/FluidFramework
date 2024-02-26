/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const { merge } = require("webpack-merge");
const webpack = require("webpack");

module.exports = (env) => {
	const isProduction = env && env.production;

	return merge({
		entry: {
			main: "./src/index.ts",
		},
		resolve: {
			extensions: [".ts", ".tsx", ".js", ".cjs", ".mjs"],
		},
		module: {
			rules: [
				{
					test: /\.m?js/,
					resolve: {
						// Required until all transitive dependencies are fully ESM.
						// https://webpack.js.org/configuration/module/#resolvefullyspecified
						fullySpecified: false,
					},
				},
				{
					test: /\.tsx?$/,
					loader: "ts-loader",
				},
				{
					test: /\.s?css$/,
					use: ["style-loader", "css-loader", "sass-loader"],
				},
				{
					test: /\.svg$/,
					use: [
						{
							loader: "svg-sprite-loader",
						},
						{
							loader: "svgo-loader",
							options: require("./svgo.plugins.js"),
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
			devtoolNamespace: "fluid-experimental/inspector-table",
			// This is required to run webpacked code in webworker/node
			// https://github.com/webpack/webpack/issues/6522
			globalObject: "(typeof self !== 'undefined' ? self : this)",
			libraryTarget: "umd",
		},
		devServer: {
			headers: {
				"Access-Control-Allow-Origin": "*",
			},
		},
		plugins: [
			new webpack.ProvidePlugin({
				process: "process/browser",
			}),
		],
		// This impacts which files are watched by the dev server (and likely by webpack if watch is true).
		// This should be configurable under devServer.static.watch
		// (see https://github.com/webpack/webpack-dev-server/blob/master/migration-v4.md) but that does not seem to work.
		// The CLI options for disabling watching don't seem to work either, so this may be a symptom of using webpack4 with the newer webpack-cli and webpack-dev-server.
		watchOptions: {
			ignored: "**/node_modules/**",
		},
		mode: isProduction ? "production" : "development",
	});
};
