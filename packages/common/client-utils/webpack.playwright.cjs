/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("node:path");
const webpack = require("webpack");

module.exports = {
	mode: "development",
	devtool: "inline-source-map",
	entry: "./lib/test/playwright/browserHash.js",
	output: {
		filename: "browserHash.bundle.js",
		path: path.resolve(__dirname, "lib/test/playwright"),
	},
	plugins: [
		new webpack.IgnorePlugin({
			resourceRegExp: /^\.\/hashFileNode\.js$/,
		}),
	],
};
