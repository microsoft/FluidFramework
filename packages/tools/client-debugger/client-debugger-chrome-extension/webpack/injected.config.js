/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");

const packageSourcePath = path.resolve(__dirname, "..", "src");
const packageBuildPath = path.resolve(__dirname, "..", "dist");

const injectedExtensionScriptsPath = path.resolve(
	packageSourcePath,
	"injected-extension",
	"scripts",
);
const injectedExtensionBuildPath = path.resolve(packageBuildPath, "injected-extension");

module.exports = {
	mode: "production",
	devtool: "inline-source-map",
	entry: {
		// The Background script
		BackgroundScript: path.join(injectedExtensionScriptsPath, "BackgroundScript.ts"),

		// The Content scripts
		OpenDebuggerView: path.join(injectedExtensionScriptsPath, "InjectDebuggerOpenScript.ts"),
		CloseDebuggerView: path.join(injectedExtensionScriptsPath, "InjectDebuggerCloseScript.ts"),

		// The Injected scripts
		OpenDebuggerPanelScript: path.join(
			injectedExtensionScriptsPath,
			"OpenDebuggerPanelScript.ts",
		),
		CloseDebuggerPanelScript: path.join(
			injectedExtensionScriptsPath,
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
