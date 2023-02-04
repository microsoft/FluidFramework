/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");

const packageSourcePath = path.resolve(__dirname, "..", "src");
const packageBuildPath = path.resolve(__dirname, "..", "dist");

const contentExtensionSourcePath = path.resolve(packageSourcePath, "content-extension");
const contentExtensionBuildPath = path.resolve(packageBuildPath, "content-extension");

module.exports = {
	mode: "development", // TODO: production
	devtool: "inline-source-map", // TODO: remove this
	entry: {
		// The Background script
		BackgroundScript: path.join(contentExtensionSourcePath, "BackgroundScript.ts"),

		// The Content scripts
		ContentScript: path.join(contentExtensionSourcePath, "ContentScript.ts"),
	},
	output: {
		path: contentExtensionBuildPath,
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
