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
