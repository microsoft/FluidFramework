/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const webpack = require("webpack");

const mode = "development";

module.exports = {
	entry: {
		"fluid-loader": path.resolve(__dirname, "./src/loader.ts"),
	},
	mode,
	devtool: "inline-source-map",
	resolve: {
		extensionAlias: {
			".js": [".ts", ".tsx", ".js"],
			".cjs": [".cts", ".cjs"],
			".mjs": [".mts", ".mjs"],
		},
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				loader: "ts-loader",
			},
			{
				test: /\.[cm]?js$/,
				use: [require.resolve("source-map-loader")],
				enforce: "pre",
			},
		],
	},
	// Some of Fluid's dependencies depend on process.env.NODE_ENV being defined.
	// This can be removed when we no longer get runtime errors like 'process is not defined'
	plugins: [
		new webpack.DefinePlugin({
			process: { env: { NODE_ENV: JSON.stringify(mode) } },
		}),
	],
	output: {
		filename: "[name].bundle.js",
		path: path.resolve(__dirname, "dist"),
		library: { name: "FluidLoader", type: "umd" },
	},
};
