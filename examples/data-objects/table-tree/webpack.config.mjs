/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { commonExampleConfig } from "@fluid-example/webpack-fluid-loader";
import { merge } from "webpack-merge";

export default (env) =>
	merge(commonExampleConfig(import.meta.dirname, env), {
		entry: {
			main: "./src/index.tsx",
		},
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
		devServer: { devMiddleware: { stats: "minimal" } },
	});
