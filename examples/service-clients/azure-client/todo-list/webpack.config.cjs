/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

module.exports = (env) => {
	const { production } = env;
	const fluidClient = env?.FLUID_CLIENT || "";

	return {
		entry: {
			app: "./src/app.tsx",
		},
		resolve: {
			extensions: [".ts", ".tsx", ".js", ".cjs", ".mjs"],
			extensionAlias: {
				".js": [".ts", ".tsx", ".js", ".cjs", ".mjs"],
			},
			fallback: {
				assert: require.resolve("assert/"),
			},
		},
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
				{
					test: /\.m?js$/,
					use: ["source-map-loader"],
				},
			],
		},
		output: {
			filename: "[name].bundle.js",
			path: path.resolve(__dirname, "dist"),
			library: "[name]",
			// https://github.com/webpack/webpack/issues/5767
			// https://github.com/webpack/webpack/issues/7939
			devtoolNamespace: "fluid-example/app-integration-external-controller",
			libraryTarget: "umd",
		},
		plugins: [
			new webpack.DefinePlugin({
				"process.env.FLUID_CLIENT": JSON.stringify(fluidClient),
			}),
			new webpack.ProvidePlugin({
				process: "process/browser.js",
			}),
			new HtmlWebpackPlugin({
				template: "./src/index.html",
			}),
		],
		mode: production ? "production" : "development",
		devtool: production ? "source-map" : "inline-source-map",
	};
};
