/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ExampleDriver, ExampleDriverService } from "./interfaces.js";
import { createLocalDriver } from "./localDriver.js";
import { createOdspDriver } from "./odspDriver.js";
import { createTinyliciousDriver } from "./tinyliciousDriver.js";

/**
 * Creates the set of driver functionality needed to create/load a container for the given
 * service.
 *
 * @remarks
 * This pattern should not be used in production since it pulls all driver types into the bundle.
 * This is just done for convenience in our examples. Instead a specific driver should be selected
 * and used for production.
 */
export const createExampleDriver = async (
	service: ExampleDriverService,
): Promise<ExampleDriver> => {
	switch (service) {
		case "odsp": {
			return createOdspDriver();
		}
		case "t9s": {
			return createTinyliciousDriver();
		}
		case "local": {
			return createLocalDriver();
		}
		default: {
			throw new Error(`Unrecognized driver type: ${service}`);
		}
	}
};
