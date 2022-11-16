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
		background: path.join(sourceDirectoryPath, "Background.ts"),
		openDebuggerPanelScript: path.join(sourceDirectoryPath, "OpenDebuggerPanelScript.tsx"),
		closeDebuggerPanelScript: path.join(sourceDirectoryPath, "CloseDebuggerPanelScript.ts"),
		openDebuggerView: path.join(sourceDirectoryPath, "OpenDebuggerView.ts"),
		closeDebuggerView: path.join(sourceDirectoryPath, "CloseDebuggerView.ts"),
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

	// TODO: remove
	mode: "development",
	devtool: "inline-source-map",
};
