/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = (env) => {
	const htmlTemplate = "./src/index.html";
	const mode = env && env.production ? "production" : "development";

	return {
		devtool: mode === "production" ? "source-map" : "inline-source-map",
		entry: {
			app: "./src/app.ts",
		},
		resolve: {
			extensionAlias: {
				".cjs": [".cts", ".cjs"],
				".js": [".ts", ".tsx", ".js"],
				".mjs": [".mts", ".mjs"],
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
			clean: env && env.clean,
		},
		plugins: [new HtmlWebpackPlugin({ template: htmlTemplate })],
		devServer: {
			open: false,
		},
	};
};
