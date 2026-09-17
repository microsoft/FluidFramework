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
