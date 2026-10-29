/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { exampleAppConfig } from "@fluid-example/webpack-fluid-loader";

export default (env = {}) => {
	const config = exampleAppConfig(import.meta.dirname, env, {
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
