/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const Dotenv = require("dotenv-webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

const pkg = require("./package.json");
const componentName = pkg.name.slice(1);

module.exports = (env) => {
	return {
		entry: {
			app: "./e2e-tests/app/app.tsx",
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
					test: /\.tsx?$/,
					loader: "ts-loader",
				},
				{
					test: /\.css$/i,
					use: ["style-loader", "css-loader"],
				},
			],
		},
		output: {
			filename: "[name].bundle.js",
			path: path.resolve("./e2e-tests/app", "dist"),
			library: "[name]",
			devtoolNamespace: componentName,
			libraryTarget: "umd",
		},
		devServer: {
			static: {
				directory: path.join("./e2e-tests/app"),
			},
		},
		plugins: [
			new webpack.ProvidePlugin({
				process: "process/browser.js",
			}),
			new Dotenv({
				path: "./.env",
				systemvars: true,
			}),
			new HtmlWebpackPlugin({
				template: "./e2e-tests/app/index.html",
			}),
		],
		mode: "development",
		devtool: "inline-source-map",
	};
};
