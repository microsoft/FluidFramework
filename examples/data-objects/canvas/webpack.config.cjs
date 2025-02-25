/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-example/webpack-fluid-loader");
const path = require("path");
const webpack = require("webpack");
const { merge } = require("webpack-merge");

const pkg = require("./package.json");
const fluidPackageName = pkg.name.slice(1);

module.exports = (env) => {
	const isProduction = env?.production;

	return merge(
		{
			entry: {
				main: "./src/index.ts",
			},
			resolve: {
				extensionAlias: {
					".js": [".ts", ".tsx", ".js", ".cjs", ".mjs"],
				},
				extensions: [".ts", ".tsx", ".js", ".cjs", ".mjs"],
				fallback: {
					dgram: false,
					fs: false,
					net: false,
					tls: false,
					child_process: false,
				},
			},
			module: {
				rules: [
					{
						test: /\.tsx?$/,
						loader: "ts-loader",
					},
					{
						test: /\.less$/,
						use: [
							{
								loader: "style-loader", // creates style nodes from JS strings
							},
							{
								loader: "css-loader", // translates CSS into CommonJS
							},
							{
								loader: "less-loader", // compiles Less to CSS
							},
						],
					},
					{
						test: /\.(png|jpg|gif|svg|eot|ttf|woff|woff2)$/,
						loader: "url-loader",
						options: {
							limit: 10000,
						},
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
