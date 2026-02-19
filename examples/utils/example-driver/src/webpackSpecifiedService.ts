/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isExampleDriverService, type ExampleDriverService } from "./interfaces.js";

declare const EXAMPLE_DRIVER_SERVICE: string | undefined;
/**
 * Determine which service was specified, relying on webpack to provide a value for EXAMPLE_DRIVER_SERVICE
 * via DefinePlugin. The example-webpack-integration package provides a plugin to make this easy to do.
 */
export const getSpecifiedServiceFromWebpack = (): ExampleDriverService => {
	const service = EXAMPLE_DRIVER_SERVICE;
	if (service === undefined) {
		throw new Error(
			"EXAMPLE_DRIVER_SERVICE not provided. Make sure you included the example-webpack-integration plugin.",
		);
	}
	if (!isExampleDriverService(service)) {
		throw new Error(`EXAMPLE_DRIVER_SERVICE not a recognized driver type: ${service}`);
	}
	return service;
};
