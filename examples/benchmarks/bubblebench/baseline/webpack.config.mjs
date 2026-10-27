/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { commonExampleConfig } from "@fluid-example/webpack-fluid-loader";
import webpack from "webpack";

export default (env) => ({
	...commonExampleConfig(import.meta.dirname, env),
	plugins: [
		new webpack.ProvidePlugin({
			process: "process/browser.js",
		}),
	],
});
