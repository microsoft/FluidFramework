/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isExampleDriverService, type ExampleDriverService } from "./interfaces.js";

// getSpecifiedServiceFromWebpack expects that webpack will provide the value for EXAMPLE_DRIVER_SERVICE
// via DefinePlugin.
declare const EXAMPLE_DRIVER_SERVICE: string | undefined;
/**
 * @internal
 */
export const getSpecifiedServiceFromWebpack = (): ExampleDriverService => {
	const service = EXAMPLE_DRIVER_SERVICE;
	if (service === undefined) {
		throw new Error(
			"EXAMPLE_DRIVER_SERVICE not provided. Make sure you included the EXAMPLE_DRIVER_SERVICE webpack plugin.",
		);
	}
	if (!isExampleDriverService(service)) {
		throw new Error(`EXAMPLE_DRIVER_SERVICE not a recognized driver type: ${service}`);
	}
	return service;
};
