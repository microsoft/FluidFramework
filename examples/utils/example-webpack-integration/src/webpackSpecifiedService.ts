/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// webpack ships as a CommonJS module, so it must be default-imported.
import webpackModule from "webpack";

/**
 * Helper to create a DefinePlugin for specifying the driver service to use.
 */
export const createExampleDriverServiceWebpackPlugin = (
	service: string,
): webpackModule.DefinePlugin =>
	new webpackModule.DefinePlugin({
		EXAMPLE_DRIVER_SERVICE: JSON.stringify(service),
	});
