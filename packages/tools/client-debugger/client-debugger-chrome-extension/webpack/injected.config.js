/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");

const packageSourcePath = path.resolve(__dirname, "..", "src");
const packageBuildPath = path.resolve(__dirname, "..", "dist");

const injectedExtensionSourcePath = path.resolve(packageSourcePath, "injected-extension");
const injectedExtensionBuildPath = path.resolve(packageBuildPath, "injected-extension");

module.exports = {
	mode: "development", // TODO: production
	devtool: "inline-source-map", // TODO: Remove this
	entry: {
		// The Background script
		BackgroundScript: path.join(injectedExtensionSourcePath, "BackgroundScript.ts"),

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
	},
	output: {
		path: injectedExtensionBuildPath,
		filename: "[name].js",
		publicPath: "",
	},
	resolve: {
		extensions: [".js", "jsx", ".ts", ".tsx"],
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
