/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-example/webpack-fluid-loader");
const webpack = require("webpack");

module.exports = (env) => {
	const config = fluidRoute.baseExampleConfig(__dirname, env, {
		html: { title: "Fluid Inventory" },
	});

	return {
		...config,
		plugins: [
			...(config.plugins ?? []),
			// local-driver transitively loads Node's util package, which reads process.env.NODE_DEBUG.
			new webpack.ProvidePlugin({ process: "process/browser.js" }),
		],
	};
};
