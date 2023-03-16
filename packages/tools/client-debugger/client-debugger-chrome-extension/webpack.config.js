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
	mode: "development", // TODO: production
	devtool: "inline-source-map", // TODO: remove this
	entry: {
		// The Devtools script and view
		"devtools/DevtoolsScript": path.join(sourceDirectoryPath, "devtools", "DevtoolsScript.ts"),
		"devtools/RootView": path.join(sourceDirectoryPath, "devtools", "RootView.tsx"),

		// The Background script
		"background/BackgroundScript": path.join(
			sourceDirectoryPath,
			"background",
			"BackgroundScript.ts",
		),

		// The Content script
		"content/ContentScript": path.join(sourceDirectoryPath, "content", "ContentScript.ts"),

		// The action button pop-up script
		"popup/PopupScript": path.join(sourceDirectoryPath, "popup", "PopupScript.ts"),
	},
	output: {
		path: buildDirectoryPath,
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
