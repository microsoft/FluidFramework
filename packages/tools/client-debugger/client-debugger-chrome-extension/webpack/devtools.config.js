/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");

const packageSourcePath = path.resolve(__dirname, "..", "src");
const packageBuildPath = path.resolve(__dirname, "..", "dist");

const devtoolsExtensionSourcePath = path.resolve(packageSourcePath, "devtools-extension");
const devtoolsExtensionBuildPath = path.resolve(packageBuildPath, "devtools-extension");

module.exports = {
	mode: "development", // TODO: production
	devtool: "inline-source-map", // TODO: remove this
	entry: {
		// The Devtools script
		Devtools: path.join(devtoolsExtensionSourcePath, "Devtools.ts"),

		// The Background script
		BackgroundScript: path.join(devtoolsExtensionSourcePath, "BackgroundScript.ts"),

		// The Content script
		ContentScript: path.join(devtoolsExtensionSourcePath, "ContentScript.ts"),

		// View scripts used by Devtools
		RootView: path.join(devtoolsExtensionSourcePath, "RootView.ts"),

		// The action button pop-up script
		Popup: path.join(devtoolsExtensionSourcePath, "PopupScript.ts"),
	},
	output: {
		path: devtoolsExtensionBuildPath,
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
