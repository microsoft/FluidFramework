/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");

const packageSourcePath = path.resolve(__dirname, "src");
const packageBuildPath = path.resolve(__dirname, "dist");

module.exports = {
	mode: "development", // TODO: production
	devtool: "inline-source-map", // TODO: remove this
	entry: {
		// The Devtools script and view
		"devtools/DevtoolsScript": path.join(packageSourcePath, "devtools", "DevtoolsScript.ts"),
		"devtools/RootView": path.join(packageSourcePath, "devtools", "RootView.tsx"),

		// The Background script
		"background/BackgroundScript": path.join(
			packageSourcePath,
			"background",
			"BackgroundScript.ts",
		),

		// The Content script
		"content/ContentScript": path.join(packageSourcePath, "content", "ContentScript.ts"),

		// The action button pop-up script
		"popup/PopupScript": path.join(packageSourcePath, "popup", "PopupScript.ts"),
	},
	output: {
		path: packageBuildPath,
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
