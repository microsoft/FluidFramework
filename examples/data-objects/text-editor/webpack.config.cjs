/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-example/webpack-fluid-loader");

module.exports = (env = {}) => {
	const config = fluidRoute.exampleAppConfig(__dirname, env, {
		html: { title: "Multi-View Text Editor" },
	});

	return {
		...config,
		entry: {
			main: "./src/app.tsx",
		},
		module: {
			rules: [
				...config.module.rules,
				{
					test: /\.css$/,
					use: ["style-loader", "css-loader"],
				},
			],
		},
		performance: {
			maxAssetSize: 2_000_000, // 2MB
			maxEntrypointSize: 2_000_000, // 2MB
		},
	};
};
