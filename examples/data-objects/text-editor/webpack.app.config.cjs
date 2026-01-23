/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");

module.exports = (env = {}) => {
	const { production } = env;

	return {
		entry: {
			app: "./src/app.tsx",
		},
		resolve: {
			extensions: [".ts", ".tsx", ".js"],
			extensionAlias: {
				".js": [".ts", ".tsx", ".js"],
				".cjs": [".cts", ".cjs"],
				".mjs": [".mts", ".mjs"],
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
			new HtmlWebpackPlugin({
				title: "Formatted Text Editor",
				templateContent: `
					<!DOCTYPE html>
					<html><head><meta charset="utf-8"><title>Formatted Text Editor</title>
					<style>*{box-sizing:border-box}body{margin:0;font-family:sans-serif}#content{height:100vh}</style>
					</head><body><div id="content">Loading...</div></body></html>
				`,
			}),
		],
		devServer: {
			static: {
				directory: path.join(__dirname, "dist"),
			},
			port: 8081,
			hot: true,
			open: true,
		},
		watchOptions: {
			ignored: "**/node_modules/**",
		},
		mode: production ? "production" : "development",
		devtool: production ? "source-map" : "inline-source-map",
	};
};
