/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { exampleAppConfig } from "@fluid-example/webpack-fluid-loader";

export default (env) =>
	exampleAppConfig(import.meta.dirname, env, {
		html: { title: "Fluid Inventory" },
	});
