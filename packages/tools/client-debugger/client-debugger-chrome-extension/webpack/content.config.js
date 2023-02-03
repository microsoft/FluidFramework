/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");

const sourcePath = path.resolve(__dirname, "..", "src");
const buildPath = path.resolve(__dirname, "..", "dist");

const contentExtensionSourcePath = path.resolve(sourcePath, "content-extension");
const contentExtensionBuildPath = path.resolve(buildPath, "content-extension");

module.exports = {
	mode: "production",
	devtool: "inline-source-map",
	entry: {
		// TODO
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
