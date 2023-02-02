/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");

const sourceDirectoryPath = path.resolve(__dirname, "src");
const buildDirectoryPath = path.resolve(__dirname, "dist");

module.exports = {
	mode: "production",
	entry: {
		// The Background script
		BackgroundScript: path.join(sourceDirectoryPath, "BackgroundScript.ts"),

		// The Content scripts
		OpenDebuggerView: path.join(sourceDirectoryPath, "InjectDebuggerOpenScript.ts"),
		CloseDebuggerView: path.join(sourceDirectoryPath, "InjectDebuggerCloseScript.ts"),

		// The Injected scripts
		OpenDebuggerPanelScript: path.join(sourceDirectoryPath, "OpenDebuggerPanelScript.ts"),
		CloseDebuggerPanelScript: path.join(sourceDirectoryPath, "CloseDebuggerPanelScript.ts"),
	},
	output: {
		path: buildDirectoryPath,
		filename: "[name].js",
		publicPath: "",
	},
	resolve: {
		extensions: [".ts", ".tsx", ".js"],
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				loader: "ts-loader",
				exclude: /node_modules/,
			},
		],
	},
	plugins: [
		new webpack.ProvidePlugin({
			process: "process/browser",
		}),
		new CopyPlugin({
			patterns: [{ from: ".", to: ".", context: "public" }],
		}),
	],
};
