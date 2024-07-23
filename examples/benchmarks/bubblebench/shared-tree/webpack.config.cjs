/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-example/webpack-fluid-loader");
const path = require("path");

module.exports = (env) => ({
	...fluidRoute.devServerConfig(__dirname, env),
	entry: {
		main: "./src/index.ts",
	},
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
	output: {
		filename: "[name].bundle.js",
		path: path.resolve(__dirname, "dist"),
		library: { name: "[name]", type: "umd" },
	},
	watchOptions: {
		ignored: "**/node_modules/**",
	},
	mode: env?.production ? "production" : "development",
	devtool: env?.production ? "source-map" : "inline-source-map",
});
