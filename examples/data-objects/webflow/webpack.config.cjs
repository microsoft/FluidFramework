/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-example/webpack-fluid-loader");
const path = require("path");
const { merge } = require("webpack-merge");
const webpack = require("webpack");

module.exports = (env) => {
	const isProduction = env?.production;
	const styleLocalIdentName = isProduction ? "[hash:base64:5]" : "[local]-[hash:base64:5]";

	return merge(
		{
			entry: "./src/index.ts",
			resolve: {
				extensions: [".mjs", ".ts", ".tsx", ".js"],
				// This ensures that webpack understands fully-specified relative module imports.
				// See https://github.com/webpack/webpack/issues/13252 for more discussion.
				extensionAlias: {
					".js": [".ts", ".tsx", ".js", ".cjs", ".mjs"],
					".mjs": [".mts", ".mtsx", ".mjs"],
				},
				fallback: {
					dgram: false,
					fs: false,
					net: false,
					tls: false,
					child_process: false,
				},
			},
			devtool: "source-map",
			mode: "production",
			module: {
				rules: [
					{
						test: /\.tsx?$/,
						loader: "ts-loader",
					},
					{
						test: /\.css$/,
						use: [
							"style-loader", // creates style nodes from JS strings
							"css-loader", // translates CSS into CommonJS
						],
					},
				],
			},
			output: {
				filename: "[name].bundle.js",
				chunkFilename: "[name].async.js",
				path: path.resolve(__dirname, "dist"),
				publicPath: "/dist/",
				library: "[name]",
				libraryTarget: "umd",
				globalObject: "self",
			},
			plugins: [
				new webpack.ProvidePlugin({
					process: "process/browser.js",
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
		isProduction ? require("./webpack.prod.cjs") : require("./webpack.dev.cjs"),
		fluidRoute.devServerConfig(__dirname, env),
	);
};
