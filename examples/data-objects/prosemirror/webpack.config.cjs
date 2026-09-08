/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-example/webpack-fluid-loader");
const { merge } = require("webpack-merge");

module.exports = (env) =>
	merge(fluidRoute.commonExampleConfig(__dirname, env), {
		module: {
			rules: [
				{
					test: /\.css$/,
					use: [
						"style-loader", // creates style nodes from JS strings
						"css-loader", // translates CSS into CommonJS
					],
				},
			],
		},
		devServer: {
			host: "0.0.0.0",
			devMiddleware: { stats: "minimal" },
		},
	});
