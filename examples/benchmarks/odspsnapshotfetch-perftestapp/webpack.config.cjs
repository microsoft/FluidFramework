/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const webpack = require("webpack");

const mode = "development";

module.exports = {
	entry: {
		"fluid-loader": path.resolve(__dirname, "./src/fetchApp.ts"),
	},
	mode,
	devtool: "inline-source-map",
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: "ts-loader",
				exclude: /node_modules/,
			},
			{
				test: /\.m?js$/,
				use: [require.resolve("source-map-loader")],
				enforce: "pre",
			},
		],
	},
	// Webpack 5 does not support automatic polyfilling of node modules, setting node to false will help simulate webpack 5 behavior by throwing build errors when we rely on node polyfills
	node: false,
	resolve: {
		extensionAlias: {
			".js": [".ts", ".tsx", ".js", ".cjs", ".mjs"],
		},
		extensions: [".tsx", ".ts", ".js"],
	},
	// Some of Fluid's dependencies depend on things like global and process.env.NODE_ENV being defined. This won't be set in Webpack 5 by default, so we are setting it with the define plugin.
	// This can be removed when we no longer get runtime errors like 'process is not defined' and 'global' is not defined
	plugins: [
		new webpack.DefinePlugin({
			process: { env: { NODE_ENV: JSON.stringify(mode) } },
			global: {},
		}),
	],
	devServer: {
		static: {
			directory: path.join(__dirname, "/lib/fluid-loader.bundle.js"),
			publicPath: "/fluid-loader.bundle.js",
		},
		devMiddleware: {
			publicPath: "/lib",
		},
		port: 8080,
	},
	output: {
		filename: "[name].bundle.js",
		path: path.resolve(__dirname, "lib"),
		library: "FluidLoader",
		publicPath: "/",
	},
};
