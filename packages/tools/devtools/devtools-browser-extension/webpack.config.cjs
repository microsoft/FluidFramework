/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");
const Dotenv = require("dotenv-webpack");

const sourceDirectoryPath = path.resolve(__dirname, "src");

// Directory under which the final webpacked output will be saved.
const bundleDirectoryPath = path.resolve(__dirname, "dist", "bundle");

module.exports = {
	mode: "development", // TODO: production
	devtool: "inline-source-map", // TODO: remove this
	entry: {
		// The Devtools script and view
		"devtools/DevtoolsScript": path.join(sourceDirectoryPath, "devtools", "DevtoolsScript.ts"),
		"devtools/InitializeViewScript": path.join(
			sourceDirectoryPath,
			"devtools",
			"InitializeViewScript.ts",
		),

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
		path: bundleDirectoryPath,
		filename: "[name].js",
		publicPath: "",
	},
	resolve: {
		extensionAlias: {
			".cjs": [".cts", ".cjs"],
			".js": [".ts", ".tsx", ".js"],
			".mjs": [".mts", ".mjs"],
		},
		extensions: [".js", ".jsx", ".ts", ".tsx"],
	},
	module: {
		rules: [
			{
				test: /\.m?js/,
				type: "javascript/auto",
			},
			{
				test: /\.m?js/,
				resolve: {
					// Required until all transitive dependencies are fully ESM.
					// https://webpack.js.org/configuration/module/#resolvefullyspecified
					fullySpecified: false,
				},
			},
			{
				test: /\.tsx?$/,
				loader: "ts-loader",
				exclude: /node_modules/,
				resolve: {
					// Required until all transitive dependencies are fully ESM.
					// https://webpack.js.org/configuration/module/#resolvefullyspecified
					fullySpecified: false,
				},
			},
		],
	},
	plugins: [
		new webpack.ProvidePlugin({
			process: "process/browser.js",
		}),
		new CopyPlugin({
			patterns: [
				// Copy assets from `public`
				{ from: ".", to: ".", context: "public" },

				// Copy HTML resources from source
				{ from: "**/*.html", to: ".", context: "src" },
			],
		}),
		new Dotenv({
			path: "./.env",
			systemvars: true,
		}),
	],
};
