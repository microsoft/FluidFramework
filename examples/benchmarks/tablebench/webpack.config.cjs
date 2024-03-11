/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = (env) => {
	const htmlTemplate = "./src/index.html";
	const plugins =
		env && env.clean
			? [new CleanWebpackPlugin(), new HtmlWebpackPlugin({ template: htmlTemplate })]
			: [new HtmlWebpackPlugin({ template: htmlTemplate })];

	const mode = env && env.production ? "production" : "development";

	return {
		devtool: mode === "production" ? "source-map" : "inline-source-map",
		entry: {
			app: "./src/app.ts",
		},
		resolve: {
			extensionAlias: {
				".js": [".ts", ".tsx", ".js", ".cjs", ".mjs"],
			},
			extensions: [".ts", ".tsx", ".js", ".cjs", ".mjs"],
			fallback: {
				// stochastic-test-utils uses fs and path for logging ops generated for fuzz testing.
				fs: false,
				path: false,
				process: false,
			},
		},
		module: {
			rules: [
				{
					test: /\.tsx?$/,
					loader: "ts-loader",
				},
			],
		},

		mode,
		output: {
			filename: "[name].[contenthash].js",
		},
		plugins,
		devServer: {
			open: false,
		},
	};
};
