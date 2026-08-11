/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-example/webpack-fluid-loader");
const { merge } = require("webpack-merge");

module.exports = (env) =>
	merge(fluidRoute.commonExampleConfig(__dirname, env), {
		entry: {
			main: "./src/index.tsx",
		},
		output: {
			// This is required to run webpacked code in webworker/node
			// https://github.com/webpack/webpack/issues/6522
			globalObject: "(typeof self !== 'undefined' ? self : this)",
		},
		devServer: {
			headers: {
				"Access-Control-Allow-Origin": "*",
			},
		},
	});
