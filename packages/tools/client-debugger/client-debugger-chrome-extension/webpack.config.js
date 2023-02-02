/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");

const sourcePath = path.resolve(__dirname, "src");
const buildPath = path.resolve(__dirname, "dist");

const injectedExtensionSourcePath = path.resolve(sourcePath, "injected-extension");
const injectedExtensionBuildPath = path.resolve(buildPath, "injected-extension");

module.exports = {
	mode: "production",
	devtool: "inline-source-map",
	entry: {
		// #region Injected Script entry-points

		// The Background script
		BackgroundScript: path.join(sourcePath, "injected-extension", "BackgroundScript.ts"),

		// The Content scripts
		OpenDebuggerView: path.join(injectedExtensionSourcePath, "InjectDebuggerOpenScript.ts"),
		CloseDebuggerView: path.join(injectedExtensionSourcePath, "InjectDebuggerCloseScript.ts"),

		// The Injected scripts
		OpenDebuggerPanelScript: path.join(
			injectedExtensionSourcePath,
			"OpenDebuggerPanelScript.ts",
		),
		CloseDebuggerPanelScript: path.join(
			injectedExtensionSourcePath,
			"CloseDebuggerPanelScript.ts",
		),

		// #endregion
	},
	output: {
		path: injectedExtensionBuildPath,
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
