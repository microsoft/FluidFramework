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
		resolve: {
			...config.resolve,
			fallback: {
				...config.resolve?.fallback,
				assert: require.resolve("assert/"),
			},
		},
		module: {
			...config.module,
			rules: config.module.rules.map((rule) =>
				rule.enforce === "pre"
					? { ...rule, exclude: /axios[/\\]dist[/\\]browser[/\\]axios\.cjs$/ }
					: rule,
			),
		},
		plugins: [
			...(config.plugins ?? []),
			new webpack.DefinePlugin({
				"process.env.FLUID_CLIENT": JSON.stringify(fluidClient),
			}),
			new webpack.ProvidePlugin({
				process: "process/browser.js",
			}),
		],
		devServer: {
			...config.devServer,
			port: 8080,
			open: true,
		},
	};
};
