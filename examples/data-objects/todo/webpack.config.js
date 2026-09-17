/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { commonExampleConfig } from "@fluid-example/webpack-fluid-loader";
import { merge } from "webpack-merge";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default (env) =>
	merge(commonExampleConfig(dirname, env), {
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
