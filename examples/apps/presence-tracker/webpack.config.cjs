/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");
const webpack = require("webpack");

module.exports = (env) => {
	const { production } = env;

	return {
		entry: {
			app: "./src/app.ts",
		},
		resolve: {
			alias: {
				// The emoji data is emitted as a standalone asset (see the rule below) so the
				// import resolves to the URL it is served from.
				"emoji-data-url$": require.resolve("emoji-picker-element-data/en/emojibase/data.json"),
			},
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
				{
					test: /\.m?js$/,
					use: ["source-map-loader"],
				},
				{
					// Emit the emoji-picker-element data as a local asset. Without an explicit
					// dataSource the picker fetches this file from a public CDN at runtime.
					test: /emoji-picker-element-data[\\/].*\.json$/,
					type: "asset/resource",
				},
			],
		},
		output: {
			filename: "[name].bundle.js",
			path: path.resolve(__dirname, "dist"),
			library: "[name]",
			// https://github.com/webpack/webpack/issues/5767
			// https://github.com/webpack/webpack/issues/7939
			devtoolNamespace: "fluid-example/presence-tracker",
			libraryTarget: "umd",
		},
		plugins: [
			new HtmlWebpackPlugin({
				template: "./src/index.html",
			}),
			new webpack.ProvidePlugin({
				process: "process/browser.js",
			}),
		],
		mode: production ? "production" : "development",
		devtool: production ? "source-map" : "inline-source-map",
	};
};
