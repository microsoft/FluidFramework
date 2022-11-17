/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const webpack = require("webpack");

const testAppSrcPath = path.resolve(__dirname, "src", "test", "app");
const buildDirectoryPath = path.resolve(__dirname, "dist");

/**
 * Webpack config for the test app.
 * @remarks **Not** used for building the extension itself.
 */
module.exports = {
	mode: "production",
	entry: {
		main: path.join(testAppSrcPath, "index.tsx"),
	},
	output: {
		path: buildDirectoryPath,
		filename: "[name].js",
		publicPath: "",
	},
	resolve: {
		extensions: [".ts", ".tsx", ".js"],
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
	],
};
