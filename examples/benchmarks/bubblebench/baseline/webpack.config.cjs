/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-example/webpack-fluid-loader");
const webpack = require("webpack");

module.exports = (env) => ({
	...fluidRoute.commonExampleConfig(__dirname, env),
	plugins: [
		new webpack.ProvidePlugin({
			process: "process/browser.js",
		}),
	],
});
