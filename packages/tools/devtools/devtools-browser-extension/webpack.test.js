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
			app: "./e2e-tests/app/app.tsx",
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
					test: /\.css$/i,
					use: ["style-loader", "css-loader"],
				},
			],
		},
		output: {
			filename: "[name].bundle.js",
			path: path.resolve("./e2e-tests/app", "dist"),
			library: "[name]",
			devtoolNamespace: componentName,
			libraryTarget: "umd",
		},
		devServer: {
			static: {
				directory: path.join("./e2e-tests/app"),
			},
		},
		plugins: [
			new webpack.ProvidePlugin({
				process: "process/browser",
			}),
			new HtmlWebpackPlugin({
				template: "./e2e-tests/app/index.html",
			}),
		],
		// This impacts which files are watched by the dev server (and likely by webpack if watch is true).
		// This should be configurable under devServer.static.watch
		// (see https://github.com/webpack/webpack-dev-server/blob/master/migration-v4.md) but that does not seem to work.
		// The CLI options for disabling watching don't seem to work either, so this may be a symptom of using webpack4 with the newer webpack-cli and webpack-dev-server.
		watchOptions: {
			ignored: "**/node_modules/**",
		},
		mode: "development",
		devtool: "inline-source-map",
	};
};
