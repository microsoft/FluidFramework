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
			app: "./test/app/app.tsx",
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
			path: path.resolve("./test/app", "dist"),
			library: "[name]",
			devtoolNamespace: componentName,
			libraryTarget: "umd",
		},
		devServer: {
			static: {
				directory: path.join("./test/app"),
			},
		},
		plugins: [
			new webpack.ProvidePlugin({
				process: "process/browser.js",
			}),
			new Dotenv({
				path: "./.env",
				systemvars: true,
				// Suppress missing .env warning in CI; keep it locally so devs know to create .env.
				silent: Boolean(process.env.CI || process.env.TF_BUILD),
			}),
			new HtmlWebpackPlugin({
				template: "./test/app/index.html",
			}),
		],
		mode: "development",
		devtool: "inline-source-map",
	};
};
