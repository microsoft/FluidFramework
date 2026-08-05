/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-example/webpack-fluid-loader");
const webpack = require("webpack");

module.exports = (env) => {
	const fluidClient = env?.FLUID_CLIENT ?? "";
	const config = fluidRoute.commonExampleConfig(__dirname, env);

	return {
		...config,
		plugins: [
			...(config.plugins ?? []),
			new webpack.DefinePlugin({
				"process.env.FLUID_CLIENT": JSON.stringify(fluidClient),
			}),
			new webpack.ProvidePlugin({
				process: "process/browser.js",
			}),
		],
	};
};
