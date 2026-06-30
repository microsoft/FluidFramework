/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

module.exports = (env) => {
	const { production } = env;
	const fluidClient = env?.FLUID_CLIENT ?? "";

	return {
		entry: {
			main: "./src/index.ts",
		},
		resolve: {
			extensionAlias: {
				".js": [".ts", ".tsx", ".js"],
				".cjs": [".cts", ".cjs"],
				".mjs": [".mts", ".mjs"],
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
					test: /\.[cm]?js$/,
					use: [require.resolve("source-map-loader")],
					enforce: "pre",
				},
			],
		},
		output: {
			filename: "[name].bundle.js",
			path: path.resolve(__dirname, "dist"),
		},
		plugins: [
			new HtmlWebpackPlugin({ template: path.join(__dirname, "src", "index.html") }),
			new webpack.DefinePlugin({
				"process.env.FLUID_CLIENT": JSON.stringify(fluidClient),
			}),
			new webpack.ProvidePlugin({
				process: "process/browser.js",
			}),
		],
		watchOptions: {
			ignored: "**/node_modules/**",
		},
		mode: production ? "production" : "development",
		devtool: production ? "source-map" : "inline-source-map",
		devServer: {
			port: 8080,
			open: true,
		},
	};
};
