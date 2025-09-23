/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DefinePlugin } from "webpack";

/**
 * Helper to create a DefinePlugin for specifying the driver service to use.
 */
export const createExampleDriverServiceWebpackPlugin = (service: string): DefinePlugin =>
	new DefinePlugin({
		EXAMPLE_DRIVER_SERVICE: JSON.stringify(service),
	});
